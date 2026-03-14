import 'server-only';
import type { IdentityProvider } from '@/lib/supabase/types';
import type {
  PlatformAdapter,
  ResolvedWallet,
  CreatorToken,
  TokenFee,
  ClaimEvent,
} from './types';

// ═══════════════════════════════════════════════
// Heaven Adapter (Stub)
//
// Placeholder adapter for the Heaven platform.
// Implements the full PlatformAdapter interface
// with no-op methods until the Heaven integration
// is built out.
// ═══════════════════════════════════════════════

export const heavenAdapter: PlatformAdapter = {
  platform: 'heaven',
  chain: 'sol',
  supportsIdentityResolution: false,
  supportsLiveFees: false,
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

  async getLiveUnclaimedFees(_wallet: string, _signal?: AbortSignal): Promise<TokenFee[]> {
    return [];
  },

  async getClaimHistory(_wallet: string): Promise<ClaimEvent[]> {
    return [];
  },
};
