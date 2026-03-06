import 'server-only';
import { CLANKER_API_BASE } from '@/lib/constants';
import { batchClankerFees, isValidEvmAddress, normalizeEvmAddress } from '@/lib/chains/base';
import { safeBigInt, sanitizeTokenSymbol } from '@/lib/utils';
import type { IdentityProvider } from '@/lib/supabase/types';
import { getAddress, type Address } from 'viem';
import type {
  PlatformAdapter,
  ResolvedWallet,
  CreatorToken,
  TokenFee,
  ClaimEvent,
} from './types';

// ═══════════════════════════════════════════════
// Clanker API Types
// ═══════════════════════════════════════════════

interface ClankerCreatorResult {
  fid?: number;
  walletAddress?: string;
  custodyAddress?: string;
}

interface ClankerToken {
  contract_address: string;
  symbol: string;
  name: string;
  img_url: string | null;
  fid?: number;
}

interface ClankerTokensResponse {
  data?: ClankerToken[];
}

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

async function clankerFetch<T>(path: string): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(`${CLANKER_API_BASE}${path}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════
// Clanker Adapter
// ═══════════════════════════════════════════════

export const clankerAdapter: PlatformAdapter = {
  platform: 'clanker',
  chain: 'base',
  supportsIdentityResolution: true,
  supportsLiveFees: true,

  async resolveIdentity(
    handle: string,
    provider: IdentityProvider
  ): Promise<ResolvedWallet[]> {
    // Clanker resolves via Farcaster primarily
    if (provider !== 'farcaster' && provider !== 'wallet') {
      // Try searching by username which may resolve Farcaster handles
      const data = await clankerFetch<ClankerCreatorResult>(
        `/search-creator?q=${encodeURIComponent(handle)}`
      );
      const address = data?.walletAddress;
      if (!address || !isValidEvmAddress(address)) return [];
      return [
        {
          address: normalizeEvmAddress(address),
          chain: 'base',
          sourcePlatform: 'clanker',
        },
      ];
    }

    if (provider === 'wallet') {
      if (!isValidEvmAddress(handle)) return [];
      return [{ address: normalizeEvmAddress(handle), chain: 'base', sourcePlatform: 'clanker' }];
    }

    // Farcaster: search by handle
    const data = await clankerFetch<ClankerCreatorResult>(
      `/search-creator?q=${encodeURIComponent(handle)}`
    );
    const address = data?.walletAddress;
    if (!address || !isValidEvmAddress(address)) return [];
    return [
      {
        address: normalizeEvmAddress(address),
        chain: 'base',
        sourcePlatform: 'clanker',
      },
    ];
  },

  async getCreatorTokens(wallet: string): Promise<CreatorToken[]> {
    // Try to find tokens by wallet address
    const data = await clankerFetch<ClankerTokensResponse>(
      `/tokens?deployer=${encodeURIComponent(wallet)}`
    );
    if (!data?.data) return [];

    return data.data.map((t) => ({
      tokenAddress: t.contract_address,
      chain: 'base' as const,
      platform: 'clanker' as const,
      symbol: sanitizeTokenSymbol(t.symbol),
      name: t.name ? sanitizeTokenSymbol(t.name) : null,
      imageUrl: t.img_url,
    }));
  },

  async getHistoricalFees(wallet: string): Promise<TokenFee[]> {
    // Validate EVM address before making onchain calls
    if (!isValidEvmAddress(wallet)) return [];

    // Get creator's tokens first, then batch read fees onchain
    const tokens = await this.getCreatorTokens(wallet);
    if (tokens.length === 0) return [];

    // Filter to only valid EVM contract addresses before casting
    const validTokens = tokens.filter((t) => isValidEvmAddress(t.tokenAddress));
    if (validTokens.length === 0) return [];

    const tokenAddresses = validTokens.map((t) => getAddress(t.tokenAddress));
    const feeResults = await batchClankerFees(
      getAddress(wallet),
      tokenAddresses
    );

    // NOTE: The FeeLocker contract only exposes availableFees (unclaimed).
    // Claimed totals are not readable onchain — they require event log parsing.
    // totalEarned is set to the same as totalUnclaimed (best available data).
    const validTokenMap = new Map(validTokens.map((t) => [getAddress(t.tokenAddress) as string, t]));
    return feeResults.map((f) => ({
      tokenAddress: f.token,
      tokenSymbol: validTokenMap.get(f.token)?.symbol ?? null,
      chain: 'base' as const,
      platform: 'clanker' as const,
      totalEarned: f.available.toString(),
      totalClaimed: '0',
      totalUnclaimed: f.available.toString(),
      totalEarnedUsd: null,
      royaltyBps: null,
    }));
  },

  async getLiveUnclaimedFees(wallet: string): Promise<TokenFee[]> {
    // Delegate to getHistoricalFees to avoid fetching the token list twice
    const fees = await this.getHistoricalFees(wallet);
    return fees.filter((f) => safeBigInt(f.totalUnclaimed) > 0n);
  },

  async getClaimHistory(_wallet: string): Promise<ClaimEvent[]> {
    // Claim events would need to be parsed from onchain logs.
    // Not implementing for MVP — historical fees already cover totals.
    return [];
  },
};
