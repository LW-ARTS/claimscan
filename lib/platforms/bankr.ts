import 'server-only';
import { isValidEvmAddress, normalizeEvmAddress } from '@/lib/chains/base';
import { sanitizeTokenSymbol } from '@/lib/utils';
import type { IdentityProvider } from '@/lib/supabase/types';
import type {
  PlatformAdapter,
  ResolvedWallet,
  CreatorToken,
  TokenFee,
} from './types';
import { createLogger } from '@/lib/logger';
const log = createLogger('bankr');

// ═══════════════════════════════════════════════
// Bankr Agent API (limited fallback)
//
// The Agent API is an LLM endpoint that takes 30s-2min and returns
// natural language. It's kept ONLY as a last-resort fallback for
// resolveIdentity and getFeesByHandle (where it runs in parallel
// with other work, not inside Promise.allSettled with other adapters).
//
// Removed from getHistoricalFees — it never completed within the
// 5s allSettled budget and blocked the pipeline.
// ═══════════════════════════════════════════════

const BANKR_API_URL = process.env.BANKR_API_URL || 'https://api.bankr.bot';
const BANKR_AGENT_URL = `${BANKR_API_URL}/agent`;
const BANKR_API_KEY = process.env.BANKR_API_KEY;

/** Budget for Agent API in resolveIdentity (runs in parallel, not inside allSettled). */
const AGENT_SHORT_TIMEOUT_MS = 5_000;

/** Budget for Agent API in getFeesByHandle (runs in parallel with wallet resolution).
 * Reduced from 20s to 10s — Agent is a fallback; Search API is primary. */
const AGENT_LONG_TIMEOUT_MS = 5_000;

const AGENT_POLL_INTERVAL_MS = 2_000;

interface AgentPromptResponse {
  jobId?: string;
  threadId?: string;
  status?: string;
  result?: string;
  response?: string;
}

async function promptBankrAgent(prompt: string, timeoutMs = AGENT_SHORT_TIMEOUT_MS): Promise<string | null> {
  if (!BANKR_API_KEY) return null;

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const submitRes = await fetch(`${BANKR_AGENT_URL}/prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': BANKR_API_KEY,
      },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    });

    if (!submitRes.ok) {
      log.warn(`agent prompt returned HTTP ${submitRes.status}`);
      return null;
    }

    const data = (await submitRes.json()) as AgentPromptResponse & { success?: boolean };

    if (data.success === false) {
      log.warn('agent prompt returned success=false');
      return null;
    }

    if (data.result) return data.result;
    if (data.response) return data.response;
    if (!data.jobId) return null;

    const MAX_POLL_ATTEMPTS = 30; // ~30s with 1s interval — prevent infinite polling
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await new Promise((r) => setTimeout(r, AGENT_POLL_INTERVAL_MS));

      const pollRes = await fetch(`${BANKR_AGENT_URL}/job/${data.jobId}`, {
        headers: { 'x-api-key': BANKR_API_KEY },
        signal: controller.signal,
      });

      if (!pollRes.ok) continue;
      const job = (await pollRes.json()) as AgentPromptResponse;

      if (job.status === 'completed') return job.response || job.result || null;
      if (job.status === 'failed' || job.status === 'cancelled') {
        log.warn(`agent job ${data.jobId} ${job.status}`, { error: String((job as Record<string, unknown>).error || '') });
        return null;
      }
    }

    log.warn(`agent job ${data.jobId} timed out after ${MAX_POLL_ATTEMPTS} polls`);
    return null;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return null;
    }
    log.warn('agent prompt failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  } finally {
    clearTimeout(deadline);
  }
}

// ═══════════════════════════════════════════════
// Agent Response Parsing
// ═══════════════════════════════════════════════

interface ParsedAgentFee {
  tokenAddress: string;
  tokenSymbol: string;
  earnedWeth: string;
  claimedWeth: string;
  unclaimedWeth: string;
}

function parseAgentFeeResponse(response: string): ParsedAgentFee[] {
  // Strategy 1: JSON array extraction
  const jsonMatch = response.match(/\[[\s\S]*?\]/);
  if (jsonMatch) {
    try {
      const arr = JSON.parse(jsonMatch[0]) as Record<string, string>[];
      if (Array.isArray(arr) && arr.length > 0) {
        const fees: ParsedAgentFee[] = [];
        for (const item of arr) {
          const addr = item.a || item.address || item.tokenAddress || '';
          if (!addr || !isValidEvmAddress(addr)) continue;
          fees.push({
            tokenAddress: addr,
            tokenSymbol: item.s || item.symbol || item.tokenSymbol || 'UNKNOWN',
            earnedWeth: item.e || item.earned || item.totalEarned || '0',
            claimedWeth: item.c || item.claimed || item.totalClaimed || '0',
            unclaimedWeth: item.u || item.unclaimed || item.totalUnclaimed || '0',
          });
        }
        if (fees.length > 0) return fees;
      }
    } catch (jsonErr) {
      log.warn('JSON parse failed, trying pipe-delimited', { error: jsonErr instanceof Error ? jsonErr.message : String(jsonErr) });
    }
  }

  // Strategy 2: Pipe-delimited format
  const pipeRegex = /^(0x[a-fA-F0-9]{40})\|([^|]+)\|([\d.]+)\|([\d.]+)\|([\d.]+)/;
  const lines = response.split('\n');
  const fees: ParsedAgentFee[] = [];

  for (const line of lines) {
    const match = line.trim().match(pipeRegex);
    if (match) {
      fees.push({
        tokenAddress: match[1],
        tokenSymbol: match[2].trim(),
        earnedWeth: match[3],
        claimedWeth: match[4],
        unclaimedWeth: match[5],
      });
    }
  }

  return fees;
}

async function fetchFeesByAgent(handle: string, timeoutMs = AGENT_SHORT_TIMEOUT_MS): Promise<TokenFee[]> {
  const safeHandle = handle.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 50);
  const prompt = [
    `List all Bankr tokens where @${safeHandle} is the fee recipient.`,
    'For each token, return ONLY a JSON array with this exact format, no explanation text:',
    '[{"a":"TOKEN_ADDRESS","s":"SYMBOL","e":"EARNED_WETH","c":"CLAIMED_WETH","u":"UNCLAIMED_WETH"}]',
    'Use numeric strings for WETH values (e.g. "0.005417"). Return [] if no tokens found.',
  ].join(' ');

  const response = await promptBankrAgent(prompt, timeoutMs);
  if (!response) return [];

  const parsed = parseAgentFeeResponse(response);
  if (parsed.length === 0) {
    if (/no (token|fee|result)|not found|\[\s*\]|none|zero|empty/i.test(response)) {
      return [];
    }
    log.warn('could not parse agent response', { error: response.slice(0, 300) });
    return [];
  }

  // Sanity checks for LLM-generated data
  const MAX_FEE_WEI = BigInt('1000000000000000000000'); // 1000 ETH
  const EVM_ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

  const validated = parsed.filter((p) => {
    if (!EVM_ADDR_RE.test(p.tokenAddress)) {
      log.warn(`LLM rejected: invalid address "${p.tokenAddress}"`);
      return false;
    }
    try {
      const earnedWei = BigInt(wethToWei(p.earnedWeth) || '0');
      if (earnedWei > MAX_FEE_WEI) {
        log.warn(`LLM rejected: ${p.earnedWeth} ETH exceeds 1000 ETH cap for ${p.tokenAddress}`);
        return false;
      }
    } catch (err) {
      log.warn(`LLM rejected: BigInt parse failed for ${p.tokenAddress}`, { error: err instanceof Error ? err.message : String(err) });
      return false;
    }
    return true;
  });

  if (validated.length > 0) {
    log.info(`LLM fees for @${safeHandle}`, { fees: validated.map((p) => `${p.tokenSymbol}:${p.earnedWeth}`).join(', ') });
  }

  return validated
    .filter((p) => {
      const earned = wethToWei(p.earnedWeth);
      const unclaimed = wethToWei(p.unclaimedWeth);
      return earned !== '0' || unclaimed !== '0';
    })
    .map((p) => {
      const earned = wethToWei(p.earnedWeth);
      const claimed = wethToWei(p.claimedWeth);
      const unclaimed = wethToWei(p.unclaimedWeth);

      let totalEarned = earned;
      if (earned === '0' && (claimed !== '0' || unclaimed !== '0')) {
        try {
          totalEarned = (BigInt(claimed) + BigInt(unclaimed)).toString();
        } catch (mathErr) {
          log.warn('BigInt arithmetic failed for earned calculation', { error: mathErr instanceof Error ? mathErr.message : String(mathErr) });
          totalEarned = unclaimed;
        }
      }

      return {
        tokenAddress: normalizeEvmAddress(p.tokenAddress),
        tokenSymbol: sanitizeTokenSymbol(p.tokenSymbol),
        chain: 'base' as const,
        platform: 'bankr' as const,
        totalEarned: totalEarned,
        totalClaimed: claimed,
        totalUnclaimed: unclaimed,
        totalEarnedUsd: null,
        royaltyBps: null,
      };
    });
}

async function resolveWalletByAgent(handle: string): Promise<ResolvedWallet[]> {
  const safeHandle = handle.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 50);
  const prompt = `What is the Base/Ethereum wallet address associated with @${safeHandle} on Bankr? Reply with ONLY the 0x address, nothing else.`;
  const response = await promptBankrAgent(prompt);
  if (!response) return [];

  const wallets: ResolvedWallet[] = [];
  const seen = new Set<string>();
  const addrRegex = /0x[a-fA-F0-9]{40}/g;

  for (const match of response.matchAll(addrRegex)) {
    const addr = match[0];
    if (!isValidEvmAddress(addr)) continue;
    const normalized = normalizeEvmAddress(addr);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      wallets.push({ address: normalized, chain: 'base', sourcePlatform: 'bankr' });
    }
  }

  return wallets;
}

// ═══════════════════════════════════════════════
// Search + Doppler API (primary — fast, structured)
// ═══════════════════════════════════════════════

const BANKR_LAUNCHES_API = `${BANKR_API_URL}/token-launches`;
const BANKR_PUBLIC_API = `${BANKR_API_URL}/public/doppler`;
const BANKR_BEARER = process.env.BANKR_BEARER_TOKEN;

// ── Doppler in-memory cache ──────────────────────────────
// The Doppler API is public (no auth, rate-limited by IP).
// Caching responses avoids redundant calls when multiple scans
// hit overlapping tokens within the same serverless instance.
const DOPPLER_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const DOPPLER_CACHE_MAX = 500;
const dopplerCache = new Map<string, { data: BankrTokenFeeResponse; ts: number }>();

function dopplerCacheGet(tokenAddress: string): BankrTokenFeeResponse | null {
  const entry = dopplerCache.get(tokenAddress);
  if (!entry) return null;
  if (Date.now() - entry.ts > DOPPLER_CACHE_TTL_MS) {
    dopplerCache.delete(tokenAddress);
    return null;
  }
  return entry.data;
}

function dopplerCacheSet(tokenAddress: string, data: BankrTokenFeeResponse): void {
  // Lazy eviction: if at capacity, drop oldest half
  if (dopplerCache.size >= DOPPLER_CACHE_MAX) {
    const entries = [...dopplerCache.entries()].sort((a, b) => a[1].ts - b[1].ts);
    const toDrop = Math.floor(entries.length / 2);
    for (let i = 0; i < toDrop; i++) dopplerCache.delete(entries[i][0]);
  }
  dopplerCache.set(tokenAddress, { data, ts: Date.now() });
}

/** Build auth headers for Bankr Search API.
 * Prefers bearer token if available, falls back to API key (x-api-key). */
function bankrAuthHeaders(): Record<string, string> {
  if (BANKR_BEARER) return { Authorization: `Bearer ${BANKR_BEARER}` };
  if (BANKR_API_KEY) return { 'x-api-key': BANKR_API_KEY };
  return {};
}

/** Whether we have ANY Bankr auth (bearer OR API key) for Search API */
const HAS_BANKR_AUTH = !!(BANKR_BEARER || BANKR_API_KEY);

export interface BankrTokenLaunch {
  tokenName: string;
  tokenSymbol: string;
  tokenAddress: string;
  chain: string;
  poolId: string;
  feeRecipient?: { walletAddress: string; xUsername?: string };
  deployer?: { walletAddress: string; xUsername?: string };
}

interface BankrPaginatedResponse {
  results: BankrTokenLaunch[];
  nextCursor?: string | null;
}

export interface BankrSearchResponse {
  groups?: {
    tokens?: { results: BankrTokenLaunch[]; hasMore: boolean };
    byDeployer?: { results: BankrTokenLaunch[]; hasMore: boolean };
    byFeeRecipient?: { results: BankrTokenLaunch[]; hasMore: boolean };
  };
}

export interface BankrTokenFeeResponse {
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
  dailyEarnings?: Array<{ date: string; weth: string }>;
}

async function searchLaunchesPaginated(
  query: string,
  maxPages = 3,
  externalSignal?: AbortSignal
): Promise<BankrTokenLaunch[]> {
  if (!HAS_BANKR_AUTH) return [];

  const all: BankrTokenLaunch[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    if (externalSignal?.aborted) break;
    try {
      const params = new URLSearchParams({ q: query, group: 'byFeeRecipient' });
      if (cursor) params.set('cursor', cursor);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      const combinedSignal = externalSignal
        ? AbortSignal.any([externalSignal, controller.signal])
        : controller.signal;
      const res = await fetch(
        `${BANKR_LAUNCHES_API}/search/paginated?${params.toString()}`,
        { headers: bankrAuthHeaders(), signal: combinedSignal }
      );
      clearTimeout(timeout);
      if (!res.ok) { log.warn(`searchLaunchesPaginated returned HTTP ${res.status}`); break; }

      const data = (await res.json()) as BankrPaginatedResponse;
      for (const token of data.results ?? []) {
        if (!token.tokenAddress) continue;
        const key = token.tokenAddress.toLowerCase();
        if (!seen.has(key)) { seen.add(key); all.push(token); }
      }
      if (!data.nextCursor) break;
      cursor = data.nextCursor;
    } catch (err) {
      log.warn('searchLaunchesPaginated failed', { error: err instanceof Error ? err.message : String(err) });
      break;
    }
  }

  // Post-filter: the paginated endpoint may return tokens where the query
  // matched the deployer, not the fee recipient. Only keep tokens where the
  // query actually matches the fee recipient (handle OR wallet address).
  const queryLower = query.toLowerCase();
  const isWalletQuery = /^0x[a-fA-F0-9]{40}$/i.test(query);

  const filtered = all.filter((token) => {
    if (isWalletQuery) {
      return token.feeRecipient?.walletAddress?.toLowerCase() === queryLower;
    }
    return token.feeRecipient?.xUsername?.toLowerCase() === queryLower;
  });

  if (filtered.length < all.length) {
    log.info(`Post-filter: ${all.length} → ${filtered.length} tokens (query="${query}")`);
  }

  return filtered;
}

export async function searchLaunches(query: string): Promise<BankrSearchResponse> {
  if (!HAS_BANKR_AUTH) return {};
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(
      `${BANKR_LAUNCHES_API}/search?q=${encodeURIComponent(query)}`,
      { headers: bankrAuthHeaders(), signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!res.ok) { log.warn(`searchLaunches returned HTTP ${res.status}`); return {}; }
    return (await res.json()) as BankrSearchResponse;
  } catch (err) {
    log.warn('searchLaunches failed', { error: err instanceof Error ? err.message : String(err) });
    return {};
  }
}

export async function getTokenFees(tokenAddress: string, externalSignal?: AbortSignal): Promise<BankrTokenFeeResponse | null> {
  // Check in-memory cache first
  const cached = dopplerCacheGet(tokenAddress);
  if (cached) return cached;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const combinedSignal = externalSignal
      ? AbortSignal.any([externalSignal, controller.signal])
      : controller.signal;
    const res = await fetch(`${BANKR_PUBLIC_API}/token-fees/${tokenAddress}?days=90`, {
      signal: combinedSignal,
    });
    clearTimeout(timeout);
    if (!res.ok) { log.warn(`getTokenFees returned HTTP ${res.status} for ${tokenAddress}`); return null; }
    const data = (await res.json()) as BankrTokenFeeResponse;
    dopplerCacheSet(tokenAddress, data);
    return data;
  } catch (err) {
    log.warn('getTokenFees failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Convert a human-readable WETH amount (e.g. "0.005417") to wei string.
 */
export function wethToWei(val: string | null | undefined): string {
  if (!val) return '0';
  let str = val.trim();
  if (!str || str === '0' || str === '0.000000') return '0';

  if (str.startsWith('<')) str = str.slice(1);
  // Only treat as raw wei if 19+ digits (minimum ~1 ETH in wei = 1e18)
  if (/^\d{19,}$/.test(str)) return str;

  // Validate using string checks instead of parseFloat to avoid precision loss
  // for very small values below float64 resolution (e.g. "0.000000000000000001").
  if (!/^\d+\.?\d*$/.test(str) || str === '0' || str === '0.0') return '0';

  const parts = str.split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').padEnd(18, '0').slice(0, 18);
  const result = (whole + frac).replace(/^0+/, '') || '0';
  // Reject values above 1 billion ETH (obviously wrong from LLM)
  if (result.length > 27) {
    log.warn('wethToWei produced unreasonably large value, clamping to 0');
    return '0';
  }
  return result;
}

/**
 * Sum the dailyEarnings array (reliable) to get total earned in wei.
 * The Bankr Doppler API's `totals.claimedWeth` is unreliable — it often
 * returns "0" even when substantial amounts were claimed on-chain.
 * `dailyEarnings[].weth` is consistent and accurate.
 */
export function sumDailyEarningsWei(dailyEarnings: Array<{ date: string; weth: string }> | undefined): string {
  if (!dailyEarnings || dailyEarnings.length === 0) return '0';
  let total = BigInt(0);
  for (const day of dailyEarnings) {
    const wei = wethToWei(day.weth);
    if (wei !== '0') total += BigInt(wei);
  }
  return total.toString();
}

async function fetchFeesForTokens(tokens: BankrTokenLaunch[], signal?: AbortSignal): Promise<TokenFee[]> {
  if (tokens.length === 0) return [];
  const batch = tokens.slice(0, 30);
  const feeResults = await Promise.allSettled(batch.map((t) => getTokenFees(t.tokenAddress, signal)));
  const fees: TokenFee[] = [];

  for (let i = 0; i < feeResults.length; i++) {
    const result = feeResults[i];
    const token = batch[i];
    if (result.status !== 'fulfilled' || !result.value) continue;

    const { totals, dailyEarnings } = result.value;
    const claimableWei = wethToWei(totals?.claimableWeth);

    // Primary: sum dailyEarnings (reliable source of truth).
    // Fallback: claimable + claimed from totals (only if no dailyEarnings).
    const dailyEarnedWei = sumDailyEarningsWei(dailyEarnings);
    const claimedWeiFromTotals = wethToWei(totals?.claimedWeth);
    const totalsEarnedWei = (BigInt(claimableWei) + BigInt(claimedWeiFromTotals)).toString();

    // Use whichever is higher — dailyEarnings covers 90 days of actual
    // on-chain activity while totals.claimedWeth is sometimes zero.
    const totalEarnedWei = BigInt(dailyEarnedWei) > BigInt(totalsEarnedWei)
      ? dailyEarnedWei
      : totalsEarnedWei;

    // Derive claimed = earned - unclaimed (more reliable than totals.claimedWeth)
    const totalClaimedWei = BigInt(totalEarnedWei) > BigInt(claimableWei)
      ? (BigInt(totalEarnedWei) - BigInt(claimableWei)).toString()
      : '0';

    if (totalEarnedWei === '0' && claimableWei === '0') continue;

    fees.push({
      tokenAddress: normalizeEvmAddress(token.tokenAddress),
      tokenSymbol: sanitizeTokenSymbol(token.tokenSymbol ?? token.tokenName),
      chain: 'base' as const,
      platform: 'bankr' as const,
      totalEarned: totalEarnedWei,
      totalClaimed: totalClaimedWei,
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
  historicalCoversLive: true,

  async resolveIdentity(
    handle: string,
    provider: IdentityProvider
  ): Promise<ResolvedWallet[]> {
    if (provider === 'wallet') return [];

    // Primary: Search API (fast, ~2s)
    if (HAS_BANKR_AUTH) {
      const data = await searchLaunches(handle);
      const wallets: ResolvedWallet[] = [];
      const seen = new Set<string>();
      const handleLower = handle.toLowerCase();
      for (const token of data.groups?.byFeeRecipient?.results ?? []) {
        // Safety: verify the fee recipient's xUsername actually matches
        if (token.feeRecipient?.xUsername?.toLowerCase() !== handleLower) continue;
        const addr = token.feeRecipient?.walletAddress;
        if (!addr || !isValidEvmAddress(addr)) continue;
        const normalized = normalizeEvmAddress(addr);
        if (!seen.has(normalized)) {
          seen.add(normalized);
          wallets.push({ address: normalized, chain: 'base', sourcePlatform: 'bankr' });
        }
      }
      if (wallets.length > 0) return wallets;
    }

    // Fallback: Agent API (slow but catches edge cases Search misses)
    if (BANKR_API_KEY) {
      return resolveWalletByAgent(handle);
    }

    return [];
  },

  async getFeesByHandle(
    handle: string,
    provider: IdentityProvider
  ): Promise<TokenFee[]> {
    if (provider === 'wallet') return [];

    // Primary: Search + Doppler (fast, ~5s)
    if (HAS_BANKR_AUTH) {
      const tokens = await searchLaunchesPaginated(handle);
      const fees = await fetchFeesForTokens(tokens);
      if (fees.length > 0) return fees;
    }

    // Fallback: Agent API — uses long timeout because getFeesByHandle runs
    // in parallel with resolveWallets, NOT inside Promise.allSettled
    if (BANKR_API_KEY) {
      return fetchFeesByAgent(handle, AGENT_LONG_TIMEOUT_MS);
    }

    return [];
  },

  async getCreatorTokens(_wallet: string): Promise<CreatorToken[]> {
    return [];
  },

  // No Agent API fallback here — it never completed within the 5s
  // Promise.allSettled budget and blocked the entire pipeline.
  async getHistoricalFees(wallet: string): Promise<TokenFee[]> {
    if (!isValidEvmAddress(wallet)) return [];

    if (HAS_BANKR_AUTH) {
      const tokens = await searchLaunchesPaginated(wallet);
      return fetchFeesForTokens(tokens);
    }

    return [];
  },

  async getLiveUnclaimedFees(wallet: string, signal?: AbortSignal): Promise<TokenFee[]> {
    if (!isValidEvmAddress(wallet)) return [];

    // Call internal functions directly to thread signal (interface doesn't expose it)
    const tokens = HAS_BANKR_AUTH ? await searchLaunchesPaginated(wallet, 3, signal) : [];
    const allFees = await fetchFeesForTokens(tokens, signal);
    return allFees.filter((f) => {
      try {
        return BigInt(f.totalUnclaimed) > 0n;
      } catch (err) {
        log.warn('BigInt parse failed in getLiveUnclaimedFees', { error: err instanceof Error ? err.message : String(err) });
        return parseFloat(f.totalUnclaimed) > 0;
      }
    });
  },

};
