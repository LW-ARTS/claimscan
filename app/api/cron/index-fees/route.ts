import { NextResponse } from 'next/server';
import { createServiceClient, verifyCronSecret } from '@/lib/supabase/service';
import { fetchAllFees } from '@/lib/resolve/identity';
import { safeBigInt } from '@/lib/utils';
import type { ResolvedWallet } from '@/lib/platforms/types';
import type { Platform, Chain } from '@/lib/supabase/types';

export const maxDuration = 10;

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  try {
    // Only re-index creators whose data is stale (updated > 1 hour ago)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: staleCreators, error: queryError } = await supabase
      .from('creators')
      .select('id, wallets(*)')
      .lt('updated_at', oneHourAgo)
      .order('updated_at', { ascending: true })
      .limit(5);

    if (queryError) {
      console.error('[index-fees] Failed to query stale creators:', queryError.message);
      return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
    }

    if (!staleCreators || staleCreators.length === 0) {
      return NextResponse.json({ ok: true, indexed: 0 });
    }

    let indexed = 0;
    // Wallclock guard — stop processing before maxDuration to avoid hard timeout
    const deadline = Date.now() + 8_000; // 8s of 10s budget

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

    // --- Phase 2: Token indexing (if requested and time permits) ---
    const url = new URL(request.url);
    let tokensIndexed = 0;

    if (url.searchParams.get('also') === 'tokens' && Date.now() < deadline) {
      try {
        const { getAllAdapters } = await import('@/lib/platforms');
        const GPA_PLATFORMS = new Set(['coinbarrel', 'believe', 'revshare']);
        const gpaAdapters = getAllAdapters().filter((a) => GPA_PLATFORMS.has(a.platform));
        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

        const { data: tokenCreators } = await supabase
          .from('creators')
          .select('id, last_token_sync_at, wallets(*)')
          .order('last_token_sync_at', { ascending: true, nullsFirst: true })
          .limit(1);

        for (const creator of tokenCreators ?? []) {
          if (Date.now() > deadline) break;
          if (creator.last_token_sync_at && creator.last_token_sync_at > tenMinAgo) continue;

          const wallets: ResolvedWallet[] = (creator.wallets ?? [])
            .filter((w: { address: string; chain: string; source_platform: string }) => w.address && w.chain)
            .map((w: { address: string; chain: string; source_platform: string }) => ({
              address: w.address,
              chain: w.chain as ResolvedWallet['chain'],
              sourcePlatform: w.source_platform as ResolvedWallet['sourcePlatform'],
            }));

          if (wallets.length === 0) continue;

          const discovered: Array<{
            creator_id: string;
            platform: Platform;
            chain: Chain;
            token_address: string;
            token_symbol: string | null;
            token_name: string | null;
            token_image_url: string | null;
          }> = [];

          const tasks = wallets.flatMap((wallet) =>
            gpaAdapters
              .filter((a) => a.chain === wallet.chain)
              .map(async (adapter) => {
                try {
                  const tokens = await adapter.getCreatorTokens(wallet.address);
                  for (const token of tokens) {
                    discovered.push({
                      creator_id: creator.id,
                      platform: token.platform,
                      chain: token.chain,
                      token_address: token.tokenAddress,
                      token_symbol: token.symbol,
                      token_name: token.name,
                      token_image_url: token.imageUrl,
                    });
                  }
                } catch (err) {
                  console.warn(`[index-fees+tokens] ${adapter.platform} failed:`, err instanceof Error ? err.message : err);
                }
              })
          );

          await Promise.allSettled(tasks);

          if (discovered.length > 0) {
            const { error } = await supabase
              .from('creator_tokens')
              .upsert(discovered, { onConflict: 'token_address,chain' });
            if (!error) tokensIndexed += discovered.length;
          }

          await supabase
            .from('creators')
            .update({ last_token_sync_at: new Date().toISOString() })
            .eq('id', creator.id);
        }
      } catch (tokenErr) {
        console.warn('[index-fees] token indexing phase failed:', tokenErr instanceof Error ? tokenErr.message : tokenErr);
      }
    }

    return NextResponse.json({ ok: true, indexed, tokensIndexed });
  } catch (error) {
    console.error('Index fees error:', error);
    return NextResponse.json(
      { error: 'Fee indexing failed' },
      { status: 500 }
    );
  }
}
