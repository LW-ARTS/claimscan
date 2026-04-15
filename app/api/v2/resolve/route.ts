import 'server-only';
import { withX402 } from '@x402/next';
import { NextRequest, NextResponse } from 'next/server';
import { resolveOWSWallet, isOWSAvailable } from '@/lib/ows/resolve';
import { x402Server, feeRouteConfig } from '@/lib/x402/server';
import { declareDiscoveryExtension } from '@x402/extensions/bazaar';
import { PAYMENT_IDENTIFIER, declarePaymentIdentifierExtension } from '@x402/extensions/payment-identifier';

export const maxDuration = 60;

const handler = async (req: NextRequest): Promise<NextResponse<unknown>> => {
  const walletName = req.nextUrl.searchParams.get('ows_wallet');

  // Validate format before reflecting input into any response — prevents
  // log-poisoning via unconstrained reflection and tightens the API contract.
  if (!walletName || !/^[a-zA-Z0-9_-]{1,64}$/.test(walletName)) {
    return NextResponse.json(
      { error: 'ows_wallet parameter required (1-64 chars, alphanumeric/underscore/hyphen)', ows_available: isOWSAvailable() },
      { status: 400 },
    );
  }

  try {
    const resolved = resolveOWSWallet(walletName);

    if (!resolved.length) {
      return NextResponse.json(
        { error: 'OWS wallet not found or has no supported chain addresses', ows_available: isOWSAvailable() },
        { status: 404 },
      );
    }

    return NextResponse.json({
      owsWallet: walletName,
      addresses: resolved,
      supportedChains: ['sol', 'base', 'eth', 'bsc'],
      paidVia: 'x402',
    }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (err) {
    console.error('[v2/resolve] OWS resolution error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'OWS wallet resolution failed' }, { status: 500 });
  }
};

export const GET = withX402(
  handler,
  feeRouteConfig('$0.01', 'OWS wallet name → on-chain addresses (Solana / Base / ETH / BSC)', {
    ...declareDiscoveryExtension({
      input: { ows_wallet: '<ows_wallet_name>' },
      output: {
        example: {
          owsWallet: 'name',
          addresses: [{ chain: 'sol', address: '<base58>' }, { chain: 'base', address: '0x...' }],
          supportedChains: ['sol', 'base', 'eth', 'bsc'],
        },
      },
    }),
    [PAYMENT_IDENTIFIER]: declarePaymentIdentifierExtension(),
  }),
  x402Server,
);
