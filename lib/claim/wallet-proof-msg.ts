/**
 * Shared helpers for the SIWS-style "prove control" message used by
 * POST /api/claim/bags. The message is built client-side, signed with the
 * wallet's private key, and re-built server-side for verification — so both
 * sides must agree on the exact string format.
 *
 * Message format (LF separators):
 *   ClaimScan: prove control of {wallet}
 *   Mints: {mintsHashPrefix}
 *   Issued: {iso-timestamp}
 *   TTL: 5 minutes
 *
 * Both sides MUST derive `mintsHashPrefix` via computeMintsHashPrefix() so a
 * signature bound to one set of mints cannot be reused for a different set.
 */

export const PROOF_MAX_AGE_MS = 5 * 60 * 1000;
export const PROOF_CLOCK_SKEW_MS = 60 * 1000;
export const PROOF_TTL_LINE = 'TTL: 5 minutes';

/**
 * Hex prefix of sha256(sorted mints joined by ","), first 16 chars (8 bytes).
 * 8 bytes is enough to bind the signature to the mint set without bloating
 * the wallet popup — collision risk is negligible for this scope.
 * Works in both Node 24 and browsers via globalThis.crypto.subtle.
 */
export async function computeMintsHashPrefix(tokenMints: readonly string[]): Promise<string> {
  const sorted = [...tokenMints].sort();
  const data = new TextEncoder().encode(sorted.join(','));
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

export function buildProofMessage(args: {
  wallet: string;
  mintsHashPrefix: string;
  issuedAt: Date;
}): string {
  return [
    `ClaimScan: prove control of ${args.wallet}`,
    `Mints: ${args.mintsHashPrefix}`,
    `Issued: ${args.issuedAt.toISOString()}`,
    PROOF_TTL_LINE,
  ].join('\n');
}
