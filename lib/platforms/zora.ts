import 'server-only';
import { getZoraProtocolRewardsBalance, getZoraWithdrawLogs, isValidEvmAddress } from '@/lib/chains/base';
import { getZoraProtocolRewardsBalanceEth, getZoraWithdrawLogsEth } from '@/lib/chains/eth';
import { getAddress } from 'viem';
import type { IdentityProvider } from '@/lib/supabase/types';
import type {
  PlatformAdapter,
  ResolvedWallet,
  CreatorToken,
  TokenFee,
} from './types';
import { createLogger } from '@/lib/logger';
const log = createLogger('zora');

// ═══════════════════════════════════════════════
// Zora Adapter
//
// Two fee sources:
// 1. Legacy ProtocolRewards (0x7777...BA8B) — ETH on Base + ETH mainnet.
//    Claimable by creator. Works for pre-Content Coins tokens.
// 2. Content Coins (Uniswap V4) — fees auto-distributed per swap.
//    No claim needed. Queried via Zora Coins REST API.
// ═══════════════════════════════════════════════

const ZORA_API_BASE = 'https://api-sdk.zora.engineering';
const ZORA_API_TIMEOUT = 10_000;

function getZoraApiKey(): string | null {
  return process.env.ZORA_API_KEY ?? null;
}

interface ZoraProfileCoin {
  name: string;
  symbol: string;
  address: string;
  chainId: number;
  creatorAddress: string;
  creatorEarnings?: Array<{
    amount: { currencyAddress: string; amountRaw: string; amountDecimal: number };
    amountUsd?: string;
  }>;
  marketCap?: string;
  totalVolume?: string;
}

/**
 * Fetch Content Coins created by a wallet from Zora Coins API.
 * Returns total earnings across all their Content Coins (auto-distributed).
 */
async function fetchContentCoinEarnings(wallet: string): Promise<{
  totalEarningsUsd: number;
  coinCount: number;
} | null> {
  const apiKey = getZoraApiKey();
  if (!apiKey) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ZORA_API_TIMEOUT);

    const res = await fetch(
      `${ZORA_API_BASE}/profile/coins?identifier=${wallet}&count=100`,
      {
        headers: { 'api-key': apiKey },
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    if (!res.ok) {
      log.warn('Zora Coins API failed', { status: res.status });
      return null;
    }

    const data = await res.json();
    const coins: ZoraProfileCoin[] = data?.data?.profile?.coins?.edges?.map(
      (e: { node: ZoraProfileCoin }) => e.node
    ) ?? data?.coins ?? [];

    if (coins.length === 0) return null;

    let totalEarningsUsd = 0;
    for (const coin of coins) {
      if (coin.creatorEarnings) {
        for (const earning of coin.creatorEarnings) {
          totalEarningsUsd += parseFloat(earning.amountUsd ?? '0');
        }
      }
    }

    return { totalEarningsUsd, coinCount: coins.length };
  } catch (err) {
    log.warn('fetchContentCoinEarnings failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export const zoraAdapter: PlatformAdapter = {
  platform: 'zora',
  chain: 'base',
  supportsIdentityResolution: false,
  supportsLiveFees: true,
  supportsHandleBasedFees: false,
  historicalCoversLive: false,

  async resolveIdentity(
    _handle: string,
    _provider: IdentityProvider
  ): Promise<ResolvedWallet[]> {
    return [];
  },

  async getFeesByHandle(): Promise<TokenFee[]> {
    return [];
  },

  async getCreatorTokens(_wallet: string): Promise<CreatorToken[]> {
    return [];
  },

  async getHistoricalFees(_wallet: string): Promise<TokenFee[]> {
    return [];
  },

  async getLiveUnclaimedFees(wallet: string, _signal?: AbortSignal): Promise<TokenFee[]> {
    if (!isValidEvmAddress(wallet)) return [];

    const checksummed = getAddress(wallet);
    const fees: TokenFee[] = [];

    // Query legacy ProtocolRewards + Content Coins in parallel
    const [baseBalance, ethBalance, baseClaimed, ethClaimed, contentCoins] =
      await Promise.allSettled([
        getZoraProtocolRewardsBalance(checksummed),
        getZoraProtocolRewardsBalanceEth(checksummed),
        getZoraWithdrawLogs(checksummed),
        getZoraWithdrawLogsEth(checksummed),
        fetchContentCoinEarnings(checksummed),
      ]);

    // --- Legacy ProtocolRewards (Base) ---
    let baseBal = 0n;
    if (baseBalance.status === 'fulfilled') {
      baseBal = baseBalance.value;
    } else {
      log.warn('Base ProtocolRewards query failed', { error: baseBalance.reason instanceof Error ? baseBalance.reason.message : String(baseBalance.reason) });
    }

    let ethBal = 0n;
    if (ethBalance.status === 'fulfilled') {
      ethBal = ethBalance.value;
    } else {
      log.warn('ETH ProtocolRewards query failed', { error: ethBalance.reason instanceof Error ? ethBalance.reason.message : String(ethBalance.reason) });
    }

    const baseClaimedTotal = baseClaimed.status === 'fulfilled' ? baseClaimed.value : 0n;
    const ethClaimedTotal = ethClaimed.status === 'fulfilled' ? ethClaimed.value : 0n;

    if (baseBal > 0n || baseClaimedTotal > 0n) {
      fees.push({
        tokenAddress: 'ETH:zora:base',
        tokenSymbol: 'ETH (Zora Base)',
        chain: 'base',
        platform: 'zora',
        totalEarned: (baseBal + baseClaimedTotal).toString(),
        totalClaimed: baseClaimedTotal.toString(),
        totalUnclaimed: baseBal.toString(),
        totalEarnedUsd: null,
        royaltyBps: null,
      });
    }

    if (ethBal > 0n || ethClaimedTotal > 0n) {
      fees.push({
        tokenAddress: 'ETH:zora:eth',
        tokenSymbol: 'ETH (Zora Mainnet)',
        chain: 'eth',
        platform: 'zora',
        totalEarned: (ethBal + ethClaimedTotal).toString(),
        totalClaimed: ethClaimedTotal.toString(),
        totalUnclaimed: ethBal.toString(),
        totalEarnedUsd: null,
        royaltyBps: null,
      });
    }

    // --- Content Coins (auto-distributed, no claim needed) ---
    const ccResult = contentCoins.status === 'fulfilled' ? contentCoins.value : null;
    if (ccResult && ccResult.totalEarningsUsd > 0) {
      fees.push({
        tokenAddress: 'ZORA:coins:base',
        tokenSymbol: `Content Coins (${ccResult.coinCount})`,
        chain: 'base',
        platform: 'zora',
        totalEarned: '0', // Denominated in $ZORA, tracked as USD only
        totalClaimed: '0',
        totalUnclaimed: '0', // Auto-distributed — nothing to claim
        totalEarnedUsd: ccResult.totalEarningsUsd,
        royaltyBps: null,
        feeType: 'cashback', // Signals auto-distribution (no claim button)
      });
    }

    return fees;
  },

};
