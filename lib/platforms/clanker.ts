import 'server-only';
import { CLANKER_API_BASE } from '@/lib/constants';
import { batchClankerFees, getClankerClaimLogs, isValidEvmAddress, normalizeEvmAddress } from '@/lib/chains/base';
import { batchClankerFeesBsc, getClankerClaimLogsBsc } from '@/lib/chains/bsc';
import { safeBigInt, sanitizeTokenSymbol, sanitizeTokenName } from '@/lib/utils';
import type { IdentityProvider, Chain } from '@/lib/supabase/types';
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
  /** Chain identifier — 8453 = Base, 56 = BSC. API may return as number or string. */
  chain_id?: number | string;
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

/** Map Clanker API chain_id to ClaimScan Chain type. Returns null for unsupported chains.
 * Coerces string values to number since JSON APIs may serialize chain_id inconsistently. */
function mapChainId(chainId: number | string | undefined): Chain | null {
  const id = typeof chainId === 'string' ? Number(chainId) : chainId;
  if (id === 56) return 'bsc';
  if (id === 8453 || id === undefined) return 'base';
  log.warn(`Unknown Clanker chain_id: ${chainId} (type: ${typeof chainId}) — token skipped`);
  return null;
}

async function clankerFetch<T>(path: string, externalSignal?: AbortSignal, attempt = 0): Promise<T | null> {
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
    if (res.status === 429) {
      if (attempt < 2) {
        const retryAfter = parseInt(res.headers.get('retry-after') ?? '', 10);
        const delay = !isNaN(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 10_000)
          : (attempt + 1) * 2000;
        log.warn(`fetch ${path} rate limited, retrying in ${delay}ms (attempt ${attempt + 1})`);
        await new Promise((r) => setTimeout(r, delay));
        return clankerFetch<T>(path, externalSignal, attempt + 1);
      }
      log.warn(`fetch ${path} rate limited after ${attempt + 1} attempts`);
      return null;
    }
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
// Chain-specific fee fetchers
// ═══════════════════════════════════════════════

async function fetchChainFees(
  chain: Chain,
  wallet: Address,
  tokens: CreatorToken[],
): Promise<TokenFee[]> {
  const validTokens = tokens.filter((t) => isValidEvmAddress(t.tokenAddress));
  if (validTokens.length === 0) return [];

  const tokenAddresses = validTokens.map((t) => getAddress(t.tokenAddress));

  const [feeResults, claimLogs] = await Promise.all([
    chain === 'bsc'
      ? batchClankerFeesBsc(wallet, tokenAddresses)
      : batchClankerFees(wallet, tokenAddresses),
    chain === 'bsc'
      ? getClankerClaimLogsBsc(wallet, tokenAddresses)
      : getClankerClaimLogs(wallet, tokenAddresses),
  ]);

  const validTokenMap = new Map(validTokens.map((t) => [getAddress(t.tokenAddress) as string, t]));

  const fees: TokenFee[] = [];
  for (const f of feeResults) {
    const claimed = claimLogs.get(f.token.toLowerCase()) ?? 0n;
    const available = f.available;
    if (available === 0n && claimed === 0n) continue;
    fees.push({
      tokenAddress: f.token,
      tokenSymbol: validTokenMap.get(f.token)?.symbol ?? null,
      chain,
      platform: 'clanker' as const,
      totalEarned: (available + claimed).toString(),
      totalClaimed: claimed.toString(),
      totalUnclaimed: available.toString(),
      totalEarnedUsd: null,
      royaltyBps: null,
    });
  }
  return fees;
}

// ═══════════════════════════════════════════════
// Clanker Adapter (multi-chain: Base + BSC)
// ═══════════════════════════════════════════════

export const clankerAdapter: PlatformAdapter = {
  platform: 'clanker',
  chain: 'base', // Primary chain — BSC handled internally by getCreatorTokens + fetchChainFees
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
      // Only return 'base' — the adapter handles BSC internally via getCreatorTokens.
      // Returning both chains would cause double-dispatch in fetchAllFees.
      return [{ address: normalizeEvmAddress(handle), chain: 'base', sourcePlatform: 'clanker' }];
    }

    const data = await clankerFetch<ClankerCreatorResult>(
      `/search-creator?q=${encodeURIComponent(handle)}`
    );

    const wallets: ResolvedWallet[] = [];
    const seen = new Set<string>();

    const primary = data?.searchedAddress;
    if (primary && isValidEvmAddress(primary)) {
      const normalized = normalizeEvmAddress(primary);
      seen.add(normalized);
      wallets.push({ address: normalized, chain: 'base', sourcePlatform: 'clanker' });
    }

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

    const MAX_PAGES = 10;
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

    const mapped: CreatorToken[] = [];
    for (const t of allTokens) {
      const chain = mapChainId(t.chain_id);
      if (!chain) continue; // Skip unsupported chains
      mapped.push({
        tokenAddress: t.contract_address,
        chain,
        platform: 'clanker' as const,
        symbol: sanitizeTokenSymbol(t.symbol),
        name: sanitizeTokenName(t.name),
        imageUrl: t.img_url?.startsWith('https://') ? t.img_url : null,
      });
    }
    return mapped;
  },

  async getHistoricalFees(wallet: string): Promise<TokenFee[]> {
    if (!isValidEvmAddress(wallet)) return [];

    const tokens = await this.getCreatorTokens(wallet);
    if (tokens.length === 0) return [];

    // Split tokens by chain and fetch fees in parallel
    const baseTokens = tokens.filter((t) => t.chain === 'base');
    const bscTokens = tokens.filter((t) => t.chain === 'bsc');
    const walletAddr = getAddress(wallet);

    const results = await Promise.allSettled([
      baseTokens.length > 0 ? fetchChainFees('base', walletAddr, baseTokens) : Promise.resolve([]),
      bscTokens.length > 0 ? fetchChainFees('bsc', walletAddr, bscTokens) : Promise.resolve([]),
    ]);

    const fees: TokenFee[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') fees.push(...r.value);
      else log.warn('fetchChainFees failed:', { error: r.reason instanceof Error ? r.reason.message : String(r.reason) });
    }
    return fees;
  },

  async getLiveUnclaimedFees(wallet: string, signal?: AbortSignal): Promise<TokenFee[]> {
    if (signal?.aborted) return [];
    const fees = await this.getHistoricalFees(wallet);
    return fees.filter((f) => safeBigInt(f.totalUnclaimed) > 0n);
  },

  async getClaimHistory(_wallet: string): Promise<ClaimEvent[]> {
    return [];
  },
};
