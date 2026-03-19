import 'server-only';
import { createHash } from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';
import type { Database } from '@/lib/supabase/types';
import { parseSearchQuery, checkCache, resolveAndUpsertIdentity } from './resolve';
import { aggregateFees, persistFees, syncClaimHistory } from './fee-sync';

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

type Creator = Database['public']['Tables']['creators']['Row'];
type Wallet = Database['public']['Tables']['wallets']['Row'];
type FeeRecord = Database['public']['Tables']['fee_records']['Row'];
type ClaimEventRow = Database['public']['Tables']['claim_events']['Row'];

export interface ResolveResult {
  creator: (Creator & { wallets?: Wallet[]; fee_records?: FeeRecord[] }) | null;
  wallets: Wallet[];
  fees: FeeRecord[];
  claimEvents: ClaimEventRow[];
  resolveMs: number;
  cached: boolean;
}

// ═══════════════════════════════════════════════
// In-flight deduplication (instance-local)
// ═══════════════════════════════════════════════

const inFlight = new Map<string, Promise<ResolveResult>>();

const RESOLVE_TIMEOUT_MS = parseInt(process.env.RESOLVE_TIMEOUT_MS ?? '55000', 10);

// ═══════════════════════════════════════════════
// Public API — resolveAndPersistCreator
// ═══════════════════════════════════════════════

/**
 * Shared search + resolve + persist logic used by both
 * the /api/search route and the /[handle] server component.
 *
 * Orchestrates: cache check → identity resolution → fee aggregation → persistence.
 */
export async function resolveAndPersistCreator(query: string): Promise<ResolveResult> {
  const parsed = parseSearchQuery(query);
  const dedupeKey = `${parsed.provider}:${parsed.value}`;

  const existing = inFlight.get(dedupeKey);
  if (existing) return existing;

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
    const log = createLogger('creator');
    log.error('resolve timed out or failed', { dedupeKey, err: err instanceof Error ? err.message : String(err) });
    return { creator: null, wallets: [], fees: [], claimEvents: [], resolveMs: 0, cached: false } as ResolveResult;
  });

  inFlight.set(dedupeKey, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(dedupeKey);
  }
}

// ═══════════════════════════════════════════════
// Internal orchestrator
// ═══════════════════════════════════════════════

function hashQueryForLog(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

async function doResolve(
  parsed: { value: string; provider: import('@/lib/supabase/types').IdentityProvider }
): Promise<ResolveResult> {
  const start = Date.now();
  const log = createLogger('creator');
  const supabase = createServiceClient();

  // Log search (fire-and-forget)
  const logQuery = hashQueryForLog(parsed.value);
  Promise.resolve(
    supabase.from('search_log').insert({
      query: logQuery,
      provider: parsed.provider,
      creator_id: null,
      ip_hash: null,
    })
  ).then(({ error }) => {
    if (error) log.warn('search_log insert failed', { error: error.message });
  }).catch((err: unknown) => log.warn('search_log transport error', { err: String(err) }));

  // ── Step 1: Cache check ──
  const cache = await log.time('checkCache', () => checkCache(parsed, supabase, log));

  if (cache.hit && (cache.strategy === 'fresh' || cache.strategy === 'stale_heavy')) {
    return {
      creator: cache.creator,
      wallets: cache.wallets,
      fees: cache.fees,
      claimEvents: cache.claimEvents,
      resolveMs: Date.now() - start,
      cached: true,
    };
  }

  // ── Step 2: Fresh resolve ──
  return await freshResolve(parsed, supabase, cache.creatorId, start, log);
}

async function freshResolve(
  parsed: { value: string; provider: import('@/lib/supabase/types').IdentityProvider },
  supabase: ReturnType<typeof createServiceClient>,
  existingCreatorId: string | null,
  start: number,
  log: ReturnType<typeof createLogger>
): Promise<ResolveResult> {
  try {
    // ── Step 2a: Identity resolution + wallet upsert ──
    const { creatorId, wallets } = await log.time('resolveIdentity', () =>
      resolveAndUpsertIdentity(parsed, supabase, existingCreatorId, log)
    );

    if (!creatorId && wallets.length === 0) {
      return { creator: null, wallets: [], fees: [], claimEvents: [], resolveMs: Date.now() - start, cached: false };
    }

    if (!creatorId) {
      return { creator: null, wallets: [], fees: [], claimEvents: [], resolveMs: Date.now() - start, cached: false };
    }

    // ── Step 2b: Fee aggregation ──
    const allFees = await log.time('aggregateFees', () =>
      aggregateFees(parsed.value, parsed.provider, wallets, log)
    );

    // ── Step 2c: Persist fees ──
    await log.time('persistFees', () => persistFees(creatorId, allFees, supabase, log));

    // ── Step 2d: Claim history (fire-and-forget) ──
    syncClaimHistory(creatorId, wallets, supabase, log);

    // ── Step 2e: Update search_log ──
    const logQuery = hashQueryForLog(parsed.value);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await supabase
      .from('search_log')
      .update({ creator_id: creatorId })
      .eq('query', logQuery)
      .eq('provider', parsed.provider)
      .is('creator_id', null)
      .gte('searched_at', fiveMinutesAgo);

    // ── Step 3: Return fresh data ──
    const [{ data: freshCreator }, { data: freshFees }, { data: claimEvents }] = await Promise.all([
      supabase.from('creators').select('*, wallets(*)').eq('id', creatorId).single(),
      supabase.from('fee_records').select('*').eq('creator_id', creatorId),
      supabase.from('claim_events').select('*').eq('creator_id', creatorId).order('claimed_at', { ascending: false }).limit(50),
    ]);

    const returnedFees = (freshFees ?? []) as FeeRecord[];
    return {
      creator: freshCreator ? { ...freshCreator, fee_records: returnedFees } : null,
      wallets: (freshCreator?.wallets ?? []) as Wallet[],
      fees: returnedFees,
      claimEvents: (claimEvents ?? []) as ClaimEventRow[],
      resolveMs: Date.now() - start,
      cached: false,
    };
  } catch (err) {
    log.error('freshResolve failed', { err: err instanceof Error ? err.message : String(err) });

    // Stale fallback for existing creators
    if (existingCreatorId) {
      try {
        const [{ data: staleCreator }, { data: staleFees }] = await Promise.all([
          supabase.from('creators').select('*, wallets(*)').eq('id', existingCreatorId).single(),
          supabase.from('fee_records').select('*').eq('creator_id', existingCreatorId),
        ]);
        if (staleCreator) {
          const staleFeeRecords = (staleFees ?? []) as FeeRecord[];
          return {
            creator: { ...staleCreator, fee_records: staleFeeRecords },
            wallets: staleCreator.wallets ?? [],
            fees: staleFeeRecords,
            claimEvents: [],
            resolveMs: Date.now() - start,
            cached: true,
          };
        }
      } catch (staleErr) {
        log.error('stale fallback also failed', { err: staleErr instanceof Error ? staleErr.message : String(staleErr) });
      }
    }

    return { creator: null, wallets: [], fees: [], claimEvents: [], resolveMs: Date.now() - start, cached: false };
  }
}
