import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy avatar images from unavatar.io server-side.
 * Same approach as the OG card — avoids CSP issues and stale browser caches.
 * Usage: /api/avatar?handle=elonmusk[&provider=tiktok]
 *
 * Detects unavatar's generic placeholder (constant 2137-byte JPEG with a
 * stable ETag) and 404s instead of proxying it through. That lets the
 * frontend onError handler fall back to initials instead of rendering the
 * same default face on every leaderboard row when Twitter scraping fails.
 */

const UNAVATAR_PLACEHOLDER_ETAG = '"8e-LeWtyRFMgcxsay6eL9aKuVgFSO8"';
const UNAVATAR_PLACEHOLDER_BYTES = 2137;

export async function GET(req: NextRequest) {
  const handle = req.nextUrl.searchParams.get('handle');
  const providerParam = req.nextUrl.searchParams.get('provider');
  const provider = providerParam === 'tiktok' ? 'tiktok' : 'x';

  // TikTok handles allow dots; Twitter/X handles do not.
  const handleRegex = provider === 'tiktok'
    ? /^[a-zA-Z0-9_.]{1,30}$/
    : /^[a-zA-Z0-9_]{1,50}$/;

  if (!handle || !handleRegex.test(handle)) {
    return NextResponse.json({ error: 'Invalid handle' }, { status: 400 });
  }

  try {
    const res = await fetch(`https://unavatar.io/${provider}/${handle}?fallback=false`, {
      signal: AbortSignal.timeout(4000),
      headers: { 'User-Agent': 'ClaimScan/1.0' },
      redirect: 'error',
    });

    if (!res.ok) {
      return new NextResponse(null, { status: 404 });
    }

    // Guard against oversized responses (max 2MB for an avatar image)
    const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
    const contentLength = res.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_AVATAR_BYTES) {
      return new NextResponse(null, { status: 502 });
    }

    // Detect unavatar's constant placeholder before paying the body read.
    // ETag is the most reliable signal; content-length + JPEG content-type
    // is the belt-and-suspenders backup if unavatar ever rotates the ETag
    // header but keeps serving the same image bytes.
    const etag = res.headers.get('etag');
    const isPlaceholderByEtag = etag === UNAVATAR_PLACEHOLDER_ETAG;
    const isPlaceholderBySize =
      contentLength === String(UNAVATAR_PLACEHOLDER_BYTES) &&
      (res.headers.get('content-type') ?? '').startsWith('image/jpeg');
    if (isPlaceholderByEtag || isPlaceholderBySize) {
      return new NextResponse(null, { status: 404 });
    }

    // Allowlist content types BEFORE reading body to prevent proxying HTML/JS from upstream
    const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']);
    const rawCt = res.headers.get('content-type') ?? '';
    const ct = rawCt.split(';')[0].trim();
    if (!ALLOWED_IMAGE_TYPES.has(ct)) return new NextResponse(null, { status: 502 });

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_AVATAR_BYTES) {
      return new NextResponse(null, { status: 502 });
    }

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': ct,
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=43200, stale-if-error=604800',
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
