import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Safely convert a string to BigInt.
 * Returns 0n for null, undefined, empty strings, decimals, negative, or invalid values.
 * Negative values are clamped to 0n since token amounts cannot be negative.
 */
export function safeBigInt(val: string | null | undefined): bigint {
  if (!val || val.trim() === '') return 0n;
  try {
    // Handle decimal strings by truncating to integer part
    const intPart = val.includes('.') ? val.split('.')[0] : val;
    const result = BigInt(intPart || '0');
    // Clamp negatives to 0n — token amounts should never be negative
    return result < 0n ? 0n : result;
  } catch {
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
    return fracStr.length > 0 ? `${whole}.${fracStr.slice(0, 4)}` : `${whole}.0000`;
  }
  if (fracStr.length > 0) return `${whole}.${fracStr.slice(0, 6)}`;
  return `${whole}`;
}

/**
 * Validate a wallet object shape for API input validation.
 */
export const VALID_CHAINS = new Set(['sol', 'base', 'eth']);
export const VALID_PLATFORMS = new Set(['bags', 'clanker', 'pump', 'zora', 'heaven', 'bankr', 'believe', 'revshare']);

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
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(trimmed)) {
    try {
      const num = Number(trimmed);
      if (Number.isFinite(num) && num >= 0 && num <= Number.MAX_SAFE_INTEGER) {
        return Math.floor(num).toString();
      }
    } catch { /* fall through */ }
    return '0';
  }
  // Accept decimal strings by truncating to integer part (some APIs return formatted values)
  const intPart = trimmed.split('.')[0];
  if (intPart && /^\d+$/.test(intPart)) return intPart;
  return '0';
}

/**
 * Sanitize a token symbol from external APIs — strip non-printable and special chars.
 */
export function sanitizeTokenSymbol(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  return val.replace(/[^\w\-\.]/g, '').slice(0, 20) || null;
}

export function isValidWalletInput(w: unknown): w is { address: string; chain: string; sourcePlatform: string } {
  if (!w || typeof w !== 'object') return false;
  const obj = w as Record<string, unknown>;
  return (
    typeof obj.address === 'string' &&
    obj.address.length >= 2 &&
    obj.address.length <= 128 &&
    typeof obj.chain === 'string' &&
    VALID_CHAINS.has(obj.chain) &&
    typeof obj.sourcePlatform === 'string' &&
    VALID_PLATFORMS.has(obj.sourcePlatform)
  );
}
