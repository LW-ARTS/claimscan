import 'server-only';
import { PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { getConnection, isValidSolanaAddress } from '@/lib/chains/solana';
import { fetchVaultClaimTotal, fetchTokenClaimTotal } from '@/lib/helius/transactions';
import { getCachedTokenAddresses } from './cached-tokens';
import { enrichSolanaTokenSymbols } from './solana-metadata';
import type { IdentityProvider } from '@/lib/supabase/types';
import type {
  PlatformAdapter,
  ResolvedWallet,
  CreatorToken,
  TokenFee,
  ClaimEvent,
} from './types';

// ═══════════════════════════════════════════════
// Believe.app Adapter
//
// Believe uses Meteora DBC (Dynamic Bonding Curve).
// All methods share a single getPoolsByCreator GPA call
// to minimize expensive getProgramAccounts queries.
//
// Fee fields in the VirtualPool account:
//   creatorBaseFee  — unclaimed base token (meme coin) fees
//   creatorQuoteFee — unclaimed quote token (SOL) fees
// ═══════════════════════════════════════════════

/** Per-call timeout for the getProgramAccounts query (can be slow). */
const GPA_TIMEOUT_MS = 20_000;

/** Simple in-memory cache for GPA results to avoid redundant calls within a scan cycle. */
type PoolEntry = { publicKey: PublicKey; account: Record<string, unknown> };
const poolCache = new Map<string, { pools: PoolEntry[]; ts: number }>();
const POOL_CACHE_TTL_MS = 60_000; // 1 minute
const POOL_CACHE_MAX_SIZE = 200; // Prevent unbounded memory growth

/**
 * Safely convert a BN (or BN-like object from Anchor) to bigint.
 */
function bnToBigInt(bn: unknown): bigint {
  if (typeof bn === 'bigint') return bn;
  if (bn === null || bn === undefined) return 0n;
  try {
    return BigInt(String(bn));
  } catch (err) {
    console.warn('[believe] bnToBigInt conversion failed for value:', String(bn), err instanceof Error ? err.message : err);
    return 0n;
  }
}

/**
 * Shared GPA call — fetches all pools by creator once and caches briefly.
 * All adapter methods use this instead of making separate GPA calls.
 */
async function getPoolsByCreatorCached(wallet: string): Promise<PoolEntry[]> {
  const cached = poolCache.get(wallet);
  if (cached && Date.now() - cached.ts < POOL_CACHE_TTL_MS) {
    return cached.pools;
  }

  const client = DynamicBondingCurveClient.create(getConnection());
  const pools = await raceGpaTimeout(
    client.state.getPoolsByCreator(new PublicKey(wallet)),
    'believe-pools'
  );

  const result = (pools ?? []) as PoolEntry[];

  // Evict expired entries and cap size to prevent unbounded memory growth
  if (poolCache.size >= POOL_CACHE_MAX_SIZE) {
    const now = Date.now();
    for (const [key, entry] of poolCache) {
      if (now - entry.ts > POOL_CACHE_TTL_MS) poolCache.delete(key);
    }
    // If still over limit after TTL sweep, delete oldest half
    if (poolCache.size >= POOL_CACHE_MAX_SIZE) {
      const entries = [...poolCache.entries()].sort((a, b) => a[1].ts - b[1].ts);
      for (let i = 0; i < Math.floor(entries.length / 2); i++) {
        poolCache.delete(entries[i][0]);
      }
    }
  }

  poolCache.set(wallet, { pools: result, ts: Date.now() });
  return result;
}

export const believeAdapter: PlatformAdapter = {
  platform: 'believe',
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
      // DB-first: use cached token addresses from cron to skip expensive GPA
      const cached = await getCachedTokenAddresses(wallet, 'believe', 'sol');
      if (cached) {
        return cached.map((addr) => ({
          tokenAddress: addr,
          chain: 'sol' as const,
          platform: 'believe' as const,
          symbol: null,
          name: null,
          imageUrl: null,
        }));
      }

      const pools = await getPoolsByCreatorCached(wallet);
      if (pools.length === 0) return [];

      return pools
        .filter((p) => !isMigrated(p.account))
        .map((pool) => ({
          tokenAddress: (pool.account.baseMint as PublicKey).toBase58(),
          chain: 'sol' as const,
          platform: 'believe' as const,
          symbol: null,
          name: null,
          imageUrl: null,
        }));
    } catch (err) {
      console.warn(
        '[believe] getCreatorTokens failed:',
        err instanceof Error ? err.message : err
      );
      return [];
    }
  },

  async getHistoricalFees(wallet: string): Promise<TokenFee[]> {
    // Delegate to getLiveUnclaimedFees — it covers both SOL (quote) and
    // base-token fees with Helius claim history. Listed in HISTORICAL_COVERS_LIVE
    // to avoid double Helius calls.
    return this.getLiveUnclaimedFees(wallet);
  },

  async getLiveUnclaimedFees(wallet: string, _signal?: AbortSignal): Promise<TokenFee[]> {
    if (!isValidSolanaAddress(wallet)) return [];

    try {
      const pools = await getPoolsByCreatorCached(wallet);
      if (pools.length === 0) return [];

      // Collect all pools with unclaimed fees — including migrated pools.
      // Migrated pools may still hold creatorQuoteFee/creatorBaseFee that
      // accumulated before migration. Only getCreatorTokens filters these out.
      const activePools = pools
        .map((p) => ({
          pool: p,
          quoteFee: bnToBigInt(p.account.creatorQuoteFee),
          baseFee: bnToBigInt(p.account.creatorBaseFee),
          baseMint: (p.account.baseMint as PublicKey).toBase58(),
          poolAddress: p.publicKey.toBase58(),
        }))
        .filter((p) => p.quoteFee > 0n || p.baseFee > 0n);

      if (activePools.length === 0) return [];

      // Fetch SOL claimed totals for top 10 pools (by SOL fees) in parallel
      const poolsForSolClaim = activePools
        .filter((p) => p.quoteFee > 0n)
        .sort((a, b) => (b.quoteFee > a.quoteFee ? 1 : -1))
        .slice(0, 10);

      // Fetch base-token claimed totals for top 10 pools (by base fee) in parallel
      const poolsForBaseClaim = activePools
        .filter((p) => p.baseFee > 0n)
        .sort((a, b) => (b.baseFee > a.baseFee ? 1 : -1))
        .slice(0, 10);

      const [solClaimResults, baseClaimResults] = await Promise.all([
        Promise.allSettled(
          poolsForSolClaim.map((p) => fetchVaultClaimTotal(p.poolAddress))
        ),
        Promise.allSettled(
          poolsForBaseClaim.map((p) =>
            fetchTokenClaimTotal(p.poolAddress, wallet, p.baseMint)
          )
        ),
      ]);

      const solClaimMap = new Map<string, bigint>();
      for (let i = 0; i < poolsForSolClaim.length; i++) {
        const cr = solClaimResults[i];
        if (cr.status === 'fulfilled' && cr.value > 0n) {
          solClaimMap.set(poolsForSolClaim[i].poolAddress, cr.value);
        }
      }

      const baseClaimMap = new Map<string, bigint>();
      for (let i = 0; i < poolsForBaseClaim.length; i++) {
        const cr = baseClaimResults[i];
        if (cr.status === 'fulfilled' && cr.value > 0n) {
          baseClaimMap.set(poolsForBaseClaim[i].poolAddress, cr.value);
        }
      }

      const fees: TokenFee[] = [];
      for (const p of activePools) {
        const solClaimed = solClaimMap.get(p.poolAddress) ?? 0n;

        if (p.quoteFee > 0n || solClaimed > 0n) {
          fees.push({
            tokenAddress: `SOL:believe:${p.poolAddress}`,
            tokenSymbol: 'SOL',
            chain: 'sol',
            platform: 'believe',
            totalEarned: (p.quoteFee + solClaimed).toString(),
            totalClaimed: solClaimed.toString(),
            totalUnclaimed: p.quoteFee.toString(),
            totalEarnedUsd: null,
            royaltyBps: null,
          });
        }

        const baseClaimed = baseClaimMap.get(p.poolAddress) ?? 0n;

        if (p.baseFee > 0n || baseClaimed > 0n) {
          fees.push({
            tokenAddress: p.baseMint,
            tokenSymbol: null,
            chain: 'sol',
            platform: 'believe',
            totalEarned: (p.baseFee + baseClaimed).toString(),
            totalClaimed: baseClaimed.toString(),
            totalUnclaimed: p.baseFee.toString(),
            totalEarnedUsd: null,
            royaltyBps: null,
          });
        }
      }

      return enrichSolanaTokenSymbols(fees);
    } catch (err) {
      console.warn(
        '[believe] getLiveUnclaimedFees failed:',
        err instanceof Error ? err.message : err
      );
      return [];
    }
  },

  async getClaimHistory(_wallet: string): Promise<ClaimEvent[]> {
    return [];
  },
};

/**
 * Check if a pool has been migrated (graduated to DAMM).
 * The isMigrated field is a u8 on the VirtualPool struct.
 */
function isMigrated(account: Record<string, unknown>): boolean {
  const val = account.isMigrated;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  return false;
}

/**
 * Race a GPA promise against a timeout.
 * getProgramAccounts can be very slow on some RPCs.
 */
function raceGpaTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
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
