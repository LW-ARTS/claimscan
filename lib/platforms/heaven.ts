import 'server-only';
import { HEAVEN_DATA_API } from '@/lib/constants';
import { isValidSolanaAddress } from '@/lib/chains/solana';
import { safeBigInt, sanitizeAmountString, sanitizeTokenName, sanitizeTokenSymbol } from '@/lib/utils';
import type { IdentityProvider } from '@/lib/supabase/types';
import type {
  PlatformAdapter,
  ResolvedWallet,
  CreatorToken,
  TokenFee,
  ClaimEvent,
} from './types';

// ═══════════════════════════════════════════════
// Heaven API Types
// ═══════════════════════════════════════════════

interface HeavenPoolInfo {
  poolAddress: string;
  tokenMint: string;
  tokenSymbol: string;
  tokenName: string;
  creatorFees?: {
    totalEarned: string;
    totalClaimed: string;
    unclaimed: string;
  };
}

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

/**
 * Short-circuit all Heaven API calls when the API is known to be down.
 * Set HEAVEN_API_ENABLED=true to re-enable if Heaven restores their API.
 */
const HEAVEN_ENABLED = process.env.HEAVEN_API_ENABLED === 'true';

async function heavenFetch<T>(
  baseUrl: string,
  path: string
): Promise<T | null> {
  if (!HEAVEN_ENABLED) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(`${baseUrl}${path}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn(`[heaven] fetch ${path} returned HTTP ${res.status}`);
      return null;
    }
    return await res.json() as T;
  } catch (err) {
    console.warn(`[heaven] fetch ${path} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ═══════════════════════════════════════════════
// Heaven Adapter
// WARNING: api.heaven.xyz DNS does not resolve as of 2026-03-07.
// All API calls will silently fail and return empty arrays.
// Kept as-is in case Heaven restores their API.
// ═══════════════════════════════════════════════

export const heavenAdapter: PlatformAdapter = {
  platform: 'heaven',
  chain: 'sol',
  supportsIdentityResolution: false,
  supportsLiveFees: true,
  supportsHandleBasedFees: false,

  async resolveIdentity(
    _handle: string,
    _provider: IdentityProvider
  ): Promise<ResolvedWallet[]> {
    // Heaven doesn't have identity resolution.
    return [];
  },

  async getFeesByHandle(): Promise<TokenFee[]> {
    return [];
  },

  async getCreatorTokens(wallet: string): Promise<CreatorToken[]> {
    if (!isValidSolanaAddress(wallet)) return [];
    const data = await heavenFetch<{ pools?: HeavenPoolInfo[] }>(
      HEAVEN_DATA_API,
      `/pools?creator=${encodeURIComponent(wallet)}`
    );
    if (!data?.pools) return [];

    return data.pools.map((p) => ({
      tokenAddress: p.tokenMint,
      chain: 'sol' as const,
      platform: 'heaven' as const,
      symbol: sanitizeTokenSymbol(p.tokenSymbol),
      name: sanitizeTokenName(p.tokenName),
      imageUrl: null,
    }));
  },

  async getHistoricalFees(wallet: string): Promise<TokenFee[]> {
    if (!isValidSolanaAddress(wallet)) return [];
    const data = await heavenFetch<{ pools?: HeavenPoolInfo[] }>(
      HEAVEN_DATA_API,
      `/pools?creator=${encodeURIComponent(wallet)}`
    );
    if (!data?.pools) return [];

    return data.pools
      .filter((p) => p.creatorFees)
      .map((p) => ({
        tokenAddress: p.tokenMint,
        tokenSymbol: sanitizeTokenSymbol(p.tokenSymbol),
        chain: 'sol' as const,
        platform: 'heaven' as const,
        totalEarned: sanitizeAmountString(p.creatorFees!.totalEarned),
        totalClaimed: sanitizeAmountString(p.creatorFees!.totalClaimed),
        totalUnclaimed: sanitizeAmountString(p.creatorFees!.unclaimed),
        totalEarnedUsd: null,
        royaltyBps: null,
      }));
  },

  async getLiveUnclaimedFees(wallet: string): Promise<TokenFee[]> {
    // Same as historical — Heaven API returns live data
    const fees = await this.getHistoricalFees(wallet);
    return fees.filter((f) => safeBigInt(f.totalUnclaimed) > 0n);
  },

  async getClaimHistory(_wallet: string): Promise<ClaimEvent[]> {
    return [];
  },
};
