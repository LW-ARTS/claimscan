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
    const { data: tokens } = await supabase
      .from('fee_records')
      .select('chain, token_address, token_symbol')
      .not('token_address', 'in', '("SOL","ETH")')
      .order('last_synced_at', { ascending: false })
      .limit(50);

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

    // Fetch prices in batches of 10
    const entries = Array.from(unique.values());
    let updated = 0;

    for (let i = 0; i < entries.length; i += 10) {
      const batch = entries.slice(i, i + 10);
      const results = await Promise.allSettled(
        batch.map(async (t) => {
          // Validate token address format before calling external price APIs
          if (!isValidTokenForChain(t.chain, t.address)) {
            console.warn(`[refresh-prices] skipping invalid address: ${t.chain}:${t.address}`);
            return;
          }

          const price = await getTokenPrice(t.chain, t.address);
          if (price > 0) {
            const { error: upsertErr } = await supabase.from('token_prices').upsert(
              {
                chain: t.chain,
                token_address: t.address,
                token_symbol: t.symbol,
                price_usd: price,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'chain,token_address' }
            );
            // Only count as updated if upsert actually succeeded
            if (upsertErr) {
              console.warn(`[refresh-prices] upsert failed for ${t.address}:`, upsertErr.message);
            } else {
              updated++;
            }
          }
        })
      );

      for (const result of results) {
        if (result.status === 'rejected') {
          console.warn('[refresh-prices] batch update failed:', result.reason);
        }
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
