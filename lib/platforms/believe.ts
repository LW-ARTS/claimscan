import 'server-only';
import { PublicKey } from '@solana/web3.js';
import { METEORA_DBC_PROGRAM } from '@/lib/constants';
import type { IdentityProvider } from '@/lib/supabase/types';
import type {
  PlatformAdapter,
  ResolvedWallet,
  CreatorToken,
  TokenFee,
  ClaimEvent,
} from './types';

// ═══════════════════════════════════════════════
// Believe.app Adapter
//
// Believe uses Meteora DBC (Dynamic Bonding Curve).
// Fees are embedded in the VirtualPool account data.
// Identity resolution is off-chain/custodial — not supported.
// ═══════════════════════════════════════════════

const METEORA_PROGRAM = new PublicKey(METEORA_DBC_PROGRAM);

/**
 * Derive the Meteora DBC pool PDA for a given token mint.
 *
 * WARNING: This PDA derivation is incomplete. The full Meteora DBC
 * VirtualPool PDA requires [Buffer.from('virtual_pool'), poolConfig, baseMint]
 * where poolConfig is a specific Pubkey for each pool configuration.
 * This simplified derivation will NOT produce valid addresses.
 * Kept as a placeholder for future implementation with correct seeds.
 *
 * @internal Not currently used — all adapter methods return empty arrays.
 */
function _deriveVirtualPool(tokenMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('virtual_pool'), tokenMint.toBuffer()],
    METEORA_PROGRAM
  );
}

export const believeAdapter: PlatformAdapter = {
  platform: 'believe',
  chain: 'sol',
  supportsIdentityResolution: false,
  // Disabled: all fee methods return empty arrays until token discovery
  // and correct PDA derivation are implemented.
  supportsLiveFees: false,

  async resolveIdentity(
    _handle: string,
    _provider: IdentityProvider
  ): Promise<ResolvedWallet[]> {
    return [];
  },

  async getCreatorTokens(_wallet: string): Promise<CreatorToken[]> {
    // Would require scanning Meteora DBC events for creator.
    // Not implementing for MVP.
    return [];
  },

  async getHistoricalFees(_wallet: string): Promise<TokenFee[]> {
    return [];
  },

  async getLiveUnclaimedFees(_wallet: string): Promise<TokenFee[]> {
    // Believe doesn't have a direct "list all tokens by creator" API.
    // For a given token mint, we could read the VirtualPool account
    // and deserialize the fee fields. But without knowing which tokens
    // belong to this creator, we can't enumerate them.
    //
    // Additionally, the PDA derivation is incomplete (missing poolConfig seed).
    // This adapter becomes useful when combined with correct PDA seeds and
    // token discovery from the creator_tokens table.
    return [];
  },

  async getClaimHistory(_wallet: string): Promise<ClaimEvent[]> {
    return [];
  },
};
