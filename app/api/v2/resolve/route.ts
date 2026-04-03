import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { resolveOWSWallet, isOWSAvailable } from '@/lib/ows/resolve';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const walletName = req.nextUrl.searchParams.get('ows_wallet');

  if (!walletName) {
    return NextResponse.json(
      { error: 'ows_wallet parameter required', ows_available: isOWSAvailable() },
      { status: 400 },
    );
  }

  try {
    const resolved = resolveOWSWallet(walletName);

    if (!resolved.length) {
      return NextResponse.json(
        { error: `OWS wallet "${walletName}" not found or has no supported chain addresses`, ows_available: isOWSAvailable() },
        { status: 404 },
      );
    }

    return NextResponse.json({
      owsWallet: walletName,
      addresses: resolved,
      supportedChains: ['sol', 'base', 'eth', 'bsc'],
      hint: 'Use any address with /api/v2/fees or /api/v2/intelligence (x402 paid endpoints)',
    });
  } catch (err) {
    console.error('[v2/resolve] OWS resolution error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'OWS wallet resolution failed' }, { status: 500 });
  }
}
