import 'server-only';
import { BANKR_API_BASE } from '@/lib/constants';
import { isValidEvmAddress, normalizeEvmAddress } from '@/lib/chains/base';
import { safeBigInt, sanitizeAmountString, sanitizeTokenSymbol } from '@/lib/utils';
import type { IdentityProvider } from '@/lib/supabase/types';
import type {
  PlatformAdapter,
  ResolvedWallet,
  CreatorToken,
  TokenFee,
  ClaimEvent,
} from './types';

// ═══════════════════════════════════════════════
// Bankr Agent API Types
// ═══════════════════════════════════════════════

interface BankrAgentResponse {
  result?: string;
  data?: {
    wallet?: unknown;
    fees?: unknown;
  };
}

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

/**
 * Sanitize user input before interpolating into AI agent prompts.
 * Strips control characters, structural chars, and limits length.
 *
 * NOTE: This is a defense-in-depth measure. The primary defense against
 * prompt injection is treating AI responses as untrusted data and validating
 * all returned values (addresses, amounts) before use.
 */
function sanitizeForPrompt(input: string): string {
  return input
    // Remove control chars, zero-width chars, RTL override chars
    .replace(/[\x00-\x1F\x7F\u200B-\u200F\u202A-\u202E\uFEFF]/g, '')
    // Remove structural and injection characters
    .replace(/[{}[\]<>`'";\|\\]/g, '')
    // Remove common prompt injection keywords (case-insensitive, word boundaries)
    .replace(/\b(ignore|forget|instead|override|system|prompt|instructions?|assistant|user|role|execute|eval)\b/gi, '')
    // Remove Unicode confusable characters commonly used to bypass keyword filters
    .replace(/[\u0400-\u04FF\u0500-\u052F]/g, '') // Cyrillic lookalikes
    // Hard length limit
    .slice(0, 128)
    .trim();
}

/**
 * Build a prompt with clear data boundaries to reduce injection risk.
 */
function buildPrompt(template: string, dataValue: string): string {
  const safe = sanitizeForPrompt(dataValue);
  return `${template}\n\n[DATA]: ${safe}`;
}

async function bankrQuery(prompt: string): Promise<BankrAgentResponse | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(`${BANKR_API_BASE}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.json() as BankrAgentResponse;
  } catch {
    return null;
  }
}

/**
 * Validate and extract a fee object from the AI response.
 * All fields are treated as untrusted and validated individually.
 */
function parseAiFee(f: unknown): TokenFee | null {
  if (!f || typeof f !== 'object') return null;
  const obj = f as Record<string, unknown>;

  const tokenAddress = typeof obj.tokenAddress === 'string' ? obj.tokenAddress : null;
  if (!tokenAddress || !isValidEvmAddress(tokenAddress)) return null;

  return {
    tokenAddress: normalizeEvmAddress(tokenAddress),
    tokenSymbol: sanitizeTokenSymbol(obj.tokenSymbol),
    chain: 'base' as const,
    platform: 'bankr' as const,
    totalEarned: sanitizeAmountString(obj.earned),
    totalClaimed: sanitizeAmountString(obj.claimed),
    totalUnclaimed: sanitizeAmountString(obj.unclaimed),
    totalEarnedUsd: null,
    royaltyBps: null,
  };
}

// ═══════════════════════════════════════════════
// Bankr Adapter
// ═══════════════════════════════════════════════

export const bankrAdapter: PlatformAdapter = {
  platform: 'bankr',
  chain: 'base',
  supportsIdentityResolution: true,
  supportsLiveFees: true,

  async resolveIdentity(
    handle: string,
    provider: IdentityProvider
  ): Promise<ResolvedWallet[]> {
    if (provider !== 'twitter' && provider !== 'wallet') return [];

    const data = await bankrQuery(
      buildPrompt('What is the wallet address for this user?', `@${handle}`)
    );
    const rawAddress = data?.data?.wallet;
    // Validate the AI-returned wallet address before trusting it
    if (!rawAddress || typeof rawAddress !== 'string' || !isValidEvmAddress(rawAddress)) return [];

    return [
      {
        address: normalizeEvmAddress(rawAddress),
        chain: 'base',
        sourcePlatform: 'bankr',
      },
    ];
  },

  async getCreatorTokens(_wallet: string): Promise<CreatorToken[]> {
    // Bankr doesn't expose a token listing endpoint.
    return [];
  },

  async getHistoricalFees(wallet: string): Promise<TokenFee[]> {
    if (!isValidEvmAddress(wallet)) return [];
    const data = await bankrQuery(
      buildPrompt('Check all creator fees for this wallet address.', wallet)
    );

    // Validate response structure — AI responses are inherently unreliable
    if (!data?.data?.fees || !Array.isArray(data.data.fees)) return [];

    const validFees: TokenFee[] = [];
    for (const rawFee of data.data.fees) {
      const parsed = parseAiFee(rawFee);
      if (parsed) validFees.push(parsed);
    }

    return validFees;
  },

  async getLiveUnclaimedFees(wallet: string): Promise<TokenFee[]> {
    const fees = await this.getHistoricalFees(wallet);
    return fees.filter((f) => safeBigInt(f.totalUnclaimed) > 0n);
  },

  async getClaimHistory(_wallet: string): Promise<ClaimEvent[]> {
    return [];
  },
};
