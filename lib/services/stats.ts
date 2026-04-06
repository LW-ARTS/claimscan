import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { getNativeTokenPrices } from '@/lib/prices';

export interface ClaimScanStats {
  totalFeesUsd: number;
  walletsScanned: number;
  unclaimedPercent: number;
}

const DECIMALS_PER_CHAIN: Record<string, number> = {
  sol: 9,
  base: 18,
  eth: 18,
  bsc: 18,
};

/**
 * Aggregate homepage stats directly from Supabase.
 * Uses raw total_earned BigInt grouped by chain, then multiplies by live native
 * token prices. Cached via Next.js ISR (see callers).
 */
export async function getStats(): Promise<ClaimScanStats> {
  try {
    const db = createServiceClient();

    // Fetch aggregated sums via RPC, or page through records to aggregate in-memory
    let offset = 0;
    const chunkSize = 1000;
    const MAX_ROWS = 50_000;
    const rawByChain: Record<string, bigint> = { sol: 0n, base: 0n, eth: 0n, bsc: 0n };

    while (offset < MAX_ROWS) {
      const { data, error } = await db
        .from('fee_records')
        .select('chain, total_earned')
        .not('total_earned', 'is', null)
        .range(offset, offset + chunkSize - 1);

      if (error || !data || data.length === 0) break;

      for (const r of data) {
        try {
          const amount = BigInt(r.total_earned ?? '0');
          if (r.chain in rawByChain) {
            rawByChain[r.chain] += amount;
          }
        } catch {
          // Skip invalid BigInt strings
        }
      }

      if (data.length < chunkSize) break;
      offset += chunkSize;
    }

    // Multiply raw amounts by live native token prices
    const prices = await getNativeTokenPrices().catch(() => ({ sol: 0, eth: 0, bnb: 0 }));
    const pricePerChain: Record<string, number> = {
      sol: prices.sol,
      base: prices.eth,
      eth: prices.eth,
      bsc: prices.bnb,
    };

    let totalFeesUsd = 0;
    for (const [chain, rawAmount] of Object.entries(rawByChain)) {
      if (rawAmount === 0n) continue;
      const decimals = DECIMALS_PER_CHAIN[chain] ?? 18;
      const divisor = 10n ** BigInt(decimals);
      // Convert BigInt to decimal number via string (safe for large values)
      const amountStr = rawAmount.toString();
      const amount = Number(amountStr) / Number(divisor);
      totalFeesUsd += amount * (pricePerChain[chain] ?? 0);
    }

    const walletsResult = await db.from('wallets').select('id', { count: 'exact', head: true });
    const walletsScanned = walletsResult.count ?? 0;

    return {
      totalFeesUsd: Math.round(totalFeesUsd),
      walletsScanned,
      unclaimedPercent: 0,
    };
  } catch {
    return { totalFeesUsd: 0, walletsScanned: 0, unclaimedPercent: 0 };
  }
}
