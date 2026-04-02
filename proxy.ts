import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  APP_ORIGINS,
  APP_URL,
  RATE_LIMIT_GENERAL,
  RATE_LIMIT_SEARCH,
  RATE_LIMIT_FEES,
  HSTS_HEADER,
} from '@/lib/constants';

// Lazy-load Upstash rate limiters to avoid Edge bundling issues
let _generalLimiter: Awaited<typeof import('@/lib/rate-limit')>['generalLimiter'] | undefined;
let _searchLimiter: Awaited<typeof import('@/lib/rate-limit')>['searchLimiter'] | undefined;
let _feesLimiter: Awaited<typeof import('@/lib/rate-limit')>['feesLimiter'] | undefined;
let _limiterLoaded = false;

async function getRateLimiters() {
  if (!_limiterLoaded) {
    try {
      const mod = await import('@/lib/rate-limit');
      _generalLimiter = mod.generalLimiter;
      _searchLimiter = mod.searchLimiter;
      _feesLimiter = mod.feesLimiter;
    } catch {
      // Upstash not available in Edge — use in-memory fallback
    }
    _limiterLoaded = true;
  }
  return { generalLimiter: _generalLimiter, searchLimiter: _searchLimiter, feesLimiter: _feesLimiter };
}

async function verifyRequestSignature(sig: string | null, path: string): Promise<boolean> {
  try {
    const mod = await import('@/lib/request-signing');
    return mod.verifyRequestSignature(sig, path);
  } catch (err) {
    // Fail-closed: if the signing module can't load, reject the request in production.
    // In dev mode, allow through since Edge bundling issues are common locally.
    if (process.env.NODE_ENV === 'production') {
      console.error('[middleware] CRITICAL: request-signing module failed to load in Edge', err);
      return false;
    }
    return true;
  }
}

// Track whether we've already warned about missing Upstash (once per instance)
let _warnedMissingUpstash = false;

// Simple in-memory rate limiter — fallback when Upstash is not configured.
// NOTE: In serverless/Edge environments, each instance has its own map.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = RATE_LIMIT_GENERAL;

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

function evictStaleEntries(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
  if (rateLimitMap.size > 10_000) {
    // Evict by staleness (earliest resetAt first), not insertion order
    const sorted = [...rateLimitMap.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    const toDelete = Math.floor(sorted.length / 2);
    for (let i = 0; i < toDelete; i++) {
      rateLimitMap.delete(sorted[i][0]);
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

/**
 * Single source of truth for all security headers.
 * Applied to both pass-through responses and error returns.
 * Accepts a nonce for CSP script-src — eliminates 'unsafe-inline'.
 */
function applySecurityHeaders(res: NextResponse, nonce: string): NextResponse {
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('X-DNS-Prefetch-Control', 'off');
  res.headers.set('Permissions-Policy', PERMISSIONS_POLICY);
  res.headers.set('Content-Security-Policy', buildCspHeader(nonce));
  res.headers.set('X-XSS-Protection', '0');
  if (process.env.NODE_ENV === 'production') {
    res.headers.set('Strict-Transport-Security', HSTS_HEADER);
  }
  return res;
}

/**
 * Resolve client IP from request.
 * Trust order: Vercel platform IP > x-real-ip > fingerprint fallback.
 * x-forwarded-for is NOT used — it's client-spoofable outside Vercel's edge.
 */
function getClientIp(request: NextRequest): string {
  const vercelIp = (request as unknown as { ip?: string }).ip;
  if (vercelIp) return vercelIp;
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  // Fingerprint fallback: avoids a single shared bucket for all anonymous traffic.
  // Not perfect but prevents one attacker from exhausting the bucket for everyone.
  if (process.env.NODE_ENV === 'production') {
    const ua = (request.headers.get('user-agent') ?? '').slice(0, 32);
    const lang = (request.headers.get('accept-language') ?? '').slice(0, 8);
    return `anon:${ua}:${lang}`;
  }
  return '127.0.0.1';
}

/** Max POST body size (4KB) to prevent memory exhaustion from large payloads */
const MAX_BODY_SIZE = 4096;

/** Stricter rate limit for the search endpoint (most valuable to scrapers) */
const SEARCH_RATE_LIMIT_MAX = RATE_LIMIT_SEARCH;

const SCRAPER_UA_RE = new RegExp(
  [
    'python-requests', 'python-urllib', 'scrapy', 'httpclient',
    'go-http-client', 'java/', 'libwww-perl', 'wget', 'curl/',
    'postmanruntime', 'insomnia/', 'httpie/', 'axios/',
    'node-fetch', 'undici', 'got/', 'superagent',
    'selenium', 'phantomjs', 'headlesschrome', 'puppeteer',
    'bytespider', 'petalbot', 'semrushbot', 'ahrefsbot', 'dotbot',
    'mj12bot', 'barkrowler', 'dataforseobot',
  ].map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i'
);

/** Allowed origins for API POST requests (anti-scraping). Derived from APP_ORIGINS. */
const ALLOWED_API_ORIGINS = APP_ORIGINS;

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

const PERMISSIONS_POLICY = [
  'camera=()', 'microphone=()', 'geolocation=()', 'payment=()',
  'usb=()', 'serial=()', 'battery=()', 'display-capture=()',
  'accelerometer=()', 'gyroscope=()', 'magnetometer=()',
  'browsing-topics=()', 'interest-cohort=()',
].join(', ');

/**
 * Build a per-request CSP header with nonce to eliminate 'unsafe-inline'.
 * 'strict-dynamic' allows scripts loaded by nonce'd scripts (e.g., Turnstile sub-scripts).
 * 'self' and URL allowlists are kept for CSP2 browser fallback.
 */
function buildCspHeader(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval' https://challenges.cloudflare.com`,
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
  ].join('; ');
}

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

export async function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const pathname = request.nextUrl.pathname;

  // Generate per-request nonce for CSP (eliminates 'unsafe-inline' in script-src)
  const nonce = btoa(crypto.randomUUID());
  response.headers.set('x-nonce', nonce);

  // Apply all security headers (single source of truth — SH-001)
  applySecurityHeaders(response, nonce);

  // ═══════════════════════════════════════════════
  // FAST PATH: Static page GET requests
  // Skip rate limiting, signature verification, anti-enumeration, and tarpit
  // for non-API GET requests to known static pages.
  // These pages don't need protection beyond security headers.
  // Saves ~200-400ms TTFB on homepage and other static pages.
  // ═══════════════════════════════════════════════
  if (
    request.method === 'GET' &&
    !pathname.startsWith('/api/') &&
    !pathname.endsWith('/opengraph-image')
  ) {
    return response;
  }

  // CORS — reflect request Origin only if it's in our allowlist (not attacker-controlled)
  const requestOrigin = request.headers.get('origin');
  const allowedOrigin = requestOrigin && APP_ORIGINS.has(requestOrigin) ? requestOrigin : APP_URL;
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
      return applySecurityHeaders(NextResponse.json({ error: 'Server misconfigured' }, { status: 500 }), nonce);
    }
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !safeCompare(authHeader, `Bearer ${secret}`)) {
      return applySecurityHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), nonce);
    }
  }

  // Prevent caching of API responses (except /api/prices which uses revalidate)
  if (pathname.startsWith('/api/') && pathname !== '/api/prices') {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  }

  // Block known scraper User-Agents on API routes
  if (pathname.startsWith('/api/')) {
    const ua = request.headers.get('user-agent')?.toLowerCase() ?? '';
    if (SCRAPER_UA_RE.test(ua)) {
      return applySecurityHeaders(NextResponse.json(
        { error: 'Automated access is not permitted' },
        { status: 403 }
      ), nonce);
    }
    // Block requests with no User-Agent (legitimate browsers always send one)
    if (!request.headers.get('user-agent')) {
      return applySecurityHeaders(NextResponse.json(
        { error: 'User-Agent header is required' },
        { status: 400 }
      ), nonce);
    }
  }

  // Origin validation for POST API requests (anti-scraping).
  // Browsers always send the Origin header on POST; absence = non-browser client.
  // Skip cron routes (called by Vercel scheduler) and dev mode (localhost).
  if (
    request.method === 'POST' &&
    pathname.startsWith('/api/') &&
    !pathname.startsWith('/api/cron') &&
    !pathname.startsWith('/api/webhooks') &&
    process.env.NODE_ENV !== 'development'
  ) {
    const origin = request.headers.get('origin');
    if (!origin || !ALLOWED_API_ORIGINS.has(origin)) {
      return applySecurityHeaders(NextResponse.json({ error: 'Forbidden' }, { status: 403 }), nonce);
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
      return applySecurityHeaders(NextResponse.json({ error: 'Invalid request signature' }, { status: 403 }), nonce);
    }
  }

  // Anti-enumeration: detect mass handle lookups (e.g., scraping all creators)
  const handleMatch = pathname.match(HANDLE_ROUTE_RE);
  if (handleMatch) {
    const handle = handleMatch[1];
    const ip = getClientIp(request);

    if (!ip.startsWith('anon:') && isEnumerating(ip, handle)) {
      await sleep(3000);
      return applySecurityHeaders(NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': '300' } }
      ), nonce);
    }
  }

  // Rate limit BEFORE tarpit (L9): reject over-limit requests immediately
  // instead of wasting 5s of serverless function time tarpitting them first.
  const isRateLimitedPath =
    (pathname.startsWith('/api/') && !pathname.startsWith('/api/cron')) ||
    pathname.endsWith('/opengraph-image');

  if (isRateLimitedPath) {
    const rateLimitKey = getClientIp(request);

    const { generalLimiter, searchLimiter, feesLimiter } = await getRateLimiters();

    // Path-specific rate limits:
    // - /api/search, /api/resolve: 10 req/min (identity resolution oracle — M1)
    // - /api/fees/live*: 5 req/min (triggers 9 adapters × 10 wallets — M2)
    // - everything else: 30 req/min (general)
    const isSearchOrResolve = pathname === '/api/search' || pathname === '/api/resolve';
    const isFeesLive = pathname.startsWith('/api/fees/live');
    const upstashLimiter = isSearchOrResolve
      ? searchLimiter
      : isFeesLive
        ? feesLimiter
        : generalLimiter;

    if (!upstashLimiter && process.env.NODE_ENV === 'production' && !_warnedMissingUpstash) {
      _warnedMissingUpstash = true;
      console.error(
        '[middleware] CRITICAL: Upstash Redis not configured in production. ' +
        'Rate limiting is per-instance only and effectively bypassed in serverless.'
      );
    }

    if (upstashLimiter) {
      const { success, remaining } = await upstashLimiter.limit(rateLimitKey);
      if (!success) {
        return applySecurityHeaders(NextResponse.json(
          { error: 'Too many requests. Please try again later.' },
          {
            status: 429,
            headers: {
              'Retry-After': '60',
              'X-RateLimit-Remaining': '0',
            },
          }
        ), nonce);
      }
      response.headers.set('X-RateLimit-Remaining', String(remaining));
    } else {
      // Fallback: in-memory rate limiting (per-instance, not reliable in serverless).
      // Tighter limits compensate for per-instance reset on cold start.
      const inMemorySearchLimit = process.env.NODE_ENV === 'production' ? 5 : SEARCH_RATE_LIMIT_MAX;
      const inMemoryFeesLimit = process.env.NODE_ENV === 'production' ? 3 : 5;
      const inMemoryGeneralLimit = process.env.NODE_ENV === 'production' ? 15 : RATE_LIMIT_MAX;
      const effectiveLimit = isSearchOrResolve
        ? inMemorySearchLimit
        : isFeesLive
          ? inMemoryFeesLimit
          : inMemoryGeneralLimit;
      const limitKey = isSearchOrResolve
        ? `search:${rateLimitKey}`
        : isFeesLive
          ? `fees:${rateLimitKey}`
          : rateLimitKey;
      if (isRateLimited(limitKey, effectiveLimit)) {
        return applySecurityHeaders(NextResponse.json(
          { error: 'Too many requests. Please try again later.' },
          {
            status: 429,
            headers: { 'Retry-After': '60' },
          }
        ), nonce);
      }
    }

    // Reject oversized or unbounded POST bodies before they reach route handlers.
    if (request.method === 'POST' && !pathname.startsWith('/api/webhooks')) {
      const contentLength = request.headers.get('content-length');
      if (!contentLength) {
        return applySecurityHeaders(NextResponse.json(
          { error: 'Content-Length header is required' },
          { status: 411 }
        ), nonce);
      }
      const parsedLength = parseInt(contentLength, 10);
      if (isNaN(parsedLength) || parsedLength > MAX_BODY_SIZE) {
        return applySecurityHeaders(NextResponse.json(
          { error: 'Request body too large' },
          { status: 413 }
        ), nonce);
      }
    }
  }

  // Tarpit AFTER rate limit: only delay requests that weren't already rejected.
  // Saves serverless function time for rate-limited requests (L9).
  if (pathname.startsWith('/api/') || handleMatch) {
    const delay = getTarpitDelayMs(request);
    if (delay > 0) {
      await sleep(delay);
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|pdf)$).*)',
  ],
};
