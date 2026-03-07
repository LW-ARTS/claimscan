import 'server-only';
import { PublicKey } from '@solana/web3.js';
import {
  PROGRAM_IDS,
  BONDING_CURVE_OFFSETS,
  POOL_OFFSETS,
  getBondingCurveState,
} from '@coinbarrel/sdk';
import { getConnection, isValidSolanaAddress, withRpcFallback } from '@/lib/chains/solana';
import type { IdentityProvider } from '@/lib/supabase/types';
import type {
  PlatformAdapter,
  ResolvedWallet,
  CreatorToken,
  TokenFee,
  ClaimEvent,
} from './types';

// ═══════════════════════════════════════════════
// Coinbarrel Adapter
//
// Coinbarrel uses Meteora DAMM V2 pools internally.
// We discover creator tokens via getProgramAccounts
// with memcmp on CREATOR_FEE_RECIPIENT, then read
// accumulated creator fees from pool accounts.
// ═══════════════════════════════════════════════

const COINBARREL_PROGRAM = new PublicKey(PROGRAM_IDS.mainnet);

/** Per-call timeout for GPA queries. */
const GPA_TIMEOUT_MS = 20_000;

/**
 * Read a u64 (little-endian) from a Buffer at the given offset.
 */
function readU64LE(data: Buffer, offset: number): bigint {
  // Read as two u32s to avoid BigInt constructor overhead
  const lo = data.readUInt32LE(offset);
  const hi = data.readUInt32LE(offset + 4);
  return BigInt(lo) + (BigInt(hi) << 32n);
}

/**
 * Read a PublicKey (32 bytes) from a Buffer at the given offset.
 */
function readPubkey(data: Buffer, offset: number): PublicKey {
  return new PublicKey(data.subarray(offset, offset + 32));
}

/**
 * Race a promise against a timeout.
 */
function raceTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${GPA_TIMEOUT_MS}ms`)),
      GPA_TIMEOUT_MS
    );
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

/**
 * Find all bonding curve accounts where CREATOR_FEE_RECIPIENT = wallet.
 * Returns tokenMint for each curve.
 */
async function findBondingCurvesByCreator(
  wallet: PublicKey
): Promise<{ tokenMint: PublicKey; accumulatedHolderRewards: bigint }[]> {
  const conn = getConnection();

  const accounts = await raceTimeout(
    conn.getProgramAccounts(COINBARREL_PROGRAM, {
      filters: [
        { dataSize: 241 }, // bonding curve account size (or 242 for v2 with launch_tier)
        {
          memcmp: {
            offset: BONDING_CURVE_OFFSETS.CREATOR_FEE_RECIPIENT,
            bytes: wallet.toBase58(),
          },
        },
      ],
    }),
    'coinbarrel-curves-gpa'
  );

  // Also try v2 size (242 bytes)
  let v2Accounts: typeof accounts = [];
  try {
    v2Accounts = await raceTimeout(
      conn.getProgramAccounts(COINBARREL_PROGRAM, {
        filters: [
          { dataSize: 242 },
          {
            memcmp: {
              offset: BONDING_CURVE_OFFSETS.CREATOR_FEE_RECIPIENT,
              bytes: wallet.toBase58(),
            },
          },
        ],
      }),
      'coinbarrel-curves-v2-gpa'
    );
  } catch {
    // v2 query failed — not critical
  }

  const allAccounts = [...accounts, ...v2Accounts];
  const results: { tokenMint: PublicKey; accumulatedHolderRewards: bigint }[] = [];

  for (const { account } of allAccounts) {
    try {
      const tokenMint = readPubkey(account.data as Buffer, BONDING_CURVE_OFFSETS.TOKEN_MINT);
      const rewards = readU64LE(account.data as Buffer, BONDING_CURVE_OFFSETS.ACCUMULATED_HOLDER_REWARDS_SOL);
      results.push({ tokenMint, accumulatedHolderRewards: rewards });
    } catch {
      // Skip malformed accounts
    }
  }

  return results;
}

/**
 * Find all pool accounts where CREATOR_FEE_RECIPIENT = wallet.
 * Returns tokenMint and accumulated creator fees.
 */
async function findPoolsByCreator(
  wallet: PublicKey
): Promise<{ tokenMint: PublicKey; creatorFeesA: bigint; creatorFeesB: bigint }[]> {
  const conn = getConnection();

  // Pool accounts have CREATOR_FEE_RECIPIENT at offset 245
  // Pool minimum size is 317 bytes (from getPoolState check of 269, plus reward fields)
  const accounts = await raceTimeout(
    conn.getProgramAccounts(COINBARREL_PROGRAM, {
      filters: [
        {
          memcmp: {
            offset: POOL_OFFSETS.CREATOR_FEE_RECIPIENT,
            bytes: wallet.toBase58(),
          },
        },
      ],
    }),
    'coinbarrel-pools-gpa'
  );

  const results: { tokenMint: PublicKey; creatorFeesA: bigint; creatorFeesB: bigint }[] = [];

  for (const { account } of accounts) {
    try {
      const data = account.data as Buffer;
      // Only process if account is large enough to be a pool
      if (data.length < 293) continue;

      const tokenMint = readPubkey(data, POOL_OFFSETS.TOKEN_A_MINT);
      const creatorFeesA = readU64LE(data, POOL_OFFSETS.ACCUMULATED_CREATOR_TRADER_FEES_A);
      const creatorFeesB = readU64LE(data, POOL_OFFSETS.ACCUMULATED_CREATOR_TRADER_FEES_B);
      results.push({ tokenMint, creatorFeesA, creatorFeesB });
    } catch {
      // Skip malformed accounts
    }
  }

  return results;
}

export const coinbarrelAdapter: PlatformAdapter = {
  platform: 'coinbarrel',
  chain: 'sol',
  supportsIdentityResolution: false,
  supportsLiveFees: true,
  supportsHandleBasedFees: false,

  async resolveIdentity(
    _handle: string,
    _provider: IdentityProvider
  ): Promise<ResolvedWallet[]> {
    return [];
  },

  async getFeesByHandle(): Promise<TokenFee[]> {
    return [];
  },

  async getCreatorTokens(wallet: string): Promise<CreatorToken[]> {
    if (!isValidSolanaAddress(wallet)) return [];

    try {
      const creatorPk = new PublicKey(wallet);
      const curves = await findBondingCurvesByCreator(creatorPk);

      return curves.map((c) => ({
        tokenAddress: c.tokenMint.toBase58(),
        chain: 'sol' as const,
        platform: 'coinbarrel' as const,
        symbol: null,
        name: null,
        imageUrl: null,
      }));
    } catch (err) {
      console.warn(
        '[coinbarrel] getCreatorTokens failed:',
        err instanceof Error ? err.message : err
      );
      return [];
    }
  },

  async getHistoricalFees(wallet: string): Promise<TokenFee[]> {
    // Same as live fees — onchain data is the source of truth
    return this.getLiveUnclaimedFees(wallet);
  },

  async getLiveUnclaimedFees(wallet: string): Promise<TokenFee[]> {
    if (!isValidSolanaAddress(wallet)) return [];

    try {
      const creatorPk = new PublicKey(wallet);
      const fees: TokenFee[] = [];

      // Query bonding curves and pools in parallel
      const [curves, pools] = await Promise.allSettled([
        findBondingCurvesByCreator(creatorPk),
        findPoolsByCreator(creatorPk),
      ]);

      // Track pool token mints to avoid double-counting
      const poolTokenMints = new Set<string>();

      // Process pools (migrated tokens) — these have explicit creator fee tracking
      if (pools.status === 'fulfilled') {
        for (const pool of pools.value) {
          const mintAddr = pool.tokenMint.toBase58();
          poolTokenMints.add(mintAddr);

          // creatorFeesB is SOL (quote token) fees accumulated for creator
          if (pool.creatorFeesB > 0n) {
            fees.push({
              tokenAddress: mintAddr,
              tokenSymbol: 'SOL',
              chain: 'sol',
              platform: 'coinbarrel',
              totalEarned: '0',
              totalClaimed: '0',
              totalUnclaimed: pool.creatorFeesB.toString(),
              totalEarnedUsd: null,
              royaltyBps: null,
            });
          }
        }
      }

      // Process bonding curves (pre-migration tokens)
      // Only if they haven't already been counted via pools
      if (curves.status === 'fulfilled') {
        for (const curve of curves.value) {
          const mintAddr = curve.tokenMint.toBase58();
          // Skip if already processed via pool
          if (poolTokenMints.has(mintAddr)) continue;

          // For bonding curves, we report accumulated holder rewards as an indicator.
          // Creator-specific fees on bonding curves are harder to isolate without
          // on-chain claim history, so we check the bonding SOL escrow.
          const conn = getConnection();
          try {
            const curveState = await getBondingCurveState(
              conn,
              curve.tokenMint,
              COINBARREL_PROGRAM
            );
            if (!curveState) continue;

            // The SOL escrow holds all virtual SOL including creator fees.
            // We can't precisely isolate creator fees from the curve state alone,
            // so we report the bonding curve as having activity (non-zero rewards).
            if (curve.accumulatedHolderRewards > 0n) {
              fees.push({
                tokenAddress: mintAddr,
                tokenSymbol: 'SOL',
                chain: 'sol',
                platform: 'coinbarrel',
                totalEarned: '0',
                totalClaimed: '0',
                // Report holder rewards as an approximation for curve-phase tokens
                totalUnclaimed: curve.accumulatedHolderRewards.toString(),
                totalEarnedUsd: null,
                royaltyBps: null,
              });
            }
          } catch {
            // Skip individual curve errors
          }
        }
      }

      return fees;
    } catch (err) {
      console.warn(
        '[coinbarrel] getLiveUnclaimedFees failed:',
        err instanceof Error ? err.message : err
      );
      return [];
    }
  },

  async getClaimHistory(_wallet: string): Promise<ClaimEvent[]> {
    return [];
  },
};
