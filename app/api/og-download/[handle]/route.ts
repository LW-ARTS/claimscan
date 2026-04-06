import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;
  const decoded = decodeURIComponent(handle);
  const safeHandle = decoded.replace(/[^a-zA-Z0-9_\-\.]/g, '').slice(0, 64);

  // Fetch the OG image from the opengraph-image route
  const origin = request.nextUrl.origin;
  const ogRes = await fetch(`${origin}/${encodeURIComponent(safeHandle)}/opengraph-image`, {
    signal: AbortSignal.timeout(20_000),
  });

  if (!ogRes.ok) {
    return NextResponse.json({ error: 'Failed to generate image' }, { status: 500 });
  }

  const imageBuffer = await ogRes.arrayBuffer();

  return new NextResponse(imageBuffer, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="claimscan-${safeHandle}.png"`,
      'Cache-Control': 'no-store',
    },
  });
}
