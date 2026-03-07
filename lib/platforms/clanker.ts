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

/** /search-creator response includes resolved address + user info */
interface ClankerCreatorResult {
  fid?: number;
  walletAddress?: string;
  custodyAddress?: string;
  /** API actually returns searchedAddress, not walletAddress */
  searchedAddress?: string;
  users?: Array<{
    platform?: string;
    fid?: number;
    username?: string;
    verifiedAddresses?: string[];
  }>;
}

interface ClankerToken {
  contract_address: string;
  symbol: string;
  name: string;
  img_url: string | null;
  admin?: string;
  fid?: number;
}

/** /search-creator response shape */
interface ClankerSearchCreatorResponse {
  tokens?: ClankerToken[];
  total?: number;
  hasMore?: boolean;
  searchedAddress?: string;
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
  supportsHandleBasedFees: false,

  async resolveIdentity(
    handle: string,
    provider: IdentityProvider
  ): Promise<ResolvedWallet[]> {
    if (provider === 'wallet') {
      if (!isValidEvmAddress(handle)) return [];
      return [{ address: normalizeEvmAddress(handle), chain: 'base', sourcePlatform: 'clanker' }];
    }

    // Search Clanker by handle — API resolves Farcaster handles internally
    // and returns the wallet as `searchedAddress` (not `walletAddress`)
    const data = await clankerFetch<ClankerCreatorResult>(
      `/search-creator?q=${encodeURIComponent(handle)}`
    );

    const wallets: ResolvedWallet[] = [];
    const seen = new Set<string>();

    // Primary: searchedAddress is the resolved wallet
    const primary = data?.searchedAddress;
    if (primary && isValidEvmAddress(primary)) {
      const normalized = normalizeEvmAddress(primary);
      seen.add(normalized);
      wallets.push({ address: normalized, chain: 'base', sourcePlatform: 'clanker' });
    }

    // Secondary: extract verified addresses from user profiles
    for (const user of data?.users ?? []) {
      for (const addr of user.verifiedAddresses ?? []) {
        if (isValidEvmAddress(addr)) {
          const normalized = normalizeEvmAddress(addr);
          if (!seen.has(normalized)) {
            seen.add(normalized);
            wallets.push({ address: normalized, chain: 'base', sourcePlatform: 'clanker' });
          }
        }
      }
    }

    return wallets;
  },

  async getFeesByHandle(): Promise<TokenFee[]> {
    return [];
  },

  async getCreatorTokens(wallet: string): Promise<CreatorToken[]> {
    if (!isValidEvmAddress(wallet)) return [];

    // Use /search-creator which correctly returns tokens where wallet is admin.
    // The /tokens?deployer= endpoint is broken (ignores the deployer parameter).
    const data = await clankerFetch<ClankerSearchCreatorResponse>(
      `/search-creator?q=${encodeURIComponent(wallet)}`
    );
    if (!data?.tokens || data.tokens.length === 0) return [];

    const normalizedWallet = normalizeEvmAddress(wallet);

    // Deduplicate by contract address (API can return duplicates)
    const seen = new Set<string>();
    const unique: ClankerToken[] = [];
    for (const t of data.tokens) {
      if (!t.contract_address) continue;
      const addr = normalizeEvmAddress(t.contract_address);
      if (seen.has(addr)) continue;
      seen.add(addr);

      // Only include tokens where this wallet is the admin (fee recipient)
      if (t.admin && normalizeEvmAddress(t.admin) !== normalizedWallet) continue;

      unique.push(t);
    }

    return unique.map((t) => ({
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

    // Filter out tokens with zero available fees.
    // Since the FeeLocker doesn't expose claimedFees(), we can't tell if 0 means
    // "already claimed" or "not yet distributed from v4 hook". Showing them as
    // "claimed" with $0 is misleading, so we exclude them entirely.
    return feeResults
      .filter((f) => f.available > 0n)
      .map((f) => ({
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
