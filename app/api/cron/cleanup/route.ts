import { NextResponse } from 'next/server';
import { createServiceClient, verifyCronSecret } from '@/lib/supabase/service';
import { getNativeTokenPrices, getTokenPrice } from '@/lib/prices';
import { isValidSolanaAddress } from '@/lib/chains/solana';
import { isValidEvmAddress } from '@/lib/chains/base';

export const maxDuration = 10;

/**
 * Combined cleanup + price refresh cron.
 * Vercel Hobby allows only 2 cron jobs, so this route handles both.
 * Called via `?also=prices` from vercel.json.
 *
 * The individual `/api/cron/refresh-prices` route still works standalone
 * for manual invocation.
 */
export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const wallclockStart = Date.now();

  try {
    // --- Phase 1: Cleanup (fast DB operations) ---

    // Clean search_log older than 30 days
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    const { count: logsDeleted } = await supabase
      .from('search_log')
      .delete({ count: 'exact' })
      .lt('searched_at', thirtyDaysAgo);

    // Clean orphaned creators — batch delete instead of N+1
    let creatorsDeleted = 0;
    const { data: allCreators } = await supabase
      .from('creators')
      .select('id, wallets(id), fee_records(id)')
      .order('created_at', { ascending: true })
      .limit(200);

    if (allCreators) {
      const orphanIds = allCreators
        .filter((c) => {
          const hasWallets = Array.isArray(c.wallets) && c.wallets.length > 0;
          const hasFees = Array.isArray(c.fee_records) && c.fee_records.length > 0;
          return !hasWallets && !hasFees;
        })
        .map((c) => c.id);

      if (orphanIds.length > 0) {
        const { count } = await supabase
          .from('creators')
          .delete({ count: 'exact' })
          .in('id', orphanIds);
        creatorsDeleted = count ?? 0;
      }
    }

    // Expire stale claim_attempts (pending/signing > 5min = blockhash expired)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count: claimsPending } = await supabase
      .from('claim_attempts')
      .update(
        { status: 'expired', error_reason: 'Blockhash expired (stale)', updated_at: new Date().toISOString() },
        { count: 'exact' }
      )
      .in('status', ['pending', 'signing'])
      .lt('created_at', fiveMinAgo);

    // Expire submitted claims where updated_at > 2 minutes ago
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { count: claimsExpired } = await supabase
      .from('claim_attempts')
      .update(
        { status: 'expired', error_reason: 'Transaction confirmation timeout', updated_at: new Date().toISOString() },
        { count: 'exact' }
      )
      .eq('status', 'submitted')
      .lt('updated_at', twoMinAgo);

    // Clean stale token_prices (not updated in 7 days)
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const { count: pricesDeleted } = await supabase
      .from('token_prices')
      .delete({ count: 'exact' })
      .lt('updated_at', sevenDaysAgo);

    // --- Phase 2: Price refresh (if requested and time permits) ---
    const url = new URL(request.url);
    let tokensUpdated = 0;

    if (url.searchParams.get('also') === 'prices' && Date.now() - wallclockStart < 4_000) {
      try {
        // Budget remaining time for price fetch (leave 1s buffer for DB writes)
        const priceTimeout = Math.max(1000, 9_000 - (Date.now() - wallclockStart));
        const nativePrices = await Promise.race([
          getNativeTokenPrices(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Price fetch budget exceeded')), priceTimeout)
          ),
        ]);
        const now = new Date().toISOString();

        // Upsert native prices (SOL, ETH) in parallel
        await Promise.allSettled([
          nativePrices.sol > 0
            ? supabase.from('token_prices').upsert(
                { chain: 'sol' as const, token_address: 'SOL', token_symbol: 'SOL', price_usd: nativePrices.sol, updated_at: now },
                { onConflict: 'chain,token_address' }
              )
            : Promise.resolve(),
          nativePrices.eth > 0
            ? supabase.from('token_prices').upsert(
                { chain: 'base' as const, token_address: 'ETH', token_symbol: 'ETH', price_usd: nativePrices.eth, updated_at: now },
                { onConflict: 'chain,token_address' }
              )
            : Promise.resolve(),
        ]);

        // Fetch a few token prices if time allows
        if (Date.now() - wallclockStart < 7_000) {
          const { data: tokens } = await supabase
            .from('fee_records')
            .select('chain, token_address, token_symbol')
            .not('token_address', 'in', '("SOL","ETH")')
            .order('last_synced_at', { ascending: false })
            .limit(5);

          const unique = new Map<string, { chain: 'sol' | 'base' | 'eth'; address: string; symbol: string }>();
          for (const t of tokens ?? []) {
            const key = `${t.chain}:${t.token_address}`;
            if (!unique.has(key)) {
              unique.set(key, { chain: t.chain, address: t.token_address, symbol: t.token_symbol ?? 'UNKNOWN' });
            }
          }

          const priceRows: Array<{ chain: 'sol' | 'base' | 'eth'; token_address: string; token_symbol: string; price_usd: number; updated_at: string }> = [];
          const entries = Array.from(unique.values());
          const results = await Promise.allSettled(
            entries.map(async (t) => {
              const isValid = t.chain === 'sol' ? isValidSolanaAddress(t.address) : isValidEvmAddress(t.address);
              if (!isValid) return null;
              const price = await getTokenPrice(t.chain, t.address);
              return price > 0 ? { chain: t.chain, token_address: t.address, token_symbol: t.symbol, price_usd: price, updated_at: new Date().toISOString() } : null;
            })
          );

          for (const r of results) {
            if (r.status === 'fulfilled' && r.value) priceRows.push(r.value);
          }

          if (priceRows.length > 0) {
            await supabase.from('token_prices').upsert(priceRows, { onConflict: 'chain,token_address' });
            tokensUpdated = priceRows.length;
          }
        }
      } catch (priceErr) {
        console.warn('[cleanup] price refresh phase failed:', priceErr instanceof Error ? priceErr.message : priceErr);
      }
    }

    return NextResponse.json({
      ok: true,
      logsDeleted: logsDeleted ?? 0,
      creatorsDeleted,
      pricesDeleted: pricesDeleted ?? 0,
      claimsPending: claimsPending ?? 0,
      claimsExpired: claimsExpired ?? 0,
      tokensUpdated,
      durationMs: Date.now() - wallclockStart,
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json(
      { error: 'Cleanup failed' },
      { status: 500 }
    );
  }
}
