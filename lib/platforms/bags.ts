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

/**
 * claimable-positions response: fee positions for a wallet.
 *
 * IMPORTANT: Field naming is misleading in the Bags API V2:
 * - `totalClaimableLamportsUserShare` = TOTAL EARNED (not unclaimed!)
 * - Real unclaimed = sum of 3 pool fields below
 * - claimed = earned − unclaimed
 */
interface BagsClaimablePosition {
  baseMint: string;
  quoteMint?: string | null;
  /** Total EARNED lamports (misleading name — this is NOT unclaimed). */
  totalClaimableLamportsUserShare: number;
  claimableDisplayAmount?: number | null;
  userBps?: number | null;
  isMigrated?: boolean;
  isCustomFeeVault?: boolean;
  virtualPool?: string;
  virtualPoolAddress?: string | null;
  dammPoolAddress?: string | null;
  /** Unclaimed fees in the virtual pool (lamports). */
  virtualPoolClaimableLamportsUserShare?: number | null;
  /** Unclaimed fees in the DAMM pool (lamports). */
  dammPoolClaimableLamportsUserShare?: number | null;
  /** Unclaimed fees in the user vault (lamports). */
  userVaultClaimableLamportsUserShare?: number | null;
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

/** Max concurrent API requests to avoid overwhelming bags.fm or Vercel connection limits. */
const CONCURRENCY_LIMIT = 40;

/** Minimum earned value in USD to include in results.
 *  Filters out dust positions, saving storage. Uses live SOL price. */
const MIN_UNCLAIMED_USD = 15;

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

    // Step 3: Build fee entries using O(1) inline calculation.
    // earned/claimed/unclaimed come directly from the position data — zero extra API calls.
    //
    // Bags API V2 field naming is misleading:
    //   totalClaimableLamportsUserShare = TOTAL EARNED (not unclaimed!)
    //   Real unclaimed = virtualPool + dammPool + userVault pool fields
    //   claimed = earned − unclaimed
    const { sol: solPrice } = await getNativeTokenPrices();
    const dustLamports = solPrice > 0
      ? BigInt(Math.floor((MIN_UNCLAIMED_USD / solPrice) * 1e9))
      : 0n;

    const fees: TokenFee[] = [];
    for (const p of positions) {
      if (!p.baseMint) continue;

      // O(1): earned/claimed/unclaimed directly from position
      const earned = BigInt(Math.floor(p.totalClaimableLamportsUserShare || 0));
      const unclaimed = BigInt(Math.floor(p.virtualPoolClaimableLamportsUserShare || 0))
                      + BigInt(Math.floor(p.dammPoolClaimableLamportsUserShare || 0))
                      + BigInt(Math.floor(p.userVaultClaimableLamportsUserShare || 0));
      const claimed = earned > unclaimed ? earned - unclaimed : 0n;

      if (earned <= 0n) continue;

      // Skip dust: earned < threshold AND no claimed history
      if (dustLamports > 0n && earned < dustLamports && claimed === 0n) continue;

      fees.push({
        tokenAddress: p.baseMint,
        tokenSymbol: null,
        chain: 'sol',
        platform: 'bags',
        totalEarned: earned.toString(),
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
      // O(1): earned/claimed/unclaimed from position data — zero extra API calls.
      const positions = await getClaimablePositionsCached(wallet);
      if (positions.length === 0) return [];

      const fees: TokenFee[] = [];
      for (const p of positions) {
        if (!p.baseMint) continue;

        const earned = BigInt(Math.floor(p.totalClaimableLamportsUserShare || 0));
        const unclaimed = BigInt(Math.floor(p.virtualPoolClaimableLamportsUserShare || 0))
                        + BigInt(Math.floor(p.dammPoolClaimableLamportsUserShare || 0))
                        + BigInt(Math.floor(p.userVaultClaimableLamportsUserShare || 0));
        const claimed = earned > unclaimed ? earned - unclaimed : 0n;

        if (earned <= 0n) continue;

        fees.push({
          tokenAddress: p.baseMint,
          tokenSymbol: null,
          chain: 'sol',
          platform: 'bags',
          totalEarned: earned.toString(),
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
      // Live polling: O(1) from position data — zero extra API calls.
      const data = await getClaimablePositionsCached(wallet);

      const fees = data
        .filter((p) => p.baseMint && (p.totalClaimableLamportsUserShare || 0) > 0)
        .map((p) => {
          const earned = BigInt(Math.floor(p.totalClaimableLamportsUserShare || 0));
          const unclaimed = BigInt(Math.floor(p.virtualPoolClaimableLamportsUserShare || 0))
                          + BigInt(Math.floor(p.dammPoolClaimableLamportsUserShare || 0))
                          + BigInt(Math.floor(p.userVaultClaimableLamportsUserShare || 0));
          const claimed = earned > unclaimed ? earned - unclaimed : 0n;

          return {
            tokenAddress: p.baseMint,
            tokenSymbol: null as string | null,
            chain: 'sol' as const,
            platform: 'bags' as const,
            totalEarned: earned.toString(),
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
    return [];
  },
};
