import 'server-only';
import { BAGS_API_BASE } from '@/lib/constants';
import { isValidSolanaAddress } from '@/lib/chains/solana';
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

async function bagsFetch<T>(path: string): Promise<T | null> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (process.env.BAGS_API_KEY) {
      headers['x-api-key'] = process.env.BAGS_API_KEY;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(`${BAGS_API_BASE}${path}`, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);
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

  // 3. Match by isCreator flag — only use as last resort since multiple
  // claimers can have isCreator=true (co-creators), which could return
  // the wrong claimer's totalClaimed.
  entry = stats.find((s) => s.isCreator === true);
  if (entry) return entry;

  return undefined;
}

/**
 * Get totalClaimed (lamports) for a wallet across multiple token mints.
 * Caps at MAX_CLAIM_STATS_MINTS to avoid excessive API calls; logs a warning when truncated.
 * When `handle` is provided (handle-based lookup), uses it as a fallback
 * matching strategy if the wallet address doesn't match claim-stats entries.
 */
/**
 * Convert a decimal SOL string (e.g. "1.234567890") to lamports using
 * string manipulation instead of floating-point arithmetic.
 * This avoids precision loss for amounts > ~9 SOL where
 * `parseFloat(raw) * 1e9` would exceed Number.MAX_SAFE_INTEGER.
 */
function solDecimalToLamports(raw: string): bigint {
  const [whole, frac = ''] = raw.split('.');
  // Pad or truncate fractional part to exactly 9 digits (lamports precision)
  const paddedFrac = frac.padEnd(9, '0').slice(0, 9);
  return BigInt((whole || '0') + paddedFrac);
}

/** Max mints to query claim-stats for. Must be generous — creators with many
 *  tokens (e.g. 300+) need accurate totals. Requests are concurrent, so the
 *  wall-clock cost is ~1-2 extra seconds, not 200× sequential delay. */
const MAX_CLAIM_STATS_MINTS = 500;

/** Max mints to query lifetime-fees for (fallback when claim-stats fails). */
const MAX_LIFETIME_FEES_MINTS = 200;

/**
 * Fetch lifetime-fees for a token (total fees collected, all claimers combined).
 * Returns lamports as bigint, or 0n on failure.
 */
async function fetchLifetimeFees(tokenMint: string): Promise<bigint> {
  const res = await bagsFetch<BagsApiResponse<string>>(
    `/token-launch/lifetime-fees?tokenMint=${encodeURIComponent(tokenMint)}`
  );
  if (!res?.response) return 0n;
  try {
    return BigInt(res.response);
  } catch {
    return 0n;
  }
}

async function getClaimTotalsForWallet(
  wallet: string,
  mints: string[],
  handle?: string
): Promise<Map<string, bigint>> {
  const claimMap = new Map<string, bigint>();
  if (mints.length > MAX_CLAIM_STATS_MINTS) {
    console.warn(`[bags] claim-stats capped at ${MAX_CLAIM_STATS_MINTS}/${mints.length} mints for wallet ${wallet.slice(0, 8)}...`);
  }
  const cappedMints = mints.slice(0, MAX_CLAIM_STATS_MINTS);

  const results = await Promise.allSettled(
    cappedMints.map(async (mint) => {
      const stats = await fetchClaimStatsCached(mint);
      const entry = findClaimerEntry(stats, wallet, handle);
      if (entry?.totalClaimed) {
        // claim-stats may return lamports (integer string) or SOL (decimal string).
        // Use string-based conversion to avoid parseFloat precision loss.
        const raw = entry.totalClaimed;
        const claimed = raw.includes('.')
          ? solDecimalToLamports(raw)
          : BigInt(raw);
        if (claimed > 0n) claimMap.set(mint, claimed);
      }
    })
  );

  for (const r of results) {
    if (r.status === 'rejected') {
      console.warn('[bags] claim-stats fetch failed:', r.reason instanceof Error ? r.reason.message : r.reason);
    }
  }

  return claimMap;
}

/**
 * Fallback: for positions where claim-stats matching failed, use lifetime-fees
 * to estimate the user's total earned and derive claimed amount.
 *
 * Formula: userEarned = lifetimeFees × userBps / 10000
 *          claimed = userEarned − unclaimed  (clamped to ≥ 0)
 *
 * Only called for positions with userBps available and 0 claimed from claim-stats.
 */
async function fillClaimedFromLifetimeFees(
  positions: BagsClaimablePosition[],
  claimMap: Map<string, bigint>
): Promise<void> {
  // Only process positions where claim-stats returned nothing and BPS is known
  const needFallback = positions.filter(
    (p) => p.baseMint && !claimMap.has(p.baseMint) && p.userBps != null && p.userBps > 0
  );

  if (needFallback.length === 0) return;

  // Sort by unclaimed descending — biggest positions are most likely to have
  // significant claimed amounts, so we prioritise them within the cap.
  needFallback.sort(
    (a, b) =>
      (b.totalClaimableLamportsUserShare || 0) -
      (a.totalClaimableLamportsUserShare || 0)
  );
  const capped = needFallback.slice(0, MAX_LIFETIME_FEES_MINTS);

  if (needFallback.length > MAX_LIFETIME_FEES_MINTS) {
    console.warn(
      `[bags] lifetime-fees fallback capped at ${MAX_LIFETIME_FEES_MINTS}/${needFallback.length} mints`
    );
  }

  const results = await Promise.allSettled(
    capped.map(async (p) => {
      const lifetimeLamports = await fetchLifetimeFees(p.baseMint);
      if (lifetimeLamports <= 0n) return;

      const userBps = BigInt(p.userBps!);
      const userEarned = (lifetimeLamports * userBps) / 10000n;
      const unclaimed = BigInt(Math.floor(p.totalClaimableLamportsUserShare || 0));
      const claimed = userEarned > unclaimed ? userEarned - unclaimed : 0n;

      if (claimed > 0n) {
        claimMap.set(p.baseMint, claimed);
      }
    })
  );

  for (const r of results) {
    if (r.status === 'rejected') {
      console.warn('[bags] lifetime-fees fallback failed:', r.reason instanceof Error ? r.reason.message : r.reason);
    }
  }
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

    // Step 3: Fetch claimed totals via claim-stats API (pass handle for fallback matching)
    const mints = positions.filter((p) => p.baseMint).map((p) => p.baseMint);
    const claimTotals = await getClaimTotalsForWallet(wallet, mints, handle);

    // Step 4: For positions where claim-stats had no match, use lifetime-fees fallback
    await fillClaimedFromLifetimeFees(positions, claimTotals);

    const fees: TokenFee[] = [];
    for (const p of positions) {
      if (!p.baseMint) continue;
      // totalClaimableLamportsUserShare is in lamports (1 SOL = 1e9 lamports)
      const unclaimed = BigInt(Math.floor(p.totalClaimableLamportsUserShare || 0));
      const claimed = claimTotals.get(p.baseMint) ?? 0n;
      if (unclaimed <= 0n && claimed <= 0n) continue;

      fees.push({
        tokenAddress: p.baseMint,
        tokenSymbol: null,
        chain: 'sol',
        platform: 'bags',
        totalEarned: (unclaimed + claimed).toString(),
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
      const positions = await getClaimablePositionsCached(wallet);
      if (positions.length === 0) return [];

      const mints = positions.filter((p) => p.baseMint).map((p) => p.baseMint);
      const claimTotals = await getClaimTotalsForWallet(wallet, mints);
      await fillClaimedFromLifetimeFees(positions, claimTotals);

      const fees: TokenFee[] = [];
      for (const p of positions) {
        if (!p.baseMint) continue;
        const unclaimed = BigInt(Math.floor(p.totalClaimableLamportsUserShare || 0));
        const claimed = claimTotals.get(p.baseMint) ?? 0n;
        if (unclaimed <= 0n && claimed <= 0n) continue;

        fees.push({
          tokenAddress: p.baseMint,
          tokenSymbol: null,
          chain: 'sol',
          platform: 'bags',
          totalEarned: (unclaimed + claimed).toString(),
          totalClaimed: claimed.toString(),
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
      const data = await getClaimablePositionsCached(wallet);
      const activeMints = data
        .filter((p) => p.baseMint && (p.totalClaimableLamportsUserShare || 0) > 0)
        .map((p) => p.baseMint);

      // Fetch claimed totals in parallel for active positions
      const claimTotals = activeMints.length > 0
        ? await getClaimTotalsForWallet(wallet, activeMints)
        : new Map<string, bigint>();

      // Lifetime-fees fallback for positions where claim-stats had no match
      const activePositions = data.filter(
        (p) => p.baseMint && (p.totalClaimableLamportsUserShare || 0) > 0
      );
      await fillClaimedFromLifetimeFees(activePositions, claimTotals);

      const fees = data
        .filter((p) => p.baseMint && (p.totalClaimableLamportsUserShare || 0) > 0)
        .map((p) => {
          const unclaimed = BigInt(Math.floor(p.totalClaimableLamportsUserShare || 0));
          const claimed = claimTotals.get(p.baseMint) ?? 0n;
          return {
            tokenAddress: p.baseMint,
            tokenSymbol: null as string | null,
            chain: 'sol' as const,
            platform: 'bags' as const,
            totalEarned: (unclaimed + claimed).toString(),
            totalClaimed: claimed.toString(),
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
