import 'server-only';
import { PublicKey } from '@solana/web3.js';
import {
  getUnclaimedPumpFees,
  getUnclaimedPumpSwapFees,
  deriveCreatorVault,
  derivePumpSwapVault,
  isValidSolanaAddress,
} from '@/lib/chains/solana';
import { fetchVaultClaimTotal } from '@/lib/helius/transactions';
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
      const [pumpVault] = deriveCreatorVault(creator);
      const [swapVault] = derivePumpSwapVault(creator);

      // Fetch unclaimed balances + claimed totals in parallel
      const [pumpFees, pumpSwapFees, pumpClaimed, swapClaimed] = await Promise.allSettled([
        getUnclaimedPumpFees(creator),
        getUnclaimedPumpSwapFees(creator),
        fetchVaultClaimTotal(pumpVault.toBase58()),
        fetchVaultClaimTotal(swapVault.toBase58()),
      ]);

      const fees: TokenFee[] = [];

      let pumpBalance = 0n;
      if (pumpFees.status === 'fulfilled') {
        pumpBalance = pumpFees.value;
      } else {
        console.warn('[pump] getUnclaimedPumpFees failed:', pumpFees.reason instanceof Error ? pumpFees.reason.message : pumpFees.reason);
      }
      const pumpClaimedTotal = pumpClaimed.status === 'fulfilled' ? pumpClaimed.value : 0n;

      if (pumpBalance > 0n || pumpClaimedTotal > 0n) {
        fees.push({
          tokenAddress: 'SOL:pump',
          tokenSymbol: 'SOL',
          chain: 'sol',
          platform: 'pump',
          totalEarned: (pumpBalance + pumpClaimedTotal).toString(),
          totalClaimed: pumpClaimedTotal.toString(),
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
      const swapClaimedTotal = swapClaimed.status === 'fulfilled' ? swapClaimed.value : 0n;

      if (swapBalance > 0n || swapClaimedTotal > 0n) {
        fees.push({
          tokenAddress: 'SOL:pumpswap',
          tokenSymbol: 'SOL (PumpSwap)',
          chain: 'sol',
          platform: 'pump',
          totalEarned: (swapBalance + swapClaimedTotal).toString(),
          totalClaimed: swapClaimedTotal.toString(),
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
