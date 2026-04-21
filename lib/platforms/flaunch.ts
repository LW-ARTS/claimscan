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
import { readFlaunchBalances } from '@/lib/chains/flaunch-reads';
import { fetchCoinsByCreator } from '@/lib/flaunch/client';
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

    // Two-step: confirm the wallet holds at least one Flaunch coin, then
    // read the aggregated ETH claimable. Skipping on zero coins saves an
    // unnecessary RPC call. Signal only threads into the REST path; viem 2.x
    // readContract does not expose a per-call AbortSignal.
    const list = await fetchCoinsByCreator(recipient, signal);
    if ('kind' in list) {
      log.warn('list_failed', { kind: list.kind, wallet: wallet.slice(0, 10) });
      return [];
    }
    if (list.data.length === 0) return [];
    if (signal?.aborted) return [];

    const claimable = await readFlaunchBalances(recipient);
    if (claimable === 0n) return [];

    const fee: TokenFee = {
      tokenAddress: SYNTHETIC_TOKEN_ID,
      tokenSymbol: 'ETH',
      chain: 'base',
      platform: 'flaunch',
      // v1: totalClaimed is not tracked (requires event scan on RevenueManager.Claimed).
      // balances() = cumulative unclaimed-since-last-claim, so totalEarned === totalUnclaimed.
      totalEarned: claimable.toString(),
      totalClaimed: '0',
      totalUnclaimed: claimable.toString(),
      totalEarnedUsd: null,    // price waterfall resolves ETH price downstream
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
