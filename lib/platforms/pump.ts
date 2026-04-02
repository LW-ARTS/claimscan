import 'server-only';
import { PublicKey } from '@solana/web3.js';
import {
  getUnclaimedPumpFees,
  getUnclaimedPumpSwapFees,
  deriveCreatorVault,
  derivePumpSwapVault,
  isValidSolanaAddress,
  readBondingCurve,
} from '@/lib/chains/solana';
import { fetchVaultClaimTotal } from '@/lib/helius/transactions';
import { heliusDasRpc, isHeliusAvailable } from '@/lib/helius/client';
import { PUMP_PROGRAM_ID } from '@/lib/constants';
import type { IdentityProvider } from '@/lib/supabase/types';
import type {
  PlatformAdapter,
  ResolvedWallet,
  CreatorToken,
  TokenFee,
  ClaimEvent,
} from './types';
import { createLogger } from '@/lib/logger';
const log = createLogger('pump');

// ═══════════════════════════════════════════════
// Pump.fun Adapter (v2 — Jan-Mar 2026 fee model)
// ═══════════════════════════════════════════════
// Live fee reads: fast vault balance checks (unchanged from v1).
// Fee metadata (cashback, sharing config, lock status): populated by cron
// via readBondingCurve/readSharingConfig in lib/chains/solana.ts.
// This keeps live queries fast within the 10s Vercel timeout.

export const pumpAdapter: PlatformAdapter = {
  platform: 'pump',
  chain: 'sol',
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

  async getCreatorTokens(wallet: string): Promise<CreatorToken[]> {
    if (!isHeliusAvailable() || !isValidSolanaAddress(wallet)) return [];

    try {
      // Use Helius DAS searchAssets with authorityAddress (Pump program) filter
      // and then verify creator by reading BondingCurve accounts
      const data = await heliusDasRpc<{
        total: number;
        items: Array<{
          id: string;
          content?: { metadata?: { name?: string; symbol?: string } };
          token_info?: { symbol?: string };
          authorities?: Array<{ address: string }>;
        }>;
      }>(
        'searchAssets',
        {
          authorityAddress: PUMP_PROGRAM_ID,
          ownerAddress: wallet,
          page: 1,
          limit: 100,
          displayOptions: { showFungible: true },
        },
        'pump-creator-tokens'
      );

      if (!data?.items?.length) return [];

      // For each token found in wallet, verify it was created by this wallet
      // by reading the BondingCurve account's creator field
      const results: CreatorToken[] = [];
      const checks = data.items.slice(0, 50).map(async (asset) => {
        try {
          const mint = new PublicKey(asset.id);
          const bc = await readBondingCurve(mint);
          if (bc && bc.creator === wallet) {
            results.push({
              tokenAddress: asset.id,
              chain: 'sol',
              platform: 'pump',
              symbol: asset.token_info?.symbol ?? asset.content?.metadata?.symbol ?? null,
              name: asset.content?.metadata?.name ?? null,
              imageUrl: null,
            });
          }
        } catch {
          // Skip failed reads
        }
      });

      await Promise.allSettled(checks);
      log.info('getCreatorTokens found', { wallet: wallet.slice(0, 8), count: results.length });
      return results;
    } catch (err) {
      log.warn('getCreatorTokens failed', { error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  },

  async getHistoricalFees(_wallet: string): Promise<TokenFee[]> {
    return [];
  },

  async getLiveUnclaimedFees(wallet: string, signal?: AbortSignal): Promise<TokenFee[]> {
    if (!isValidSolanaAddress(wallet)) return [];
    try {
      const creator = new PublicKey(wallet);
      const [pumpVault] = deriveCreatorVault(creator);
      const [swapVault] = derivePumpSwapVault(creator);

      // Fetch unclaimed balances + claimed totals in parallel
      const [pumpFees, pumpSwapFees, pumpClaimed, swapClaimed] = await Promise.allSettled([
        getUnclaimedPumpFees(creator),
        getUnclaimedPumpSwapFees(creator),
        fetchVaultClaimTotal(pumpVault.toBase58(), signal),
        fetchVaultClaimTotal(swapVault.toBase58(), signal),
      ]);

      const fees: TokenFee[] = [];

      // --- Pump.fun bonding curve fees ---
      let pumpBalance = 0n;
      if (pumpFees.status === 'fulfilled') {
        pumpBalance = pumpFees.value;
      } else {
        log.warn('getUnclaimedPumpFees failed', { error: pumpFees.reason instanceof Error ? pumpFees.reason.message : String(pumpFees.reason) });
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
          // feeType, feeLocked, feeRecipients populated by cron enrichment
        });
      }

      // --- PumpSwap AMM fees ---
      let swapBalance = 0n;
      if (pumpSwapFees.status === 'fulfilled') {
        swapBalance = pumpSwapFees.value;
      } else {
        log.warn('getUnclaimedPumpSwapFees failed', { error: pumpSwapFees.reason instanceof Error ? pumpSwapFees.reason.message : String(pumpSwapFees.reason) });
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
      log.warn('getLiveUnclaimedFees failed', { error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  },

  async getClaimHistory(_wallet: string): Promise<ClaimEvent[]> {
    return [];
  },
};
