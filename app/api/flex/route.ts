import { NextResponse } from 'next/server';
import { resolveSafeHost, resolveInternalProtocol } from '@/lib/internal-fetch';

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

  // Full-string validation: length AND regex apply to the entire handle.
  // Previously slice(0, 67) let chars 68-256 bypass the format check even
  // though the whole string was passed to encodeURIComponent downstream.
  if (!handle || handle.length < 2 || handle.length > 67) {
    return NextResponse.json(
      { error: 'handle parameter required (2-67 chars)' },
      { status: 400 }
    );
  }

  if (!/^[a-zA-Z0-9_\-\.@:]{2,67}$/.test(handle)) {
    return NextResponse.json(
      { error: 'Invalid handle format' },
      { status: 400 }
    );
  }

  // Sanitize handle for filename
  const safeHandle = handle.replace(/[^a-zA-Z0-9_\-\.]/g, '_').slice(0, 64);

  try {
    // Build the absolute URL to the OG image route.
    // H-1/L-01: host allowlist lives in lib/internal-fetch.ts and is shared
    // with /api/og-download so both routes stay in lockstep.
    const host = resolveSafeHost();
    if (!host) {
      console.error('[flex] SSRF blocked: resolved host is not in allowlist');
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
    const ogUrl = `${resolveInternalProtocol()}://${host}/${encodeURIComponent(handle)}/opengraph-image`;

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
