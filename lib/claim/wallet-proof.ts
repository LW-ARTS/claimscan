import 'server-only';
import { PublicKey } from '@solana/web3.js';
import { PROOF_CLOCK_SKEW_MS, PROOF_MAX_AGE_MS, PROOF_TTL_LINE } from './wallet-proof-msg';

/**
 * Verify a SIWS-style ownership proof sent with POST /api/claim/bags. Binds
 * the request to the wallet's private key so an attacker cannot open
 * claim_attempts for a third-party wallet (P1 fix).
 *
 * Ed25519 verification uses Node 24's native WebCrypto — no extra dep.
 */

export type WalletProofErr =
  | 'bad_format'
  | 'bad_signature'
  | 'expired'
  | 'mints_mismatch'
  | 'wallet_mismatch';

export interface VerifyWalletProofInput {
  message: string;
  /** Base64-encoded 64-byte ed25519 signature. */
  signature: string;
  /** Base58-encoded Solana pubkey expected to have signed. */
  wallet: string;
  /** First 16 hex chars of sha256(sorted_mints.join(",")). */
  expectedMintsHashPrefix: string;
}

const CLAIM_LINE_RE = /^ClaimScan: prove control of ([1-9A-HJ-NP-Za-km-z]{32,44})$/;
const MINTS_LINE_RE = /^Mints: ([a-f0-9]{16})$/;
const ISSUED_LINE_RE = /^Issued: (.+)$/;

export async function verifyWalletProof(
  input: VerifyWalletProofInput
): Promise<WalletProofErr | null> {
  const { message, signature, wallet, expectedMintsHashPrefix } = input;

  const lines = message.split('\n');
  if (lines.length !== 4) return 'bad_format';

  const claimMatch = lines[0].match(CLAIM_LINE_RE);
  if (!claimMatch) return 'bad_format';
  if (claimMatch[1] !== wallet) return 'wallet_mismatch';

  const mintsMatch = lines[1].match(MINTS_LINE_RE);
  if (!mintsMatch) return 'bad_format';
  if (mintsMatch[1] !== expectedMintsHashPrefix) return 'mints_mismatch';

  const issuedMatch = lines[2].match(ISSUED_LINE_RE);
  if (!issuedMatch) return 'bad_format';
  const issuedAt = Date.parse(issuedMatch[1]);
  if (!Number.isFinite(issuedAt)) return 'bad_format';
  const skew = Date.now() - issuedAt;
  if (skew < -PROOF_CLOCK_SKEW_MS || skew > PROOF_MAX_AGE_MS) return 'expired';

  if (lines[3] !== PROOF_TTL_LINE) return 'bad_format';

  // Allocate fresh ArrayBuffers so WebCrypto receives clean BufferSource
  // values regardless of Node's pooled Buffer internals and TS's generic
  // `Uint8Array<ArrayBufferLike>` narrowing (TS 5.7+).
  let sigBuf: ArrayBuffer;
  try {
    const raw = Buffer.from(signature, 'base64');
    if (raw.length !== 64) return 'bad_signature';
    sigBuf = new ArrayBuffer(raw.length);
    new Uint8Array(sigBuf).set(raw);
  } catch {
    return 'bad_signature';
  }

  let pubkeyBuf: ArrayBuffer;
  try {
    const pub = new PublicKey(wallet).toBytes();
    pubkeyBuf = new ArrayBuffer(pub.length);
    new Uint8Array(pubkeyBuf).set(pub);
  } catch {
    return 'wallet_mismatch';
  }

  const encoded = new TextEncoder().encode(message);
  const msgBuf = new ArrayBuffer(encoded.length);
  new Uint8Array(msgBuf).set(encoded);

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      pubkeyBuf,
      { name: 'Ed25519' },
      false,
      ['verify']
    );
    const ok = await crypto.subtle.verify('Ed25519', key, sigBuf, msgBuf);
    return ok ? null : 'bad_signature';
  } catch {
    // importKey/verify can throw on malformed pubkey or unsupported alg —
    // both cases map to an invalid signature from the caller's perspective.
    return 'bad_signature';
  }
}
