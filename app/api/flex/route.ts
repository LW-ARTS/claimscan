import { NextResponse } from 'next/server';

export const maxDuration = 60;

/**
 * GET /api/flex?handle=username
 *
 * Serves the OG flex card image as a downloadable PNG.
 * Internally fetches the Next.js OG image route and proxies it
 * with Content-Disposition: attachment for direct download.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const handle = searchParams.get('handle')?.trim();

  if (!handle || handle.length < 2 || handle.length > 256) {
    return NextResponse.json(
      { error: 'handle parameter required (2-256 chars)' },
      { status: 400 }
    );
  }

  if (!/^[a-zA-Z0-9_\-\.@]{2,64}$/.test(handle.slice(0, 64))) {
    return NextResponse.json(
      { error: 'Invalid handle format' },
      { status: 400 }
    );
  }

  // Sanitize handle for filename
  const safeHandle = handle.replace(/[^a-zA-Z0-9_\-\.]/g, '_').slice(0, 64);

  try {
    // Build the absolute URL to the OG image route
    // H-1: Validate host against allowlist to prevent SSRF via env var misconfiguration
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://claimscan.tech';
    const host = process.env.VERCEL_URL ?? new URL(appUrl).host;
    if (
      host !== 'claimscan.tech' &&
      host !== 'www.claimscan.tech' &&
      !host.endsWith('.vercel.app')
    ) {
      console.error(`[flex] SSRF blocked: resolved host "${host}" is not in allowlist`);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
    const ogUrl = `${protocol}://${host}/${encodeURIComponent(handle)}/opengraph-image`;

    const response = await fetch(ogUrl, {
      signal: AbortSignal.timeout(15000),
      headers: {
        // Forward cookies/auth for internal request
        'User-Agent': 'ClaimScan-Flex/1.0',
      },
    });

    if (!response.ok) {
      console.error(`[flex] OG image fetch failed: ${response.status} for handle=${handle}`);
      return NextResponse.json(
        { error: 'Failed to generate flex image' },
        { status: 502 }
      );
    }

    const imageBuffer = await response.arrayBuffer();

    // Determine if user wants download or inline display
    const download = searchParams.get('download') !== 'false';

    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': download
          ? `attachment; filename="claimscan-${safeHandle}.png"`
          : 'inline',
        'Cache-Control': 'public, max-age=300, s-maxage=600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('[flex] error:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
