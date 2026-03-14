import 'server-only';
import { isValidSolanaAddress } from '@/lib/chains/solana';
import { getNativeTokenPrices } from '@/lib/prices';
import { enrichSolanaTokenSymbols } from './solana-metadata';
import { bagsFetch, getClaimablePositionsCached } from './bags-api';
import type { BagsApiResponse } from './bags-api';
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

interface BagsWalletPayload {
  platformData?: {
    username?: string;
    provider?: string;
  };
  provider?: string;
  wallet?: string;
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

    // Enrichment is cosmetic (adds token symbols) — don't let it destroy fee data
    try {
      return await enrichSolanaTokenSymbols(fees);
    } catch (enrichErr) {
      console.warn('[bags] enrichSolanaTokenSymbols failed, returning fees without symbols:', enrichErr instanceof Error ? enrichErr.message : enrichErr);
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

  async getLiveUnclaimedFees(wallet: string, signal?: AbortSignal): Promise<TokenFee[]> {
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
