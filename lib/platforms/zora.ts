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
  ClaimEvent,
} from './types';
import { createLogger } from '@/lib/logger';
const log = createLogger('zora');

// ═══════════════════════════════════════════════
// Zora Adapter
//
// Checks ProtocolRewards balance on BOTH Base and ETH mainnet.
// The same contract 0x7777777F279eba3d3Ad8F4E708545291A6fDBA8B is
// deployed on both chains. Since EVM addresses work cross-chain,
// we query both when called for a Base wallet.
// ═══════════════════════════════════════════════

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

    // Query balances + withdraw logs on both chains in parallel
    const [baseBalance, ethBalance, baseClaimed, ethClaimed] = await Promise.allSettled([
      getZoraProtocolRewardsBalance(checksummed),
      getZoraProtocolRewardsBalanceEth(checksummed),
      getZoraWithdrawLogs(checksummed),
      getZoraWithdrawLogsEth(checksummed),
    ]);

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

    return fees;
  },

  async getClaimHistory(_wallet: string): Promise<ClaimEvent[]> {
    return [];
  },
};
