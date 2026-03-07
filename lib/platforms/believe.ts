import 'server-only';
import { PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { getConnection, isValidSolanaAddress, withRpcFallback, lamportsToSol } from '@/lib/chains/solana';
import { sanitizeTokenSymbol } from '@/lib/utils';
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
// We query pools by creator using getProgramAccounts
// with a memcmp filter at offset 104 (the `creator` field).
//
// Fee fields in the VirtualPool account:
//   creatorBaseFee  — unclaimed base token (meme coin) fees
//   creatorQuoteFee — unclaimed quote token (SOL) fees
//   metrics.totalTradingBaseFee  — lifetime base trading fees
//   metrics.totalTradingQuoteFee — lifetime quote trading fees
// ═══════════════════════════════════════════════

/** Per-call timeout for the getProgramAccounts query (can be slow). */
const GPA_TIMEOUT_MS = 20_000;

/**
 * Safely convert a BN (or BN-like object from Anchor) to bigint.
 */
function bnToBigInt(bn: unknown): bigint {
  if (typeof bn === 'bigint') return bn;
  if (bn === null || bn === undefined) return 0n;
  try {
    return BigInt(String(bn));
  } catch {
    return 0n;
  }
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
    // Believe doesn't expose identity resolution.
    return [];
  },

  async getFeesByHandle(): Promise<TokenFee[]> {
    return [];
  },

  async getCreatorTokens(wallet: string): Promise<CreatorToken[]> {
    if (!isValidSolanaAddress(wallet)) return [];

    try {
      const client = DynamicBondingCurveClient.create(getConnection());
      const pools = await raceGpaTimeout(
        client.state.getPoolsByCreator(new PublicKey(wallet)),
        'believe-creator-tokens'
      );
      if (!pools || pools.length === 0) return [];

      return pools.map((pool) => ({
        tokenAddress: pool.account.baseMint.toBase58(),
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
    if (!isValidSolanaAddress(wallet)) return [];

    try {
      const client = DynamicBondingCurveClient.create(getConnection());
      const feeData = await raceGpaTimeout(
        client.state.getPoolsFeesByCreator(new PublicKey(wallet)),
        'believe-historical-fees'
      );
      if (!feeData || feeData.length === 0) return [];

      const fees: TokenFee[] = [];

      for (const pool of feeData) {
        const totalQuote = bnToBigInt(pool.totalTradingQuoteFee);
        const creatorQuote = bnToBigInt(pool.creatorQuoteFee);

        // Only include pools that have had any trading activity
        if (totalQuote === 0n && creatorQuote === 0n) continue;

        // We use the pool address as the token identifier since we
        // don't have the baseMint from getPoolsFeesByCreator directly.
        // The pool address is unique per token.
        const poolAddress = pool.poolAddress instanceof PublicKey
          ? pool.poolAddress.toBase58()
          : String(pool.poolAddress);

        fees.push({
          tokenAddress: `SOL:believe:${poolAddress}`,
          tokenSymbol: 'SOL',
          chain: 'sol',
          platform: 'believe',
          // totalTradingQuoteFee tracks all quote (SOL) fees ever generated,
          // but only a portion goes to the creator. We report what's available.
          totalEarned: '0', // can't derive exact lifetime creator fees from onchain data
          totalClaimed: '0',
          totalUnclaimed: creatorQuote.toString(),
          totalEarnedUsd: null,
          royaltyBps: null,
        });
      }

      return fees;
    } catch (err) {
      console.warn(
        '[believe] getHistoricalFees failed:',
        err instanceof Error ? err.message : err
      );
      return [];
    }
  },

  async getLiveUnclaimedFees(wallet: string): Promise<TokenFee[]> {
    if (!isValidSolanaAddress(wallet)) return [];

    try {
      const client = DynamicBondingCurveClient.create(getConnection());
      const pools = await raceGpaTimeout(
        client.state.getPoolsByCreator(new PublicKey(wallet)),
        'believe-live-fees'
      );
      if (!pools || pools.length === 0) return [];

      const fees: TokenFee[] = [];

      for (const pool of pools) {
        const creatorQuoteFee = bnToBigInt(pool.account.creatorQuoteFee);
        // creatorBaseFee is in the meme coin — less useful for display
        // but we track it for completeness
        const creatorBaseFee = bnToBigInt(pool.account.creatorBaseFee);

        // Skip pools with no unclaimed fees
        if (creatorQuoteFee === 0n && creatorBaseFee === 0n) continue;

        const baseMint = pool.account.baseMint.toBase58();
        const poolAddress = pool.publicKey.toBase58();

        // Report SOL (quote) fees
        if (creatorQuoteFee > 0n) {
          fees.push({
            tokenAddress: `SOL:believe:${poolAddress}`,
            tokenSymbol: 'SOL',
            chain: 'sol',
            platform: 'believe',
            totalEarned: '0',
            totalClaimed: '0',
            totalUnclaimed: creatorQuoteFee.toString(),
            totalEarnedUsd: null,
            royaltyBps: null,
          });
        }

        // Report base token fees (meme coin fees)
        if (creatorBaseFee > 0n) {
          fees.push({
            tokenAddress: baseMint,
            tokenSymbol: null, // Would need token metadata lookup
            chain: 'sol',
            platform: 'believe',
            totalEarned: '0',
            totalClaimed: '0',
            totalUnclaimed: creatorBaseFee.toString(),
            totalEarnedUsd: null,
            royaltyBps: null,
          });
        }
      }

      return fees;
    } catch (err) {
      console.warn(
        '[believe] getLiveUnclaimedFees failed:',
        err instanceof Error ? err.message : err
      );
      return [];
    }
  },

  async getClaimHistory(_wallet: string): Promise<ClaimEvent[]> {
    // Would require indexing claim transactions from Meteora DBC.
    return [];
  },
};

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
