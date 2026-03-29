import 'server-only';
import { isValidSolanaAddress } from '@/lib/chains/solana';
import { getNativeTokenPrices } from '@/lib/prices';
import { enrichSolanaTokenSymbols } from './solana-metadata';
import { bagsFetch, getClaimablePositionsCached } from './bags-api';
import type { BagsClaimablePosition, BagsApiResponse } from './bags-api';
import type { IdentityProvider } from '@/lib/supabase/types';
import type {
  PlatformAdapter,
  ResolvedWallet,
  CreatorToken,
  TokenFee,
  ClaimEvent,
} from './types';
import { createLogger } from '@/lib/logger';
const log = createLogger('bags');

/** Convert a Bags API lamport value (string | number | null) to BigInt.
 * Handles string values directly to avoid Number precision loss for values > 2^53. */
function toLamports(val: string | number | null | undefined): bigint {
  if (val == null) return 0n;
  if (typeof val === 'number') {
    if (!Number.isFinite(val) || val < 0) return 0n;
    if (!Number.isSafeInteger(val)) {
      log.warn(`toLamports: number ${val} exceeds safe integer range, converting via string`);
      return toLamports(String(val));
    }
    return BigInt(Math.floor(val));
  }
  const trimmed = val.trim();
  if (!trimmed || trimmed === '0') return 0n;
  try {
    const result = BigInt(trimmed.split('.')[0]);
    return result < 0n ? 0n : result;
  } catch {
    log.warn(`toLamports: invalid value "${trimmed}", returning 0`);
    return 0n;
  }
}

// ═══════════════════════════════════════════════
// Bags.fm API Types
// ═══════════════════════════════════════════════

interface BagsWalletPayload {
  platformData?: {
    username?: string;
    provider?: string;
  };
  provider?: string;
  wallet?: string;
}

// ═══════════════════════════════════════════════
// Fee Computation (single source of truth)
// ═══════════════════════════════════════════════

/**
 * Convert a Bags claimable position to a TokenFee entry.
 * Bags API V2 field naming is misleading:
 *   totalClaimableLamportsUserShare = TOTAL EARNED (not unclaimed!)
 *   Real unclaimed = virtualPool + dammPool + userVault pool fields
 *   claimed = earned - unclaimed
 *
 * @param dustLamports - minimum earned threshold to filter noise (0n = no filter)
 */
function positionToFee(
  p: BagsClaimablePosition,
  dustLamports: bigint = 0n
): TokenFee | null {
  if (!p.baseMint) return null;

  const earned = toLamports(p.totalClaimableLamportsUserShare);
  const unclaimed = toLamports(p.virtualPoolClaimableLamportsUserShare)
                  + toLamports(p.dammPoolClaimableLamportsUserShare)
                  + toLamports(p.userVaultClaimableLamportsUserShare);
  // Clamp unclaimed to earned to maintain invariant: earned >= unclaimed
  const clampedUnclaimed = unclaimed > earned ? earned : unclaimed;
  const claimed = earned - clampedUnclaimed;

  if (earned <= 0n) return null;
  if (dustLamports > 0n && earned < dustLamports && claimed === 0n) return null;

  return {
    tokenAddress: p.baseMint,
    tokenSymbol: null,
    chain: 'sol',
    platform: 'bags',
    totalEarned: earned.toString(),
    totalClaimed: claimed.toString(),
    totalUnclaimed: clampedUnclaimed.toString(),
    totalEarnedUsd: null,
    royaltyBps: p.userBps ?? null,
  };
}

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

/** Map ClaimScan providers to Bags-supported providers.
 * Bags only supports: twitter, kick, github. */
function mapIdentityProvider(
  provider: IdentityProvider
): string | null {
  if (provider === 'twitter') return 'twitter';
  if (provider === 'github') return 'github';
  // Bags does not support farcaster or wallet-based lookups
  return null;
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
  if (!bagsProvider) return null;

  const data = await bagsFetch<BagsApiResponse<BagsWalletPayload>>(
    `/token-launch/fee-share/wallet/v2?provider=${bagsProvider}&username=${encodeURIComponent(handle)}`
  );

  const address = data?.response?.wallet;
  if (!address || !isValidSolanaAddress(address)) return null;
  return address;
}

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
  historicalCoversLive: true,

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

    // Step 3: Build fee entries from position data.
    const { sol: solPrice } = await getNativeTokenPrices();
    const dustLamports = solPrice > 0
      ? BigInt(Math.floor((MIN_UNCLAIMED_USD / solPrice) * 1e9))
      : 0n;

    const fees = positions
      .map((p) => positionToFee(p, dustLamports))
      .filter((f): f is TokenFee => f !== null);

    // Enrichment is cosmetic (adds token symbols) — don't let it destroy fee data
    try {
      return await enrichSolanaTokenSymbols(fees);
    } catch (enrichErr) {
      log.warn('enrichSolanaTokenSymbols failed, returning fees without symbols', { error: enrichErr instanceof Error ? enrichErr.message : String(enrichErr) });
      return fees;
    }
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

      // Apply same dust filter as getFeesByHandle for consistency
      const { sol: solPrice } = await getNativeTokenPrices();
      const dustLamports = solPrice > 0
        ? BigInt(Math.floor((MIN_UNCLAIMED_USD / solPrice) * 1e9))
        : 0n;

      const fees = positions
        .map((p) => positionToFee(p, dustLamports))
        .filter((f): f is TokenFee => f !== null);

      return enrichSolanaTokenSymbols(fees);
    } catch (err) {
      log.warn('getHistoricalFees failed', { error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  },

  async getLiveUnclaimedFees(wallet: string, signal?: AbortSignal): Promise<TokenFee[]> {
    if (!isValidSolanaAddress(wallet)) return [];
    if (signal?.aborted) return [];

    try {
      // Live polling: O(1) from position data — zero extra API calls.
      const data = await getClaimablePositionsCached(wallet, signal);

      const fees = data
        .map((p) => positionToFee(p))
        .filter((f): f is TokenFee => f !== null);

      return enrichSolanaTokenSymbols(fees);
    } catch (err) {
      log.warn('getLiveUnclaimedFees failed', { error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  },

  async getClaimHistory(wallet: string): Promise<ClaimEvent[]> {
    if (!isValidSolanaAddress(wallet)) return [];

    try {
      const positions = await getClaimablePositionsCached(wallet);
      if (positions.length === 0) return [];

      // Fetch claim events per token (max 5 tokens to stay within budget)
      const tokensToCheck = positions
        .filter((p) => p.baseMint && toLamports(p.totalClaimableLamportsUserShare) > 0n)
        .slice(0, 5);

      const events: ClaimEvent[] = [];
      const results = await Promise.allSettled(
        tokensToCheck.map(async (p) => {
          const data = await bagsFetch<BagsApiResponse<Array<{
            wallet?: string;
            isCreator?: boolean;
            amount?: string;
            signature?: string;
            timestamp?: string;
          }>>>(`/fee-share/token/claim-events?tokenMint=${encodeURIComponent(p.baseMint)}&limit=20`);

          if (!data?.response || !Array.isArray(data.response)) return [];

          return data.response
            .filter((e) => e.wallet === wallet)
            .map((e) => ({
              tokenAddress: p.baseMint,
              chain: 'sol' as const,
              platform: 'bags' as const,
              amount: e.amount ?? '0',
              amountUsd: null,
              txHash: e.signature ?? null,
              claimedAt: e.timestamp ?? new Date().toISOString(),
            }));
        })
      );

      let failedCount = 0;
      for (const result of results) {
        if (result.status === 'fulfilled') events.push(...result.value);
        else failedCount++;
      }
      if (failedCount > 0) {
        log.warn(`getClaimHistory: ${failedCount}/${results.length} token event fetches failed`);
      }

      return events.sort((a, b) => b.claimedAt.localeCompare(a.claimedAt)).slice(0, 50);
    } catch (err) {
      log.warn('getClaimHistory failed', { error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  },
};
