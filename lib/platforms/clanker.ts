import 'server-only';
import { CLANKER_API_BASE } from '@/lib/constants';
import { batchClankerFees, getClankerClaimLogs, isValidEvmAddress, normalizeEvmAddress } from '@/lib/chains/base';
import { safeBigInt, sanitizeTokenSymbol, sanitizeTokenName } from '@/lib/utils';
import type { IdentityProvider } from '@/lib/supabase/types';
import { getAddress, type Address } from 'viem';
import type {
  PlatformAdapter,
  ResolvedWallet,
  CreatorToken,
  TokenFee,
  ClaimEvent,
} from './types';
import { createLogger } from '@/lib/logger';
const log = createLogger('clanker');

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

async function clankerFetch<T>(path: string, externalSignal?: AbortSignal): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const combinedSignal = externalSignal
      ? AbortSignal.any([externalSignal, controller.signal])
      : controller.signal;
    const res = await fetch(`${CLANKER_API_BASE}${path}`, {
      signal: combinedSignal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      log.warn(`fetch ${path} returned HTTP ${res.status}`);
      return null;
    }
    return await res.json() as T;
  } catch (err) {
    log.warn(`fetch ${path} failed`, { error: err instanceof Error ? err.message : String(err) });
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
  historicalCoversLive: true,

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

    // Use /search-creator?q=<wallet> to find tokens deployed by this wallet.
    // NOTE: The /tokens?feeRecipient= endpoint was tested but is broken —
    // it ignores the feeRecipient parameter and returns the 10 most recent
    // tokens platform-wide (verified 2026-03-11 with address 0x0...01).
    const MAX_PAGES = 10; // 200 tokens max safety cap
    const allTokens: ClankerToken[] = [];
    const seen = new Set<string>();
    const paginationDeadline = Date.now() + 6_000;

    for (let page = 1; page <= MAX_PAGES; page++) {
      if (Date.now() > paginationDeadline) {
        log.warn(`Pagination deadline exceeded for ${wallet} at page ${page}/${MAX_PAGES}, ${allTokens.length} tokens fetched`);
        break;
      }
      const data = await clankerFetch<ClankerSearchCreatorResponse>(
        `/search-creator?q=${encodeURIComponent(wallet)}&page=${page}`
      );
      if (!data?.tokens || data.tokens.length === 0) break;

      for (const t of data.tokens) {
        if (!t.contract_address) continue;
        const lower = t.contract_address.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          allTokens.push(t);
        }
      }
      if (!data.hasMore) break;
    }

    if (allTokens.length === 0) return [];

    return allTokens.map((t) => ({
      tokenAddress: t.contract_address,
      chain: 'base' as const,
      platform: 'clanker' as const,
      symbol: sanitizeTokenSymbol(t.symbol),
      name: sanitizeTokenName(t.name),
      imageUrl: t.img_url?.startsWith('https://') ? t.img_url : null,
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

    const validTokenMap = new Map(validTokens.map((t) => [getAddress(t.tokenAddress) as string, t]));

    // Fetch claimed totals from ERC20 Transfer event logs (FeeLocker → owner)
    const claimLogs = await getClankerClaimLogs(
      getAddress(wallet),
      tokenAddresses
    );

    // Include tokens with either unclaimed OR claimed fees.
    // Now that we have event logs, we can show tokens that were fully claimed.
    const fees: TokenFee[] = [];
    for (const f of feeResults) {
      const claimed = claimLogs.get(f.token.toLowerCase()) ?? 0n;
      const available = f.available;
      if (available === 0n && claimed === 0n) continue;
      fees.push({
        tokenAddress: f.token,
        tokenSymbol: validTokenMap.get(f.token)?.symbol ?? null,
        chain: 'base' as const,
        platform: 'clanker' as const,
        totalEarned: (available + claimed).toString(),
        totalClaimed: claimed.toString(),
        totalUnclaimed: available.toString(),
        totalEarnedUsd: null,
        royaltyBps: null,
      });
    }
    return fees;
  },

  async getLiveUnclaimedFees(wallet: string, signal?: AbortSignal): Promise<TokenFee[]> {
    if (signal?.aborted) return [];
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
