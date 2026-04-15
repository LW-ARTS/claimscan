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
 */

const UNAVATAR_PLACEHOLDER_ETAG = '"8e-LeWtyRFMgcxsay6eL9aKuVgFSO8"';
const UNAVATAR_PLACEHOLDER_BYTES = 2137;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
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

function isPlaceholderHeaders(res: Response): boolean {
  // Cheap pre-check on headers — saves the body read when unavatar honors
  // its own caching contract. Both ETag (Vercel may strip the surrounding
  // quotes when normalizing) and content-length forms are accepted.
  const etag = (res.headers.get('etag') ?? '').replace(/^W\//, '');
  if (etag === UNAVATAR_PLACEHOLDER_ETAG || etag === UNAVATAR_PLACEHOLDER_ETAG.slice(1, -1)) {
    return true;
  }
  const cl = res.headers.get('content-length');
  const ct = res.headers.get('content-type') ?? '';
  return cl === String(UNAVATAR_PLACEHOLDER_BYTES) && ct.startsWith('image/jpeg');
}

function isPlaceholderBody(buf: ArrayBuffer): boolean {
  // Authoritative fallback: the placeholder is exactly 2137 bytes. If the
  // header sniff missed (e.g. Vercel transforms ETag/content-length on the
  // way back) the body byteLength is the ground truth.
  return buf.byteLength === UNAVATAR_PLACEHOLDER_BYTES;
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

    if (isPlaceholderHeaders(res)) return { ok: null, isPlaceholder: true };

    const ct = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!ALLOWED_IMAGE_TYPES.has(ct)) return { ok: null, isPlaceholder: false };

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_AVATAR_BYTES) return { ok: null, isPlaceholder: false };
    if (isPlaceholderBody(buf)) return { ok: null, isPlaceholder: true };

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

  const primary = await fromUnavatar(provider, handle);
  if (primary.ok) return primary.ok;

  // Fallback only kicks in if unavatar served its placeholder OR errored.
  // Skipping when unavatar 404s (no placeholder, no scraper match) avoids
  // wasting a fxtwitter call on truly unknown handles.
  if (provider === 'x' && primary.isPlaceholder) {
    const fx = await fromFxTwitter(handle);
    if (fx) return fx;
  }

  return new NextResponse(null, { status: 404 });
}
