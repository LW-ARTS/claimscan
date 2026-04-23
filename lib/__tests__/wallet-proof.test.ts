import { describe, it, expect } from 'vitest';
import nacl from 'tweetnacl';
import { PublicKey } from '@solana/web3.js';

// Mock server-only (not installed outside Next.js)
import { vi } from 'vitest';
vi.mock('server-only', () => ({}));

import { verifyWalletProof } from '@/lib/claim/wallet-proof';
import { buildProofMessage, computeMintsHashPrefix, PROOF_MAX_AGE_MS } from '@/lib/claim/wallet-proof-msg';

function signMessage(message: string, secretKey: Uint8Array): string {
  const msgBytes = new TextEncoder().encode(message);
  const sig = nacl.sign.detached(msgBytes, secretKey);
  return Buffer.from(sig).toString('base64');
}

describe('wallet-proof SIWS', () => {
  const keypair = nacl.sign.keyPair();
  const wallet = new PublicKey(keypair.publicKey).toBase58();
  const mints = ['So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'];

  it('accepts a valid, fresh signature', async () => {
    const prefix = await computeMintsHashPrefix(mints);
    const msg = buildProofMessage({ wallet, mintsHashPrefix: prefix, issuedAt: new Date() });
    const sig = signMessage(msg, keypair.secretKey);
    expect(await verifyWalletProof({ message: msg, signature: sig, wallet, expectedMintsHashPrefix: prefix })).toBe(null);
  });

  it('rejects when the mints hash prefix does not match the payload', async () => {
    const prefix = await computeMintsHashPrefix(mints);
    const msg = buildProofMessage({ wallet, mintsHashPrefix: prefix, issuedAt: new Date() });
    const sig = signMessage(msg, keypair.secretKey);
    const otherMints = [...mints, 'BonkNFT5paLXpZsbNjE5ozUxM4J5j1M5SA2g4Gn9y5eB'];
    const wrongPrefix = await computeMintsHashPrefix(otherMints);
    expect(await verifyWalletProof({ message: msg, signature: sig, wallet, expectedMintsHashPrefix: wrongPrefix })).toBe('mints_mismatch');
  });

  it('rejects when the message wallet does not match the claimed wallet', async () => {
    const other = nacl.sign.keyPair();
    const otherWallet = new PublicKey(other.publicKey).toBase58();
    const prefix = await computeMintsHashPrefix(mints);
    // Message says wallet=A but we claim wallet=B
    const msg = buildProofMessage({ wallet: otherWallet, mintsHashPrefix: prefix, issuedAt: new Date() });
    const sig = signMessage(msg, other.secretKey);
    expect(await verifyWalletProof({ message: msg, signature: sig, wallet, expectedMintsHashPrefix: prefix })).toBe('wallet_mismatch');
  });

  it('rejects a signature from a different keypair', async () => {
    const other = nacl.sign.keyPair();
    const prefix = await computeMintsHashPrefix(mints);
    const msg = buildProofMessage({ wallet, mintsHashPrefix: prefix, issuedAt: new Date() });
    // Sign with OTHER private key — claims to be `wallet` but signer is different
    const sig = signMessage(msg, other.secretKey);
    expect(await verifyWalletProof({ message: msg, signature: sig, wallet, expectedMintsHashPrefix: prefix })).toBe('bad_signature');
  });

  it('rejects when format passes but the signed body has been tampered (Ed25519 verify fails)', async () => {
    // Tamper the Issued timestamp post-sign — format still parses, TTL still
    // valid, wallet + mints prefix still match, so the code reaches the
    // WebCrypto verify step and ed25519 must reject.
    const prefix = await computeMintsHashPrefix(mints);
    const signedMsg = buildProofMessage({ wallet, mintsHashPrefix: prefix, issuedAt: new Date() });
    const sig = signMessage(signedMsg, keypair.secretKey);
    const tamperedMsg = buildProofMessage({
      wallet,
      mintsHashPrefix: prefix,
      issuedAt: new Date(Date.now() + 1000), // +1s, still within TTL
    });
    expect(tamperedMsg).not.toBe(signedMsg);
    expect(await verifyWalletProof({ message: tamperedMsg, signature: sig, wallet, expectedMintsHashPrefix: prefix })).toBe('bad_signature');
  });

  it('rejects a malformed message (wrong line structure)', async () => {
    const prefix = await computeMintsHashPrefix(mints);
    const msg = buildProofMessage({ wallet, mintsHashPrefix: prefix, issuedAt: new Date() });
    const sig = signMessage(msg, keypair.secretKey);
    const tampered = msg.replace('prove control of', 'prove control of ');
    expect(await verifyWalletProof({ message: tampered, signature: sig, wallet, expectedMintsHashPrefix: prefix })).toBe('bad_format');
  });

  it('rejects an expired proof (older than PROOF_MAX_AGE_MS)', async () => {
    const prefix = await computeMintsHashPrefix(mints);
    const staleDate = new Date(Date.now() - (PROOF_MAX_AGE_MS + 60_000));
    const msg = buildProofMessage({ wallet, mintsHashPrefix: prefix, issuedAt: staleDate });
    const sig = signMessage(msg, keypair.secretKey);
    expect(await verifyWalletProof({ message: msg, signature: sig, wallet, expectedMintsHashPrefix: prefix })).toBe('expired');
  });

  it('rejects a proof dated far in the future (beyond clock skew)', async () => {
    const prefix = await computeMintsHashPrefix(mints);
    const futureDate = new Date(Date.now() + 5 * 60_000);
    const msg = buildProofMessage({ wallet, mintsHashPrefix: prefix, issuedAt: futureDate });
    const sig = signMessage(msg, keypair.secretKey);
    expect(await verifyWalletProof({ message: msg, signature: sig, wallet, expectedMintsHashPrefix: prefix })).toBe('expired');
  });

  it('rejects a malformed base64 signature', async () => {
    const prefix = await computeMintsHashPrefix(mints);
    const msg = buildProofMessage({ wallet, mintsHashPrefix: prefix, issuedAt: new Date() });
    expect(await verifyWalletProof({ message: msg, signature: 'not-valid-base64!!!', wallet, expectedMintsHashPrefix: prefix })).toBe('bad_signature');
  });

  it('rejects a signature of the wrong length', async () => {
    const prefix = await computeMintsHashPrefix(mints);
    const msg = buildProofMessage({ wallet, mintsHashPrefix: prefix, issuedAt: new Date() });
    // 32-byte signature instead of 64
    const shortSig = Buffer.from(new Uint8Array(32)).toString('base64');
    expect(await verifyWalletProof({ message: msg, signature: shortSig, wallet, expectedMintsHashPrefix: prefix })).toBe('bad_signature');
  });

  it('rejects a message with the wrong number of lines', async () => {
    const prefix = await computeMintsHashPrefix(mints);
    const msg = `ClaimScan: prove control of ${wallet}\nMints: ${prefix}`;
    const sig = signMessage(msg, keypair.secretKey);
    expect(await verifyWalletProof({ message: msg, signature: sig, wallet, expectedMintsHashPrefix: prefix })).toBe('bad_format');
  });

  it('computeMintsHashPrefix is order-independent', async () => {
    const a = await computeMintsHashPrefix(['a', 'b', 'c']);
    const b = await computeMintsHashPrefix(['c', 'b', 'a']);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{16}$/);
  });

  it('computeMintsHashPrefix of a chunk differs from its full set (multi-chunk regression guard)', async () => {
    // Regression guard for the HIGH finding from the Apr-2026 review:
    // server must hash the FULL signed set, not a per-request chunk.
    const full = Array.from({ length: 25 }, (_, i) => `mint${i.toString().padStart(2, '0')}`);
    const chunk = full.slice(0, 10);
    const fullPrefix = await computeMintsHashPrefix(full);
    const chunkPrefix = await computeMintsHashPrefix(chunk);
    expect(fullPrefix).not.toBe(chunkPrefix);
  });
});
