import type { Platform, Chain, IdentityProvider } from '@/lib/supabase/types';

// ═══════════════════════════════════════════════
// Resolved Identity
// ═══════════════════════════════════════════════

export interface ResolvedWallet {
  address: string;
  chain: Chain;
  sourcePlatform: Platform;
}

// ═══════════════════════════════════════════════
// Creator Token
// ═══════════════════════════════════════════════

export interface CreatorToken {
  tokenAddress: string;
  chain: Chain;
  platform: Platform;
  symbol: string | null;
  name: string | null;
  imageUrl: string | null;
}

// ═══════════════════════════════════════════════
// Fee Data
// ═══════════════════════════════════════════════

export interface TokenFee {
  tokenAddress: string;
  tokenSymbol: string | null;
  chain: Chain;
  platform: Platform;
  totalEarned: string;     // BigInt as string (lamports/wei precision)
  totalClaimed: string;
  totalUnclaimed: string;
  totalEarnedUsd: number | null;
  royaltyBps: number | null;
  feeTokenType?: string;
}

// ═══════════════════════════════════════════════
// Claim Event
// ═══════════════════════════════════════════════

export interface ClaimEvent {
  tokenAddress: string;
  chain: Chain;
  platform: Platform;
  amount: string;
  amountUsd: number | null;
  txHash: string | null;
  claimedAt: string; // ISO timestamp
}

// ═══════════════════════════════════════════════
// Platform Adapter Interface
// ═══════════════════════════════════════════════

export interface PlatformAdapter {
  /** Which platform this adapter handles */
  platform: Platform;
  /** Primary chain for this platform */
  chain: Chain;

  /** Can this platform resolve a social handle to wallet addresses? */
  supportsIdentityResolution: boolean;
  /** Can this platform query live unclaimed fees onchain? */
  supportsLiveFees: boolean;
  /** Can this platform query fees designated to a social handle directly? */
  supportsHandleBasedFees: boolean;
  /** Does getHistoricalFees already cover getLiveUnclaimedFees data?
   * When true, the orchestrator skips the live call to avoid duplicate API/RPC work. */
  historicalCoversLive: boolean;

  /**
   * Resolve a social identity (twitter, github, etc.) to wallet addresses.
   * Only available if supportsIdentityResolution is true.
   */
  resolveIdentity(
    handle: string,
    provider: IdentityProvider
  ): Promise<ResolvedWallet[]>;

  /**
   * Get fees designated to a social handle (e.g., @VitalikButerin on Twitter).
   * Works even if the handle owner hasn't connected a wallet — the platform
   * tracks fee allocations by social identity, not wallet address.
   * Only available if supportsHandleBasedFees is true.
   */
  getFeesByHandle(
    handle: string,
    provider: IdentityProvider
  ): Promise<TokenFee[]>;

  /**
   * Get tokens created/launched by this wallet on this platform.
   */
  getCreatorTokens(wallet: string): Promise<CreatorToken[]>;

  /**
   * Get historical fee data for each token (cached-friendly).
   */
  getHistoricalFees(wallet: string): Promise<TokenFee[]>;

  /**
   * Get live unclaimed fees (real-time onchain query).
   * Only available if supportsLiveFees is true.
   * @param signal - Optional AbortSignal to cancel in-flight RPC/HTTP requests
   *                 when the caller's wallclock budget expires.
   */
  getLiveUnclaimedFees(wallet: string, signal?: AbortSignal): Promise<TokenFee[]>;

  /**
   * Get claim history (individual claim transactions).
   */
  getClaimHistory(wallet: string): Promise<ClaimEvent[]>;
}
