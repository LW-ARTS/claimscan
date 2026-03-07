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

  // Bags API v2 returns { success, response: { wallet, platformData, provider } }
  const data = await bagsFetch<BagsApiResponse<BagsWalletPayload>>(
    `/token-launch/fee-share/wallet/v2?provider=${bagsProvider}&username=${encodeURIComponent(handle)}`
  );

  const address = data?.response?.wallet;
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

    // Step 2: Get claimable positions for that wallet.
    // NOTE: claim-stats requires tokenMint (not wallet), so we can only use
    // claimable-positions to discover fees by wallet address.
    const claimableRes = await bagsFetch<BagsApiResponse<BagsClaimablePosition[]>>(
      `/token-launch/claimable-positions?wallet=${encodeURIComponent(wallet)}`
    );

    const positions = Array.isArray(claimableRes?.response) ? claimableRes.response : [];

    const fees: TokenFee[] = [];
    for (const p of positions) {
      if (!p.baseMint) continue;
      // totalClaimableLamportsUserShare is in lamports (1 SOL = 1e9 lamports)
      const lamports = BigInt(Math.floor(p.totalClaimableLamportsUserShare || 0));
      if (lamports <= 0n) continue;

      fees.push({
        tokenAddress: p.baseMint,
        tokenSymbol: null,
        chain: 'sol',
        platform: 'bags',
        totalEarned: '0',
        totalClaimed: '0',
        totalUnclaimed: lamports.toString(),
        totalEarnedUsd: null,
        royaltyBps: p.userBps ?? null,
      });
    }

    return enrichSolanaTokenSymbols(fees);
  },

  async getCreatorTokens(wallet: string): Promise<CreatorToken[]> {
    // Bags doesn't have a "list tokens by creator" endpoint.
    // We discover tokens via claimable-positions.
    const res = await bagsFetch<BagsApiResponse<BagsClaimablePosition[]>>(
      `/token-launch/claimable-positions?wallet=${encodeURIComponent(wallet)}`
    );
    const data = Array.isArray(res?.response) ? res.response : [];

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
    // Bags doesn't expose historical fee totals per wallet.
    // claim-stats requires tokenMint (not wallet).
    // claimable-positions only shows current unclaimed balances.
    // Return empty — historical data would require indexing claim events.
    return [];
  },

  async getLiveUnclaimedFees(wallet: string): Promise<TokenFee[]> {
    const res = await bagsFetch<BagsApiResponse<BagsClaimablePosition[]>>(
      `/token-launch/claimable-positions?wallet=${encodeURIComponent(wallet)}`
    );
    const data = Array.isArray(res?.response) ? res.response : [];

    const fees = data
      .filter((p) => p.baseMint && (p.totalClaimableLamportsUserShare || 0) > 0)
      .map((p) => {
        const lamports = BigInt(Math.floor(p.totalClaimableLamportsUserShare || 0));
        return {
          tokenAddress: p.baseMint,
          tokenSymbol: null as string | null,
          chain: 'sol' as const,
          platform: 'bags' as const,
          totalEarned: '0',
          totalClaimed: '0',
          totalUnclaimed: lamports.toString(),
          totalEarnedUsd: null,
          royaltyBps: p.userBps ?? null,
        };
      });

    return enrichSolanaTokenSymbols(fees);
  },

  async getClaimHistory(_wallet: string): Promise<ClaimEvent[]> {
    // Bags API doesn't expose individual claim events.
    // Historical data comes from claim-stats aggregates.
    return [];
  },
};
