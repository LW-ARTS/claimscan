import 'server-only';
import type {
  PlatformAdapter,
  TokenFee,
  CreatorToken,
  ResolvedWallet,
} from './types';
import type { IdentityProvider } from '@/lib/supabase/types';
import { asBaseAddress } from '@/lib/chains/types';
import { isValidEvmAddress, normalizeEvmAddress } from '@/lib/chains/base';
import { readFlaunchBalances, readFlaunchHistoricalEarnings } from '@/lib/chains/flaunch-reads';
import { fetchCoinsByCreator } from '@/lib/flaunch/client';
import { FLAUNCH_TAKEOVER_POSITION_MANAGER } from '@/lib/constants-evm';
import { createLogger } from '@/lib/logger';

const log = createLogger('flaunch');

// ═══════════════════════════════════════════════
// Synthetic Token ID
// RevenueManager.balances(wallet) returns ETH wei AGGREGATED across all coins.
// Per CLAUDE.md (Pump.fun pattern): when a platform exposes a single pooled
// balance rather than per-coin accruals, we emit ONE synthetic TokenFee with
// a composite-key-safe ID. TokenFeeTable.tokenDisplay() strips the 'BASE:' prefix
// pattern (mirrors how 'SOL:pump' renders as "$SOL").
// ═══════════════════════════════════════════════

const SYNTHETIC_TOKEN_ID = 'BASE:flaunch-revenue';

const TAKEOVER_PM = FLAUNCH_TAKEOVER_POSITION_MANAGER.toLowerCase();

function isEvmAddress(s: string): s is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

export const flaunchAdapter: PlatformAdapter = {
  platform: 'flaunch',
  chain: 'base',
  supportsIdentityResolution: false,
  supportsLiveFees: true,
  supportsHandleBasedFees: false,
  // getHistoricalFees already does the live on-chain read (balances() is
  // always current), so the orchestrator can skip getLiveUnclaimedFees.
  historicalCoversLive: true,

  async resolveIdentity(
    _handle: string,
    _provider: IdentityProvider,
  ): Promise<ResolvedWallet[]> {
    return [];
  },

  async getFeesByHandle(): Promise<TokenFee[]> {
    return [];
  },

  async getCreatorTokens(wallet: string): Promise<CreatorToken[]> {
    if (!isValidEvmAddress(wallet) || !isEvmAddress(wallet)) return [];
    const owner = asBaseAddress(wallet);
    const resp = await fetchCoinsByCreator(owner);
    if ('kind' in resp) {
      log.warn('getCreatorTokens_failed', { kind: resp.kind, wallet: wallet.slice(0, 10) });
      return [];
    }
    return resp.data.map((t) => ({
      tokenAddress: t.tokenAddress.toLowerCase(),
      chain: 'base' as const,
      platform: 'flaunch' as const,
      symbol: t.symbol,
      name: t.name,
      imageUrl: null,
    }));
  },

  async getHistoricalFees(wallet: string, signal?: AbortSignal): Promise<TokenFee[]> {
    if (signal?.aborted) return [];
    if (!isValidEvmAddress(wallet) || !isEvmAddress(wallet)) return [];
    const normalized = normalizeEvmAddress(wallet);
    if (!isEvmAddress(normalized)) return [];
    const recipient = asBaseAddress(normalized);

    const list = await fetchCoinsByCreator(recipient, signal);
    if ('kind' in list) {
      log.warn('list_failed', { kind: list.kind, wallet: wallet.slice(0, 10) });
      return [];
    }
    if (list.data.length === 0) return [];
    if (signal?.aborted) return [];

    // Split tokens by PM version. Only Takeover.fun (new PM) exposes
    // FeeEscrow.totalFeesAllocated for historical earned tracking.
    const newPmAddresses = list.data
      .filter((t) => t.positionManager?.toLowerCase() === TAKEOVER_PM)
      .map((t) => asBaseAddress(t.tokenAddress as `0x${string}`));

    // Parallelize: claimable read + historical earnings read (if new PM tokens exist)
    const [claimable, earningsResult] = await Promise.all([
      readFlaunchBalances(recipient, signal),
      newPmAddresses.length > 0
        ? readFlaunchHistoricalEarnings(newPmAddresses, signal)
        : Promise.resolve({ kind: 'ok' as const, total: 0n }),
    ]);

    // Bail on degraded or errored historical reads. fee-sync.ts has 'flaunch'
    // in PRUNE_EXEMPT_PLATFORMS, so returning [] keeps the previously-cached
    // row in the DB instead of flapping the user-visible value down.
    if (earningsResult.kind === 'error' || earningsResult.kind === 'degraded') {
      log.warn('historical_earnings_skipped', {
        kind: earningsResult.kind,
        wallet: wallet.slice(0, 10),
        successRatio:
          earningsResult.kind === 'degraded' ? earningsResult.successRatio : null,
        newPmTokenCount: newPmAddresses.length,
      });
      return [];
    }

    const totalEarnedFromEscrow = earningsResult.total;

    let totalEarned: bigint;
    if (newPmAddresses.length > 0) {
      // Floor totalEarned at claimable. Load-bearing for two cases:
      //   1. A late-block skew where claimable was read one block after the
      //      escrow sum, so claimable can briefly exceed totalEarnedFromEscrow.
      //   2. Mixed-PM wallets: claimable is wallet-wide (includes old PM coins),
      //      while totalEarnedFromEscrow only covers Takeover.fun pools. Without
      //      this floor, totalClaimed = totalEarned - claimable could go negative
      //      and produce an absurd "claimed more than earned" stat.
      totalEarned = totalEarnedFromEscrow > claimable ? totalEarnedFromEscrow : claimable;
    } else {
      // Old PM only: FeeEscrow historical reads not available. Fall back to showing
      // just the current claimable amount (totalClaimed cannot be computed).
      if (claimable === 0n) return [];
      totalEarned = claimable;
    }

    if (totalEarned === 0n) return [];

    const totalClaimed = totalEarned - claimable;

    const fee: TokenFee = {
      tokenAddress: SYNTHETIC_TOKEN_ID,
      tokenSymbol: 'ETH',
      chain: 'base',
      platform: 'flaunch',
      totalEarned: totalEarned.toString(),
      totalClaimed: totalClaimed.toString(),
      totalUnclaimed: claimable.toString(),
      totalEarnedUsd: null,
      royaltyBps: null,
    };
    return [fee];
  },

  async getLiveUnclaimedFees(wallet: string, signal?: AbortSignal): Promise<TokenFee[]> {
    if (signal?.aborted) return [];
    const fees = await flaunchAdapter.getHistoricalFees(wallet, signal);
    return fees.filter((f) => BigInt(f.totalUnclaimed) > 0n);
  },
};
