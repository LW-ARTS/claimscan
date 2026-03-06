import 'server-only';
import { getIdentityResolvers, getAllAdapters, getHandleFeeAdapters } from '@/lib/platforms';
import { resolveFarcasterWallets } from './farcaster';
import type { ResolvedWallet, TokenFee } from '@/lib/platforms/types';
import type { IdentityProvider } from '@/lib/supabase/types';
import { isValidSolanaAddress } from '@/lib/chains/solana';
import { isValidEvmAddress, normalizeEvmAddress } from '@/lib/chains/base';

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
  if (handle.includes('github.com/')) {
    const match = handle.match(/github\.com\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,38})(?:\/|$|\?)/);
    if (match && !GITHUB_NON_USER_PATHS.has(match[1].toLowerCase())) {
      return { value: match[1].toLowerCase(), provider: 'github' };
    }
  }

  // Twitter/X URL pattern
  if (handle.includes('twitter.com/') || handle.includes('x.com/')) {
    const match = handle.match(/(?:twitter|x)\.com\/([a-zA-Z0-9_]+)/);
    if (match) return { value: match[1].toLowerCase(), provider: 'twitter' };
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
      // Normalize to EIP-55 checksummed form to prevent case-sensitive DB duplicates
      return [{ address: normalizeEvmAddress(handle), chain: 'base', sourcePlatform: 'clanker' }];
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
      console.warn('[identity] farcaster resolve failed:', err instanceof Error ? err.message : err);
      return [] as ResolvedWallet[];
    }),
  ]);

  const wallets: ResolvedWallet[] = [];
  const seenAddresses = new Set<string>();

  // Helper to add a wallet with dedup
  const addWallet = (wallet: ResolvedWallet) => {
    const normalizedAddress = (wallet.chain === 'base' || wallet.chain === 'eth')
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
      console.warn(`[identity] ${platform} resolveIdentity failed:`, result.reason);
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

/**
 * Fetch historical fees for wallets across all chain-matching platform adapters.
 * Uses Promise.allSettled to tolerate individual adapter failures.
 */
export async function fetchAllFees(
  wallets: ResolvedWallet[]
): Promise<TokenFee[]> {
  const adapters = getAllAdapters();
  const allFees: TokenFee[] = [];

  // Build tasks with adapter metadata for error logging
  const taskMeta: Array<{ platform: string; wallet: string }> = [];
  const tasks = wallets.flatMap((wallet) =>
    adapters
      .filter((a) => a.chain === wallet.chain)
      .map((adapter) => {
        taskMeta.push({ platform: adapter.platform, wallet: wallet.address });
        return adapter.getHistoricalFees(wallet.address);
      })
  );

  const results = await Promise.allSettled(tasks);
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      allFees.push(...result.value);
    } else {
      const meta = taskMeta[i];
      console.warn(`[fees] ${meta?.platform} getHistoricalFees failed:`, result.reason);
    }
  }

  return allFees;
}

/**
 * Fetch fees designated to a social handle across all platforms that support it.
 * This works independently of wallet resolution — platforms like Bags.fm track
 * fee allocations by social identity (Twitter, GitHub, etc.), so fees can
 * accumulate even if the recipient hasn't connected a wallet.
 * Uses Promise.allSettled to tolerate individual adapter failures.
 */
export async function fetchFeesByHandle(
  handle: string,
  provider: IdentityProvider
): Promise<TokenFee[]> {
  if (provider === 'wallet') return [];

  const adapters = getHandleFeeAdapters();
  if (adapters.length === 0) return [];

  const results = await Promise.allSettled(
    adapters.map((adapter) => adapter.getFeesByHandle(handle, provider))
  );

  const allFees: TokenFee[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      allFees.push(...result.value);
    } else {
      const platform = adapters[i]?.platform ?? 'unknown';
      console.warn(`[fees] ${platform} getFeesByHandle failed:`, result.reason);
    }
  }

  return allFees;
}

/**
 * Fetch live unclaimed fees for wallets across all platforms.
 * Uses Promise.allSettled to tolerate individual adapter failures.
 */
export async function fetchLiveUnclaimedFees(
  wallets: ResolvedWallet[]
): Promise<TokenFee[]> {
  const adapters = getAllAdapters().filter((a) => a.supportsLiveFees);
  const allFees: TokenFee[] = [];

  const taskMeta: Array<{ platform: string; wallet: string }> = [];
  const tasks = wallets.flatMap((wallet) =>
    adapters
      .filter((a) => a.chain === wallet.chain)
      .map((adapter) => {
        taskMeta.push({ platform: adapter.platform, wallet: wallet.address });
        return adapter.getLiveUnclaimedFees(wallet.address);
      })
  );

  const results = await Promise.allSettled(tasks);
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      allFees.push(...result.value);
    } else {
      const meta = taskMeta[i];
      console.warn(`[fees] ${meta?.platform} getLiveUnclaimedFees failed:`, result.reason);
    }
  }

  return allFees;
}
