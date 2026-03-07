import 'server-only';
import { BANKR_API_BASE } from '@/lib/constants';
import { isValidEvmAddress, normalizeEvmAddress } from '@/lib/chains/base';
import { isValidSolanaAddress } from '@/lib/chains/solana';
import { safeBigInt, sanitizeTokenSymbol } from '@/lib/utils';
import type { IdentityProvider } from '@/lib/supabase/types';
import type {
  PlatformAdapter,
  ResolvedWallet,
  CreatorToken,
  TokenFee,
  ClaimEvent,
} from './types';

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
    .replace(/[\x00-\x1F\x7F\u200B-\u200F\u202A-\u202E\uFEFF]/g, '')
    .replace(/[{}[\]<>`'";\|\\]/g, '')
    .replace(/\b(ignore|forget|instead|override|system|prompt|instructions?|assistant|user|role|execute|eval)\b/gi, '')
    .replace(/[\u0400-\u04FF\u0500-\u052F]/g, '')
    .slice(0, 128)
    .trim();
}

function buildPrompt(template: string, dataValue: string): string {
  const safe = sanitizeForPrompt(dataValue);
  return `${template}\n\n[DATA]: ${safe}`;
}

/**
 * Send a prompt to the Bankr Agent API.
 * Endpoint: POST https://api.bankr.bot/agent/prompt
 * Returns the raw result string from the AI response.
 */
async function bankrQuery(prompt: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const apiKey = process.env.BANKR_API_KEY;
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }
    const res = await fetch(`${BANKR_API_BASE}/prompt`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;

    // Primary format: { result: "structured text or JSON" }
    if (typeof data?.result === 'string') return data.result;

    // Fallback: entire body may be stringified data
    if (typeof data === 'string') return data;

    // Fallback: try to use the whole JSON
    return JSON.stringify(data);
  } catch {
    return null;
  }
}

/**
 * Extract EVM addresses from AI response text.
 * Validates each address before returning.
 */
function extractEvmAddresses(text: string): string[] {
  const matches = text.match(/0x[a-fA-F0-9]{40}/g) || [];
  return [...new Set(matches)].filter(isValidEvmAddress);
}

/**
 * Extract Solana addresses from AI response text.
 * Uses base58 pattern matching + validation.
 */
function extractSolAddresses(text: string): string[] {
  const matches = text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g) || [];
  return [...new Set(matches)].filter(isValidSolanaAddress);
}

/**
 * Convert a human-readable ETH/WETH amount to wei string.
 * Bankr AI returns amounts like "0.5" or "1.23" — we need wei (18 decimals).
 * Returns "0" for invalid inputs.
 */
function ethToWei(val: unknown): string {
  if (val === null || val === undefined) return '0';
  const str = String(val).trim();
  if (!str || str === '0') return '0';

  // Already looks like a large integer (wei) — pass through
  if (/^\d{15,}$/.test(str)) return str;

  // Parse as float and convert to wei
  const num = parseFloat(str);
  if (!Number.isFinite(num) || num < 0) return '0';
  if (num === 0) return '0';

  // Use string manipulation to avoid floating point precision loss:
  // Split on decimal, pad/truncate to 18 decimal places, concatenate
  const parts = str.split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').padEnd(18, '0').slice(0, 18);
  const weiStr = (whole + frac).replace(/^0+/, '') || '0';
  return weiStr;
}

/**
 * Parse fee data from AI text response.
 * Attempts JSON extraction first, then falls back to regex parsing.
 * All values are treated as untrusted and validated individually.
 */
function parseFeeFromText(text: string, walletToExclude: string): TokenFee[] {
  const fees: TokenFee[] = [];

  // Strategy 1: Try to extract JSON array or object from the response
  const jsonMatch = text.match(/\[[\s\S]*?\]|\{[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as unknown;
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const obj = item as Record<string, unknown>;

        const tokenAddr = String(obj.tokenAddress ?? obj.token_address ?? obj.ca ?? obj.contract_address ?? '');
        if (!tokenAddr || !isValidEvmAddress(tokenAddr)) continue;

        // Skip the wallet itself (AI sometimes includes it)
        if (walletToExclude && isValidEvmAddress(walletToExclude) &&
            normalizeEvmAddress(tokenAddr) === normalizeEvmAddress(walletToExclude)) continue;

        fees.push({
          tokenAddress: normalizeEvmAddress(tokenAddr),
          tokenSymbol: sanitizeTokenSymbol(obj.tokenSymbol ?? obj.symbol ?? obj.name ?? obj.token_name),
          chain: 'base' as const,
          platform: 'bankr' as const,
          totalEarned: ethToWei(obj.totalEarned ?? obj.earned ?? obj.total_fees ?? obj.total),
          totalClaimed: ethToWei(obj.totalClaimed ?? obj.claimed),
          totalUnclaimed: ethToWei(obj.totalUnclaimed ?? obj.unclaimed ?? obj.available),
          totalEarnedUsd: null,
          royaltyBps: null,
        });
      }
    } catch {
      // JSON parse failed — continue to fallback
    }
  }

  if (fees.length > 0) return fees;

  // Strategy 2: Find contract addresses in text and associate with nearby amounts
  const contractAddresses = extractEvmAddresses(text).filter((addr) => {
    if (!walletToExclude || !isValidEvmAddress(walletToExclude)) return true;
    return normalizeEvmAddress(addr) !== normalizeEvmAddress(walletToExclude);
  });

  for (const addr of contractAddresses) {
    // Look for amount near the address (within ~200 chars)
    const addrIdx = text.indexOf(addr);
    const context = text.slice(Math.max(0, addrIdx - 50), addrIdx + addr.length + 200);
    const amountMatch = context.match(/(\d+\.?\d*)\s*(?:WETH|ETH|SOL)/i);

    fees.push({
      tokenAddress: normalizeEvmAddress(addr),
      tokenSymbol: null,
      chain: 'base' as const,
      platform: 'bankr' as const,
      totalEarned: amountMatch ? ethToWei(amountMatch[1]) : '0',
      totalClaimed: '0',
      totalUnclaimed: amountMatch ? ethToWei(amountMatch[1]) : '0',
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
    if (provider !== 'twitter' && provider !== 'wallet') return [];

    const result = await bankrQuery(
      buildPrompt(
        'What is the wallet address for this user? Return only the wallet address, nothing else.',
        `@${handle}`
      )
    );
    if (!result) return [];

    const wallets: ResolvedWallet[] = [];

    // Extract EVM addresses (Base chain)
    for (const addr of extractEvmAddresses(result)) {
      wallets.push({
        address: normalizeEvmAddress(addr),
        chain: 'base',
        sourcePlatform: 'bankr',
      });
    }

    // Extract Solana addresses
    for (const addr of extractSolAddresses(result)) {
      wallets.push({
        address: addr,
        chain: 'sol',
        sourcePlatform: 'bankr',
      });
    }

    return wallets;
  },

  async getFeesByHandle(
    handle: string,
    provider: IdentityProvider
  ): Promise<TokenFee[]> {
    if (provider !== 'twitter') return [];

    const result = await bankrQuery(
      buildPrompt(
        'List all tokens where fee recipient is this handle. For each token include: contract address (CA), token name, total fees in WETH, and claim status. Format as JSON array with fields: tokenAddress, symbol, earned, unclaimed.',
        `@${handle}`
      )
    );
    if (!result) return [];

    return parseFeeFromText(result, '');
  },

  async getCreatorTokens(_wallet: string): Promise<CreatorToken[]> {
    return [];
  },

  async getHistoricalFees(wallet: string): Promise<TokenFee[]> {
    if (!isValidEvmAddress(wallet)) return [];

    const result = await bankrQuery(
      buildPrompt(
        'List all creator fees for this wallet address. For each token include: contract address (CA), token name, total fees in WETH, claimed amount, unclaimed amount. Format as JSON array with fields: tokenAddress, symbol, earned, claimed, unclaimed.',
        wallet
      )
    );
    if (!result) return [];

    return parseFeeFromText(result, wallet);
  },

  async getLiveUnclaimedFees(wallet: string): Promise<TokenFee[]> {
    if (!isValidEvmAddress(wallet)) return [];

    const result = await bankrQuery(
      buildPrompt(
        'Show unclaimed creator fees for this wallet address. For each token include: contract address (CA), token name, unclaimed amount in WETH. Format as JSON array with fields: tokenAddress, symbol, unclaimed.',
        wallet
      )
    );
    if (!result) return [];

    return parseFeeFromText(result, wallet)
      .filter((f) => safeBigInt(f.totalUnclaimed) > 0n || parseFloat(f.totalUnclaimed) > 0);
  },

  async getClaimHistory(_wallet: string): Promise<ClaimEvent[]> {
    return [];
  },
};
