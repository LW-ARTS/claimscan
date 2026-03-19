import { NextResponse } from 'next/server';
import { createServiceClient, verifyCronSecret } from '@/lib/supabase/service';
import { getNativeTokenPrices, getTokenPrice } from '@/lib/prices';
import { isValidSolanaAddress } from '@/lib/chains/solana';
import { isValidEvmAddress } from '@/lib/chains/base';

export const maxDuration = 60;

/**
 * Validate that a token address is well-formed for its chain
 * before passing it to external price APIs.
 */
function isValidTokenForChain(chain: string, address: string): boolean {
  if (chain === 'sol') return isValidSolanaAddress(address);
  return isValidEvmAddress(address);
}

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  try {
    // Update native token prices (SOL, ETH)
    const nativePrices = await getNativeTokenPrices();

    // Only upsert native prices when they are valid (> 0) to avoid
    // corrupting the price table with $0 during API outages
    const now = new Date().toISOString();
    if (nativePrices.sol > 0) {
      const { error: solErr } = await supabase
        .from('token_prices')
        .upsert({
          chain: 'sol' as const,
          token_address: 'SOL',
          token_symbol: 'SOL',
          price_usd: nativePrices.sol,
          updated_at: now,
        }, { onConflict: 'chain,token_address' });
      if (solErr) console.warn('[refresh-prices] SOL upsert failed:', solErr.message);
    }
    if (nativePrices.eth > 0) {
      const { error: ethErr } = await supabase
        .from('token_prices')
        .upsert({
          chain: 'base' as const,
          token_address: 'ETH',
          token_symbol: 'ETH',
          price_usd: nativePrices.eth,
          updated_at: now,
        }, { onConflict: 'chain,token_address' });
      if (ethErr) console.warn('[refresh-prices] ETH upsert failed:', ethErr.message);
    }

    // Get unique token addresses from fee_records that need price updates
    const { data: tokens, error: tokensError } = await supabase
      .from('fee_records')
      .select('chain, token_address, token_symbol')
      .not('token_address', 'in', '("SOL","ETH")')
      .not('token_address', 'like', '%:%')
      .order('last_synced_at', { ascending: false })
      .limit(15);

    if (tokensError) {
      console.error('[refresh-prices] Failed to query fee_records:', tokensError.message);
      return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
    }

    // Deduplicate
    const unique = new Map<string, { chain: 'sol' | 'base' | 'eth'; address: string; symbol: string }>();
    for (const t of tokens ?? []) {
      const key = `${t.chain}:${t.token_address}`;
      if (!unique.has(key)) {
        unique.set(key, {
          chain: t.chain,
          address: t.token_address,
          symbol: t.token_symbol ?? 'UNKNOWN',
        });
      }
    }

    // Fetch prices in parallel batches of 10, then batch-upsert all results
    const entries = Array.from(unique.values());
    const priceRows: { chain: 'sol' | 'base' | 'eth'; token_address: string; token_symbol: string; price_usd: number; updated_at: string }[] = [];

    for (let i = 0; i < entries.length; i += 10) {
      const batch = entries.slice(i, i + 10);
      const results = await Promise.allSettled(
        batch.map(async (t) => {
          if (!isValidTokenForChain(t.chain, t.address)) {
            console.warn(`[refresh-prices] skipping invalid address: ${t.chain}:${t.address}`);
            return null;
          }
          const price = await getTokenPrice(t.chain, t.address);
          if (price > 0) {
            return { chain: t.chain, token_address: t.address, token_symbol: t.symbol, price_usd: price, updated_at: new Date().toISOString() };
          }
          return null;
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          priceRows.push(result.value);
        } else if (result.status === 'rejected') {
          console.warn('[refresh-prices] price fetch failed:', result.reason);
        }
      }
    }

    // Single batch upsert instead of N individual writes
    let updated = 0;
    if (priceRows.length > 0) {
      const { error: batchErr } = await supabase
        .from('token_prices')
        .upsert(priceRows, { onConflict: 'chain,token_address' });
      if (batchErr) {
        console.warn('[refresh-prices] batch upsert failed:', batchErr.message);
      } else {
        updated = priceRows.length;
      }
    }

    return NextResponse.json({
      ok: true,
      nativePrices,
      tokensUpdated: updated,
      totalTokens: entries.length,
    });
  } catch (error) {
    console.error('Price refresh error:', error);
    return NextResponse.json(
      { error: 'Price refresh failed' },
      { status: 500 }
    );
  }
}
