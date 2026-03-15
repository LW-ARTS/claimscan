import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { generalLimiter, searchLimiter } from '@/lib/rate-limit';
import { verifyRequestSignature } from '@/lib/request-signing';

// Simple in-memory rate limiter — fallback when Upstash is not configured.
// NOTE: In serverless/Edge environments, each instance has its own map.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30; // 30 requests per minute per IP

/**
 * Anti-enumeration: track unique handles (/{handle}) per IP to detect mass lookups.
 * Separate from general rate limiting — this specifically catches enumeration patterns
 * where a scraper hits many different handles within a window.
 */
const enumMap = new Map<string, { handles: Set<string>; resetAt: number }>();
const ENUM_WINDOW_MS = 300_000; // 5-minute window
const ENUM_MAX_UNIQUE = 20; // max 20 unique handles per 5 min per IP

function isEnumerating(ip: string, handle: string): boolean {
  const now = Date.now();
  const entry = enumMap.get(ip);

  if (enumMap.size > 5_000) {
    for (const [key, val] of enumMap) {
      if (now > val.resetAt) enumMap.delete(key);
    }
  }

  if (!entry || now > entry.resetAt) {
    enumMap.set(ip, { handles: new Set([handle]), resetAt: now + ENUM_WINDOW_MS });
    return false;
  }

  entry.handles.add(handle);
  return entry.handles.size > ENUM_MAX_UNIQUE;
}

/**
 * Evict the oldest half of rate limit entries to prevent unbounded memory growth.
 * Uses LRU-style eviction instead of clearing the entire map — prevents an attacker
 * from triggering a full reset by flooding with unique IPs.
 */
function evictStaleEntries(): void {
  const now = Date.now();

  // First pass: remove genuinely expired entries
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }

  // If still over threshold after expiry sweep, evict oldest half
  if (rateLimitMap.size > 10_000) {
    const entries = Array.from(rateLimitMap.entries())
      .sort((a, b) => a[1].resetAt - b[1].resetAt);
    const toDelete = Math.floor(entries.length / 2);
    for (let i = 0; i < toDelete; i++) {
      rateLimitMap.delete(entries[i][0]);
    }
  }
}

function isRateLimited(ip: string, max: number = RATE_LIMIT_MAX): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  // LRU eviction instead of full clear to prevent DDoS bypass
  if (rateLimitMap.size > 10_000) evictStaleEntries();

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > max;
}

// Periodic cleanup using globalThis singleton to prevent duplicate intervals on hot reload
const CLEANUP_KEY = '__claimscan_rate_limit_cleanup__';
if (
  typeof globalThis !== 'undefined' &&
  !(globalThis as Record<string, unknown>)[CLEANUP_KEY]
) {
  (globalThis as Record<string, unknown>)[CLEANUP_KEY] = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap) {
      if (now > entry.resetAt) rateLimitMap.delete(key);
    }
    for (const [key, entry] of enumMap) {
      if (now > entry.resetAt) enumMap.delete(key);
    }
  }, RATE_LIMIT_WINDOW_MS * 2);
}

/**
 * Constant-time string comparison to prevent timing side-channel attacks.
 * Uses the same timingSafeEqual pattern as lib/supabase/service.ts.
 */
function safeCompare(a: string, b: string): boolean {
  const bufA = new TextEncoder().encode(a);
  const bufB = new TextEncoder().encode(b);
  if (bufA.length !== bufB.length) {
    // Compare against self to consume constant time, then return false
    const padded = new Uint8Array(bufA.length);
    padded.set(bufB.subarray(0, Math.min(bufB.length, bufA.length)));
    let mismatch = 1; // length already differs
    for (let i = 0; i < bufA.length; i++) {
      mismatch |= bufA[i] ^ (padded[i] || 0);
    }
    return mismatch === 0; // always false
  }
  let mismatch = 0;
  for (let i = 0; i < bufA.length; i++) {
    mismatch |= bufA[i] ^ bufB[i];
  }
  return mismatch === 0;
}

/** Max POST body size (4KB) to prevent memory exhaustion from large payloads */
const MAX_BODY_SIZE = 4096;

/** Stricter rate limit for the search endpoint (most valuable to scrapers) */
const SEARCH_RATE_LIMIT_MAX = 10; // 10 searches per minute per IP

/** Known scraper/bot User-Agent substrings (lowercase) */
const SCRAPER_UA_PATTERNS = [
  'python-requests', 'python-urllib', 'scrapy', 'httpclient',
  'go-http-client', 'java/', 'libwww-perl', 'wget', 'curl/',
  'postmanruntime', 'insomnia/', 'httpie/', 'axios/',
  'node-fetch', 'undici', 'got/', 'superagent',
  'selenium', 'phantomjs', 'headlesschrome', 'puppeteer',
  'bytespider', 'petalbot', 'semrushbot', 'ahrefsbot', 'dotbot',
  'mj12bot', 'barkrowler', 'dataforseobot',
];

/** Allowed origins for API POST requests (anti-scraping) */
const ALLOWED_API_ORIGINS = new Set([
  'https://claimscan.tech',
  'https://www.claimscan.tech',
]);

/**
 * Tarpit delay — wastes scraper resources by making them wait.
 * Applied when a request is suspicious but not outright blocked
 * (e.g., bot UA patterns that aren't in the blocklist, odd header combos).
 */
const TARPIT_INDICATORS = [
  // Missing common browser headers
  (req: NextRequest) => !req.headers.get('accept-language'),
  (req: NextRequest) => !req.headers.get('accept-encoding'),
  // Accept: */* without qualification (browsers send specific types)
  (req: NextRequest) => req.headers.get('accept') === '*/*',
  // Suspiciously short or missing referer on non-GET requests to API
  (req: NextRequest) =>
    req.method !== 'GET' &&
    req.nextUrl.pathname.startsWith('/api/') &&
    !req.headers.get('referer'),
];

/** Pattern to match /{handle} routes (single path segment, not /api, /docs, /_next, etc.) */
const HANDLE_ROUTE_RE = /^\/([a-zA-Z0-9_\-\.]{1,64})$/;

function getTarpitDelayMs(request: NextRequest): number {
  let suspicionScore = 0;
  for (const check of TARPIT_INDICATORS) {
    if (check(request)) suspicionScore++;
  }
  // 0 indicators = no delay, 1 = 500ms, 2 = 1.5s, 3 = 3s, 4 = 5s
  if (suspicionScore === 0) return 0;
  return Math.min(suspicionScore * suspicionScore * 500, 5000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const pathname = request.nextUrl.pathname;

  // Security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-DNS-Prefetch-Control', 'on');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()'
  );
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://pbs.twimg.com https://abs.twimg.com https://avatars.githubusercontent.com https://imagedelivery.net https://ipfs.io https://unavatar.io",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://*.supabase.co https://api.coingecko.com https://api.dexscreener.com https://api.jup.ag https://*.ingest.sentry.io https://*.helius-rpc.com wss://*.helius-rpc.com https://api.mainnet-beta.solana.com",
      "frame-src 'self' https://challenges.cloudflare.com",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join('; ')
  );
  // Only set HSTS in production to avoid issues with local dev
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    );
  }

  // CORS — fail closed to production URL; never reflect attacker-controlled origin
  const ALLOWED_ORIGINS = new Set(['https://claimscan.tech', 'https://www.claimscan.tech']);
  const rawOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const allowedOrigin = rawOrigin && ALLOWED_ORIGINS.has(rawOrigin) ? rawOrigin : 'https://claimscan.tech';
  response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Sig');
  response.headers.set('Access-Control-Max-Age', '86400');
  response.headers.set('Vary', 'Origin');

  // Handle CORS preflight requests — return 204 early without hitting route handlers
  if (request.method === 'OPTIONS' && pathname.startsWith('/api/')) {
    return new NextResponse(null, { status: 204, headers: response.headers });
  }

  // Protect cron endpoints with constant-time comparison
  if (pathname.startsWith('/api/cron')) {
    const secret = process.env.CRON_SECRET;
    if (!secret || secret.length === 0) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !safeCompare(authHeader, `Bearer ${secret}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Prevent caching of API responses (except /api/prices which uses revalidate)
  if (pathname.startsWith('/api/') && pathname !== '/api/prices') {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  }

  // Block known scraper User-Agents on API routes
  if (pathname.startsWith('/api/')) {
    const ua = request.headers.get('user-agent')?.toLowerCase() ?? '';
    if (SCRAPER_UA_PATTERNS.some((pattern) => ua.includes(pattern))) {
      return NextResponse.json(
        { error: 'Automated access is not permitted' },
        { status: 403 }
      );
    }
    // Block requests with no User-Agent (legitimate browsers always send one)
    if (!request.headers.get('user-agent')) {
      return NextResponse.json(
        { error: 'User-Agent header is required' },
        { status: 400 }
      );
    }
  }

  // Origin validation for POST API requests (anti-scraping).
  // Browsers always send the Origin header on POST; absence = non-browser client.
  // Skip cron routes (called by Vercel scheduler) and dev mode (localhost).
  if (
    request.method === 'POST' &&
    pathname.startsWith('/api/') &&
    !pathname.startsWith('/api/cron') &&
    process.env.NODE_ENV !== 'development'
  ) {
    const origin = request.headers.get('origin');
    if (!origin || !ALLOWED_API_ORIGINS.has(origin)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // Request signature verification for API POST requests (anti-scraping).
  // Opt-in: only active when NEXT_PUBLIC_API_SIGN_KEY is set.
  if (
    request.method === 'POST' &&
    pathname.startsWith('/api/') &&
    !pathname.startsWith('/api/cron') &&
    !pathname.startsWith('/api/webhooks')
  ) {
    const sig = request.headers.get('x-request-sig');
    const isValid = await verifyRequestSignature(sig, pathname);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid request signature' }, { status: 403 });
    }
  }

  // Anti-enumeration: detect mass handle lookups (e.g., scraping all creators)
  const handleMatch = pathname.match(HANDLE_ROUTE_RE);
  if (handleMatch) {
    const handle = handleMatch[1];
    const ip = (request as unknown as { ip?: string }).ip
      ?? request.headers.get('x-real-ip')
      ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();

    if (ip && isEnumerating(ip, handle)) {
      // Tarpit + 429 — waste scraper time before rejecting
      await sleep(3000);
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': '300' } }
      );
    }
  }

  // Tarpit: add artificial delay for suspicious requests to waste scraper resources.
  // Applied on API routes and handle routes (not static assets).
  if (pathname.startsWith('/api/') || handleMatch) {
    const delay = getTarpitDelayMs(request);
    if (delay > 0) {
      await sleep(delay);
    }
  }

  // Rate limit public API endpoints and expensive dynamic routes (OG images)
  const isRateLimitedPath =
    (pathname.startsWith('/api/') && !pathname.startsWith('/api/cron')) ||
    pathname.endsWith('/opengraph-image');

  if (isRateLimitedPath) {
    // Use Vercel's runtime-injected IP (not spoofable), falling back to headers
    // set by trusted reverse proxy. On Vercel, request.ip is injected by the platform.
    const ip = (request as unknown as { ip?: string }).ip
      ?? request.headers.get('x-real-ip')
      ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();

    // If IP cannot be determined in production, the request is suspicious —
    // create a per-request pseudo-key from available headers to avoid a shared bucket.
    // In dev (no Vercel IP injection), use localhost fallback.
    const rateLimitKey = ip
      || `anon:${request.headers.get('user-agent')?.slice(0, 64) ?? 'none'}:${request.headers.get('accept-language')?.slice(0, 16) ?? 'none'}`;

    // Use Upstash Redis (persistent across serverless instances) when configured,
    // otherwise fall back to in-memory rate limiting (best-effort per-instance).
    const upstashLimiter = pathname === '/api/search' ? searchLimiter : generalLimiter;
    if (upstashLimiter) {
      const { success, remaining } = await upstashLimiter.limit(rateLimitKey);
      if (!success) {
        return NextResponse.json(
          { error: 'Too many requests. Please try again later.' },
          {
            status: 429,
            headers: {
              'Retry-After': '60',
              'X-RateLimit-Remaining': '0',
            },
          }
        );
      }
      response.headers.set('X-RateLimit-Remaining', String(remaining));
    } else {
      // Fallback: in-memory rate limiting
      const effectiveLimit = pathname === '/api/search' ? SEARCH_RATE_LIMIT_MAX : RATE_LIMIT_MAX;
      const limitKey = pathname === '/api/search' ? `search:${rateLimitKey}` : rateLimitKey;
      if (isRateLimited(limitKey, effectiveLimit)) {
        return NextResponse.json(
          { error: 'Too many requests. Please try again later.' },
          {
            status: 429,
            headers: { 'Retry-After': '60' },
          }
        );
      }
    }

    // Reject oversized or unbounded POST bodies before they reach route handlers.
    // Webhooks may use chunked transfer encoding (no Content-Length), so exclude them.
    if (request.method === 'POST' && !pathname.startsWith('/api/webhooks')) {
      const contentLength = request.headers.get('content-length');
      if (!contentLength) {
        return NextResponse.json(
          { error: 'Content-Length header is required' },
          { status: 411 }
        );
      }
      if (parseInt(contentLength, 10) > MAX_BODY_SIZE) {
        return NextResponse.json(
          { error: 'Request body too large' },
          { status: 413 }
        );
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|pdf)$).*)',
  ],
};
