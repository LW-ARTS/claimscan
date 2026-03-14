import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy avatar images from unavatar.io server-side.
 * Same approach as the OG card — avoids CSP issues and stale browser caches.
 * Usage: /api/avatar?handle=elonmusk
 */
export async function GET(req: NextRequest) {
  const handle = req.nextUrl.searchParams.get('handle');
  if (!handle || !/^[a-zA-Z0-9_]{1,50}$/.test(handle)) {
    return new NextResponse(null, { status: 400 });
  }

  try {
    const res = await fetch(`https://unavatar.io/x/${handle}`, {
      signal: AbortSignal.timeout(4000),
      headers: { 'User-Agent': 'ClaimScan/1.0' },
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

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_AVATAR_BYTES) {
      return new NextResponse(null, { status: 502 });
    }

    // Allowlist content types to prevent proxying HTML/JS from upstream
    const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif']);
    const rawCt = res.headers.get('content-type') ?? 'image/jpeg';
    const ct = ALLOWED_IMAGE_TYPES.has(rawCt.split(';')[0].trim()) ? rawCt : 'image/jpeg';

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
