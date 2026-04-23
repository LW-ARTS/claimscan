import { NextRequest, NextResponse } from 'next/server';
import { resolveSafeHost, resolveInternalProtocol } from '@/lib/internal-fetch';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;
  const decoded = decodeURIComponent(handle);
  const safeHandle = decoded.replace(/[^a-zA-Z0-9_\-\.]/g, '').slice(0, 64);

  // Normalize TikTok/GitHub URL forms to tt:/gh: prefix so opengraph-image.tsx
  // routes to the correct DB column and avatar provider.
  const ttMatch = decoded.match(/tiktok\.com\/@?([a-zA-Z0-9_.]{2,24})(?:\/|$|\?)/i);
  const ghMatch = !ttMatch && decoded.match(/github\.com\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,38})(?:\/|$|\?)/i);
  const ogSlug = ttMatch ? `tt:${ttMatch[1]}`
    : ghMatch ? `gh:${ghMatch[1]}`
    : decoded.replace(/[^a-zA-Z0-9_\-\.:]/g, '').slice(0, 67);

  // H-1 parity with /api/flex: resolve host from env allowlist, never from
  // the untrusted request origin (which can be influenced by X-Forwarded-Host
  // on misconfigured proxies).
  const host = resolveSafeHost();
  if (!host) {
    console.error('[og-download] SSRF blocked: resolved host not in allowlist');
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
  const ogRes = await fetch(`${resolveInternalProtocol()}://${host}/${encodeURIComponent(ogSlug)}/opengraph-image`, {
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
