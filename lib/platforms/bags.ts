import 'server-only';
import { BAGS_API_BASE } from '@/lib/constants';
import { isValidSolanaAddress } from '@/lib/chains/solana';
import { sanitizeAmountString, sanitizeTokenSymbol } from '@/lib/utils';
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

interface BagsWalletResponse {
  data?: {
    walletAddress?: string;
    solanaWallet?: string;
  };
}

interface BagsClaimStats {
  data?: {
    tokenMint: string;
    tokenSymbol: string;
    totalEarned: string;
    totalClaimed: string;
    totalUnclaimed: string;
    royaltyBps: number;
  }[];
}

interface BagsClaimablePosition {
  tokenMint: string;
  tokenSymbol: string;
  claimableAmount: string;
}

interface BagsClaimableResponse {
  data?: BagsClaimablePosition[];
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
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
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

  // Try the /token-launch/ prefixed path first (v2 API), then fallback
  const data = await bagsFetch<BagsWalletResponse>(
    `/token-launch/fee-share/wallet/v2?provider=${bagsProvider}&username=${encodeURIComponent(handle)}`
  ) ?? await bagsFetch<BagsWalletResponse>(
    `/fee-share/wallet/v2?provider=${bagsProvider}&username=${encodeURIComponent(handle)}`
  );

  const address = data?.data?.walletAddress || data?.data?.solanaWallet;
  if (!address || !isValidSolanaAddress(address)) return null;
  return address;
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

    // Step 2: Get claimable positions AND claim-stats for that wallet
    const [claimable, stats] = await Promise.all([
      bagsFetch<BagsClaimableResponse>(
        `/token-launch/claimable-positions?wallet=${encodeURIComponent(wallet)}`
      ) ?? bagsFetch<BagsClaimableResponse>(
        `/claimable-positions?wallet=${encodeURIComponent(wallet)}`
      ),
      bagsFetch<BagsClaimStats>(
        `/token-launch/claim-stats?wallet=${encodeURIComponent(wallet)}`
      ) ?? bagsFetch<BagsClaimStats>(
        `/claim-stats?wallet=${encodeURIComponent(wallet)}`
      ),
    ]);

    const fees: TokenFee[] = [];
    const seenTokens = new Set<string>();

    // Prefer claim-stats as it has more complete data (earned, claimed, unclaimed)
    if (stats?.data) {
      for (const s of stats.data) {
        seenTokens.add(s.tokenMint);
        fees.push({
          tokenAddress: s.tokenMint,
          tokenSymbol: sanitizeTokenSymbol(s.tokenSymbol),
          chain: 'sol',
          platform: 'bags',
          totalEarned: sanitizeAmountString(s.totalEarned),
          totalClaimed: sanitizeAmountString(s.totalClaimed),
          totalUnclaimed: sanitizeAmountString(s.totalUnclaimed),
          totalEarnedUsd: null,
          royaltyBps: s.royaltyBps,
        });
      }
    }

    // Add any claimable positions not already covered by claim-stats
    if (claimable?.data) {
      for (const p of claimable.data) {
        if (seenTokens.has(p.tokenMint)) continue;
        try {
          if (BigInt(p.claimableAmount || '0') <= 0n) continue;
        } catch {
          continue;
        }
        fees.push({
          tokenAddress: p.tokenMint,
          tokenSymbol: sanitizeTokenSymbol(p.tokenSymbol),
          chain: 'sol',
          platform: 'bags',
          totalEarned: '0',
          totalClaimed: '0',
          totalUnclaimed: sanitizeAmountString(p.claimableAmount),
          totalEarnedUsd: null,
          royaltyBps: null,
        });
      }
    }

    return fees;
  },

  async getCreatorTokens(wallet: string): Promise<CreatorToken[]> {
    // Bags doesn't have a dedicated "list creator tokens" endpoint.
    // Tokens are discovered via claim-stats which returns all tokens
    // that have fee allocations for this wallet.
    const stats = await bagsFetch<BagsClaimStats>(
      `/token-launch/claim-stats?wallet=${encodeURIComponent(wallet)}`
    ) ?? await bagsFetch<BagsClaimStats>(
      `/claim-stats?wallet=${encodeURIComponent(wallet)}`
    );
    if (!stats?.data) return [];

    return stats.data.map((s) => ({
      tokenAddress: s.tokenMint,
      chain: 'sol' as const,
      platform: 'bags' as const,
      symbol: sanitizeTokenSymbol(s.tokenSymbol),
      name: null,
      imageUrl: null,
    }));
  },

  async getHistoricalFees(wallet: string): Promise<TokenFee[]> {
    const stats = await bagsFetch<BagsClaimStats>(
      `/token-launch/claim-stats?wallet=${encodeURIComponent(wallet)}`
    ) ?? await bagsFetch<BagsClaimStats>(
      `/claim-stats?wallet=${encodeURIComponent(wallet)}`
    );
    if (!stats?.data) return [];

    return stats.data.map((s) => ({
      tokenAddress: s.tokenMint,
      tokenSymbol: sanitizeTokenSymbol(s.tokenSymbol),
      chain: 'sol' as const,
      platform: 'bags' as const,
      totalEarned: sanitizeAmountString(s.totalEarned),
      totalClaimed: sanitizeAmountString(s.totalClaimed),
      totalUnclaimed: sanitizeAmountString(s.totalUnclaimed),
      totalEarnedUsd: null,
      royaltyBps: s.royaltyBps,
    }));
  },

  async getLiveUnclaimedFees(wallet: string): Promise<TokenFee[]> {
    const data = await bagsFetch<BagsClaimableResponse>(
      `/token-launch/claimable-positions?wallet=${encodeURIComponent(wallet)}`
    ) ?? await bagsFetch<BagsClaimableResponse>(
      `/claimable-positions?wallet=${encodeURIComponent(wallet)}`
    );
    if (!data?.data) return [];

    return data.data
      .filter((p) => {
        try { return BigInt(p.claimableAmount || '0') > 0n; } catch { return false; }
      })
      .map((p) => ({
        tokenAddress: p.tokenMint,
        tokenSymbol: sanitizeTokenSymbol(p.tokenSymbol),
        chain: 'sol' as const,
        platform: 'bags' as const,
        totalEarned: '0',
        totalClaimed: '0',
        totalUnclaimed: sanitizeAmountString(p.claimableAmount),
        totalEarnedUsd: null,
        royaltyBps: null,
      }));
  },

  async getClaimHistory(_wallet: string): Promise<ClaimEvent[]> {
    // Bags API doesn't expose individual claim events.
    // Historical data comes from claim-stats aggregates.
    return [];
  },
};
