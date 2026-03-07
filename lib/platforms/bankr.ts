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

/** Bearer token for the launches search API (sourced from Bankr frontend) */
const BANKR_BEARER = process.env.BANKR_BEARER_TOKEN ?? '9WG1CEmcVRoKZWy1FNis21IWmKy3ZWE1';

/**
 * Search Bankr token launches by handle or wallet address.
 * Uses the structured REST API (same one bankr.bot frontend uses).
 */
async function searchLaunches(query: string): Promise<BankrSearchResponse> {
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
    if (!res.ok) return {};
    return (await res.json()) as BankrSearchResponse;
  } catch {
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
  } catch {
    return null;
  }
}

/**
 * Convert a human-readable WETH amount (e.g. "0.005417") to wei string.
 */
function wethToWei(val: string | null | undefined): string {
  if (!val) return '0';
  const str = val.trim();
  if (!str || str === '0' || str === '0.000000') return '0';

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
 * Collect token addresses from search results where query matches as fee recipient.
 * Also includes tokens from the general "tokens" group that have a fee recipient.
 */
function extractFeeRecipientTokens(data: BankrSearchResponse): BankrTokenLaunch[] {
  const results: BankrTokenLaunch[] = [];
  const seen = new Set<string>();

  // Primary: tokens where the searched identity is the fee recipient
  for (const token of data.groups?.byFeeRecipient?.results ?? []) {
    if (token.tokenAddress && !seen.has(token.tokenAddress.toLowerCase())) {
      seen.add(token.tokenAddress.toLowerCase());
      results.push(token);
    }
  }

  return results;
}

/**
 * Fetch fee amounts for a list of token launches in parallel.
 * Uses the public Doppler token-fees endpoint.
 */
async function fetchFeesForTokens(tokens: BankrTokenLaunch[]): Promise<TokenFee[]> {
  if (tokens.length === 0) return [];

  // Limit concurrent requests
  const batch = tokens.slice(0, 20);

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
    } catch {
      totalEarnedWei = claimableWei;
    }

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

    const data = await searchLaunches(handle);
    const wallets: ResolvedWallet[] = [];
    const seen = new Set<string>();

    // Extract unique fee recipient wallet addresses
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

    const data = await searchLaunches(handle);
    const tokens = extractFeeRecipientTokens(data);
    return fetchFeesForTokens(tokens);
  },

  async getCreatorTokens(_wallet: string): Promise<CreatorToken[]> {
    return [];
  },

  async getHistoricalFees(wallet: string): Promise<TokenFee[]> {
    if (!isValidEvmAddress(wallet)) return [];

    // Search by wallet address — Bankr API supports this
    const data = await searchLaunches(wallet);
    const tokens = extractFeeRecipientTokens(data);
    return fetchFeesForTokens(tokens);
  },

  async getLiveUnclaimedFees(wallet: string): Promise<TokenFee[]> {
    if (!isValidEvmAddress(wallet)) return [];

    const data = await searchLaunches(wallet);
    const tokens = extractFeeRecipientTokens(data);
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
