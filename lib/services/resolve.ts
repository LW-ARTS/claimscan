import 'server-only';
import type { Database, IdentityProvider } from '@/lib/supabase/types';
import { CACHE_TTL_MS, CACHE_TTL_HEAVY_MS } from '@/lib/constants';
import {
  parseSearchQuery,
  resolveWallets,
} from '@/lib/resolve/identity';
import type { Logger } from '@/lib/logger';

export type { ParsedQuery } from '@/lib/resolve/identity';

type Creator = Database['public']['Tables']['creators']['Row'];
type Wallet = Database['public']['Tables']['wallets']['Row'];
type FeeRecord = Database['public']['Tables']['fee_records']['Row'];
type ClaimEventRow = Database['public']['Tables']['claim_events']['Row'];
type SupabaseClient = ReturnType<typeof import('@/lib/supabase/service').createServiceClient>;

// Re-export parseSearchQuery for the orchestrator
export { parseSearchQuery };

// ═══════════════════════════════════════════════
// Cache Check
// ═══════════════════════════════════════════════

export interface CacheResult {
  hit: boolean;
  /** 'fresh' = serve as-is, 'stale_heavy' = serve stale (cron refreshes), null = miss or needs refresh */
  strategy: 'fresh' | 'stale_heavy' | null;
  creator: (Creator & { wallets?: Wallet[]; fee_records?: FeeRecord[] }) | null;
  wallets: Wallet[];
  fees: FeeRecord[];
  claimEvents: ClaimEventRow[];
  creatorId: string | null;
}

/**
 * Check Supabase for a cached creator + fee records.
 * Returns cache strategy so the orchestrator can decide to serve stale or re-resolve.
 */
export async function checkCache(
  parsed: { value: string; provider: IdentityProvider },
  supabase: SupabaseClient,
  log: Logger
): Promise<CacheResult> {
  const miss: CacheResult = { hit: false, strategy: null, creator: null, wallets: [], fees: [], claimEvents: [], creatorId: null };
  const handleColumn = getHandleColumn(parsed.provider);
  if (!handleColumn) return miss;

  const { data } = await supabase
    .from('creators')
    .select('id, twitter_handle, github_handle, farcaster_handle, farcaster_fid, tiktok_handle, display_name, avatar_url, created_at, updated_at, last_token_sync_at, wallets(id, creator_id, address, chain, source_platform, verified, created_at)')
    .eq(handleColumn, parsed.value)
    .single();

  if (!data) return miss;

  // Fetch fee_records + claim_events in parallel (saves ~1 DB round-trip)
  const [{ data: feeRecords }, { data: claimEvents }] = await Promise.all([
    supabase.from('fee_records').select('id, creator_id, creator_token_id, platform, chain, token_address, token_symbol, total_earned, total_claimed, total_unclaimed, total_earned_usd, claim_status, royalty_bps, last_synced_at, created_at').eq('creator_id', data.id),
    supabase.from('claim_events').select('id, creator_id, platform, chain, token_address, amount, amount_usd, tx_hash, claimed_at, created_at').eq('creator_id', data.id)
      .order('claimed_at', { ascending: false }).limit(50),
  ]);
  const allFeeRecords = (feeRecords ?? []) as FeeRecord[];
  const allClaimEvents = (claimEvents ?? []) as ClaimEventRow[];

  // Check freshness using the most recent fee_records entry
  const maxSyncedAt = allFeeRecords.reduce((max: number, r: FeeRecord) => {
    const t = r.last_synced_at ? new Date(r.last_synced_at).getTime() : 0;
    return t > max ? t : max;
  }, 0);
  const ttl = allFeeRecords.length > 500 ? CACHE_TTL_HEAVY_MS : CACHE_TTL_MS;
  const isFresh = maxSyncedAt > 0 && Date.now() - maxSyncedAt < ttl;

  if (isFresh) {
    return {
      hit: true,
      strategy: 'fresh',
      creator: { ...data, fee_records: allFeeRecords },
      wallets: data.wallets ?? [],
      fees: allFeeRecords,
      claimEvents: allClaimEvents,
      creatorId: data.id,
    };
  }

  // Stale + heavy → serve stale, cron refreshes later
  if (allFeeRecords.length > 500) {
    log.info('returning stale cache for heavy creator', {
      handle: parsed.value,
      recordCount: allFeeRecords.length,
      lastSynced: new Date(maxSyncedAt).toISOString(),
    });
    return {
      hit: true,
      strategy: 'stale_heavy',
      creator: { ...data, fee_records: allFeeRecords },
      wallets: data.wallets ?? [],
      fees: allFeeRecords,
      claimEvents: allClaimEvents,
      creatorId: data.id,
    };
  }

  // Stale + normal → needs refresh, but return creatorId for the re-resolve path
  return { ...miss, creatorId: data.id };
}

// ═══════════════════════════════════════════════
// Identity Resolution + Wallet Upsert
// ═══════════════════════════════════════════════

export interface ResolveIdentityResult {
  creatorId: string | null;
  wallets: Awaited<ReturnType<typeof resolveWallets>>;
}

/**
 * Resolve identity → wallets, upsert creator + wallets in DB.
 * Returns creatorId and resolved wallets.
 */
export async function resolveAndUpsertIdentity(
  parsed: { value: string; provider: IdentityProvider },
  supabase: SupabaseClient,
  existingCreatorId: string | null,
  log: Logger
): Promise<ResolveIdentityResult> {
  const wallets = await log.time('resolveWallets', () => resolveWallets(parsed.value, parsed.provider), {
    handle: parsed.value,
    provider: parsed.provider,
  });

  let creatorId = existingCreatorId;
  const handleColumn = getHandleColumn(parsed.provider);

  if (!creatorId) {
    const creatorData: Database['public']['Tables']['creators']['Insert'] = {
      display_name: parsed.value,
      ...(parsed.provider === 'twitter' && { twitter_handle: parsed.value }),
      ...(parsed.provider === 'github' && { github_handle: parsed.value }),
      ...(parsed.provider === 'farcaster' && { farcaster_handle: parsed.value }),
      ...(parsed.provider === 'tiktok' && { tiktok_handle: parsed.value }),
    };

    // For wallet searches, check if a creator already exists for this wallet
    if (!handleColumn && wallets.length > 0) {
      const { data: existingWallet } = await supabase
        .from('wallets')
        .select('creator_id')
        .eq('address', wallets[0].address)
        .limit(1)
        .maybeSingle();
      if (existingWallet?.creator_id) {
        creatorId = existingWallet.creator_id;
      }
    }

    if (!creatorId) {
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
        log.error('creator upsert/insert failed', { error: creatorError.message, code: creatorError.code });
        // Farcaster conflict recovery (no unique constraint yet)
        if (parsed.provider === 'farcaster' && creatorError.code === '23505') {
          const { data: existingFc } = await supabase
            .from('creators')
            .select('id')
            .eq('farcaster_handle', parsed.value)
            .single();
          creatorId = existingFc?.id ?? null;
        }
        if (!creatorId) {
          throw new Error(`Creator upsert failed: ${creatorError.message}`);
        }
      } else {
        creatorId = newCreator?.id ?? null;
      }
    }
  }

  // Batch upsert wallets
  if (creatorId && wallets.length > 0) {
    const walletRows = wallets.map((w) => ({
      creator_id: creatorId!,
      address: w.address,
      chain: w.chain,
      source_platform: w.sourcePlatform,
      verified: false,
    }));
    const { error: walletError } = await supabase
      .from('wallets')
      .upsert(walletRows, { onConflict: 'address,chain', ignoreDuplicates: true });
    if (walletError) {
      log.warn('wallet upsert error', { error: walletError.message });
    }
  }

  return { creatorId, wallets };
}

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

export function getHandleColumn(provider: IdentityProvider): string | null {
  if (provider === 'twitter') return 'twitter_handle';
  if (provider === 'github') return 'github_handle';
  if (provider === 'farcaster') return 'farcaster_handle';
  if (provider === 'tiktok') return 'tiktok_handle';
  return null;
}
