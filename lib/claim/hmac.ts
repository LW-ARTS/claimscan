import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';
import { CLAIM_HMAC_MAX_AGE_MINUTES } from '@/lib/constants';

function getSecret(): string {
  const secret = process.env.CLAIM_HMAC_SECRET
    || (process.env.NODE_ENV !== 'production' ? (() => {
      console.error('[hmac] WARNING: Using dev fallback HMAC secret. Set CLAIM_HMAC_SECRET in production/preview.');
      return 'dev-hmac-secret-do-not-use-in-prod-32ch';
    })() : undefined);
  if (!secret || secret.length < 32) throw new Error('CLAIM_HMAC_SECRET is required in production (min 32 chars)');
  return secret;
}

/**
 * Generate HMAC-SHA256 token for a claim attempt.
 * Includes a minute-level timestamp to prevent indefinite replay.
 * Format: "{minuteTs}.{hex}"
 */
export function generateConfirmToken(claimAttemptId: string, wallet: string): string {
  const secret = getSecret();
  const minuteTs = Math.floor(Date.now() / 60_000);
  return `${minuteTs}.${createHmac('sha256', secret)
    .update(`claim:${claimAttemptId}:${wallet}:${minuteTs}`)
    .digest('hex')}`;
}

const HEX64_RE = /^[0-9a-f]{64}$/i;

/**
 * Verify a timestamped HMAC confirm token.
 * Accepts tokens up to maxAgeMinutes old (default 15).
 */
export function verifyConfirmToken(
  provided: string,
  claimAttemptId: string,
  wallet: string,
  maxAgeMinutes = CLAIM_HMAC_MAX_AGE_MINUTES
): boolean {
  const dotIdx = provided.indexOf('.');
  if (dotIdx === -1) return false;
  const hex = provided.slice(dotIdx + 1);
  if (!HEX64_RE.test(hex)) return false;

  let secret: string;
  try { secret = getSecret(); } catch (err) {
    console.error('[hmac] CRITICAL: HMAC secret misconfigured, all token verification will fail:', err instanceof Error ? err.message : err);
    return false;
  }

  // Extract embedded timestamp and validate age range first (O(1))
  const providedMinute = parseInt(provided.slice(0, dotIdx), 10);
  if (isNaN(providedMinute)) return false;
  const currentMinute = Math.floor(Date.now() / 60_000);
  if (providedMinute > currentMinute || currentMinute - providedMinute > maxAgeMinutes) return false;

  // Single HMAC check against the token's own embedded timestamp (constant-time)
  const expected = createHmac('sha256', secret)
    .update(`claim:${claimAttemptId}:${wallet}:${providedMinute}`)
    .digest('hex');
  try {
    const a = Buffer.from(hex, 'hex');
    const b = Buffer.from(expected, 'hex');
    // timingSafeEqual first to avoid short-circuit timing leak on length check
    const match = timingSafeEqual(a, b);
    return match && a.length === b.length;
  } catch { return false; }
}
