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

/** Budget for Agent API in getFeesByHandle (runs in parallel with wallet resolution). */
const AGENT_LONG_TIMEOUT_MS = 20_000;

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
      console.warn(`[bankr] agent prompt returned HTTP ${submitRes.status}`);
      return null;
    }

    const data = (await submitRes.json()) as AgentPromptResponse & { success?: boolean };

    if (data.success === false) {
      console.warn('[bankr] agent prompt returned success=false');
      return null;
    }

    if (data.result) return data.result;
    if (data.response) return data.response;
    if (!data.jobId) return null;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      await new Promise((r) => setTimeout(r, AGENT_POLL_INTERVAL_MS));

      const pollRes = await fetch(`${BANKR_AGENT_URL}/job/${data.jobId}`, {
        headers: { 'x-api-key': BANKR_API_KEY },
        signal: controller.signal,
      });

      if (!pollRes.ok) continue;
      const job = (await pollRes.json()) as AgentPromptResponse;

      if (job.status === 'completed') return job.response || job.result || null;
      if (job.status === 'failed' || job.status === 'cancelled') {
        console.warn(`[bankr] agent job ${data.jobId} ${job.status}`, (job as Record<string, unknown>).error || '');
        return null;
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return null;
    }
    console.warn('[bankr] agent prompt failed:', err instanceof Error ? err.message : err);
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
    } catch {
      // Fall through to next strategy
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
    console.warn('[bankr] could not parse agent response:', response.slice(0, 300));
    return [];
  }

  return parsed
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
        } catch {
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
  const prompt = `What is the Base/Ethereum wallet address associated with @${handle} on Bankr? Reply with ONLY the 0x address, nothing else.`;
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

const BANKR_LAUNCHES_API = 'https://api.bankr.bot/token-launches';
const BANKR_PUBLIC_API = 'https://api.bankr.bot/public/doppler';
const BANKR_BEARER = process.env.BANKR_BEARER_TOKEN;

/** Build auth headers for Bankr Search API.
 * Prefers bearer token if available, falls back to API key (x-api-key). */
function bankrAuthHeaders(): Record<string, string> {
  if (BANKR_BEARER) return { Authorization: `Bearer ${BANKR_BEARER}` };
  if (BANKR_API_KEY) return { 'x-api-key': BANKR_API_KEY };
  return {};
}

/** Whether we have ANY Bankr auth (bearer OR API key) for Search API */
const HAS_BANKR_AUTH = !!(BANKR_BEARER || BANKR_API_KEY);

interface BankrTokenLaunch {
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

async function searchLaunchesPaginated(
  query: string,
  maxPages = 3
): Promise<BankrTokenLaunch[]> {
  if (!HAS_BANKR_AUTH) return [];

  const all: BankrTokenLaunch[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    try {
      const params = new URLSearchParams({ q: query, group: 'byFeeRecipient' });
      if (cursor) params.set('cursor', cursor);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      const res = await fetch(
        `${BANKR_LAUNCHES_API}/search/paginated?${params.toString()}`,
        { headers: bankrAuthHeaders(), signal: controller.signal }
      );
      clearTimeout(timeout);
      if (!res.ok) { console.warn(`[bankr] searchLaunchesPaginated returned HTTP ${res.status}`); break; }

      const data = (await res.json()) as BankrPaginatedResponse;
      for (const token of data.results ?? []) {
        if (!token.tokenAddress) continue;
        const key = token.tokenAddress.toLowerCase();
        if (!seen.has(key)) { seen.add(key); all.push(token); }
      }
      if (!data.nextCursor) break;
      cursor = data.nextCursor;
    } catch (err) {
      console.warn('[bankr] searchLaunchesPaginated failed:', err instanceof Error ? err.message : err);
      break;
    }
  }
  return all;
}

async function searchLaunches(query: string): Promise<BankrSearchResponse> {
  if (!HAS_BANKR_AUTH) return {};
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(
      `${BANKR_LAUNCHES_API}/search?q=${encodeURIComponent(query)}`,
      { headers: bankrAuthHeaders(), signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!res.ok) { console.warn(`[bankr] searchLaunches returned HTTP ${res.status}`); return {}; }
    return (await res.json()) as BankrSearchResponse;
  } catch (err) {
    console.warn('[bankr] searchLaunches failed:', err instanceof Error ? err.message : err);
    return {};
  }
}

async function getTokenFees(tokenAddress: string): Promise<BankrTokenFeeResponse | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(`${BANKR_PUBLIC_API}/token-fees/${tokenAddress}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) { console.warn(`[bankr] getTokenFees returned HTTP ${res.status} for ${tokenAddress}`); return null; }
    return (await res.json()) as BankrTokenFeeResponse;
  } catch (err) {
    console.warn('[bankr] getTokenFees failed:', err instanceof Error ? err.message : err);
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

  if (str.startsWith('<')) str = str.slice(1);
  // Only treat as raw wei if 19+ digits (minimum ~1 ETH in wei = 1e18)
  if (/^\d{19,}$/.test(str)) return str;

  const num = parseFloat(str);
  if (!Number.isFinite(num) || num <= 0) return '0';

  const parts = str.split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').padEnd(18, '0').slice(0, 18);
  return (whole + frac).replace(/^0+/, '') || '0';
}

async function fetchFeesForTokens(tokens: BankrTokenLaunch[]): Promise<TokenFee[]> {
  if (tokens.length === 0) return [];
  const batch = tokens.slice(0, 30);
  const feeResults = await Promise.allSettled(batch.map((t) => getTokenFees(t.tokenAddress)));
  const fees: TokenFee[] = [];

  for (let i = 0; i < feeResults.length; i++) {
    const result = feeResults[i];
    const token = batch[i];
    if (result.status !== 'fulfilled' || !result.value) continue;

    const totals = result.value.totals;
    const claimableWei = wethToWei(totals?.claimableWeth);
    const claimedWei = wethToWei(totals?.claimedWeth);

    let totalEarnedWei: string;
    try {
      totalEarnedWei = (BigInt(claimableWei) + BigInt(claimedWei)).toString();
    } catch (err) {
      console.warn('[bankr] BigInt add failed in fetchFeesForTokens:', err instanceof Error ? err.message : err);
      totalEarnedWei = claimableWei;
    }

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

    // Primary: Search API (fast, ~2s)
    if (HAS_BANKR_AUTH) {
      const data = await searchLaunches(handle);
      const wallets: ResolvedWallet[] = [];
      const seen = new Set<string>();
      for (const token of data.groups?.byFeeRecipient?.results ?? []) {
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

    const allFees = await bankrAdapter.getHistoricalFees(wallet);
    return allFees.filter((f) => {
      try {
        return BigInt(f.totalUnclaimed) > 0n;
      } catch (err) {
        console.warn('[bankr] BigInt parse failed in getLiveUnclaimedFees:', err instanceof Error ? err.message : err);
        return parseFloat(f.totalUnclaimed) > 0;
      }
    });
  },

  async getClaimHistory(_wallet: string): Promise<ClaimEvent[]> {
    return [];
  },
};
