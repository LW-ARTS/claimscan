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
// Token ID conventions
//
// Takeover.fun (new PM) coins emit one TokenFee per coin keyed by the real
// 0x token address. For each coin we know the historical earned (from
// FeeEscrow.totalFeesAllocated) and assume it has been fully claimed —
// see the long comment in getHistoricalFees for why claimable cannot be
// split per coin.
//
// `BASE:flaunch-legacy` is a synthetic catch-all row that holds the
// wallet-wide claimable from RevenueManager.balances. It is emitted only
// when the wallet has either old-PM coins (no per-pool data available) OR
// any non-zero claimable that cannot be attributed to a specific coin.
// ═══════════════════════════════════════════════

const LEGACY_TOKEN_ID = 'BASE:flaunch-legacy';

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
    const newPmCoins = list.data.filter(
      (t) => t.positionManager?.toLowerCase() === TAKEOVER_PM,
    );
    const oldPmCoins = list.data.filter(
      (t) => t.positionManager?.toLowerCase() !== TAKEOVER_PM,
    );

    const newPmAddresses = newPmCoins.map((t) =>
      asBaseAddress(t.tokenAddress as `0x${string}`),
    );

    // Parallelize: claimable read + historical earnings read (if new PM tokens exist)
    const [claimable, earningsResult] = await Promise.all([
      readFlaunchBalances(recipient, signal),
      newPmAddresses.length > 0
        ? readFlaunchHistoricalEarnings(newPmAddresses, signal)
        : Promise.resolve({ kind: 'ok' as const, perCoin: new Map<string, bigint>(), total: 0n }),
    ]);

    // Bail on degraded or errored historical reads. fee-sync.ts has 'flaunch'
    // in PRUNE_EXEMPT_PLATFORMS, so returning [] keeps the previously-cached
    // rows in the DB instead of flapping the user-visible values down.
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

    const fees: TokenFee[] = [];
    const perCoin = earningsResult.perCoin;

    // Per-coin rows for new-PM (Takeover.fun) coins.
    //
    // Why totalClaimed === totalEarned and totalUnclaimed === 0 per coin:
    // RevenueManager.balances(wallet) returns the wallet-wide claimable
    // aggregate. There is no on-chain primitive to split that aggregate per
    // coin without scanning RevenueManager.Claimed events for the entire
    // wallet history. We attribute ALL current claimable to the legacy row
    // below, which keeps the per-coin earned numbers honest (matches what
    // the FeeEscrow contract reports for each pool) at the cost of showing
    // claimable as a single bucket rather than per coin.
    for (const coin of newPmCoins) {
      const key = coin.tokenAddress.toLowerCase();
      const earned = perCoin.get(key) ?? 0n;
      if (earned === 0n) continue;

      fees.push({
        tokenAddress: key,
        tokenSymbol: coin.symbol,
        chain: 'base',
        platform: 'flaunch',
        totalEarned: earned.toString(),
        totalClaimed: earned.toString(),
        totalUnclaimed: '0',
        totalEarnedUsd: null,
        royaltyBps: null,
      });
    }

    // Legacy row: holds the wallet-wide current claimable.
    //
    // Emitted when:
    //   - The wallet has any claimable balance (could be from old or new PM).
    //   - OR the wallet has old-PM coins but no per-coin breakdown is available
    //     (compatibility with the pre-2026-04-21 single-row UX).
    //
    // The earned value here is the claimable amount itself: from the user's
    // perspective the legacy row represents "money currently sitting in the
    // RevenueManager waiting to be claimed", so earned == unclaimed and
    // claimed == 0 for that bucket. The per-coin rows above already
    // accounted for what was historically claimed.
    if (claimable > 0n || (oldPmCoins.length > 0 && fees.length === 0)) {
      fees.push({
        tokenAddress: LEGACY_TOKEN_ID,
        tokenSymbol: 'ETH',
        chain: 'base',
        platform: 'flaunch',
        totalEarned: claimable.toString(),
        totalClaimed: '0',
        totalUnclaimed: claimable.toString(),
        totalEarnedUsd: null,
        royaltyBps: null,
      });
    }

    return fees;
  },

  async getLiveUnclaimedFees(wallet: string, signal?: AbortSignal): Promise<TokenFee[]> {
    if (signal?.aborted) return [];
    const fees = await flaunchAdapter.getHistoricalFees(wallet, signal);
    return fees.filter((f) => BigInt(f.totalUnclaimed) > 0n);
  },
};
