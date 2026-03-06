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
} from '@/lib/resolve/identity';

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

interface ResolveResult {
  creator: (Creator & { wallets?: Wallet[]; fee_records?: FeeRecord[] }) | null;
  wallets: Wallet[];
  fees: FeeRecord[];
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
    return { creator: null, wallets: [], fees: [], cached: false } as ResolveResult;
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
  const supabase = createServiceClient();

  // Log search (fire-and-forget) — hash the query to avoid storing raw wallet addresses
  const logQuery = parsed.provider === 'wallet'
    ? hashQueryForLog(parsed.value)
    : parsed.value;

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
        return {
          creator: data,
          wallets: data.wallets ?? [],
          fees: feeRecords,
          cached: true,
        };
      }

      // Cache is stale — fully re-resolve before returning
      return await freshResolve(parsed, supabase, data.id);
    }
  }

  // Resolve fresh
  return await freshResolve(parsed, supabase, null);
}

async function freshResolve(
  parsed: { value: string; provider: IdentityProvider },
  supabase: ReturnType<typeof createServiceClient>,
  existingCreatorId: string | null
): Promise<ResolveResult> {
  // Wrap in try/catch to prevent crashing the server component
  try {
    const wallets = await resolveWallets(parsed.value, parsed.provider);

    if (wallets.length === 0 && !existingCreatorId) {
      return { creator: null, wallets: [], fees: [], cached: false };
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
      return { creator: null, wallets: [], fees: [], cached: false };
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

    // Fetch fees across all platforms
    const fees = await fetchAllFees(wallets);

    // Batch upsert fee records
    if (fees.length > 0) {
      const feeRows = fees.map((fee) => ({
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
        claim_status: safeBigInt(fee.totalUnclaimed) > 0n ? 'unclaimed' as const : 'claimed' as const,
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

    // Update search_log with creator_id — use hashed query for wallet provider
    const logQuery = parsed.provider === 'wallet'
      ? hashQueryForLog(parsed.value)
      : parsed.value;
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await supabase
      .from('search_log')
      .update({ creator_id: creatorId })
      .eq('query', logQuery)
      .eq('provider', parsed.provider)
      .is('creator_id', null)
      .gte('searched_at', fiveMinutesAgo);

    // Return fresh data
    const { data: freshCreator } = await supabase
      .from('creators')
      .select('*, wallets(*), fee_records(*)')
      .eq('id', creatorId)
      .single();

    return {
      creator: freshCreator,
      wallets: (freshCreator?.wallets ?? []) as Wallet[],
      fees: (freshCreator?.fee_records ?? []) as FeeRecord[],
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
            cached: true,
          };
        }
      } catch {
        // Stale data fetch also failed — fall through to return null
      }
    }
    return { creator: null, wallets: [], fees: [], cached: false };
  }
}

function getHandleColumn(provider: IdentityProvider): string | null {
  if (provider === 'twitter') return 'twitter_handle';
  if (provider === 'github') return 'github_handle';
  if (provider === 'farcaster') return 'farcaster_handle';
  return null;
}
