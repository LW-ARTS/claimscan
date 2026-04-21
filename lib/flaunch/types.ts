import type { BaseAddress } from '@/lib/chains/types';

type Brand<K, T> = K & { readonly __brand: T };

/**
 * A BaseAddress additionally tagged as a Flaunch-issued coin token.
 */
export type FlaunchCoinAddress = Brand<BaseAddress, 'FlaunchCoinAddress'>;

// ═══════════════════════════════════════════════
// GET /v1/base/tokens?ownerAddress=0x...
// Response: { data: FlaunchTokenListItem[], pagination: { limit, offset } }
// ═══════════════════════════════════════════════

export interface FlaunchTokenListItem {
  tokenAddress: string;
  symbol: string;
  name: string;
  marketCapETH: string;
  createdAt: number;
}

export interface FlaunchTokenListResponse {
  data: FlaunchTokenListItem[];
  pagination: {
    limit: number;
    offset: number;
  };
}

// ═══════════════════════════════════════════════
// GET /v1/base/tokens/:tokenAddress
// ═══════════════════════════════════════════════

export interface FlaunchTokenDetail {
  tokenAddress: string;
  symbol: string;
  name: string;
  image?: string | null;
  description?: string | null;
  socials?: {
    website?: string;
    twitter?: string;
    telegram?: string;
    discord?: string;
    farcaster?: string;
  };
}

// ═══════════════════════════════════════════════
// Discriminated error union
// ═══════════════════════════════════════════════

export type FlaunchApiError =
  | { kind: 'rate_limited'; retryAfterMs: number }
  | { kind: 'not_found' }
  | { kind: 'schema_drift'; rawBody: unknown; path: string }
  | { kind: 'network_error'; message: string; path: string };
