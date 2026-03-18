import 'server-only';
import { PublicKey } from '@solana/web3.js';
import {
  PROGRAM_IDS,
  BONDING_CURVE_OFFSETS,
  POOL_OFFSETS,
} from '@coinbarrel/sdk';
import { isValidSolanaAddress, withRpcFallback } from '@/lib/chains/solana';
import { fetchVaultClaimTotal } from '@/lib/helius/transactions';
import { getCachedTokenAddresses } from './cached-tokens';
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

/** Known bonding curve account sizes: v1 (241 bytes), v2 with launch_tier (242 bytes). */
const BONDING_CURVE_MIN_SIZE = 241;
const BONDING_CURVE_MAX_SIZE = 242;

/**
 * Find all bonding curve accounts where CREATOR_FEE_RECIPIENT = wallet.
 * Single GPA query without dataSize filter — validates account size client-side.
 * This avoids two separate RPC round-trips for v1 (241) and v2 (242) accounts.
 */
async function findBondingCurvesByCreator(
  wallet: PublicKey,
  signal?: AbortSignal
): Promise<{ tokenMint: PublicKey; accumulatedHolderRewards: bigint }[]> {
  const accounts = await raceTimeout(
    withRpcFallback(
      (conn) => conn.getProgramAccounts(COINBARREL_PROGRAM, {
        filters: [
          {
            memcmp: {
              offset: BONDING_CURVE_OFFSETS.CREATOR_FEE_RECIPIENT,
              bytes: wallet.toBase58(),
            },
          },
        ],
      }),
      'coinbarrel-curves-gpa',
      signal
    ),
    'coinbarrel-curves-gpa'
  );

  const results: { tokenMint: PublicKey; accumulatedHolderRewards: bigint }[] = [];

  for (const { account } of accounts) {
    try {
      const data = account.data as Buffer;
      // Client-side size validation: only process known bonding curve sizes
      if (data.length < BONDING_CURVE_MIN_SIZE || data.length > BONDING_CURVE_MAX_SIZE) continue;

      const tokenMint = readPubkey(data, BONDING_CURVE_OFFSETS.TOKEN_MINT);
      const rewards = readU64LE(data, BONDING_CURVE_OFFSETS.ACCUMULATED_HOLDER_REWARDS_SOL);
      results.push({ tokenMint, accumulatedHolderRewards: rewards });
    } catch (err) {
      console.warn('[coinbarrel] malformed bonding curve account:', err instanceof Error ? err.message : err);
    }
  }

  return results;
}

/**
 * Find all pool accounts where CREATOR_FEE_RECIPIENT = wallet.
 * Returns tokenMint and accumulated creator fees.
 */
async function findPoolsByCreator(
  wallet: PublicKey,
  signal?: AbortSignal
): Promise<{ poolAddress: string; tokenMint: PublicKey; creatorFeesA: bigint; creatorFeesB: bigint }[]> {
  // Pool accounts have CREATOR_FEE_RECIPIENT at offset 245
  // Pool minimum size is 317 bytes (from getPoolState check of 269, plus reward fields)
  const accounts = await raceTimeout(
    withRpcFallback(
      (conn) => conn.getProgramAccounts(COINBARREL_PROGRAM, {
        filters: [
          {
            memcmp: {
              offset: POOL_OFFSETS.CREATOR_FEE_RECIPIENT,
              bytes: wallet.toBase58(),
            },
          },
        ],
      }),
      'coinbarrel-pools-gpa',
      signal
    ),
    'coinbarrel-pools-gpa'
  );

  const results: { poolAddress: string; tokenMint: PublicKey; creatorFeesA: bigint; creatorFeesB: bigint }[] = [];

  for (const { pubkey, account } of accounts) {
    try {
      const data = account.data as Buffer;
      // Only process if account is large enough to be a pool
      if (data.length < 293) continue;

      const tokenMint = readPubkey(data, POOL_OFFSETS.TOKEN_A_MINT);
      const creatorFeesA = readU64LE(data, POOL_OFFSETS.ACCUMULATED_CREATOR_TRADER_FEES_A);
      const creatorFeesB = readU64LE(data, POOL_OFFSETS.ACCUMULATED_CREATOR_TRADER_FEES_B);
      results.push({ poolAddress: pubkey.toBase58(), tokenMint, creatorFeesA, creatorFeesB });
    } catch (err) {
      console.warn('[coinbarrel] malformed pool account:', err instanceof Error ? err.message : err);
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
  historicalCoversLive: true,

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
      // DB-first: use cached token addresses from cron to skip expensive GPA
      const cached = await getCachedTokenAddresses(wallet, 'coinbarrel', 'sol');
      if (cached) {
        return cached.map((addr) => ({
          tokenAddress: addr,
          chain: 'sol' as const,
          platform: 'coinbarrel' as const,
          symbol: null,
          name: null,
          imageUrl: null,
        }));
      }

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

  async getLiveUnclaimedFees(wallet: string, signal?: AbortSignal): Promise<TokenFee[]> {
    if (!isValidSolanaAddress(wallet)) return [];

    try {
      const creatorPk = new PublicKey(wallet);
      const fees: TokenFee[] = [];

      // Query bonding curves and pools in parallel
      const [curves, pools] = await Promise.allSettled([
        findBondingCurvesByCreator(creatorPk, signal),
        findPoolsByCreator(creatorPk, signal),
      ]);

      // Track pool token mints to avoid double-counting
      const poolTokenMints = new Set<string>();

      // Fetch claimed totals for top 10 pools (by SOL fees) via Helius
      const poolsForClaim = pools.status === 'fulfilled'
        ? pools.value
            .filter((p) => p.creatorFeesB > 0n)
            .sort((a, b) => (b.creatorFeesB > a.creatorFeesB ? 1 : -1))
            .slice(0, 10)
        : [];

      const claimResults = await Promise.allSettled(
        poolsForClaim.map((p) => fetchVaultClaimTotal(p.poolAddress, signal))
      );

      const claimMap = new Map<string, bigint>();
      for (let i = 0; i < poolsForClaim.length; i++) {
        const cr = claimResults[i];
        if (cr.status === 'fulfilled' && cr.value > 0n) {
          claimMap.set(poolsForClaim[i].poolAddress, cr.value);
        }
      }

      // Process pools (migrated tokens) — these have explicit creator fee tracking
      if (pools.status === 'fulfilled') {
        for (const pool of pools.value) {
          const mintAddr = pool.tokenMint.toBase58();
          poolTokenMints.add(mintAddr);

          const claimed = claimMap.get(pool.poolAddress) ?? 0n;

          // creatorFeesB = SOL (quote token) creator fees
          if (pool.creatorFeesB > 0n || claimed > 0n) {
            fees.push({
              tokenAddress: mintAddr,
              tokenSymbol: 'SOL',
              chain: 'sol',
              platform: 'coinbarrel',
              totalEarned: (pool.creatorFeesB + claimed).toString(),
              totalClaimed: claimed.toString(),
              totalUnclaimed: pool.creatorFeesB.toString(),
              totalEarnedUsd: null,
              royaltyBps: null,
            });
          }

          // creatorFeesA = token-A (meme token) creator fees
          // Uses real mint address with feeTokenType metadata to avoid
          // breaking price lookups and DB consistency
          if (pool.creatorFeesA > 0n) {
            fees.push({
              tokenAddress: mintAddr,
              tokenSymbol: null,
              chain: 'sol',
              platform: 'coinbarrel',
              totalEarned: pool.creatorFeesA.toString(),
              totalClaimed: '0',
              totalUnclaimed: pool.creatorFeesA.toString(),
              totalEarnedUsd: null,
              royaltyBps: null,
              feeTokenType: 'token-a',
            });
          }
        }
      }

      // Bonding curves (pre-migration tokens) — skip for fee reporting.
      // The GPA reads ACCUMULATED_HOLDER_REWARDS_SOL which is the holder reward pool,
      // NOT the creator's personal fee share. Creator fees on bonding curves are not
      // directly readable from a single account field. Migrated tokens (pools above)
      // have explicit ACCUMULATED_CREATOR_TRADER_FEES fields which are correct.
      // Pre-migration tokens with unclaimed creator fees will be captured once they
      // migrate to pools.

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
