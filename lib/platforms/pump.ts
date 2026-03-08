import 'server-only';
import { PublicKey } from '@solana/web3.js';
import {
  getUnclaimedPumpFees,
  getUnclaimedPumpSwapFees,
  isValidSolanaAddress,
} from '@/lib/chains/solana';
import type { IdentityProvider } from '@/lib/supabase/types';
import type {
  PlatformAdapter,
  ResolvedWallet,
  CreatorToken,
  TokenFee,
  ClaimEvent,
} from './types';

// ═══════════════════════════════════════════════
// Pump.fun Adapter
// ═══════════════════════════════════════════════

export const pumpAdapter: PlatformAdapter = {
  platform: 'pump',
  chain: 'sol',
  supportsIdentityResolution: false,
  supportsLiveFees: true,
  supportsHandleBasedFees: false,

  async resolveIdentity(
    _handle: string,
    _provider: IdentityProvider
  ): Promise<ResolvedWallet[]> {
    // Pump.fun doesn't have identity resolution.
    // Relies on Bags.fm or other platforms to resolve wallets first.
    return [];
  },

  async getFeesByHandle(): Promise<TokenFee[]> {
    return [];
  },

  async getCreatorTokens(_wallet: string): Promise<CreatorToken[]> {
    // Would require Bitquery/Helius scan of Pump.fun program logs.
    // Not implementing for MVP — fees are queried directly by vault PDA.
    return [];
  },

  async getHistoricalFees(wallet: string): Promise<TokenFee[]> {
    // Pump.fun doesn't expose historical fee totals via API.
    // We can only read current vault balance (unclaimed).
    // Historical data would require indexing claim transactions.
    return [];
  },

  async getLiveUnclaimedFees(wallet: string): Promise<TokenFee[]> {
    if (!isValidSolanaAddress(wallet)) return [];
    try {
      const creator = new PublicKey(wallet);
      const [pumpFees, pumpSwapFees] = await Promise.allSettled([
        getUnclaimedPumpFees(creator),
        getUnclaimedPumpSwapFees(creator),
      ]);

      const fees: TokenFee[] = [];

      let pumpBalance = 0n;
      if (pumpFees.status === 'fulfilled') {
        pumpBalance = pumpFees.value;
      } else {
        console.warn('[pump] getUnclaimedPumpFees failed:', pumpFees.reason instanceof Error ? pumpFees.reason.message : pumpFees.reason);
      }
      if (pumpBalance > 0n) {
        fees.push({
          // Use 'SOL:pump' to distinguish from PumpSwap vault in DB upsert.
          // The DB conflict key is (creator_id, platform, chain, token_address),
          // so both vaults need unique token_address values.
          tokenAddress: 'SOL:pump',
          tokenSymbol: 'SOL',
          chain: 'sol',
          platform: 'pump',
          totalEarned: '0',
          totalClaimed: '0',
          totalUnclaimed: pumpBalance.toString(),
          totalEarnedUsd: null,
          royaltyBps: null,
        });
      }

      let swapBalance = 0n;
      if (pumpSwapFees.status === 'fulfilled') {
        swapBalance = pumpSwapFees.value;
      } else {
        console.warn('[pump] getUnclaimedPumpSwapFees failed:', pumpSwapFees.reason instanceof Error ? pumpSwapFees.reason.message : pumpSwapFees.reason);
      }
      if (swapBalance > 0n) {
        fees.push({
          tokenAddress: 'SOL:pumpswap',
          tokenSymbol: 'SOL (PumpSwap)',
          chain: 'sol',
          platform: 'pump',
          totalEarned: '0',
          totalClaimed: '0',
          totalUnclaimed: swapBalance.toString(),
          totalEarnedUsd: null,
          royaltyBps: null,
        });
      }

      return fees;
    } catch (err) {
      console.warn('[pump] getLiveUnclaimedFees failed:', err instanceof Error ? err.message : err);
      return [];
    }
  },

  async getClaimHistory(_wallet: string): Promise<ClaimEvent[]> {
    return [];
  },
};
