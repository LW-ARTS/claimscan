import 'server-only';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  PUMP_PROGRAM_ID,
  PUMPSWAP_PROGRAM_ID,
} from '@/lib/constants';

// ═══════════════════════════════════════════════
// Multi-RPC Connection with Fallback & Retry
// ═══════════════════════════════════════════════

/**
 * Parse comma-separated RPC URLs from env.
 * Supports: SOLANA_RPC_URL=https://main.helius.com,https://backup.quicknode.com
 * Falls back to public mainnet RPC (rate-limited, not for production).
 */
const RPC_URLS: string[] = (() => {
  const envUrls = process.env.SOLANA_RPC_URL;
  if (!envUrls) {
    console.warn(
      '[solana] SOLANA_RPC_URL is not set — falling back to public RPC which is rate-limited and unreliable for production.'
    );
    return ['https://api.mainnet-beta.solana.com'];
  }
  return envUrls.split(',').map((u) => u.trim()).filter(Boolean);
})();

/** Connection pool — one per RPC URL. */
const connections: Connection[] = RPC_URLS.map(
  (url) => new Connection(url, { commitment: 'confirmed' })
);

/** Get the primary Solana connection (for SDKs that need a Connection object). */
export function getConnection(): Connection {
  return connections[0];
}

/** Track consecutive failures per RPC for adaptive ordering. */
const rpcFailures: number[] = new Array(connections.length).fill(0);

/** Per-attempt timeout inside withRpcFallback (prevents one slow RPC from blocking the chain). */
const PER_ATTEMPT_TIMEOUT_MS = 8_000;

/**
 * Race a promise against a timeout that REJECTS (not resolves).
 * This ensures the caller (withRpcFallback) moves to the next RPC on timeout
 * instead of silently returning a fallback value.
 */
function raceTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

/**
 * Execute an RPC call with automatic retry across all configured providers.
 * Each attempt has its own timeout so a single slow RPC doesn't block the
 * entire fallback chain. Tries RPCs in order of fewest recent failures.
 *
 * @param fn   - Async function that takes a Connection and returns a result.
 * @param label - Human-readable label for logging (e.g. 'getBalance').
 */
export async function withRpcFallback<T>(
  fn: (conn: Connection) => Promise<T>,
  label = 'rpc-call'
): Promise<T> {
  const order = connections
    .map((_, i) => i)
    .sort((a, b) => rpcFailures[a] - rpcFailures[b]);

  let lastError: Error | undefined;

  for (const idx of order) {
    try {
      const result = await raceTimeout(fn(connections[idx]), PER_ATTEMPT_TIMEOUT_MS, label);
      rpcFailures[idx] = Math.floor(rpcFailures[idx] * 0.5);
      return result;
    } catch (err) {
      rpcFailures[idx]++;
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `[solana] ${label} failed on RPC #${idx + 1}/${connections.length}: ${lastError.message}`
      );
    }
  }

  throw lastError ?? new Error(`[solana] ${label} failed on all ${connections.length} RPCs`);
}

// ═══════════════════════════════════════════════
// Program Public Keys & Well-Known Addresses
// ═══════════════════════════════════════════════

const PUMP_PROGRAM = new PublicKey(PUMP_PROGRAM_ID);
const PUMPSWAP_PROGRAM = new PublicKey(PUMPSWAP_PROGRAM_ID);

/** SPL Token program for ATA derivation. */
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
/** Associated Token Account program. */
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
/** Wrapped SOL (WSOL) mint address. */
const NATIVE_MINT = new PublicKey('So11111111111111111111111111111111111111112');

// ═══════════════════════════════════════════════
// PDA Derivation
// ═══════════════════════════════════════════════

/**
 * Derive Pump.fun creator vault PDA.
 * Seeds: ["creator-vault", creator_pubkey]
 */
export function deriveCreatorVault(creator: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('creator-vault'), creator.toBuffer()],
    PUMP_PROGRAM
  );
}

/**
 * Derive PumpSwap creator vault PDA.
 * Seeds: ["creator_vault", creator_pubkey]
 */
export function derivePumpSwapVault(creator: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('creator_vault'), creator.toBuffer()],
    PUMPSWAP_PROGRAM
  );
}

/**
 * Derive the Associated Token Account (ATA) for a given owner and mint.
 * Standard SPL ATA derivation without requiring @solana/spl-token.
 */
function deriveAta(owner: PublicKey, mint: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

// ═══════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════

/**
 * Rent-exempt minimum for a 0-byte account on Solana mainnet.
 * This is a protocol constant (890,880 lamports) that has not changed since
 * genesis. Hardcoding avoids 1-2 RPC round-trips per fee check.
 */
const RENT_EXEMPT_MINIMUM = 890_880n;

// ═══════════════════════════════════════════════
// Balance Reads
// ═══════════════════════════════════════════════

/**
 * Get unclaimed Pump.fun fees for a creator.
 * Unclaimed = vault SOL balance - rent exempt minimum.
 */
export async function getUnclaimedPumpFees(
  creator: PublicKey
): Promise<bigint> {
  const [vault] = deriveCreatorVault(creator);
  const balance = await withRpcFallback((c) => c.getBalance(vault), 'pump-balance');
  const balanceBig = BigInt(balance);
  return balanceBig > RENT_EXEMPT_MINIMUM ? balanceBig - RENT_EXEMPT_MINIMUM : 0n;
}

/**
 * Get unclaimed PumpSwap fees for a creator.
 * Checks both native SOL in the vault PDA and WSOL in the vault's ATA,
 * since PumpSwap may store creator fees in either location depending
 * on the protocol version.
 */
export async function getUnclaimedPumpSwapFees(
  creator: PublicKey
): Promise<bigint> {
  const [vault] = derivePumpSwapVault(creator);
  const wsolAta = deriveAta(vault, NATIVE_MINT);

  const [nativeBalance, wsolBalance] = await Promise.all([
    withRpcFallback((c) => c.getBalance(vault), 'pumpswap-balance'),
    // Missing ATA is expected (not all creators have WSOL fees).
    // Catch inside fn so withRpcFallback doesn't count it as an RPC failure.
    withRpcFallback(
      (c) => c.getTokenAccountBalance(wsolAta)
        .then((info) => BigInt(info.value.amount))
        .catch(() => 0n),
      'pumpswap-wsol'
    ).catch(() => 0n),
  ]);

  const nativeBig = BigInt(nativeBalance);
  const nativeUnclaimed = nativeBig > RENT_EXEMPT_MINIMUM ? nativeBig - RENT_EXEMPT_MINIMUM : 0n;

  return nativeUnclaimed + wsolBalance;
}

/**
 * Get SOL balance for any account.
 */
export async function getSolBalance(address: string): Promise<bigint> {
  const pubkey = new PublicKey(address);
  const balance = await withRpcFallback((c) => c.getBalance(pubkey), 'sol-balance');
  return BigInt(balance);
}

/**
 * Get SPL token balance for a given token account.
 */
export async function getTokenAccountBalance(
  tokenAccount: string
): Promise<bigint> {
  try {
    const pubkey = new PublicKey(tokenAccount);
    const info = await withRpcFallback(
      (c) => c.getTokenAccountBalance(pubkey), 'token-balance'
    );
    return BigInt(info.value.amount);
  } catch (err) {
    console.warn('[solana] Failed to read token account:', err instanceof Error ? err.message : err);
    return 0n;
  }
}

/**
 * Check if a Solana address is valid user address.
 * Rejects system program addresses and degenerate values.
 */
export function isValidSolanaAddress(address: string): boolean {
  try {
    if (address.length < 32 || address.length > 44) return false;
    const pubkey = new PublicKey(address);
    // Reject all-zero (system program) and obviously invalid addresses
    if (pubkey.equals(PublicKey.default)) return false;
    if (pubkey.toBase58() === '11111111111111111111111111111111') return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Format lamports to SOL string with full precision.
 * Uses integer division + remainder to avoid Number precision loss.
 */
export function lamportsToSol(lamports: bigint): string {
  if (lamports === 0n) return '0';
  const LAMPORTS_PER_SOL = 1_000_000_000n;
  const whole = lamports / LAMPORTS_PER_SOL;
  const remainder = lamports % LAMPORTS_PER_SOL;
  if (remainder === 0n) return `${whole}`;
  const fractional = remainder.toString().padStart(9, '0').replace(/0+$/, '');
  return `${whole}.${fractional}`;
}
