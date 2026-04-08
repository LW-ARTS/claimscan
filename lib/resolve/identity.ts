import 'server-only';
import { getIdentityResolvers, getAllAdapters, getLiveFeeAdapters, getHandleFeeAdapters } from '@/lib/platforms';
import { resolveFarcasterWallets } from './farcaster';
import type { ResolvedWallet, TokenFee } from '@/lib/platforms/types';
import type { IdentityProvider } from '@/lib/supabase/types';
import { isValidSolanaAddress } from '@/lib/chains/solana';
import { isValidEvmAddress, normalizeEvmAddress } from '@/lib/chains/base';
import { safeBigInt } from '@/lib/utils';
import { EVM_CHAINS } from '@/lib/constants';
import { isHeliusAvailable } from '@/lib/helius/client';
import { discoverWalletTokens } from '@/lib/helius/discovery';
import { createLogger } from '@/lib/logger';
const log = createLogger('identity');

// ═══════════════════════════════════════════════
// Identity Detection
// ═══════════════════════════════════════════════

export interface ParsedQuery {
  value: string;
  provider: IdentityProvider;
}

/** Known GitHub non-user paths that should not be treated as handles */
const GITHUB_NON_USER_PATHS = new Set([
  'orgs', 'explore', 'topics', 'trending', 'collections',
  'events', 'marketplace', 'sponsors', 'about', 'settings',
  'features', 'pricing', 'enterprise', 'team', 'login', 'join',
]);

/**
 * Parse a search query into a normalized identity.
 * Supports: @twitter, github usernames, wallet addresses.
 */
export function parseSearchQuery(query: string): ParsedQuery {
  const trimmed = query.trim();

  // Wallet address (Solana or EVM)
  if (isValidSolanaAddress(trimmed)) {
    return { value: trimmed, provider: 'wallet' };
  }
  if (isValidEvmAddress(trimmed)) {
    return { value: trimmed, provider: 'wallet' };
  }

  // Strip @ prefix for Twitter handles
  const handle = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;

  // GitHub URL pattern — filter out known non-user paths
  // Case-insensitive check: URLs from browsers/autocomplete may have mixed case
  const handleLower = handle.toLowerCase();
  if (handleLower.includes('github.com/')) {
    const match = handle.match(/github\.com\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,38})(?:\/|$|\?)/i);
    if (match && !GITHUB_NON_USER_PATHS.has(match[1].toLowerCase())) {
      return { value: match[1].toLowerCase(), provider: 'github' };
    }
  }

  // Twitter/X URL pattern
  if (handleLower.includes('twitter.com/') || handleLower.includes('x.com/')) {
    const match = handle.match(/(?:twitter|x)\.com\/([a-zA-Z0-9_]+)/i);
    if (match) return { value: match[1].toLowerCase(), provider: 'twitter' };
  }

  // Farcaster/Warpcast URL pattern
  if (handleLower.includes('warpcast.com/')) {
    const match = handle.match(/warpcast\.com\/([a-zA-Z0-9][a-zA-Z0-9_\-\.]{0,20})/i);
    if (match) return { value: match[1].toLowerCase(), provider: 'farcaster' };
  }

  // Default: treat as Twitter handle
  return { value: handle.toLowerCase(), provider: 'twitter' };
}

// ═══════════════════════════════════════════════
// Identity Resolution
// ═══════════════════════════════════════════════

/**
 * Resolve a social handle to wallet addresses across all platforms.
 * Runs platform-specific resolvers AND Farcaster/Neynar resolution in parallel.
 * Uses Promise.allSettled to tolerate individual platform failures.
 */
export async function resolveWallets(
  handle: string,
  provider: IdentityProvider
): Promise<ResolvedWallet[]> {
  // If it's already a wallet address, return it directly.
  // sourcePlatform is set to a chain-neutral default for DB enum compatibility.
  // Fee fetching queries ALL chain-matching adapters regardless of sourcePlatform,
  // so this is just a tracking field for how the wallet was discovered.
  if (provider === 'wallet') {
    if (isValidSolanaAddress(handle)) {
      return [{ address: handle, chain: 'sol', sourcePlatform: 'pump' }];
    }
    if (isValidEvmAddress(handle)) {
      // Normalize to EIP-55 checksummed form to prevent case-sensitive DB duplicates.
      // Return BOTH chains so Zora (ETH mainnet) fees are also captured.
      const normalized = normalizeEvmAddress(handle);
      return [
        { address: normalized, chain: 'base', sourcePlatform: 'clanker' },
        { address: normalized, chain: 'eth', sourcePlatform: 'zora' },
      ];
    }
    return [];
  }

  const resolvers = getIdentityResolvers();

  // Run platform resolvers + Farcaster/Neynar resolver in parallel.
  // Farcaster bridges the gap for EVM wallet resolution — most crypto creators
  // have Farcaster accounts with verified ETH addresses.
  const [platformResults, farcasterWallets] = await Promise.all([
    Promise.allSettled(
      resolvers.map((adapter) => adapter.resolveIdentity(handle, provider))
    ),
    resolveFarcasterWallets(handle, provider).catch((err) => {
      log.warn('farcaster resolve failed', { error: err instanceof Error ? err.message : String(err) });
      return [] as ResolvedWallet[];
    }),
  ]);

  const wallets: ResolvedWallet[] = [];
  const seenAddresses = new Set<string>();

  // Helper to add a wallet with dedup
  const addWallet = (wallet: ResolvedWallet) => {
    const normalizedAddress = EVM_CHAINS.has(wallet.chain)
      ? normalizeEvmAddress(wallet.address)
      : wallet.address;
    const key = `${wallet.chain}:${normalizedAddress.toLowerCase()}`;
    if (!seenAddresses.has(key)) {
      seenAddresses.add(key);
      wallets.push({ ...wallet, address: normalizedAddress });
    }
  };

  // Process platform resolver results
  for (let i = 0; i < platformResults.length; i++) {
    const result = platformResults[i];
    if (result.status === 'fulfilled') {
      for (const wallet of result.value) {
        addWallet(wallet);
      }
    } else {
      const platform = resolvers[i]?.platform ?? 'unknown';
      log.warn('resolveIdentity failed', { platform, error: result.reason instanceof Error ? result.reason.message : String(result.reason) });
    }
  }

  // Process Farcaster-resolved wallets (EVM + SOL from verified addresses)
  for (const wallet of farcasterWallets) {
    addWallet(wallet);
  }

  return wallets;
}

// ═══════════════════════════════════════════════
// Fee Aggregation
// ═══════════════════════════════════════════════

export interface FetchFeesResult {
  fees: TokenFee[];
  /** Set of platforms whose adapter call(s) completed without throwing.
   * Empty set means we cannot trust "no fees" as a signal — leaves stale
   * rows alone. */
  syncedPlatforms: Set<string>;
}

/**
 * Fetch historical fees for wallets across all chain-matching platform adapters.
 * Uses Promise.allSettled to tolerate individual adapter failures.
 *
 * Returns both the fees and the set of platforms that successfully completed,
 * so callers (persistFees) can prune stale rows scoped to successful syncs only.
 */
export async function fetchAllFees(
  wallets: ResolvedWallet[]
): Promise<FetchFeesResult> {
  const allAdapters = getAllAdapters();
  const liveAdapters = getLiveFeeAdapters();

  // Build tasks for historical fees (all adapters)
  const taskMeta: Array<{ platform: string; wallet: string; type: string }> = [];
  const tasks: Promise<TokenFee[]>[] = [];

  // Multi-chain adapters whose primary chain is 'base' but also serve other EVM chains.
  // Zora needs this because it queries Base+ETH internally but its resolveIdentity is disabled.
  // Clanker is NOT here — its adapter handles Base+BSC internally via getCreatorTokens,
  // and resolveIdentity only returns 'base' wallets to avoid double-dispatch.
  const CROSS_CHAIN_EVM: Set<string> = new Set(['zora']);

  for (const wallet of wallets) {
    for (const adapter of allAdapters) {
      // Zora cross-chain: dispatch for ETH wallets only (Zora exists on Base+ETH, not BSC)
      const chainMatch = adapter.chain === wallet.chain
        || (CROSS_CHAIN_EVM.has(adapter.platform) && wallet.chain === 'eth' && adapter.chain === 'base');
      if (!chainMatch) continue;
      taskMeta.push({ platform: adapter.platform, wallet: wallet.address, type: 'historical' });
      tasks.push(adapter.getHistoricalFees(wallet.address));
    }
  }

  // Also fetch live unclaimed fees from adapters that support it.
  // Many adapters (pump, zora, etc.) have stub getHistoricalFees but working
  // getLiveUnclaimedFees — this ensures their fees appear in the platform tabs.
  //
  // Skip adapters where historicalCoversLive is true — getHistoricalFees and
  // getLiveUnclaimedFees return equivalent data, so calling both wastes RPC/API calls.
  for (const wallet of wallets) {
    for (const adapter of liveAdapters) {
      const chainMatch = adapter.chain === wallet.chain
        || (CROSS_CHAIN_EVM.has(adapter.platform) && wallet.chain === 'eth' && adapter.chain === 'base');
      if (!chainMatch) continue;
      if (adapter.historicalCoversLive) continue;
      taskMeta.push({ platform: adapter.platform, wallet: wallet.address, type: 'live' });
      tasks.push(adapter.getLiveUnclaimedFees(wallet.address));
    }
  }

  const results = await Promise.allSettled(tasks);

  // Collect all fees, dedup by platform+chain+tokenAddress.
  // When the same token appears from multiple wallets, sum the amounts
  // instead of discarding duplicates. Historical results take priority over live.
  const feeMap = new Map<string, { fee: TokenFee; isHistorical: boolean }>();
  const syncedPlatforms = new Set<string>();

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const meta = taskMeta[i];
    if (result.status === 'fulfilled') {
      // Track success per platform regardless of whether the result is empty.
      // An empty success result is a legitimate "no fees here" — it should
      // still authorize stale-row pruning for that platform.
      if (meta) syncedPlatforms.add(meta.platform);
      for (const fee of result.value) {
        const key = `${fee.platform}:${fee.chain}:${fee.tokenAddress}`;
        const existing = feeMap.get(key);
        if (!existing) {
          feeMap.set(key, { fee, isHistorical: meta.type === 'historical' });
        } else if (meta.type === 'historical' && !existing.isHistorical) {
          // Historical data replaces live data for the same key
          feeMap.set(key, { fee, isHistorical: true });
        } else {
          // Same token from a different wallet or source type — sum the amounts.
          // Keeps the historical flag if either source is historical.
          const summed = { ...existing.fee };
          summed.totalEarned = (safeBigInt(summed.totalEarned) + safeBigInt(fee.totalEarned)).toString();
          summed.totalClaimed = (safeBigInt(summed.totalClaimed) + safeBigInt(fee.totalClaimed)).toString();
          summed.totalUnclaimed = (safeBigInt(summed.totalUnclaimed) + safeBigInt(fee.totalUnclaimed)).toString();
          feeMap.set(key, { fee: summed, isHistorical: existing.isHistorical || meta.type === 'historical' });
        }
      }
    } else {
      log.warn('fee fetch failed', { platform: meta?.platform, type: meta?.type, error: result.reason instanceof Error ? result.reason.message : String(result.reason) });
    }
  }

  // DAS Discovery Pass — find tokens the individual adapters missed.
  // Only runs when HELIUS_API_KEY is set. Additive only: never overwrites adapter results.
  if (isHeliusAvailable()) {
    const solWallets = wallets.filter((w) => w.chain === 'sol');
    for (const wallet of solWallets) {
      try {
        const discovered = await discoverWalletTokens(wallet.address);
        for (const token of discovered) {
          const key = `${token.platform}:${token.chain}:${token.tokenAddress}`;
          if (!feeMap.has(key)) {
            feeMap.set(key, {
              fee: {
                tokenAddress: token.tokenAddress,
                tokenSymbol: token.symbol,
                chain: token.chain,
                platform: token.platform,
                totalEarned: '0',
                totalClaimed: '0',
                totalUnclaimed: '0',
                totalEarnedUsd: null,
                royaltyBps: null,
              },
              isHistorical: false,
            });
          }
        }
      } catch (err) {
        log.warn('DAS discovery failed', { wallet: wallet.address, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  return {
    fees: Array.from(feeMap.values()).map((entry) => entry.fee),
    syncedPlatforms,
  };
}

/**
 * Fetch fees designated to a social handle across all platforms that support it.
 * This works independently of wallet resolution — platforms like Bags.fm track
 * fee allocations by social identity (Twitter, GitHub, etc.), so fees can
 * accumulate even if the recipient hasn't connected a wallet.
 * Uses Promise.allSettled to tolerate individual adapter failures.
 *
 * Returns both the fees and the set of platforms that successfully completed.
 */
export async function fetchFeesByHandle(
  handle: string,
  provider: IdentityProvider
): Promise<FetchFeesResult> {
  if (provider === 'wallet') return { fees: [], syncedPlatforms: new Set() };

  const adapters = getHandleFeeAdapters();
  if (adapters.length === 0) return { fees: [], syncedPlatforms: new Set() };

  const results = await Promise.allSettled(
    adapters.map((adapter) => adapter.getFeesByHandle(handle, provider))
  );

  const allFees: TokenFee[] = [];
  const syncedPlatforms = new Set<string>();
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const platform = adapters[i]?.platform ?? 'unknown';
    if (result.status === 'fulfilled') {
      syncedPlatforms.add(platform);
      allFees.push(...result.value);
    } else {
      log.warn('getFeesByHandle failed', { platform, error: result.reason instanceof Error ? result.reason.message : String(result.reason) });
    }
  }

  return { fees: allFees, syncedPlatforms };
}

/** Route-level budget for the entire live-fee aggregation.
 * Vercel Hobby hard limit = 60s. Leave 5s for JSON serialization + network. */
const LIVE_AGGREGATION_TIMEOUT_MS = 55_000;

/**
 * Fetch live unclaimed fees for wallets across all platforms.
 * Uses Promise.allSettled to tolerate individual adapter failures.
 * Wrapped in a route-level wallclock guard to prevent silent Vercel 504s —
 * if the slowest adapter exceeds the budget, we return partial results
 * from adapters that already completed.
 */
export async function fetchLiveUnclaimedFees(
  wallets: ResolvedWallet[]
): Promise<TokenFee[]> {
  const adapters = getAllAdapters().filter((a) => a.supportsLiveFees);

  // AbortController to cancel in-flight adapter requests when the
  // wallclock budget expires. Prevents orphaned HTTP/RPC connections
  // from lingering after the response is sent.
  const controller = new AbortController();

  // Multi-chain adapters: Zora only (see CROSS_CHAIN_EVM comment above)
  const LIVE_CROSS_CHAIN_EVM: Set<string> = new Set(['zora']);

  const taskMeta: Array<{ platform: string; wallet: string }> = [];
  const tasks = wallets.flatMap((wallet) =>
    adapters
      .filter((a) => {
        if (a.chain === wallet.chain) return true;
        return LIVE_CROSS_CHAIN_EVM.has(a.platform) && wallet.chain === 'eth' && a.chain === 'base';
      })
      .map((adapter) => {
        taskMeta.push({ platform: adapter.platform, wallet: wallet.address });
        return adapter.getLiveUnclaimedFees(wallet.address, controller.signal);
      })
  );

  // Race the aggregation against a wallclock timeout.
  // On timeout we abort pending adapters and collect settled results.
  const allFees: TokenFee[] = [];
  let results: PromiseSettledResult<TokenFee[]>[];

  try {
    let liveTimeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      results = await Promise.race([
        Promise.allSettled(tasks),
        new Promise<never>((_, reject) => {
          liveTimeoutId = setTimeout(
            () => reject(new Error('LIVE_AGGREGATION_TIMEOUT')),
            LIVE_AGGREGATION_TIMEOUT_MS
          );
        }),
      ]);
    } finally {
      clearTimeout(liveTimeoutId);
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'LIVE_AGGREGATION_TIMEOUT') {
      log.warn('live aggregation timed out — aborting pending adapters', { timeoutMs: LIVE_AGGREGATION_TIMEOUT_MS });
      controller.abort();
      // Collect results from tasks that already settled.
      // 50ms delay gives abort signals time to propagate before we snapshot.
      results = await Promise.allSettled(
        tasks.map((t) => Promise.race([t, new Promise<TokenFee[]>((r) => setTimeout(() => r([]), 50))]))
      );
    } else {
      throw err;
    }
  }

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      allFees.push(...result.value);
    } else {
      const meta = taskMeta[i];
      // Don't log abort errors — they're expected on timeout
      if (result.reason?.name !== 'AbortError') {
        log.warn('getLiveUnclaimedFees failed', { platform: meta?.platform, error: result.reason instanceof Error ? result.reason.message : String(result.reason) });
      }
    }
  }

  return allFees;
}
