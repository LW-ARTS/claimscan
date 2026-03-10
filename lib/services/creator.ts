import 'server-only';
import { createHash } from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { CACHE_TTL_MS } from '@/lib/constants';
import { safeBigInt } from '@/lib/utils';
import type { Database, IdentityProvider } from '@/lib/supabase/types';
import {
  parseSearchQuery,
  resolveWallets,
  fetchAllFees,
  fetchFeesByHandle,
} from '@/lib/resolve/identity';
import { isHeliusAvailable } from '@/lib/helius/client';
import { fetchClaimHistory } from '@/lib/helius/transactions';

// ═══════════════════════════════════════════════
// In-flight deduplication to prevent thundering herd.
// NOTE: This deduplication is instance-local only (module singleton).
// In serverless environments (Vercel), each function instance has its own map.
// True cross-instance deduplication relies on DB-level upsert idempotency.
// ═══════════════════════════════════════════════
const inFlight = new Map<string, Promise<ResolveResult>>();

/** Timeout for the entire resolve operation to prevent hung promises in inFlight map */
const RESOLVE_TIMEOUT_MS = 30_000;

type Creator = Database['public']['Tables']['creators']['Row'];
type Wallet = Database['public']['Tables']['wallets']['Row'];
type FeeRecord = Database['public']['Tables']['fee_records']['Row'];

type ClaimEventRow = Database['public']['Tables']['claim_events']['Row'];

interface ResolveResult {
  creator: (Creator & { wallets?: Wallet[]; fee_records?: FeeRecord[] }) | null;
  wallets: Wallet[];
  fees: FeeRecord[];
  claimEvents: ClaimEventRow[];
  resolveMs: number;
  cached: boolean;
}

/**
 * Shared search + resolve + persist logic used by both
 * the /api/search route and the /[handle] server component.
 */
export async function resolveAndPersistCreator(query: string): Promise<ResolveResult> {
  const parsed = parseSearchQuery(query);
  const dedupeKey = `${parsed.provider}:${parsed.value}`;

  // Dedup: if an identical resolve is already in-flight, return its result
  const existing = inFlight.get(dedupeKey);
  if (existing) return existing;

  // Wrap doResolve with a timeout to prevent hung promises from blocking the inFlight map
  let timeoutId: ReturnType<typeof setTimeout>;
  const promise = Promise.race([
    doResolve(parsed),
    new Promise<ResolveResult>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('resolve timeout')), RESOLVE_TIMEOUT_MS);
    }),
  ]).then((result) => {
    clearTimeout(timeoutId);
    return result;
  }).catch((err) => {
    clearTimeout(timeoutId!);
    console.error(`[creator] resolve timed out or failed for ${dedupeKey}:`, err instanceof Error ? err.message : err);
    return { creator: null, wallets: [], fees: [], claimEvents: [], resolveMs: 0, cached: false } as ResolveResult;
  });

  inFlight.set(dedupeKey, promise);

  try {
    return await promise;
  } finally {
    inFlight.delete(dedupeKey);
  }
}

/**
 * Hash a query value for storage in search_log to avoid storing raw wallet addresses.
 */
function hashQueryForLog(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

async function doResolve(
  parsed: { value: string; provider: IdentityProvider }
): Promise<ResolveResult> {
  const start = Date.now();
  const supabase = createServiceClient();

  // Log search (fire-and-forget) — hash all queries to avoid storing PII
  const logQuery = hashQueryForLog(parsed.value);

  Promise.resolve(
    supabase.from('search_log').insert({
      query: logQuery,
      provider: parsed.provider,
      creator_id: null,
      ip_hash: null,
    })
  ).then(({ error }) => {
    if (error) console.warn('[search_log] insert failed:', error.message);
  }).catch((err: unknown) => console.warn('[search_log] transport error:', err));

  // Check cache first
  const handleColumn = getHandleColumn(parsed.provider);

  if (handleColumn) {
    const { data } = await supabase
      .from('creators')
      .select('*, wallets(*), fee_records(*)')
      .eq(handleColumn, parsed.value)
      .single();

    if (data) {
      // Check freshness using the most recent fee_records entry (not [0] blindly)
      const feeRecords = (data.fee_records ?? []) as FeeRecord[];
      const maxSyncedAt = feeRecords.reduce((max: number, r: FeeRecord) => {
        const t = r.last_synced_at ? new Date(r.last_synced_at).getTime() : 0;
        return t > max ? t : max;
      }, 0);
      const isFresh = maxSyncedAt > 0 && Date.now() - maxSyncedAt < CACHE_TTL_MS;

      if (isFresh) {
        // Query claim_events for this creator (cached path)
        const { data: claimEvents } = await supabase
          .from('claim_events')
          .select('*')
          .eq('creator_id', data.id)
          .order('claimed_at', { ascending: false })
          .limit(50);

        return {
          creator: data,
          wallets: data.wallets ?? [],
          fees: feeRecords,
          claimEvents: (claimEvents ?? []) as ClaimEventRow[],
          resolveMs: Date.now() - start,
          cached: true,
        };
      }

      // Cache is stale — fully re-resolve before returning
      return await freshResolve(parsed, supabase, data.id, start);
    }
  }

  // Resolve fresh
  return await freshResolve(parsed, supabase, null, start);
}

async function freshResolve(
  parsed: { value: string; provider: IdentityProvider },
  supabase: ReturnType<typeof createServiceClient>,
  existingCreatorId: string | null,
  start: number
): Promise<ResolveResult> {
  // Wrap in try/catch to prevent crashing the server component
  try {
    // Run handle-based fee lookups IN PARALLEL with wallet resolution.
    // Handle-based fees (e.g. Bags.fm) work even if no wallet is connected,
    // so we don't want wallet resolution failure to block fee discovery.
    const [wallets, handleFees] = await Promise.all([
      resolveWallets(parsed.value, parsed.provider),
      fetchFeesByHandle(parsed.value, parsed.provider),
    ]);

    // If no wallets AND no handle-based fees AND no existing creator → nothing found
    if (wallets.length === 0 && handleFees.length === 0 && !existingCreatorId) {
      return { creator: null, wallets: [], fees: [], claimEvents: [], resolveMs: Date.now() - start, cached: false };
    }

    // Upsert creator
    let creatorId = existingCreatorId;
    const handleColumn = getHandleColumn(parsed.provider);

    if (!creatorId) {
      const creatorData: Database['public']['Tables']['creators']['Insert'] = {
        display_name: parsed.value,
        ...(parsed.provider === 'twitter' && { twitter_handle: parsed.value }),
        ...(parsed.provider === 'github' && { github_handle: parsed.value }),
        ...(parsed.provider === 'farcaster' && { farcaster_handle: parsed.value }),
      };

      // Check error from upsert/insert to avoid silently losing data
      const { data: newCreator, error: creatorError } = handleColumn
        ? await supabase
            .from('creators')
            .upsert(creatorData, { onConflict: handleColumn })
            .select('id')
            .single()
        : await supabase
            .from('creators')
            .insert(creatorData)
            .select('id')
            .single();

      if (creatorError) {
        console.error('[creator] upsert/insert failed:', creatorError.message);
        // For farcaster (no unique constraint yet), a duplicate insert returns a conflict error.
        // Try to find the existing creator instead of failing silently.
        if (parsed.provider === 'farcaster' && creatorError.code === '23505') {
          const { data: existingFc } = await supabase
            .from('creators')
            .select('id')
            .eq('farcaster_handle', parsed.value)
            .single();
          creatorId = existingFc?.id ?? null;
        }
        // If still no creatorId, throw to trigger the stale fallback path
        if (!creatorId) {
          throw new Error(`Creator upsert failed: ${creatorError.message}`);
        }
      } else {
        creatorId = newCreator?.id ?? null;
      }
    }

    if (!creatorId) {
      return { creator: null, wallets: [], fees: [], claimEvents: [], resolveMs: Date.now() - start, cached: false };
    }

    // Batch upsert wallets — use onConflict to update source_platform on re-association.
    // ignoreDuplicates removed to allow wallet re-association when a creator is re-resolved.
    if (wallets.length > 0) {
      const walletRows = wallets.map((w) => ({
        creator_id: creatorId!,
        address: w.address,
        chain: w.chain,
        source_platform: w.sourcePlatform,
        verified: false,
      }));
      const { error: walletError } = await supabase
        .from('wallets')
        .upsert(walletRows, {
          onConflict: 'address,chain',
        });
      if (walletError) {
        console.warn('[creator] wallet upsert error:', walletError.message);
      }
    }

    // Fetch wallet-based fees across all platforms (only if wallets found)
    const walletFees = wallets.length > 0 ? await fetchAllFees(wallets) : [];

    // Merge handle-based fees + wallet-based fees, dedup by platform+chain+tokenAddress.
    // When both sources return a fee for the same token, take the MAX of each field
    // across both sources. This ensures claimed data isn't lost when one source has
    // better unclaimed data and the other has better claimed data.
    const feeMap = new Map<string, typeof handleFees[number]>();
    for (const fee of handleFees) {
      const key = `${fee.platform}:${fee.chain}:${fee.tokenAddress}`;
      feeMap.set(key, fee);
    }
    for (const fee of walletFees) {
      const key = `${fee.platform}:${fee.chain}:${fee.tokenAddress}`;
      const existing = feeMap.get(key);
      if (!existing) {
        feeMap.set(key, fee);
      } else {
        // Both sources report the same pool — keep the snapshot with higher totalEarned.
        // Taking MAX of claimed/unclaimed independently would break the invariant
        // totalEarned == totalClaimed + totalUnclaimed and could overcount.
        // As a tiebreaker, prefer the source with claimed data (richer history).
        const feeEarned = safeBigInt(fee.totalEarned);
        const existingEarned = safeBigInt(existing.totalEarned);
        if (feeEarned > existingEarned ||
            (feeEarned === existingEarned && safeBigInt(fee.totalClaimed) > safeBigInt(existing.totalClaimed))) {
          feeMap.set(key, {
            ...fee,
            totalEarnedUsd: fee.totalEarnedUsd ?? existing.totalEarnedUsd,
            tokenSymbol: fee.tokenSymbol ?? existing.tokenSymbol,
            royaltyBps: fee.royaltyBps ?? existing.royaltyBps,
          });
        }
      }
    }
    const allFees = Array.from(feeMap.values());

    // Batch upsert fee records
    if (allFees.length > 0) {
      const feeRows = allFees.map((fee) => ({
        creator_id: creatorId!,
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
          safeBigInt(fee.totalUnclaimed) > 0n
            ? 'unclaimed' as const
            : safeBigInt(fee.totalEarned) > 0n
              ? 'claimed' as const   // genuinely claimed — earned > 0 but unclaimed = 0
              : 'unclaimed' as const, // no fee data — don't falsely mark as claimed
        royalty_bps: fee.royaltyBps,
        last_synced_at: new Date().toISOString(),
      }));
      const { error: feeError } = await supabase
        .from('fee_records')
        .upsert(feeRows, { onConflict: 'creator_id,platform,chain,token_address' });
      if (feeError) {
        console.warn('[creator] fee_records upsert error:', feeError.message);
      }
    }

    // Fetch and persist claim history for Solana wallets via Helius Enhanced Transactions.
    // Fire-and-forget: failure doesn't block the main resolve flow.
    if (isHeliusAvailable() && wallets.some((w) => w.chain === 'sol')) {
      Promise.resolve(
        (async () => {
          const solWallets = wallets.filter((w) => w.chain === 'sol');
          for (const wallet of solWallets) {
            try {
              const claims = await fetchClaimHistory(wallet.address, { limit: 50 });
              if (claims.length > 0) {
                const claimRows = claims
                  .filter((c) => c.txHash) // Only persist claims with tx_hash for dedup
                  .map((c) => ({
                    creator_id: creatorId!,
                    platform: c.platform,
                    chain: c.chain,
                    token_address: c.tokenAddress,
                    amount: c.amount,
                    amount_usd: c.amountUsd,
                    tx_hash: c.txHash,
                    claimed_at: c.claimedAt,
                  }));
                if (claimRows.length > 0) {
                  const { error: claimError } = await supabase
                    .from('claim_events')
                    .upsert(claimRows, { onConflict: 'tx_hash' });
                  if (claimError) {
                    console.warn('[creator] claim_events upsert error:', claimError.message);
                  }
                }
              }
            } catch (err) {
              console.warn('[creator] claim history failed for', wallet.address, err instanceof Error ? err.message : err);
            }
          }
        })()
      ).catch((err) => {
        console.warn('[creator] claim history batch failed:', err instanceof Error ? err.message : err);
      });
    }

    // Update search_log with creator_id — all queries are hashed
    const logQuery = hashQueryForLog(parsed.value);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await supabase
      .from('search_log')
      .update({ creator_id: creatorId })
      .eq('query', logQuery)
      .eq('provider', parsed.provider)
      .is('creator_id', null)
      .gte('searched_at', fiveMinutesAgo);

    // Return fresh data + claim events
    const [{ data: freshCreator }, { data: claimEvents }] = await Promise.all([
      supabase
        .from('creators')
        .select('*, wallets(*), fee_records(*)')
        .eq('id', creatorId)
        .single(),
      supabase
        .from('claim_events')
        .select('*')
        .eq('creator_id', creatorId)
        .order('claimed_at', { ascending: false })
        .limit(50),
    ]);

    return {
      creator: freshCreator,
      wallets: (freshCreator?.wallets ?? []) as Wallet[],
      fees: (freshCreator?.fee_records ?? []) as FeeRecord[],
      claimEvents: (claimEvents ?? []) as ClaimEventRow[],
      resolveMs: Date.now() - start,
      cached: false,
    };
  } catch (err) {
    console.error('[creator] freshResolve failed:', err instanceof Error ? err.message : err);
    // If we have an existing creator, try to return stale data rather than crashing
    if (existingCreatorId) {
      try {
        const { data: staleCreator } = await supabase
          .from('creators')
          .select('*, wallets(*), fee_records(*)')
          .eq('id', existingCreatorId)
          .single();

        if (staleCreator) {
          return {
            creator: staleCreator,
            wallets: staleCreator.wallets ?? [],
            fees: staleCreator.fee_records ?? [],
            claimEvents: [],
            resolveMs: Date.now() - start,
            cached: true,
          };
        }
      } catch (staleErr) {
        console.error('[creator] stale data fallback also failed:', staleErr instanceof Error ? staleErr.message : staleErr);
      }
    }
    return { creator: null, wallets: [], fees: [], claimEvents: [], resolveMs: Date.now() - start, cached: false };
  }
}

function getHandleColumn(provider: IdentityProvider): string | null {
  if (provider === 'twitter') return 'twitter_handle';
  if (provider === 'github') return 'github_handle';
  if (provider === 'farcaster') return 'farcaster_handle';
  return null;
}
