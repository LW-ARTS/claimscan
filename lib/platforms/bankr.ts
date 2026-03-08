import 'server-only';
import { isValidEvmAddress, normalizeEvmAddress } from '@/lib/chains/base';
import { sanitizeTokenSymbol } from '@/lib/utils';
import type { IdentityProvider } from '@/lib/supabase/types';
import type {
  PlatformAdapter,
  ResolvedWallet,
  CreatorToken,
  TokenFee,
  ClaimEvent,
} from './types';

// ═══════════════════════════════════════════════
// Bankr Structured API Types
// ═══════════════════════════════════════════════

interface BankrTokenLaunch {
  tokenName: string;
  tokenSymbol: string;
  tokenAddress: string;
  chain: string;
  poolId: string;
  feeRecipient?: {
    walletAddress: string;
    xUsername?: string;
  };
  deployer?: {
    walletAddress: string;
    xUsername?: string;
  };
}

interface BankrSearchResponse {
  groups?: {
    tokens?: { results: BankrTokenLaunch[]; hasMore: boolean };
    byDeployer?: { results: BankrTokenLaunch[]; hasMore: boolean };
    byFeeRecipient?: { results: BankrTokenLaunch[]; hasMore: boolean };
  };
}

/** Paginated search response (cursor-based) */
interface BankrPaginatedResponse {
  results: BankrTokenLaunch[];
  nextCursor?: string | null;
}

interface BankrTokenFeeResponse {
  address: string;
  chain: string;
  tokens?: Array<{
    tokenAddress: string;
    name: string;
    symbol: string;
    poolId: string;
    share: string;
    claimable: { token0: string; token1: string };
    claimed: { token0: string; token1: string; count: number };
  }>;
  totals?: {
    claimableWeth: string;
    claimedWeth: string;
    claimCount: number;
  };
}

// ═══════════════════════════════════════════════
// API Helpers
// ═══════════════════════════════════════════════

const BANKR_LAUNCHES_API = 'https://api.bankr.bot/token-launches';
const BANKR_PUBLIC_API = 'https://api.bankr.bot/public/doppler';

/** Bearer token for the launches search API — must be set via env var. */
const BANKR_BEARER = process.env.BANKR_BEARER_TOKEN;

/**
 * Search Bankr token launches using the paginated endpoint.
 * The non-paginated /search endpoint caps at 5 results per group.
 * The /search/paginated endpoint uses cursor-based pagination and returns 10+ per page.
 * We fetch up to maxPages to collect all fee-recipient tokens.
 */
async function searchLaunchesPaginated(
  query: string,
  maxPages = 3
): Promise<BankrTokenLaunch[]> {
  if (!BANKR_BEARER) return [];

  const all: BankrTokenLaunch[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    try {
      const params = new URLSearchParams({
        q: query,
        group: 'byFeeRecipient',
      });
      if (cursor) params.set('cursor', cursor);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      const res = await fetch(
        `${BANKR_LAUNCHES_API}/search/paginated?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${BANKR_BEARER}` },
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);
      if (!res.ok) {
        console.warn(`[bankr] paginated search returned HTTP ${res.status}`);
        break;
      }

      const data = (await res.json()) as BankrPaginatedResponse;
      for (const token of data.results ?? []) {
        if (!token.tokenAddress) continue;
        const key = token.tokenAddress.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          all.push(token);
        }
      }

      if (!data.nextCursor) break;
      cursor = data.nextCursor;
    } catch (err) {
      console.warn('[bankr] paginated search failed:', err instanceof Error ? err.message : err);
      break;
    }
  }

  return all;
}

/**
 * Fallback: non-paginated search for identity resolution.
 * Returns the first page of results with group metadata (fee recipient wallets).
 */
async function searchLaunches(query: string): Promise<BankrSearchResponse> {
  if (!BANKR_BEARER) return {};
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(
      `${BANKR_LAUNCHES_API}/search?q=${encodeURIComponent(query)}`,
      {
        headers: { Authorization: `Bearer ${BANKR_BEARER}` },
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn(`[bankr] search returned HTTP ${res.status}`);
      return {};
    }
    return (await res.json()) as BankrSearchResponse;
  } catch (err) {
    console.warn('[bankr] search failed:', err instanceof Error ? err.message : err);
    return {};
  }
}

/**
 * Get fee details for a specific token from the public Doppler API.
 * Returns fee recipient address, claimable/claimed WETH amounts.
 */
async function getTokenFees(tokenAddress: string): Promise<BankrTokenFeeResponse | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(
      `${BANKR_PUBLIC_API}/token-fees/${tokenAddress}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!res.ok) return null;
    return (await res.json()) as BankrTokenFeeResponse;
  } catch (err) {
    console.warn(`[bankr] getTokenFees failed for ${tokenAddress}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Convert a human-readable WETH amount (e.g. "0.005417") to wei string.
 */
function wethToWei(val: string | null | undefined): string {
  if (!val) return '0';
  let str = val.trim();
  if (!str || str === '0' || str === '0.000000') return '0';

  // Handle "<0.000001" format from API (treat as 1 wei = negligible but non-zero)
  if (str.startsWith('<')) str = str.slice(1);

  // Already a large integer (wei)
  if (/^\d{15,}$/.test(str)) return str;

  const num = parseFloat(str);
  if (!Number.isFinite(num) || num <= 0) return '0';

  // String manipulation to avoid floating point precision loss
  const parts = str.split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').padEnd(18, '0').slice(0, 18);
  return (whole + frac).replace(/^0+/, '') || '0';
}

/**
 * Fetch fee amounts for a list of token launches in parallel.
 * Uses the public Doppler token-fees endpoint.
 */
async function fetchFeesForTokens(tokens: BankrTokenLaunch[]): Promise<TokenFee[]> {
  if (tokens.length === 0) return [];

  // Limit concurrent requests
  const batch = tokens.slice(0, 30);

  const feeResults = await Promise.allSettled(
    batch.map((t) => getTokenFees(t.tokenAddress))
  );

  const fees: TokenFee[] = [];

  for (let i = 0; i < feeResults.length; i++) {
    const result = feeResults[i];
    const token = batch[i];
    if (result.status !== 'fulfilled' || !result.value) continue;

    const feeData = result.value;
    const totals = feeData.totals;

    const claimableWei = wethToWei(totals?.claimableWeth);
    const claimedWei = wethToWei(totals?.claimedWeth);

    // Calculate total earned = claimable + claimed
    let totalEarnedWei: string;
    try {
      const earned = BigInt(claimableWei) + BigInt(claimedWei);
      totalEarnedWei = earned.toString();
    } catch (err) {
      console.warn('[bankr] BigInt conversion failed for earned calculation:', err instanceof Error ? err.message : err);
      totalEarnedWei = claimableWei;
    }

    // Skip tokens where the API returned no fee data (all zeros)
    // — prevents inserting misleading "0 earned / 0 claimed" rows
    if (totalEarnedWei === '0' && claimableWei === '0' && claimedWei === '0') continue;

    fees.push({
      tokenAddress: normalizeEvmAddress(token.tokenAddress),
      tokenSymbol: sanitizeTokenSymbol(token.tokenSymbol ?? token.tokenName),
      chain: 'base' as const,
      platform: 'bankr' as const,
      totalEarned: totalEarnedWei,
      totalClaimed: claimedWei,
      totalUnclaimed: claimableWei,
      totalEarnedUsd: null,
      royaltyBps: null,
    });
  }

  return fees;
}

// ═══════════════════════════════════════════════
// Bankr Adapter
// ═══════════════════════════════════════════════

export const bankrAdapter: PlatformAdapter = {
  platform: 'bankr',
  chain: 'base',
  supportsIdentityResolution: true,
  supportsLiveFees: true,
  supportsHandleBasedFees: true,

  async resolveIdentity(
    handle: string,
    provider: IdentityProvider
  ): Promise<ResolvedWallet[]> {
    if (provider === 'wallet') return [];

    // Use non-paginated search for identity — we only need the wallet address
    const data = await searchLaunches(handle);
    const wallets: ResolvedWallet[] = [];
    const seen = new Set<string>();

    for (const token of data.groups?.byFeeRecipient?.results ?? []) {
      const addr = token.feeRecipient?.walletAddress;
      if (!addr || !isValidEvmAddress(addr)) continue;
      const normalized = normalizeEvmAddress(addr);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        wallets.push({
          address: normalized,
          chain: 'base',
          sourcePlatform: 'bankr',
        });
      }
    }

    return wallets;
  },

  async getFeesByHandle(
    handle: string,
    provider: IdentityProvider
  ): Promise<TokenFee[]> {
    if (provider === 'wallet') return [];

    const tokens = await searchLaunchesPaginated(handle);
    return fetchFeesForTokens(tokens);
  },

  async getCreatorTokens(_wallet: string): Promise<CreatorToken[]> {
    return [];
  },

  async getHistoricalFees(wallet: string): Promise<TokenFee[]> {
    if (!isValidEvmAddress(wallet)) return [];

    const tokens = await searchLaunchesPaginated(wallet);
    return fetchFeesForTokens(tokens);
  },

  async getLiveUnclaimedFees(wallet: string): Promise<TokenFee[]> {
    if (!isValidEvmAddress(wallet)) return [];

    const tokens = await searchLaunchesPaginated(wallet);
    const allFees = await fetchFeesForTokens(tokens);

    // Filter to only unclaimed
    return allFees.filter((f) => {
      try {
        return BigInt(f.totalUnclaimed) > 0n;
      } catch {
        return parseFloat(f.totalUnclaimed) > 0;
      }
    });
  },

  async getClaimHistory(_wallet: string): Promise<ClaimEvent[]> {
    return [];
  },
};
