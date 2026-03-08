import 'server-only';
import { getZoraProtocolRewardsBalance, isValidEvmAddress } from '@/lib/chains/base';
import { getZoraProtocolRewardsBalanceEth } from '@/lib/chains/eth';
import { getAddress } from 'viem';
import type { IdentityProvider } from '@/lib/supabase/types';
import type {
  PlatformAdapter,
  ResolvedWallet,
  CreatorToken,
  TokenFee,
  ClaimEvent,
} from './types';

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

  async getLiveUnclaimedFees(wallet: string): Promise<TokenFee[]> {
    if (!isValidEvmAddress(wallet)) return [];

    const checksummed = getAddress(wallet);
    const fees: TokenFee[] = [];

    // Query Base and ETH mainnet ProtocolRewards in parallel
    const [baseBalance, ethBalance] = await Promise.allSettled([
      getZoraProtocolRewardsBalance(checksummed),
      getZoraProtocolRewardsBalanceEth(checksummed),
    ]);

    let baseBal = 0n;
    if (baseBalance.status === 'fulfilled') {
      baseBal = baseBalance.value;
    } else {
      console.warn('[zora] Base ProtocolRewards query failed:', baseBalance.reason instanceof Error ? baseBalance.reason.message : baseBalance.reason);
    }

    let ethBal = 0n;
    if (ethBalance.status === 'fulfilled') {
      ethBal = ethBalance.value;
    } else {
      console.warn('[zora] ETH ProtocolRewards query failed:', ethBalance.reason instanceof Error ? ethBalance.reason.message : ethBalance.reason);
    }

    if (baseBal > 0n) {
      fees.push({
        tokenAddress: 'ETH:zora:base',
        tokenSymbol: 'ETH (Zora Base)',
        chain: 'base',
        platform: 'zora',
        totalEarned: '0',
        totalClaimed: '0',
        totalUnclaimed: baseBal.toString(),
        totalEarnedUsd: null,
        royaltyBps: null,
      });
    }

    if (ethBal > 0n) {
      fees.push({
        tokenAddress: 'ETH:zora:eth',
        tokenSymbol: 'ETH (Zora Mainnet)',
        chain: 'eth',
        platform: 'zora',
        totalEarned: '0',
        totalClaimed: '0',
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
