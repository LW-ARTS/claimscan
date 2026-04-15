import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy avatar images for creator handles.
 *
 * Waterfall for X/Twitter handles:
 *   1. unavatar.io/x/{handle}?fallback=false — fast, CDN-cached, works for
 *      most accounts.
 *   2. fxtwitter user JSON (api.fxtwitter.com/{handle}) — pulls the real
 *      `avatar_url` from Twitter when unavatar's scraper returns its
 *      placeholder. Bumped to _400x400 for retina rendering before being
 *      streamed back through this proxy.
 *
 * TikTok handles only try unavatar (no fxtwitter equivalent).
 *
 * The placeholder unavatar serves on Twitter scrape failure is a constant
 * 2137-byte JPEG with a stable ETag — detecting it is what triggers the
 * fxtwitter fallback. Returns 404 only if BOTH sources fail, so the
 * frontend onError handler can render an initials chip.
 *
 * Negative cache: 404 results are cached in Upstash for 1h to short-circuit
 * repeat misses for the same handle. Caps amplification cost from cache-miss
 * enumeration even when an attacker stays within the 120 req/min rate limit.
 */

const UNAVATAR_PLACEHOLDER_ETAG = '"8e-LeWtyRFMgcxsay6eL9aKuVgFSO8"';
const UNAVATAR_PLACEHOLDER_BYTES = 2137;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const NEGATIVE_CACHE_TTL_S = 3600;
const NEGATIVE_CACHE_PREFIX = 'claimscan:avatar:404:';

let _redis: import('@upstash/redis').Redis | null = null;
try {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require('@upstash/redis') as typeof import('@upstash/redis');
    _redis = new Redis({ url, token });
  }
} catch { /* Redis unavailable — fall through to live fetches */ }
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
]);
const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=43200, stale-if-error=604800',
};

function isPlaceholderEtag(res: Response): boolean {
  // ETag is the only signal specific to unavatar's generic-face placeholder.
  // Size-only checks were tried but produce false positives — some real
  // Twitter PFPs are also exactly 2137 bytes (e.g. plain monochrome avatars).
  // Vercel may strip the surrounding quotes or weak-ETag prefix, so we
  // tolerate all three forms.
  const etag = (res.headers.get('etag') ?? '').replace(/^W\//, '');
  return etag === UNAVATAR_PLACEHOLDER_ETAG || etag === UNAVATAR_PLACEHOLDER_ETAG.slice(1, -1);
}

async function streamImage(url: string, timeoutMs: number): Promise<NextResponse | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'ClaimScan/1.0' },
      redirect: 'follow',
    });
    if (!res.ok) return null;

    const contentLength = res.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_AVATAR_BYTES) return null;

    const ct = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!ALLOWED_IMAGE_TYPES.has(ct)) return null;

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_AVATAR_BYTES) return null;

    return new NextResponse(buf, {
      status: 200,
      headers: { 'Content-Type': ct, ...CACHE_HEADERS },
    });
  } catch {
    return null;
  }
}

async function fromFxTwitter(handle: string): Promise<NextResponse | null> {
  try {
    const meta = await fetch(`https://api.fxtwitter.com/${encodeURIComponent(handle)}`, {
      signal: AbortSignal.timeout(3000),
      headers: { 'User-Agent': 'ClaimScan/1.0' },
    });
    if (!meta.ok) return null;
    const data = (await meta.json()) as { user?: { avatar_url?: string } };
    const avatarUrl = data?.user?.avatar_url;
    if (!avatarUrl || !avatarUrl.startsWith('https://pbs.twimg.com/')) return null;
    // _normal is 48x48; bumping to _400x400 gives a retina-quality crop.
    const hiRes = avatarUrl.replace(/_normal\.(jpe?g|png)$/i, '_400x400.$1');
    return await streamImage(hiRes, 4000);
  } catch {
    return null;
  }
}

async function fromUnavatar(provider: 'x' | 'tiktok', handle: string): Promise<{
  ok: NextResponse | null;
  isPlaceholder: boolean;
}> {
  try {
    const res = await fetch(`https://unavatar.io/${provider}/${handle}?fallback=false`, {
      signal: AbortSignal.timeout(4000),
      headers: { 'User-Agent': 'ClaimScan/1.0' },
      redirect: 'error',
    });
    if (!res.ok) return { ok: null, isPlaceholder: false };

    const contentLength = res.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_AVATAR_BYTES) {
      return { ok: null, isPlaceholder: false };
    }

    if (isPlaceholderEtag(res)) return { ok: null, isPlaceholder: true };

    const ct = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!ALLOWED_IMAGE_TYPES.has(ct)) return { ok: null, isPlaceholder: false };

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_AVATAR_BYTES) return { ok: null, isPlaceholder: false };

    return {
      ok: new NextResponse(buf, {
        status: 200,
        headers: { 'Content-Type': ct, ...CACHE_HEADERS },
      }),
      isPlaceholder: false,
    };
  } catch {
    return { ok: null, isPlaceholder: false };
  }
}

export async function GET(req: NextRequest) {
  const handle = req.nextUrl.searchParams.get('handle');
  const providerParam = req.nextUrl.searchParams.get('provider');
  const provider: 'x' | 'tiktok' = providerParam === 'tiktok' ? 'tiktok' : 'x';

  const handleRegex = provider === 'tiktok'
    ? /^[a-zA-Z0-9_.]{1,30}$/
    : /^[a-zA-Z0-9_]{1,50}$/;

  if (!handle || !handleRegex.test(handle)) {
    return NextResponse.json({ error: 'Invalid handle' }, { status: 400 });
  }

  const cacheKey = `${NEGATIVE_CACHE_PREFIX}${provider}:${handle}`;
  if (_redis) {
    const cached = await _redis.get(cacheKey).catch(() => null);
    if (cached) return new NextResponse(null, { status: 404 });
  }

  const primary = await fromUnavatar(provider, handle);
  if (primary.ok) return primary.ok;

  // Fallback whenever unavatar can't give us a real PFP — covers both the
  // generic placeholder hit (isPlaceholder) and the 404 path where unavatar's
  // scraper just couldn't find anything (e.g. kanyewest). The waterfall
  // accepts a brief extra latency in exchange for the real avatar.
  if (provider === 'x') {
    const fx = await fromFxTwitter(handle);
    if (fx) return fx;
  }

  if (_redis) {
    await _redis.setex(cacheKey, NEGATIVE_CACHE_TTL_S, '1').catch(() => {});
  }
  return new NextResponse(null, { status: 404 });
}
