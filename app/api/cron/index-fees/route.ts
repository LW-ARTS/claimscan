import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createServiceClient, verifyCronSecret } from '@/lib/supabase/service';
import { fetchAllFees } from '@/lib/resolve/identity';
import { pruneStaleFeeRowsForCreator } from '@/lib/services/fee-sync';
import { tryAcquireLock, releaseLock } from '@/lib/distributed-lock';
import { readBondingCurve, readSharingConfig } from '@/lib/chains/solana';
import { PublicKey } from '@solana/web3.js';
import { safeBigInt } from '@/lib/utils';
import { createLogger } from '@/lib/logger';
import type { ResolvedWallet, TokenFee } from '@/lib/platforms/types';
import type { Platform, Chain } from '@/lib/supabase/types';

const log = createLogger('cron:index-fees');

export const maxDuration = 60;

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
    const deadline = Date.now() + 55_000; // 55s of 60s budget

    for (const creator of staleCreators) {
      if (Date.now() > deadline) {
        console.warn(`[index-fees] wallclock guard: processed ${indexed}, stopping early`);
        break;
      }

      // Acquire fee-sync lock to prevent TOCTOU race with /api/search.
      // Both this cron and creator.ts:freshResolve contend on the same key.
      // 90s TTL covers the full per-creator processing budget.
      const feeSyncLockKey = `fee-sync:${creator.id}`;
      const gotLock = await tryAcquireLock(feeSyncLockKey, 90);
      if (!gotLock) {
        log.info('cron skip: fee-sync lock held by another process', { creatorId: creator.id });
        continue;
      }

      try {
      const wallets = (creator.wallets as Array<{
        address: string;
        chain: Chain;
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

      const { fees, syncedPlatforms } = await fetchAllFees(resolvedWallets);

      // Prune stale rows for any successfully-synced platform whose fresh
      // data no longer includes a previously-stored token. Runs even when
      // `fees` is empty so that creators who lost fee-recipient status get
      // cleaned up. Bags is exempt (uses detectDisappearedTokens elsewhere).
      try {
        const pruneResult = await pruneStaleFeeRowsForCreator(creator.id, fees, syncedPlatforms, supabase, log);
        if (pruneResult.selectFailed) {
          log.error('cron prune: SELECT failed for creator', { creatorId: creator.id });
          Sentry.captureMessage('cron prune SELECT failed', {
            level: 'error',
            extra: { creatorId: creator.id },
          });
        } else if (pruneResult.deleteFailures > 0) {
          log.error('cron prune: partial DELETE failures', {
            creatorId: creator.id,
            attempted: pruneResult.deleteAttempted,
            failures: pruneResult.deleteFailures,
          });
          Sentry.captureMessage('cron prune partial failure', {
            level: 'warning',
            extra: {
              creatorId: creator.id,
              attempted: pruneResult.deleteAttempted,
              failures: pruneResult.deleteFailures,
            },
          });
        } else if (pruneResult.deleted > 0) {
          log.info('cron prune: cleaned stale fee_records', {
            creatorId: creator.id,
            deleted: pruneResult.deleted,
          });
        }
      } catch (pruneErr) {
        log.error('cron prune: unexpected exception', {
          creatorId: creator.id,
          err: pruneErr instanceof Error ? pruneErr.message : String(pruneErr),
        });
        Sentry.captureException(pruneErr, {
          tags: { phase: 'cron-prune' },
          extra: { creatorId: creator.id },
        });
      }

      if (fees.length > 0) {
        // Fetch existing claimed values to prevent regression (adapters may return '0' on rate limit)
        const tokenAddresses = fees.map((f) => f.tokenAddress);
        const { data: existingRecords } = await supabase
          .from('fee_records')
          .select('token_address, platform, chain, total_claimed')
          .eq('creator_id', creator.id)
          .in('token_address', tokenAddresses)
          .limit(5000);

        const existingClaimedMap = new Map(
          (existingRecords ?? []).map((r) => [`${r.token_address}:${r.platform}:${r.chain}`, r.total_claimed])
        );

        const feeRows = fees.map((fee) => {
          const key = `${fee.tokenAddress}:${fee.platform}:${fee.chain}`;
          const existingClaimed = existingClaimedMap.get(key);
          const totalClaimed = existingClaimed && safeBigInt(existingClaimed) > safeBigInt(fee.totalClaimed)
            ? existingClaimed
            : fee.totalClaimed;
          // Recompute totalEarned when claimed was preserved to maintain invariant
          let totalEarned = fee.totalEarned;
          if (existingClaimed && safeBigInt(existingClaimed) > safeBigInt(fee.totalClaimed)) {
            totalEarned = (safeBigInt(totalClaimed) + safeBigInt(fee.totalUnclaimed)).toString();
          }

          return {
            creator_id: creator.id,
            creator_token_id: null,
            platform: fee.platform,
            chain: fee.chain,
            token_address: fee.tokenAddress,
            token_symbol: fee.tokenSymbol,
            total_earned: totalEarned,
            total_claimed: totalClaimed,
            total_unclaimed: fee.totalUnclaimed,
            total_earned_usd: fee.totalEarnedUsd,
            claim_status:
              fee.feeType === 'cashback'
                ? 'auto_distributed' as const
                : safeBigInt(fee.totalUnclaimed) > 0n && safeBigInt(totalClaimed) > 0n
                  ? 'partially_claimed' as const
                  : safeBigInt(fee.totalUnclaimed) > 0n
                    ? 'unclaimed' as const
                    : safeBigInt(totalEarned) > 0n
                      ? 'claimed' as const
                      : 'unclaimed' as const,
            royalty_bps: fee.royaltyBps,
            fee_type: fee.feeType ?? null,
            fee_locked: fee.feeLocked ?? null,
            last_synced_at: new Date().toISOString(),
          };
        });

        const { error: upsertError } = await supabase
          .from('fee_records')
          .upsert(feeRows, { onConflict: 'creator_id,platform,chain,token_address' });

        if (upsertError) {
          console.warn(`[index-fees] fee_records upsert failed for creator ${creator.id}:`, upsertError.message);
          continue; // Skip marking as fresh if upsert failed
        }

        // Upsert fee_recipients for fees with sharing config
        const feesWithRecipients = fees.filter(
          (f): f is TokenFee & { feeRecipients: NonNullable<TokenFee['feeRecipients']> } =>
            !!f.feeRecipients && f.feeRecipients.length > 0
        );
        if (feesWithRecipients.length > 0) {
          // Look up fee_record IDs for these fees
          const recipientTokenAddrs = feesWithRecipients.map((f) => f.tokenAddress);
          const { data: feeRecordIds } = await supabase
            .from('fee_records')
            .select('id, token_address, platform, chain')
            .eq('creator_id', creator.id)
            .in('token_address', recipientTokenAddrs);

          if (feeRecordIds) {
            const recipientRows = feeRecordIds.flatMap((record) => {
              const fee = feesWithRecipients.find(
                (f) => f.tokenAddress === record.token_address && f.platform === record.platform && f.chain === record.chain
              );
              if (!fee) return [];
              return fee.feeRecipients.map((r) => ({
                fee_record_id: record.id,
                recipient_address: r.address,
                share_bps: r.shareBps,
                unclaimed: r.unclaimed ?? '0',
              }));
            });

            if (recipientRows.length > 0) {
              const { error: recipientError } = await supabase
                .from('fee_recipients')
                .upsert(recipientRows, { onConflict: 'fee_record_id,recipient_address' });
              if (recipientError) {
                console.warn(`[index-fees] fee_recipients upsert failed:`, recipientError.message);
              }
            }
          }
        }

        // Enrich Pump.fun fee_records with cashback/sharing data from on-chain
        if (Date.now() < deadline) {
          const pumpFees = fees.filter((f) => f.platform === 'pump');
          if (pumpFees.length > 0) {
            // Get known Pump mints for this creator
            const { data: pumpTokens } = await supabase
              .from('creator_tokens')
              .select('token_address')
              .eq('creator_id', creator.id)
              .eq('platform', 'pump')
              .limit(20);

            const mints = (pumpTokens ?? []).map((t) => t.token_address);
            if (mints.length > 0) {
              let hasCashback = false;
              let feeLocked: boolean | null = null;

              for (const mintStr of mints.slice(0, 10)) {
                if (Date.now() > deadline) break;
                try {
                  const mint = new PublicKey(mintStr);
                  const bc = await readBondingCurve(mint);
                  if (bc?.isCashbackCoin) hasCashback = true;

                  const sc = await readSharingConfig(mint);
                  if (sc && feeLocked === null) feeLocked = sc.adminRevoked;
                } catch {
                  // Skip failed reads
                }
              }

              // Update pump fee_records with enrichment data
              if (hasCashback || feeLocked !== null) {
                const updates: { fee_locked?: boolean } = {};
                if (feeLocked !== null) updates.fee_locked = feeLocked;

                if (Object.keys(updates).length > 0) {
                  await supabase
                    .from('fee_records')
                    .update(updates)
                    .eq('creator_id', creator.id)
                    .eq('platform', 'pump');
                }
              }
            }
          }
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
      } finally {
        await releaseLock(feeSyncLockKey);
      }
    }

    // --- Phase 2: Token indexing (if requested and time permits) ---
    const url = new URL(request.url);
    let tokensIndexed = 0;

    if (url.searchParams.get('also') === 'tokens' && Date.now() < deadline) {
      try {
        const { getAllAdapters } = await import('@/lib/platforms');
        const GPA_PLATFORMS = new Set(['coinbarrel', 'believe', 'revshare', 'pump']);
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
              .upsert(discovered, { onConflict: 'token_address,chain', ignoreDuplicates: true });
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
    console.error('Index fees error:', error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      { error: 'Fee indexing failed' },
      { status: 500 }
    );
  }
}
