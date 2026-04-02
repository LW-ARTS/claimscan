import 'server-only';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  PUMP_PROGRAM_ID,
  PUMPSWAP_PROGRAM_ID,
  PUMP_FEES_PROGRAM_ID,
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

/** Get raw RPC URLs for direct HTTP calls (e.g. Helius getProgramAccountsV2). */
export function getRpcUrls(): readonly string[] {
  return RPC_URLS;
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
 * @param fn     - Async function that takes a Connection and returns a result.
 * @param label  - Human-readable label for logging (e.g. 'getBalance').
 * @param signal - Optional AbortSignal from the route-level timeout.
 *                 When aborted, skips remaining RPC attempts immediately.
 */
export async function withRpcFallback<T>(
  fn: (conn: Connection) => Promise<T>,
  label = 'rpc-call',
  signal?: AbortSignal
): Promise<T> {
  const order = connections
    .map((_, i) => i)
    .sort((a, b) => rpcFailures[a] - rpcFailures[b]);

  let lastError: Error | undefined;

  for (const idx of order) {
    // Bail immediately if the caller's budget expired
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    }
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
const PUMP_FEES_PROGRAM = new PublicKey(PUMP_FEES_PROGRAM_ID);

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

  // PumpSwap stores creator fees exclusively in the WSOL ATA, not native SOL.
  // Only catch "account not found" (expected for wallets with no WSOL ATA) —
  // let network errors propagate to withRpcFallback for retry on backup RPC.
  const wsolBalance = await withRpcFallback(
    (c) => c.getTokenAccountBalance(wsolAta)
      .then((info) => BigInt(info.value.amount))
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('could not find account') || msg.includes('Invalid param') || msg.includes('AccountNotFound')) {
          return 0n;
        }
        throw err;
      }),
    'pumpswap-wsol'
  ).catch((err) => {
    console.warn('[solana] getUnclaimedPumpSwapFees RPC failed:', err instanceof Error ? err.message : err);
    return 0n;
  });

  return wsolBalance;
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

// ═══════════════════════════════════════════════
// Metaplex Token Metadata
// ═══════════════════════════════════════════════

/** Metaplex Token Metadata program ID. */
const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'
);

/**
 * Derive Metaplex metadata PDA for a given mint.
 * Seeds: ["metadata", TOKEN_METADATA_PROGRAM_ID, mint]
 */
function deriveMetadataPda(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  return pda;
}

/**
 * Parse a Borsh string from metadata account data at the given offset.
 * Layout: 4-byte LE length prefix + raw bytes (null-padded).
 * Returns [parsedString, nextOffset].
 */
function parseBorshString(
  data: Buffer,
  offset: number,
  maxBytes: number
): [string, number] {
  if (offset + 4 > data.length) return ['', offset + 4 + maxBytes];
  const len = data.readUInt32LE(offset);
  const strLen = Math.min(len, maxBytes, data.length - offset - 4);
  const raw = data.subarray(offset + 4, offset + 4 + strLen);
  // Strip null bytes and trim
  const str = Buffer.from(raw).toString('utf8').replace(/\0/g, '').trim();
  return [str, offset + 4 + maxBytes];
}

export interface TokenMetadata {
  mint: string;
  name: string;
  symbol: string;
}

/**
 * Fetch on-chain Metaplex token metadata for a batch of mint addresses.
 * Uses getMultipleAccountsInfo (up to 100 per RPC call) and parses
 * name/symbol from the raw account data — no Metaplex SDK needed.
 *
 * Returns a Map<mintAddress, TokenMetadata> for found tokens.
 */
export async function fetchTokenMetadataBatch(
  mints: string[]
): Promise<Map<string, TokenMetadata>> {
  const result = new Map<string, TokenMetadata>();
  if (mints.length === 0) return result;

  // Filter out invalid addresses to prevent PublicKey constructor from throwing
  const validMints = mints.filter(isValidSolanaAddress);
  if (validMints.length === 0) return result;

  // Derive metadata PDAs
  const mintKeys = validMints.map((m) => new PublicKey(m));
  const pdas = mintKeys.map(deriveMetadataPda);

  // Batch in groups of 100 (RPC limit for getMultipleAccountsInfo)
  const BATCH_SIZE = 100;
  for (let i = 0; i < pdas.length; i += BATCH_SIZE) {
    const batchPdas = pdas.slice(i, i + BATCH_SIZE);
    const batchMints = validMints.slice(i, i + BATCH_SIZE);

    try {
      const accounts = await withRpcFallback(
        (c) => c.getMultipleAccountsInfo(batchPdas),
        'token-metadata'
      );

      for (let j = 0; j < accounts.length; j++) {
        const account = accounts[j];
        if (!account?.data) continue;

        const data = Buffer.from(account.data);
        // Metadata account layout:
        // offset 0:   key (1 byte)
        // offset 1:   update_authority (32 bytes)
        // offset 33:  mint (32 bytes)
        // offset 65:  name (Borsh string: 4-byte len + 32 bytes padded)
        // offset 101: symbol (Borsh string: 4-byte len + 10 bytes padded)
        if (data.length < 115) continue;

        const [name, nameEnd] = parseBorshString(data, 65, 32);
        const [symbol] = parseBorshString(data, nameEnd, 10);

        if (symbol || name) {
          result.set(batchMints[j], { mint: batchMints[j], name, symbol });
        }
      }
    } catch (err) {
      console.warn(
        '[solana] Failed to fetch token metadata batch:',
        err instanceof Error ? err.message : err
      );
    }
  }

  return result;
}

// ═══════════════════════════════════════════════
// Pump.fun Fee Model Helpers (Jan-Mar 2026)
// ═══════════════════════════════════════════════

/**
 * Derive BondingCurve PDA for a token mint.
 * Seeds: ["bonding-curve", mint]
 */
export function deriveBondingCurve(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), mint.toBuffer()],
    PUMP_PROGRAM
  );
}

/**
 * Derive SharingConfig PDA for a token mint.
 * Seeds: ["sharing-config", mint] on Fee Program.
 */
export function deriveSharingConfig(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('sharing-config'), mint.toBuffer()],
    PUMP_FEES_PROGRAM
  );
}

/**
 * BondingCurve account layout offsets (after 8-byte Anchor discriminator).
 * Verified against mainnet account 4m3TmChEPPunVUvpph71DXjSt3UMxxk8813a1U3SZash.
 * Total size: 150 bytes.
 *
 * [0-7]   discriminator
 * [8-47]  5x u64 (reserves + total_supply)
 * [48]    complete (bool)
 * [49-80] creator (Pubkey, 32 bytes)
 * [81]    is_mayhem_mode (bool)
 * [82]    is_cashback_coin (bool)
 * [83-149] remaining fields
 */
const BC_OFFSET_COMPLETE = 48;
const BC_OFFSET_CREATOR = 49;
const BC_OFFSET_IS_CASHBACK = 82;

export interface BondingCurveInfo {
  isCashbackCoin: boolean;
  creator: string;
  complete: boolean;
}

/**
 * Read BondingCurve account to check if token is a cashback coin.
 * Returns null if account doesn't exist (token may have fully migrated).
 */
export async function readBondingCurve(mint: PublicKey): Promise<BondingCurveInfo | null> {
  const [pda] = deriveBondingCurve(mint);
  try {
    const info = await withRpcFallback(
      (c) => c.getAccountInfo(pda),
      'bonding-curve-read'
    );
    // Minimum 83 bytes: discriminator(8) + 5*u64(40) + complete(1) + creator(32) + 2 bools
    if (!info?.data || info.data.length < 83) return null;
    const data = Buffer.from(info.data);
    return {
      complete: data[BC_OFFSET_COMPLETE] === 1,
      creator: new PublicKey(data.subarray(BC_OFFSET_CREATOR, BC_OFFSET_CREATOR + 32)).toBase58(),
      isCashbackCoin: data.length > BC_OFFSET_IS_CASHBACK ? data[BC_OFFSET_IS_CASHBACK] === 1 : false,
    };
  } catch {
    return null;
  }
}

/**
 * SharingConfig account layout (after 8-byte Anchor discriminator):
 * bump(u8), version(u8), status(u8 enum), mint(Pubkey 32), admin(Pubkey 32),
 * admin_revoked(bool), shareholders(Vec<Shareholder>)
 * Shareholder = address(Pubkey 32) + share_bps(u16)
 */
const SC_OFFSET_BUMP = 8;
const SC_OFFSET_STATUS = SC_OFFSET_BUMP + 2; // skip bump + version
const SC_OFFSET_MINT = SC_OFFSET_STATUS + 1;
const SC_OFFSET_ADMIN = SC_OFFSET_MINT + 32;
const SC_OFFSET_ADMIN_REVOKED = SC_OFFSET_ADMIN + 32;
const SC_OFFSET_SHAREHOLDERS_LEN = SC_OFFSET_ADMIN_REVOKED + 1;
const SHAREHOLDER_SIZE = 32 + 2; // Pubkey + u16

export interface SharingConfigInfo {
  adminRevoked: boolean;
  status: number; // 0 = Active, 1 = Paused
  shareholders: Array<{ address: string; shareBps: number }>;
}

/**
 * Read SharingConfig account for a token mint.
 * Returns null if no sharing config exists (single creator, no splits).
 */
export async function readSharingConfig(mint: PublicKey): Promise<SharingConfigInfo | null> {
  const [pda] = deriveSharingConfig(mint);
  try {
    const info = await withRpcFallback(
      (c) => c.getAccountInfo(pda),
      'sharing-config-read'
    );
    if (!info?.data || info.data.length < SC_OFFSET_SHAREHOLDERS_LEN + 4) return null;
    const data = Buffer.from(info.data);

    // Safety check: verify the mint field matches the expected mint.
    // If it doesn't, our estimated layout offsets are wrong — bail out.
    const parsedMint = new PublicKey(data.subarray(SC_OFFSET_MINT, SC_OFFSET_MINT + 32));
    if (!parsedMint.equals(mint)) return null;

    const adminRevoked = data[SC_OFFSET_ADMIN_REVOKED] === 1;
    const status = data[SC_OFFSET_STATUS];

    // Read shareholders Vec: 4-byte LE length prefix then N * SHAREHOLDER_SIZE
    const shareholderCount = data.readUInt32LE(SC_OFFSET_SHAREHOLDERS_LEN);
    const shareholders: Array<{ address: string; shareBps: number }> = [];

    const dataStart = SC_OFFSET_SHAREHOLDERS_LEN + 4;
    for (let i = 0; i < shareholderCount; i++) {
      const offset = dataStart + i * SHAREHOLDER_SIZE;
      if (offset + SHAREHOLDER_SIZE > data.length) break;
      const address = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
      const shareBps = data.readUInt16LE(offset + 32);
      shareholders.push({ address, shareBps });
    }

    return { adminRevoked, status, shareholders };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════
// Raydium Fee Key NFT Detection
// ═══════════════════════════════════════════════
// Raydium LaunchLab has 2 fee phases:
// 1. Bonding curve: vault PDA [creator, mintB] — no NFT needed, creator signs.
// 2. Post-graduation (Burn & Earn): Fee Key NFT minted during migration.
//    CLMM PersonalPosition PDA: ["position", nft_mint, bump]
//    NFT owner can claim LP fees. If transferred/burned, fees lost permanently.
//
// The current adapter only tracks bonding curve fees (phase 1).
// This helper is for future use when we add post-graduation LP fee tracking.

/** Raydium CLMM program ID. */
const RAYDIUM_CLMM_PROGRAM = new PublicKey('CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK');

/**
 * Check if a wallet holds a Raydium CLMM position NFT for a specific pool.
 * Uses getTokenAccountsByOwner to find NFTs, then checks PersonalPosition PDAs.
 *
 * @param wallet - Creator wallet address
 * @param poolId - CLMM pool address (the graduated token's pool)
 * @returns true if wallet holds a position NFT for this pool, false otherwise
 */
export async function hasRaydiumFeeKeyNft(
  wallet: PublicKey,
  poolId: PublicKey
): Promise<boolean> {
  try {
    // Get all token accounts owned by the wallet with amount = 1 (NFTs)
    const accounts = await withRpcFallback(
      (c) => c.getParsedTokenAccountsByOwner(wallet, {
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      }),
      'raydium-nft-check'
    );

    // Filter for NFTs (amount = 1, decimals = 0)
    const nftMints: PublicKey[] = [];
    for (const acc of accounts.value) {
      const parsed = acc.account.data.parsed?.info;
      if (
        parsed &&
        parsed.tokenAmount?.uiAmount === 1 &&
        parsed.tokenAmount?.decimals === 0
      ) {
        nftMints.push(new PublicKey(parsed.mint));
      }
    }

    if (nftMints.length === 0) return false;

    // Check each NFT mint against PersonalPosition PDA
    // PDA: ["position", nft_mint] on CLMM program
    const POSITION_SEED = 'position';
    const positionPdas = nftMints.map((mint) => {
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from(POSITION_SEED), mint.toBuffer()],
        RAYDIUM_CLMM_PROGRAM
      );
      return pda;
    });

    // Batch fetch position accounts (max 100 per call)
    const BATCH_SIZE = 100;
    for (let i = 0; i < positionPdas.length; i += BATCH_SIZE) {
      const batch = positionPdas.slice(i, i + BATCH_SIZE);
      const infos = await withRpcFallback(
        (c) => c.getMultipleAccountsInfo(batch),
        'raydium-position-check'
      );

      for (const info of infos) {
        if (!info?.data || info.data.length < 73) continue;
        const data = Buffer.from(info.data);
        // PersonalPosition layout (after 8-byte discriminator):
        // bump(1) + nft_mint(32) + pool_id(32) = offset 41 for pool_id
        const accountPoolId = new PublicKey(data.subarray(41, 73));
        if (accountPoolId.equals(poolId)) {
          return true; // Found matching position NFT
        }
      }
    }

    return false;
  } catch {
    // On any error, assume NFT exists (don't show false warning)
    return true;
  }
}

