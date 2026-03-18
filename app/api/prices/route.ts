import { NextResponse } from 'next/server';
import { getNativeTokenPrices, getTokenPrice } from '@/lib/prices';
import { isValidSolanaAddress } from '@/lib/chains/solana';
import { isValidEvmAddress } from '@/lib/chains/base';
import { VALID_CHAINS } from '@/lib/utils';

/** Cache native prices for 5 minutes via Next.js ISR. */
export const revalidate = 300;

/**
 * Validate that a token address looks legitimate for its chain.
 */
function isValidTokenAddress(chain: string, token: string): boolean {
  if (chain === 'sol') {
    return isValidSolanaAddress(token);
  }
  // base and eth use EVM addresses
  return isValidEvmAddress(token);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const chain = searchParams.get('chain');
    const token = searchParams.get('token');

    // If specific token requested, validate inputs before forwarding
    if (chain && token) {
      if (!VALID_CHAINS.has(chain)) {
        return NextResponse.json(
          { error: 'Invalid chain. Must be one of: sol, base, eth' },
          { status: 400 }
        );
      }

      if (!isValidTokenAddress(chain, token)) {
        return NextResponse.json(
          { error: 'Invalid token address format for the specified chain' },
          { status: 400 }
        );
      }

      const priceUsd = await getTokenPrice(
        chain as 'sol' | 'base' | 'eth',
        token
      );
      return NextResponse.json({ chain, token, priceUsd });
    }

    // Default: return native token prices
    const prices = await getNativeTokenPrices();
    return NextResponse.json(prices);
  } catch (err) {
    console.error('[prices] GET failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
