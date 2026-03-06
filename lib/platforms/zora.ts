import 'server-only';
import { ZORA_API_BASE } from '@/lib/constants';
import { getZoraProtocolRewardsBalance, isValidEvmAddress, normalizeEvmAddress } from '@/lib/chains/base';
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
// Zora API Types
// ═══════════════════════════════════════════════

interface ZoraCoin {
  address: string;
  symbol: string;
  name: string;
  mediaContent?: { previewImage?: { medium?: string } };
}

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

async function zoraFetch<T>(path: string): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (process.env.ZORA_API_KEY) {
      headers['x-api-key'] = process.env.ZORA_API_KEY;
    }
    const res = await fetch(`${ZORA_API_BASE}${path}`, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════
// Zora Adapter
// ═══════════════════════════════════════════════

export const zoraAdapter: PlatformAdapter = {
  platform: 'zora',
  chain: 'base',
  supportsIdentityResolution: false,
  supportsLiveFees: true,

  async resolveIdentity(
    _handle: string,
    _provider: IdentityProvider
  ): Promise<ResolvedWallet[]> {
    // Zora requires wallet address directly.
    // Identity resolution handled by other platforms.
    return [];
  },

  async getCreatorTokens(wallet: string): Promise<CreatorToken[]> {
    // Zora's API allows querying coins by creator.
    // For now, we rely on fee_records from previous scans.
    return [];
  },

  async getHistoricalFees(_wallet: string): Promise<TokenFee[]> {
    // Zora v4 auto-distributes fees — no "unclaimed" concept.
    // Zora v3 had ProtocolRewards with claimable balance.
    // Historical data would need event log parsing.
    return [];
  },

  async getLiveUnclaimedFees(wallet: string): Promise<TokenFee[]> {
    if (!isValidEvmAddress(wallet)) return [];
    try {
      // Check Zora v3 ProtocolRewards balance
      const balance = await getZoraProtocolRewardsBalance(
        getAddress(wallet)
      );

      if (balance === 0n) return [];

      return [
        {
          tokenAddress: '0x0000000000000000000000000000000000000000',
          tokenSymbol: 'ETH (Zora Rewards)',
          chain: 'base',
          platform: 'zora',
          totalEarned: '0',
          totalClaimed: '0',
          totalUnclaimed: balance.toString(),
          totalEarnedUsd: null,
          royaltyBps: null,
        },
      ];
    } catch {
      return [];
    }
  },

  async getClaimHistory(_wallet: string): Promise<ClaimEvent[]> {
    return [];
  },
};
