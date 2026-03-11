import { NextResponse } from 'next/server';
import { createServiceClient, verifyCronSecret } from '@/lib/supabase/service';
import { fetchAllFees } from '@/lib/resolve/identity';
import { safeBigInt } from '@/lib/utils';
import type { ResolvedWallet } from '@/lib/platforms/types';

export const maxDuration = 60;

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  try {
    // Only re-index creators whose data is stale (updated > 1 hour ago)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: staleCreators } = await supabase
      .from('creators')
      .select('id, wallets(*)')
      .lt('updated_at', oneHourAgo)
      .order('updated_at', { ascending: true })
      .limit(20);

    if (!staleCreators || staleCreators.length === 0) {
      return NextResponse.json({ ok: true, indexed: 0 });
    }

    let indexed = 0;
    // Wallclock guard — stop processing before maxDuration to avoid hard timeout
    const deadline = Date.now() + 50_000; // 50s of 60s budget

    for (const creator of staleCreators) {
      if (Date.now() > deadline) {
        console.warn(`[index-fees] wallclock guard: processed ${indexed}, stopping early`);
        break;
      }

      const wallets = (creator.wallets as Array<{
        address: string;
        chain: 'sol' | 'base' | 'eth';
        source_platform: string;
      }>) ?? [];

      if (wallets.length === 0) {
        // Mark walletless creators as fresh to prevent infinite re-queuing
        await supabase
          .from('creators')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', creator.id);
        continue;
      }

      const resolvedWallets: ResolvedWallet[] = wallets.map((w) => ({
        address: w.address,
        chain: w.chain,
        sourcePlatform: w.source_platform as ResolvedWallet['sourcePlatform'],
      }));

      const fees = await fetchAllFees(resolvedWallets);

      if (fees.length > 0) {
        const feeRows = fees.map((fee) => ({
          creator_id: creator.id,
          creator_token_id: null,
          platform: fee.platform,
          chain: fee.chain,
          token_address: fee.tokenAddress,
          token_symbol: fee.tokenSymbol,
          total_earned: fee.totalEarned,
          total_claimed: fee.totalClaimed,
          total_unclaimed: fee.totalUnclaimed,
          total_earned_usd: fee.totalEarnedUsd,
          claim_status:
            safeBigInt(fee.totalUnclaimed) > 0n && safeBigInt(fee.totalClaimed) > 0n
              ? 'partially_claimed' as const
              : safeBigInt(fee.totalUnclaimed) > 0n
                ? 'unclaimed' as const
                : safeBigInt(fee.totalEarned) > 0n
                  ? 'claimed' as const
                  : 'unclaimed' as const,
          royalty_bps: fee.royaltyBps,
          last_synced_at: new Date().toISOString(),
        }));

        const { error: upsertError } = await supabase
          .from('fee_records')
          .upsert(feeRows, { onConflict: 'creator_id,platform,chain,token_address' });

        if (upsertError) {
          console.warn(`[index-fees] fee_records upsert failed for creator ${creator.id}:`, upsertError.message);
          continue; // Skip marking as fresh if upsert failed
        }

        // Only mark as fresh when fees were actually persisted successfully
        await supabase
          .from('creators')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', creator.id);

        indexed++;
      } else {
        // fees.length === 0 — adapters returned no data (genuine zero or transient failure).
        // Still update updated_at to prevent infinite re-queuing on every cron run.
        // The creator will be re-checked after the next stale window (1 hour).
        await supabase
          .from('creators')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', creator.id);
      }
    }

    return NextResponse.json({ ok: true, indexed });
  } catch (error) {
    console.error('Index fees error:', error);
    return NextResponse.json(
      { error: 'Fee indexing failed' },
      { status: 500 }
    );
  }
}
