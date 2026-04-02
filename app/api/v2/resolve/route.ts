import { NextRequest, NextResponse } from 'next/server';
import { resolveOWSWallet, isOWSAvailable } from '@/lib/ows/resolve';

/**
 * GET /api/v2/resolve?ows_wallet=<name>
 *
 * Resolves an OWS wallet name into multi-chain addresses.
 * Free endpoint (no x402 paywall) — enables agent discovery.
 */
export async function GET(req: NextRequest) {
  const walletName = req.nextUrl.searchParams.get('ows_wallet');

  if (!walletName) {
    return NextResponse.json(
      {
        error: 'ows_wallet parameter required',
        hint: 'Pass the OWS wallet name to resolve multi-chain addresses',
        ows_available: isOWSAvailable(),
      },
      { status: 400 },
    );
  }

  const resolved = resolveOWSWallet(walletName);

  if (!resolved.length) {
    return NextResponse.json(
      {
        error: `OWS wallet "${walletName}" not found or has no supported chain addresses`,
        ows_available: isOWSAvailable(),
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    owsWallet: walletName,
    addresses: resolved,
    supportedChains: ['sol', 'base', 'eth', 'bsc'],
    hint: 'Use any address with /api/v2/fees or /api/v2/intelligence (x402 paid endpoints)',
  });
}
