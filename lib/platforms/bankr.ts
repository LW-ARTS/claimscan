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
// Bankr Agent API (primary — prompt-based)
// ═══════════════════════════════════════════════

const BANKR_API_URL = process.env.BANKR_API_URL || 'https://api.bankr.bot';
const BANKR_AGENT_URL = `${BANKR_API_URL}/agent`;
const BANKR_API_KEY = process.env.BANKR_API_KEY;

/** Budget for Agent API calls running inside Promise.allSettled with other adapters.
 * Must be short — Promise.allSettled waits for ALL adapters, so a slow Bankr call
 * blocks every other adapter's results. 5s prevents starvation. */
const AGENT_SHORT_TIMEOUT_MS = 5_000;

/** Budget for Agent API calls in getFeesByHandle, which runs in parallel (Promise.all)
 * with wallet resolution — NOT inside Promise.allSettled with other adapters.
 * A longer timeout here doesn't block other adapters from completing.
 * The pipeline has a 30s hard timeout; leaving 10s headroom for Step 2. */
const AGENT_LONG_TIMEOUT_MS = 20_000;

const AGENT_POLL_INTERVAL_MS = 2_000;

interface AgentPromptResponse {
  jobId?: string;
  threadId?: string;
  status?: string;
  result?: string;
  response?: string;
}

/**
 * Submit a natural-language prompt to Bankr's Agent API and poll until complete.
 * Returns the text response or null on failure/timeout.
 *
 * The ENTIRE call is capped at `timeoutMs` because slow Bankr calls
 * can block the resolve pipeline. Use AGENT_SHORT_TIMEOUT_MS (5s) for
 * calls inside Promise.allSettled, AGENT_LONG_TIMEOUT_MS (20s) for
 * calls that run in parallel with the rest of the pipeline.
 */
async function promptBankrAgent(prompt: string, timeoutMs = AGENT_SHORT_TIMEOUT_MS): Promise<string | null> {
  if (!BANKR_API_KEY) return null;

  // Single AbortController for the entire call — submit + any polls
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

    // Check success field per Bankr API spec
    if (data.success === false) {
      console.warn('[bankr] agent prompt returned success=false');
      return null;
    }

    // Some queries return result immediately
    if (data.result) return data.result;
    if (data.response) return data.response;
    if (!data.jobId) return null;

    // Poll for async job completion (remaining budget from the 5s total)
    // Agent API jobs typically take 30s–2min, so this rarely completes.
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
      // still pending/processing — loop will be killed by abort controller
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // Expected — 5s budget exhausted
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

/**
 * Parse the Agent API's natural-language response into structured fee data.
 * Tries JSON extraction first, then falls back to regex line-by-line parsing.
 */
function parseAgentFeeResponse(response: string): ParsedAgentFee[] {
  // Strategy 1: Try to extract a JSON array from the response
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
      // JSON parse failed — fall through to regex
    }
  }

  // Strategy 2: Line-by-line regex parsing for pipe-delimited format
  // Matches: 0xADDRESS|SYMBOL|0.005|0.002|0.003
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
  if (fees.length > 0) return fees;

  // Strategy 3: Extract individual token blocks from natural language
  // Pattern: token address + WETH amounts nearby
  const addrRegex = /0x[a-fA-F0-9]{40}/g;
  const wethRegex = /([\d.]+)\s*WETH/gi;
  const addresses = [...response.matchAll(addrRegex)].map((m) => m[0]);
  const wethAmounts = [...response.matchAll(wethRegex)].map((m) => m[1]);

  if (addresses.length > 0 && wethAmounts.length > 0) {
    // If we have both addresses and WETH amounts, try to associate them
    // Simple heuristic: each address gets the next available WETH amounts
    const symbolRegex = /\b([A-Z$][A-Z0-9$]{1,9})\b/g;
    const symbols = [...response.matchAll(symbolRegex)]
      .map((m) => m[1])
      .filter((s) => !['WETH', 'ETH', 'USD', 'TOKEN', 'TOTAL', 'NONE', 'JSON'].includes(s));

    for (let i = 0; i < addresses.length; i++) {
      const addr = addresses[i];
      if (!isValidEvmAddress(addr)) continue;

      // Try to find 2-3 WETH values near this address
      const earnedIdx = i * 3;
      const earned = wethAmounts[earnedIdx] || wethAmounts[i * 2] || '0';
      const claimed = wethAmounts[earnedIdx + 1] || '0';
      const unclaimed = wethAmounts[earnedIdx + 2] || wethAmounts[i * 2 + 1] || earned;

      fees.push({
        tokenAddress: addr,
        tokenSymbol: symbols[i] || 'UNKNOWN',
        earnedWeth: earned,
        claimedWeth: claimed,
        unclaimedWeth: unclaimed,
      });
    }
  }

  return fees;
}

/**
 * Use the Agent API to fetch fees for a handle (Twitter/Farcaster username).
 * Asks for structured JSON output for reliable parsing.
 */
async function fetchFeesByAgent(handle: string, timeoutMs = AGENT_SHORT_TIMEOUT_MS): Promise<TokenFee[]> {
  // Ask for structured JSON output — the Bankr agent understands JSON requests well
  const prompt = [
    `List all Bankr tokens where @${handle} is the fee recipient.`,
    'For each token, return ONLY a JSON array with this exact format, no explanation text:',
    '[{"a":"TOKEN_ADDRESS","s":"SYMBOL","e":"EARNED_WETH","c":"CLAIMED_WETH","u":"UNCLAIMED_WETH"}]',
    'Use numeric strings for WETH values (e.g. "0.005417"). Return [] if no tokens found.',
  ].join(' ');

  const response = await promptBankrAgent(prompt, timeoutMs);
  if (!response) return [];

  console.log(`[bankr] agent response for @${handle}:`, response.slice(0, 200));

  const parsed = parseAgentFeeResponse(response);
  if (parsed.length === 0) {
    // Check if response explicitly says no tokens
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
      // Skip zero-value entries
      return earned !== '0' || unclaimed !== '0';
    })
    .map((p) => {
      const earned = wethToWei(p.earnedWeth);
      const claimed = wethToWei(p.claimedWeth);
      const unclaimed = wethToWei(p.unclaimedWeth);

      // Recalculate earned if needed
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

/**
 * Use the Agent API to resolve a handle's Base wallet address.
 */
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
// Legacy: Search + Doppler API (fallback)
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
      if (!res.ok) break;

      const data = (await res.json()) as BankrPaginatedResponse;
      for (const token of data.results ?? []) {
        if (!token.tokenAddress) continue;
        const key = token.tokenAddress.toLowerCase();
        if (!seen.has(key)) { seen.add(key); all.push(token); }
      }
      if (!data.nextCursor) break;
      cursor = data.nextCursor;
    } catch {
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
    if (!res.ok) return {};
    return (await res.json()) as BankrSearchResponse;
  } catch {
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
  let str = val.trim();
  if (!str || str === '0' || str === '0.000000') return '0';

  if (str.startsWith('<')) str = str.slice(1);
  if (/^\d{15,}$/.test(str)) return str;

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
    } catch {
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

    // Primary: Search API (fast, ~2s) — works with bearer OR API key
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

    // Fallback: Agent API (slow, ~12s+)
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

    // Primary: legacy search + Doppler (fast, ~5s)
    if (HAS_BANKR_AUTH) {
      const tokens = await searchLaunchesPaginated(handle);
      const fees = await fetchFeesForTokens(tokens);
      if (fees.length > 0) return fees;
    }

    // Fallback: Agent API — use long timeout here because getFeesByHandle runs
    // in parallel with resolveWallets (Promise.all), NOT inside Promise.allSettled
    // with other adapters. A 20s timeout won't block pump/bags/clanker.
    if (BANKR_API_KEY) {
      return fetchFeesByAgent(handle, AGENT_LONG_TIMEOUT_MS);
    }

    return [];
  },

  async getCreatorTokens(_wallet: string): Promise<CreatorToken[]> {
    return [];
  },

  async getHistoricalFees(wallet: string): Promise<TokenFee[]> {
    if (!isValidEvmAddress(wallet)) return [];

    // Primary: legacy search + Doppler (fast, ~5s)
    if (HAS_BANKR_AUTH) {
      const tokens = await searchLaunchesPaginated(wallet);
      const fees = await fetchFeesForTokens(tokens);
      if (fees.length > 0) return fees;
    }

    // Fallback: Agent API (slow, ~12s+ — only if legacy unavailable or empty)
    if (BANKR_API_KEY) {
      const prompt = [
        `List all Bankr tokens where ${wallet} is the fee recipient.`,
        'Return ONLY a JSON array: [{"a":"TOKEN_ADDRESS","s":"SYMBOL","e":"EARNED_WETH","c":"CLAIMED_WETH","u":"UNCLAIMED_WETH"}]',
        'Use [] if none.',
      ].join(' ');

      const response = await promptBankrAgent(prompt);
      if (response) {
        const parsed = parseAgentFeeResponse(response);
        const fees = parsed
          .filter((p) => wethToWei(p.earnedWeth) !== '0' || wethToWei(p.unclaimedWeth) !== '0')
          .map((p) => {
            const earned = wethToWei(p.earnedWeth);
            const claimed = wethToWei(p.claimedWeth);
            const unclaimed = wethToWei(p.unclaimedWeth);
            let totalEarned = earned;
            if (earned === '0' && (claimed !== '0' || unclaimed !== '0')) {
              try { totalEarned = (BigInt(claimed) + BigInt(unclaimed)).toString(); } catch { totalEarned = unclaimed; }
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
        if (fees.length > 0) return fees;
      }
    }

    return [];
  },

  async getLiveUnclaimedFees(wallet: string): Promise<TokenFee[]> {
    if (!isValidEvmAddress(wallet)) return [];

    // Use getHistoricalFees and filter to unclaimed only
    const allFees = await bankrAdapter.getHistoricalFees(wallet);
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
