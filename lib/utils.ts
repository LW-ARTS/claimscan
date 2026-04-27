import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { PLATFORM_CONFIG, CHAIN_CONFIG } from '@/lib/constants'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Check whether a string looks like a wallet address (EVM 0x… or Solana base58).
 */
export function isWalletAddress(input: string): boolean {
  return /^(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(input);
}


/**
 * Copy text to clipboard with fallback for older browsers.
 * Returns true if copy succeeded, false otherwise.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }
}

/**
 * Safely convert a string to BigInt.
 * Returns 0n for null, undefined, empty strings, decimals, negative, or invalid values.
 * Negative values are clamped to 0n since token amounts cannot be negative.
 */
export function safeBigInt(val: string | null | undefined): bigint {
  if (!val || val.trim() === '') return 0n;
  try {
    let str = val.trim();
    // Handle scientific notation (e.g. "1e9", "1.5e18") — BigInt() can't parse these.
    // Note: values above Number.MAX_SAFE_INTEGER (2^53) will lose precision through Number().
    // This is acceptable for display/aggregation; storage paths use sanitizeAmountString.
    if (/[eE]/.test(str)) {
      const num = Number(str);
      if (!isFinite(num)) return 0n;
      str = num.toFixed(0);
    }
    // Handle decimal strings by truncating to integer part
    const intPart = str.includes('.') ? str.split('.')[0] : str;
    const result = BigInt(intPart || '0');
    // Clamp negatives to 0n — token amounts should never be negative
    return result < 0n ? 0n : result;
  } catch (err) {
    console.warn(`[safeBigInt] Failed to parse: "${val}"`, err instanceof Error ? err.message : err);
    return 0n;
  }
}

/**
 * Format a USD amount into a short human-readable string.
 */
export function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '$0.00';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value > 0) return `$${value.toFixed(4)}`;
  return '$0.00';
}

/**
 * Format a raw token amount string using chain decimals.
 * Uses BigInt division for large values to avoid Number precision loss.
 */
export function formatTokenAmount(raw: string, decimals: number): string {
  if (decimals < 0 || decimals > 78) return '0';
  const bigVal = safeBigInt(raw);
  if (bigVal === 0n) return '0';

  const divisor = 10n ** BigInt(decimals);
  const whole = bigVal / divisor;
  const remainder = bigVal % divisor;

  // Build precise string using BigInt-only arithmetic — avoids Number precision loss
  const fracStr = remainder.toString().padStart(decimals, '0').replace(/0+$/, '');

  // Use BigInt comparisons for thresholds to avoid parseFloat precision loss
  if (whole >= 1_000_000n) {
    const thousands = Number(whole / 1000n) / 1000;
    return `${thousands.toFixed(2)}M`;
  }
  if (whole >= 1000n) {
    const k = Number(whole) / 1000;
    return `${k.toFixed(2)}K`;
  }
  if (whole >= 1n) {
    const frac2 = fracStr.length > 0 ? fracStr.slice(0, 2).padEnd(2, '0') : '00';
    return `${whole}.${frac2}`;
  }
  if (fracStr.length > 0) {
    // >= 0.01: show 2 decimals (e.g. 0.25). < 0.01: show up to 4 (e.g. 0.0012)
    const sigDigits = fracStr.length - fracStr.replace(/^0+/, '').length < 2 ? 2 : 4;
    return `0.${fracStr.slice(0, sigDigits).padEnd(sigDigits, '0')}`;
  }
  return `${whole}`;
}

/**
 * Validate a wallet object shape for API input validation.
 */
export const VALID_CHAINS = new Set(['sol', 'base', 'eth', 'bsc']);
export const VALID_PLATFORMS = new Set(Object.keys(PLATFORM_CONFIG));

/**
 * Validate that a value is a valid non-negative integer string (safe for BigInt storage).
 * Rejects negative numbers, decimals, strings > 78 digits (uint256 max), and non-numeric chars.
 */
export function sanitizeAmountString(val: unknown): string {
  if (typeof val !== 'string') return '0';
  const trimmed = val.trim();
  if (trimmed.length === 0 || trimmed.length > 78) return '0';
  // Accept pure integer strings
  if (/^\d+$/.test(trimmed)) return trimmed;
  // Handle scientific notation (e.g. "1e18", "1.5e6") by converting to integer string
  if (/^\d+(\.\d+)?e[+\-]?\d+$/i.test(trimmed)) {
    try {
      const num = Number(trimmed);
      if (Number.isFinite(num) && num >= 0 && num <= Number.MAX_SAFE_INTEGER) {
        return Math.floor(num).toString();
      }
      // For scientific notation > MAX_SAFE_INTEGER, use BigInt arithmetic
      const lower = trimmed.toLowerCase();
      const [mantissa, expStr] = lower.split('e');
      const exp = parseInt(expStr, 10);
      if (mantissa.includes('.')) {
        // e.g. "1.5e20" → whole=1, frac="5", fracDigits=1, result = 15 * 10^(20-1) = 1.5e20
        const [wholePart, fracPart] = mantissa.split('.');
        const fracDigits = fracPart.length;
        const combined = BigInt(wholePart + fracPart);
        const adjustedExp = exp - fracDigits;
        const result = adjustedExp >= 0
          ? combined * (10n ** BigInt(adjustedExp))
          : combined / (10n ** BigInt(-adjustedExp));
        if (result >= 0n) return result.toString();
      } else {
        const result = BigInt(mantissa) * (10n ** BigInt(exp));
        if (result >= 0n) return result.toString();
      }
    } catch (err) {
      console.warn(`[utils] sanitizeAmountString: BigInt conversion failed for "${trimmed}":`, err instanceof Error ? err.message : err);
    }
    return '0';
  }
  // Accept decimal strings by truncating to integer part (some APIs return formatted values)
  // Note: this must come AFTER the scientific notation check to avoid "1.5e20" → "1"
  const intPart = trimmed.split('.')[0];
  if (intPart && /^\d+$/.test(intPart)) return intPart;
  return '0';
}

/**
 * Sanitize a token symbol from external APIs — strip non-printable and special chars.
 */
export function sanitizeTokenSymbol(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  // Unicode-aware: allow letters (CJK, Cyrillic, Latin, etc.), numbers, emoji.
  // \w would strip non-ASCII silently (e.g. '疯狂的石头' → ''). The regex below
  // preserves international tokens while still stripping control chars and
  // potentially-deceptive symbols ($, brackets, etc.).
  return val.replace(/[^\p{L}\p{N}\p{Extended_Pictographic}\-\.]/gu, '').slice(0, 20) || null;
}

/**
 * Sanitize a token name from external APIs — allows spaces but strips control chars.
 */
export function sanitizeTokenName(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  // Strip control chars + Unicode bidi/invisible characters (prevents phishing via invisible chars)
  return val.replace(/[\x00-\x1f\x7f\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '').trim().slice(0, 100) || null;
}

/**
 * Platforms where fees are denominated in the chain's native token (SOL or ETH).
 * For these platforms, the fallback conversion (amount × native price) is correct.
 * Platforms NOT in this set have fees in non-native tokens (e.g. the meme token itself),
 * so the fallback would produce wrong USD values — return 0 instead.
 */
const NATIVE_TOKEN_FEE_PLATFORMS = new Set([
  'pump',       // SOL from vault PDAs
  'zora',       // ETH from ProtocolRewards
  'raydium',    // SOL from vault PDAs
  'coinbarrel', // SOL from Meteora DAMM pools
  'bags',       // SOL (lamports) from claimable-positions
  'bankr',      // WETH (wei) from Uniswap V3 pool fees (WETH ≈ ETH)
  'flaunch',    // ETH (wei) from RevenueManager + FeeEscrow (Base)
  'flap',       // BNB (wei) from VaultPortal claimable + TaxProcessor auto-forward (BSC)
]);

/**
 * Compute USD value for a fee record.
 * Prefers DB-stored total_earned_usd; falls back to amount × native token price
 * ONLY for platforms that denominate fees in the native token.
 * For non-native token platforms (RevShare, Clanker, Believe),
 * returns 0 when total_earned_usd is not available to avoid wrong USD values.
 */
export function computeFeeUsd(
  fee: { total_earned_usd?: number | null; total_unclaimed: string | null; total_earned: string | null; chain: string; platform?: string; token_address?: string },
  solPrice: number,
  ethPrice: number,
  bnbPrice = 0,
): number {
  if (fee.total_earned_usd != null && fee.total_earned_usd > 0) {
    return fee.total_earned_usd;
  }
  // Only apply native-price fallback for platforms with native token fees,
  // OR for fee rows explicitly denominated in SOL/ETH (e.g. Believe's SOL quote fees
  // use tokenAddress like "SOL:believe:<pool>"). Other platforms' meme-token fees
  // would get wrong USD from native price conversion.
  const isNativePlatform = fee.platform && NATIVE_TOKEN_FEE_PLATFORMS.has(fee.platform);
  const isNativeTokenRow = fee.token_address?.startsWith('SOL:') || fee.token_address?.startsWith('ETH:') || fee.token_address?.startsWith('BNB:');
  if (!isNativePlatform && !isNativeTokenRow) {
    return 0;
  }
  const unclaimed = safeBigInt(fee.total_unclaimed);
  const earned = safeBigInt(fee.total_earned);
  // Prefer total_earned (claimed + unclaimed) when populated; fall back to unclaimed for stale data
  const amount = earned > 0n ? earned : unclaimed;
  if (amount === 0n) return 0;
  const config = CHAIN_CONFIG[fee.chain as keyof typeof CHAIN_CONFIG];
  const prices: Record<string, number> = { sol: solPrice, eth: ethPrice, base: ethPrice, bsc: bnbPrice };
  const price = prices[fee.chain] ?? ethPrice;
  const decimals = config?.nativeDecimals ?? 18;
  return toUsdValue(amount, decimals, price);
}

/**
 * Convert a raw token amount (bigint) to USD value.
 * Uses Number() split for whole/remainder to avoid parseFloat precision loss.
 * Defined here (not in lib/prices) to avoid pulling server-side fetch code
 * into client bundles when client components need USD conversion.
 */
export function toUsdValue(
  amount: bigint,
  decimals: number,
  priceUsd: number
): number {
  if (amount === 0n || priceUsd === 0) return 0;

  // Guard against invalid decimals
  if (!Number.isInteger(decimals) || decimals < 0) return 0;

  // For amounts that fit safely in Number (< 2^53), use direct division
  if (amount < BigInt(Number.MAX_SAFE_INTEGER)) {
    return (Number(amount) / Math.pow(10, decimals)) * priceUsd;
  }

  // For larger amounts, split into whole + remainder using BigInt arithmetic
  // then convert each part to Number separately to minimize precision loss.
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const remainder = amount % divisor;

  // Number(whole) may lose precision for very large whole parts (> 2^53),
  // but this is the best we can do without arbitrary-precision float libraries.
  // Number(remainder) / Number(divisor) preserves the fractional part.
  const tokenValue = Number(whole) + Number(remainder) / Number(divisor);
  return tokenValue * priceUsd;
}

export function isValidWalletInput(w: unknown): w is { address: string; chain: string; sourcePlatform: string } {
  if (!w || typeof w !== 'object') return false;
  const obj = w as Record<string, unknown>;
  if (
    typeof obj.address !== 'string' ||
    typeof obj.chain !== 'string' ||
    !VALID_CHAINS.has(obj.chain) ||
    typeof obj.sourcePlatform !== 'string' ||
    !VALID_PLATFORMS.has(obj.sourcePlatform)
  ) return false;

  const addr = obj.address;
  // Validate address format per chain
  if (obj.chain === 'sol') {
    return addr.length >= 32 && addr.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(addr);
  }
  // EVM chains (base, eth, bsc)
  return addr.length === 42 && /^0x[a-fA-F0-9]{40}$/.test(addr);
}
