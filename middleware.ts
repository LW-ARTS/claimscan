import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Simple in-memory rate limiter for API routes
// NOTE: This is best-effort only — in serverless/Edge environments,
// each instance has its own map. Use Upstash Redis for production-grade limiting.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30; // 30 requests per minute per IP

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

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  // LRU eviction instead of full clear to prevent DDoS bypass
  if (rateLimitMap.size > 10_000) evictStaleEntries();

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
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
  }, RATE_LIMIT_WINDOW_MS * 2);
}

/**
 * Constant-time string comparison to prevent timing side-channel attacks.
 * Falls back to byte-by-byte XOR when crypto.timingSafeEqual is unavailable in Edge.
 */
function safeCompare(a: string, b: string): boolean {
  // Pad to equal length to avoid leaking length info via timing
  const maxLen = Math.max(a.length, b.length);
  let mismatch = a.length !== b.length ? 1 : 0;
  for (let i = 0; i < maxLen; i++) {
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

/** Max POST body size (4KB) to prevent memory exhaustion from large payloads */
const MAX_BODY_SIZE = 4096;

export function middleware(request: NextRequest) {
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
      "script-src 'self' 'wasm-unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://pbs.twimg.com https://abs.twimg.com https://avatars.githubusercontent.com https://imagedelivery.net https://ipfs.io",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://*.supabase.co https://api.coingecko.com https://api.dexscreener.com https://api.jup.ag https://*.ingest.sentry.io",
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
  const allowedOrigin = process.env.NEXT_PUBLIC_APP_URL || 'https://claimscan.com';
  response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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

  // Rate limit public API endpoints
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/cron')) {
    // Use Vercel's runtime-injected IP (not spoofable), falling back to headers
    // set by trusted reverse proxy. On Vercel, request.ip is injected by the platform.
    const ip = (request as unknown as { ip?: string }).ip
      ?? request.headers.get('x-real-ip')
      ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();

    // If IP cannot be determined, apply conservative rate limiting under a shared key
    // instead of skipping — prevents bypass by omitting headers
    const rateLimitKey = ip || '__unknown_ip__';
    if (isRateLimited(rateLimitKey)) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: { 'Retry-After': '60' },
        }
      );
    }

    // Reject oversized or unbounded POST bodies before they reach route handlers.
    // Block requests missing Content-Length entirely to prevent bypass.
    if (request.method === 'POST') {
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
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
