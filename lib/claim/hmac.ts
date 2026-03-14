import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Generate HMAC-SHA256 token for a claim attempt.
 * Used by both /api/claim/bags (generation) and /api/claim/confirm (verification).
 * Uses dedicated CLAIM_HMAC_SECRET in production; falls back to CRON_SECRET only in development.
 */
export function generateConfirmToken(claimAttemptId: string, wallet: string): string {
  const secret = process.env.CLAIM_HMAC_SECRET
    || (process.env.NODE_ENV !== 'production' ? process.env.CRON_SECRET : undefined);
  if (!secret) throw new Error('CLAIM_HMAC_SECRET is required (set it in Vercel env vars)');
  return createHmac('sha256', secret)
    .update(`claim:${claimAttemptId}:${wallet}`)
    .digest('hex');
}

const CONFIRM_TOKEN_RE = /^[0-9a-f]{64}$/i;

/** Constant-time HMAC token verification. Returns false on any invalid input. */
export function verifyConfirmToken(provided: string, expected: string): boolean {
  if (!CONFIRM_TOKEN_RE.test(provided)) return false;
  try {
    const a = Buffer.from(provided, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
