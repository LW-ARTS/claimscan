import 'server-only';
import { BAGS_API_BASE } from '@/lib/constants';
import { isValidSolanaAddress } from '@/lib/chains/solana';
import { getNativeTokenPrices } from '@/lib/prices';
import { enrichSolanaTokenSymbols } from './solana-metadata';
import type { IdentityProvider } from '@/lib/supabase/types';
import type {
  PlatformAdapter,
  ResolvedWallet,
  CreatorToken,
  TokenFee,
  ClaimEvent,
} from './types';

// ═══════════════════════════════════════════════
// Bags.fm API Types
// ═══════════════════════════════════════════════

/**
 * Bags API v2 wraps all responses in { success: boolean, response: T }.
 * The `response` field contains the actual data payload.
 */
interface BagsApiResponse<T> {
  success: boolean;
  response?: T;
}

interface BagsWalletPayload {
  platformData?: {
    username?: string;
    provider?: string;
  };
  provider?: string;
  wallet?: string;
}

/** claim-stats response: per-token fee claimer stats (keyed by tokenMint) */
interface BagsClaimStatEntry {
  username?: string;
  wallet?: string;
  totalClaimed?: string;
  royaltyBps?: number;
  isCreator?: boolean;
  twitterUsername?: string;
  provider?: string;
}

/** claimable-positions response: unclaimed fee positions for a wallet */
interface BagsClaimablePosition {
  baseMint: string;
  quoteMint?: string | null;
  totalClaimableLamportsUserShare: number;
  claimableDisplayAmount?: number | null;
  userBps?: number | null;
  isMigrated?: boolean;
  isCustomFeeVault?: boolean;
  virtualPool?: string;
  virtualPoolAddress?: string | null;
  dammPoolAddress?: string | null;
}

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

function mapIdentityProvider(
  provider: IdentityProvider
): string {
  const map: Record<IdentityProvider, string> = {
    twitter: 'twitter',
    github: 'github',
    farcaster: 'farcaster',
    wallet: 'wallet',
  };
  return map[provider] || 'twitter';
}

// ═══════════════════════════════════════════════
// Multi-key rotation with per-key rate limit tracking
// ═══════════════════════════════════════════════

/** Parse API keys from BAGS_API_KEYS (comma-separated) or legacy BAGS_API_KEY. */
function getApiKeys(): string[] {
  const multi = process.env.BAGS_API_KEYS;
  if (multi) return multi.split(',').map((k) => k.trim()).filter(Boolean);
  const single = process.env.BAGS_API_KEY;
  if (single) return [single.replace(/\\n$/, '').trim()];
  return [];
}

/** Per-key rate limit expiry timestamps. */
const keyRateLimits = new Map<string, number>();
let keyIndex = 0;

/** Get the next available (non-rate-limited) API key, or null if all exhausted. */
function getAvailableKey(): string | null {
  const keys = getApiKeys();
  if (keys.length === 0) return null;
  const now = Date.now();
  // Try each key starting from current index (round-robin)
  for (let i = 0; i < keys.length; i++) {
    const idx = (keyIndex + i) % keys.length;
    const key = keys[idx];
    const limitedUntil = keyRateLimits.get(key) ?? 0;
    if (now >= limitedUntil) {
      keyIndex = (idx + 1) % keys.length; // advance for next call
      return key;
    }
  }
  return null; // all keys rate limited
}

function isRateLimited(): boolean {
  // Check without side effects (don't advance keyIndex)
  const keys = getApiKeys();
  if (keys.length === 0) return true;
  const now = Date.now();
  return keys.every((k) => (keyRateLimits.get(k) ?? 0) > now);
}

async function bagsFetch<T>(path: string, attempt = 0): Promise<T | null> {
  const keys = getApiKeys();
  if (attempt >= keys.length) return null; // exhausted all keys

  const apiKey = getAvailableKey();
  if (!apiKey) return null; // all keys rate limited

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(`${BAGS_API_BASE}${path}`, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.status === 429) {
      // Mark THIS key as rate limited, other keys may still work
      let resetAt = Date.now() + 5 * 60_000;
      try {
        const body = await res.json() as { resetTime?: string };
        if (body.resetTime) resetAt = new Date(body.resetTime).getTime();
      } catch { /* use default */ }
      keyRateLimits.set(apiKey, resetAt);
      const keysLeft = keys.filter((k) => (keyRateLimits.get(k) ?? 0) <= Date.now()).length;
      console.warn(`[bags] key ${apiKey.slice(-6)} rate limited until ${new Date(resetAt).toISOString()} (${keysLeft} keys remaining)`);
      // Retry with next available key (bounded by attempt count)
      if (keysLeft > 0) return bagsFetch<T>(path, attempt + 1);
      return null;
    }
    if (!res.ok) {
      console.warn(`[bags] fetch ${path} returned HTTP ${res.status}`);
      return null;
    }
    return await res.json() as T;
  } catch (err) {
    console.warn(`[bags] fetch ${path} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Resolve a social handle to a wallet address on Bags.
 * Bags creates fee claimer vaults tied to social identities, so this
 * may return a wallet even if the user hasn't explicitly "connected" one.
 */
async function resolveHandleToWallet(
  handle: string,
  provider: IdentityProvider
): Promise<string | null> {
  const bagsProvider = mapIdentityProvider(provider);

  // Bags API v2 returns { success, response: { wallet, platformData, provider } }
  const data = await bagsFetch<BagsApiResponse<BagsWalletPayload>>(
    `/token-launch/fee-share/wallet/v2?provider=${bagsProvider}&username=${encodeURIComponent(handle)}`
  );

  const address = data?.response?.wallet;
  if (!address || !isValidSolanaAddress(address)) return null;
  return address;
}

// ═══════════════════════════════════════════════
// Short-lived caches (avoid duplicate API calls within a scan)
// ═══════════════════════════════════════════════
const positionsCache = new Map<string, { data: BagsClaimablePosition[]; ts: number }>();
const POSITIONS_CACHE_TTL_MS = 30_000; // 30 seconds

/** Cache claim-stats per tokenMint (keyed by mint address). */
const claimStatsCache = new Map<string, { data: BagsClaimStatEntry[]; ts: number }>();
const CLAIM_STATS_CACHE_TTL_MS = 60_000; // 1 minute

async function getClaimablePositionsCached(wallet: string): Promise<BagsClaimablePosition[]> {
  const cached = positionsCache.get(wallet);
  if (cached && Date.now() - cached.ts < POSITIONS_CACHE_TTL_MS) {
    return cached.data;
  }

  const res = await bagsFetch<BagsApiResponse<BagsClaimablePosition[]>>(
    `/token-launch/claimable-positions?wallet=${encodeURIComponent(wallet)}`
  );
  const data = Array.isArray(res?.response) ? res.response : [];

  // Evict stale entries to prevent unbounded growth
  if (positionsCache.size > 100) {
    const now = Date.now();
    for (const [key, entry] of positionsCache) {
      if (now - entry.ts > POSITIONS_CACHE_TTL_MS) positionsCache.delete(key);
    }
  }

  positionsCache.set(wallet, { data, ts: Date.now() });
  return data;
}

/**
 * Fetch claim-stats for a single token mint (cached).
 * Returns all claimer entries for this mint.
 */
async function fetchClaimStatsCached(tokenMint: string): Promise<BagsClaimStatEntry[]> {
  const cached = claimStatsCache.get(tokenMint);
  if (cached && Date.now() - cached.ts < CLAIM_STATS_CACHE_TTL_MS) {
    return cached.data;
  }

  const res = await bagsFetch<BagsApiResponse<BagsClaimStatEntry[]>>(
    `/token-launch/claim-stats?tokenMint=${encodeURIComponent(tokenMint)}`
  );
  const data = Array.isArray(res?.response) ? res.response : [];

  // Evict stale entries
  if (claimStatsCache.size > 200) {
    const now = Date.now();
    for (const [key, entry] of claimStatsCache) {
      if (now - entry.ts > CLAIM_STATS_CACHE_TTL_MS) claimStatsCache.delete(key);
    }
  }

  claimStatsCache.set(tokenMint, { data, ts: Date.now() });
  return data;
}

/**
 * Find the best matching claimer entry from claim-stats results.
 * The /fee-share/wallet/v2 endpoint returns a fee vault wallet that may
 * differ from the personal wallet stored in claim-stats entries. To handle
 * this, we try multiple matching strategies in priority order.
 */
function findClaimerEntry(
  stats: BagsClaimStatEntry[],
  wallet: string,
  handle?: string
): BagsClaimStatEntry | undefined {
  // 1. Exact wallet match (works when vault wallet === claim-stats wallet)
  let entry = stats.find((s) => s.wallet === wallet);
  if (entry) return entry;

  // 2. Match by Twitter/username handle (more specific than isCreator flag)
  if (handle) {
    const lower = handle.toLowerCase();
    entry = stats.find(
      (s) =>
        s.twitterUsername?.toLowerCase() === lower ||
        s.username?.toLowerCase() === lower
    );
    if (entry) return entry;
  }

  // 3. isCreator fallback REMOVED — multiple claimers can have isCreator=true
  // (co-creators), which would return the wrong claimer's totalClaimed.
  // Returning undefined is safer than returning wrong data.

  // 4. Single-entry match: if only one claimer exists for this token,
  // it must be our user (since they have a claimable position for it).
  if (stats.length === 1) return stats[0];

  return undefined;
}

/**
 * Convert a decimal SOL string (e.g. "1.234567890") to lamports using
 * string manipulation instead of floating-point arithmetic.
 * This avoids precision loss for amounts > ~9 SOL where
 * `parseFloat(raw) * 1e9` would exceed Number.MAX_SAFE_INTEGER.
 */
function solDecimalToLamports(raw: string): bigint {
  const clean = raw.replace(/[^0-9.]/g, '');
  if (!clean || clean === '.' || clean === '0') return 0n;
  const [whole, frac = ''] = clean.split('.');
  // Pad or truncate fractional part to exactly 9 digits (lamports precision)
  const paddedFrac = frac.padEnd(9, '0').slice(0, 9);
  try {
    return BigInt((whole || '0') + paddedFrac);
  } catch {
    return 0n;
  }
}

/** Max mints for lifetime-fees primary method (positions with known BPS).
 *  This is the PRIMARY method — avoids wallet-matching issues of claim-stats.
 *  250 keeps total API time under ~20s at 40-concurrency batches. */
const MAX_LIFETIME_FEE_MINTS = 250;

/** Max mints for claim-stats fallback (positions with unknown BPS). */
const MAX_CLAIM_STATS_FALLBACK_MINTS = 100;

/** Max concurrent API requests to avoid overwhelming bags.fm or Vercel connection limits. */
const CONCURRENCY_LIMIT = 40;

/** Minimum unclaimed value in USD to be worth fetching lifetime-fees for.
 *  Filters out dust positions, saving API calls. Uses live SOL price. */
const MIN_UNCLAIMED_USD = 15;

/**
 * Fetch lifetime-fees for a token (total fees collected, all claimers combined).
 * Returns lamports as bigint, or 0n on failure.
 */
async function fetchLifetimeFees(tokenMint: string): Promise<bigint> {
  const res = await bagsFetch<BagsApiResponse<string>>(
    `/token-launch/lifetime-fees?tokenMint=${encodeURIComponent(tokenMint)}`
  );
  if (res === null) return -1n; // null = fetch failed or rate limited (distinct from 0)
  if (!res.response) return 0n;
  try {
    return BigInt(res.response);
  } catch {
    return 0n;
  }
}

/**
 * Compute claimed amounts for positions using two strategies:
 *
 * 1. PRIMARY (positions with known userBps):
 *    claimed = (lifetimeFees × userBps / 10000) − unclaimed
 *    This avoids wallet-matching issues entirely.
 *
 * 2. FALLBACK (positions with unknown userBps):
 *    Use claim-stats with findClaimerEntry matching.
 *
 * Total API calls: ≤ MAX_LIFETIME_FEE_MINTS + MAX_CLAIM_STATS_FALLBACK_MINTS (≤1000).
 */
async function computeClaimedAmounts(
  positions: BagsClaimablePosition[],
  wallet: string,
  handle?: string
): Promise<Map<string, bigint>> {
  const claimMap = new Map<string, bigint>();
  const eligible = positions.filter((p) => p.baseMint);
  if (eligible.length === 0) return claimMap;

  const withBps = eligible.filter((p) => p.userBps != null && p.userBps > 0);
  const withoutBps = eligible.filter((p) => p.userBps == null || p.userBps <= 0);

  console.debug(`[bags] computeClaimedAmounts for ${handle ?? wallet.slice(0, 8)}: ${eligible.length} positions (withBps=${withBps.length}, withoutBps=${withoutBps.length})`);

  // Bail early if all API keys are rate limited
  if (isRateLimited()) {
    console.warn('[bags] skipping computeClaimedAmounts — all API keys rate limited');
    return claimMap;
  }

  // --- Primary: lifetime-fees for positions with known BPS ---
  // NOTE: No dust filter here — a position with tiny unclaimed can have large
  // claimed history. The MAX_LIFETIME_FEE_MINTS cap controls API call volume.
  if (withBps.length > 0) {
    const sorted = [...withBps].sort(
      (a, b) => (b.totalClaimableLamportsUserShare || 0) - (a.totalClaimableLamportsUserShare || 0)
    );

    if (sorted.length > MAX_LIFETIME_FEE_MINTS) {
      console.warn(`[bags] lifetime-fees capped at ${MAX_LIFETIME_FEE_MINTS}/${sorted.length} mints`);
    }
    const capped = sorted.slice(0, MAX_LIFETIME_FEE_MINTS);

    let lfHits = 0;
    let lfErrors = 0;
    let lfZero = 0;
    let lfFetchFail = 0;

    // Process in batches to avoid overwhelming bags.fm / Vercel connection limits
    for (let batchStart = 0; batchStart < capped.length; batchStart += CONCURRENCY_LIMIT) {
      if (isRateLimited()) {
        console.warn(`[bags] lifetime-fees: aborting at batch ${batchStart}/${capped.length} — all keys rate limited`);
        break;
      }
      const batch = capped.slice(batchStart, batchStart + CONCURRENCY_LIMIT);
      const results = await Promise.allSettled(
        batch.map(async (p) => {
          const lifetimeLamports = await fetchLifetimeFees(p.baseMint);
          if (lifetimeLamports === -1n) { lfFetchFail++; return; } // fetch failed
          if (lifetimeLamports === 0n) { lfZero++; return; }

          const userBps = BigInt(p.userBps!);
          const userEarned = (lifetimeLamports * userBps) / 10000n;
          const unclaimed = BigInt(Math.floor(p.totalClaimableLamportsUserShare || 0));
          const claimed = userEarned > unclaimed ? userEarned - unclaimed : 0n;

          if (claimed > 0n) {
            claimMap.set(p.baseMint, claimed);
            lfHits++;
          }
        })
      );
      for (const r of results) {
        if (r.status === 'rejected') lfErrors++;
      }

      // Log progress every few batches
      if (batchStart % (CONCURRENCY_LIMIT * 5) === 0 || batchStart + CONCURRENCY_LIMIT >= capped.length) {
        console.debug(`[bags] lifetime-fees progress: ${Math.min(batchStart + CONCURRENCY_LIMIT, capped.length)}/${capped.length} (hits=${lfHits}, fetchFail=${lfFetchFail}, zero=${lfZero})`);
      }
    }
    console.debug(`[bags] lifetime-fees DONE: ${capped.length} queried → ${lfHits} claimed>0, ${lfZero} zero, ${lfFetchFail} fetchFail, ${lfErrors} rejected`);
  }

  // --- Fallback: claim-stats for positions without BPS ---
  // Skip if we got rate limited during primary phase
  if (withoutBps.length > 0 && !isRateLimited()) {
    const sorted = [...withoutBps].sort(
      (a, b) => (b.totalClaimableLamportsUserShare || 0) - (a.totalClaimableLamportsUserShare || 0)
    );
    if (sorted.length > MAX_CLAIM_STATS_FALLBACK_MINTS) {
      console.warn(`[bags] claim-stats fallback capped at ${MAX_CLAIM_STATS_FALLBACK_MINTS}/${sorted.length} mints`);
    }
    const capped = sorted.slice(0, MAX_CLAIM_STATS_FALLBACK_MINTS);

    let csHits = 0;
    let csErrors = 0;

    // Process in batches
    for (let batchStart = 0; batchStart < capped.length; batchStart += CONCURRENCY_LIMIT) {
      if (isRateLimited()) {
        console.warn(`[bags] claim-stats: aborting at batch ${batchStart}/${capped.length} — all keys rate limited`);
        break;
      }
      const batch = capped.slice(batchStart, batchStart + CONCURRENCY_LIMIT);
      const results = await Promise.allSettled(
        batch.map(async (p) => {
          const stats = await fetchClaimStatsCached(p.baseMint);
          const entry = findClaimerEntry(stats, wallet, handle);
          if (entry?.totalClaimed) {
            const raw = entry.totalClaimed;
            const claimed = raw.includes('.')
              ? solDecimalToLamports(raw)
              : BigInt(raw);
            if (claimed > 0n) {
              claimMap.set(p.baseMint, claimed);
              csHits++;
            }
          }
        })
      );
      for (const r of results) {
        if (r.status === 'rejected') csErrors++;
      }
    }
    console.debug(`[bags] claim-stats fallback: ${capped.length} queried → ${csHits} with claimed > 0, ${csErrors} errors`);
  }

  console.debug(`[bags] computeClaimedAmounts result: ${claimMap.size} mints with claimed > 0`);
  return claimMap;
}

// ═══════════════════════════════════════════════
// Bags.fm Adapter
// ═══════════════════════════════════════════════

export const bagsAdapter: PlatformAdapter = {
  platform: 'bags',
  chain: 'sol',
  supportsIdentityResolution: true,
  supportsLiveFees: true,
  supportsHandleBasedFees: true,

  async resolveIdentity(
    handle: string,
    provider: IdentityProvider
  ): Promise<ResolvedWallet[]> {
    const address = await resolveHandleToWallet(handle, provider);
    if (!address) return [];

    return [
      {
        address,
        chain: 'sol',
        sourcePlatform: 'bags',
      },
    ];
  },

  async getFeesByHandle(
    handle: string,
    provider: IdentityProvider
  ): Promise<TokenFee[]> {
    if (provider === 'wallet') return [];

    // Step 1: Resolve handle → wallet (Bags manages wallets for fee claimers)
    const wallet = await resolveHandleToWallet(handle, provider);
    if (!wallet) return [];

    // Step 2: Get claimable positions for that wallet (cached to avoid duplicate calls).
    const positions = await getClaimablePositionsCached(wallet);
    if (positions.length === 0) return [];

    // Step 3: Compute claimed amounts (lifetime-fees primary, claim-stats fallback).
    // When rate limited, claimTotals will be empty — earned = unclaimed only.
    const claimTotals = await computeClaimedAmounts(positions, wallet, handle);

    // Step 4: Build fee entries, filtering dust positions (< $MIN_UNCLAIMED_USD total earned).
    // This prevents storing thousands of near-zero records for massive creators (e.g. finnbags 6k+).
    const { sol: solPrice } = await getNativeTokenPrices(); // cached, near-zero overhead
    const dustLamports = solPrice > 0
      ? BigInt(Math.floor((MIN_UNCLAIMED_USD / solPrice) * 1e9))
      : 0n;

    const fees: TokenFee[] = [];
    for (const p of positions) {
      if (!p.baseMint) continue;
      const unclaimed = BigInt(Math.floor(p.totalClaimableLamportsUserShare || 0));
      const claimed = claimTotals.get(p.baseMint) ?? 0n;
      if (unclaimed <= 0n && claimed <= 0n) continue;

      // Skip dust: totalEarned < threshold AND no claimed history
      const totalEarned = unclaimed + claimed;
      if (dustLamports > 0n && totalEarned < dustLamports && claimed === 0n) continue;

      fees.push({
        tokenAddress: p.baseMint,
        tokenSymbol: null,
        chain: 'sol',
        platform: 'bags',
        totalEarned: totalEarned.toString(),
        totalClaimed: claimed.toString(),
        totalUnclaimed: unclaimed.toString(),
        totalEarnedUsd: null,
        royaltyBps: p.userBps ?? null,
      });
    }

    return enrichSolanaTokenSymbols(fees);
  },

  async getCreatorTokens(wallet: string): Promise<CreatorToken[]> {
    // Bags doesn't have a "list tokens by creator" endpoint.
    // We discover tokens via claimable-positions (cached).
    const data = await getClaimablePositionsCached(wallet);

    return data
      .filter((p) => p.baseMint)
      .map((p) => ({
        tokenAddress: p.baseMint,
        chain: 'sol' as const,
        platform: 'bags' as const,
        symbol: null,
        name: null,
        imageUrl: null,
      }));
  },

  async getHistoricalFees(wallet: string): Promise<TokenFee[]> {
    if (!isValidSolanaAddress(wallet)) return [];

    try {
      // Historical fees: only fetch unclaimed positions (1 API call via cache).
      // Claimed amounts are computed only in getFeesByHandle (the initial scan).
      const positions = await getClaimablePositionsCached(wallet);
      if (positions.length === 0) return [];

      const fees: TokenFee[] = [];
      for (const p of positions) {
        if (!p.baseMint) continue;
        const unclaimed = BigInt(Math.floor(p.totalClaimableLamportsUserShare || 0));
        if (unclaimed <= 0n) continue;

        fees.push({
          tokenAddress: p.baseMint,
          tokenSymbol: null,
          chain: 'sol',
          platform: 'bags',
          totalEarned: unclaimed.toString(),
          totalClaimed: '0',
          totalUnclaimed: unclaimed.toString(),
          totalEarnedUsd: null,
          royaltyBps: p.userBps ?? null,
        });
      }

      return enrichSolanaTokenSymbols(fees);
    } catch (err) {
      console.warn('[bags] getHistoricalFees failed:', err instanceof Error ? err.message : err);
      return [];
    }
  },

  async getLiveUnclaimedFees(wallet: string): Promise<TokenFee[]> {
    if (!isValidSolanaAddress(wallet)) return [];

    try {
      // Live polling: only fetch unclaimed positions (1 API call via cache).
      // Do NOT compute claimed amounts here — that's expensive (800+ API calls)
      // and should only happen during the initial getFeesByHandle scan.
      const data = await getClaimablePositionsCached(wallet);

      const fees = data
        .filter((p) => p.baseMint && (p.totalClaimableLamportsUserShare || 0) > 0)
        .map((p) => {
          const unclaimed = BigInt(Math.floor(p.totalClaimableLamportsUserShare || 0));
          return {
            tokenAddress: p.baseMint,
            tokenSymbol: null as string | null,
            chain: 'sol' as const,
            platform: 'bags' as const,
            totalEarned: unclaimed.toString(),
            totalClaimed: '0',
            totalUnclaimed: unclaimed.toString(),
            totalEarnedUsd: null,
            royaltyBps: p.userBps ?? null,
          };
        });

      return enrichSolanaTokenSymbols(fees);
    } catch (err) {
      console.warn('[bags] getLiveUnclaimedFees failed:', err instanceof Error ? err.message : err);
      return [];
    }
  },

  async getClaimHistory(_wallet: string): Promise<ClaimEvent[]> {
    // Bags API doesn't expose individual claim events.
    // Historical data comes from claim-stats aggregates.
    return [];
  },
};
