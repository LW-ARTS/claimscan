import 'server-only';
import { PublicKey } from '@solana/web3.js';
import { RAYDIUM_LAUNCHLAB_API, RAYDIUM_LAUNCHLAB_PROGRAM_ID } from '@/lib/constants';
import { getConnection, isValidSolanaAddress, withRpcFallback } from '@/lib/chains/solana';
import { sanitizeTokenSymbol } from '@/lib/utils';
import type { IdentityProvider } from '@/lib/supabase/types';
import type {
  PlatformAdapter,
  ResolvedWallet,
  CreatorToken,
  TokenFee,
  ClaimEvent,
} from './types';

// ═══════════════════════════════════════════════
// Raydium LaunchLab Adapter
//
// Uses the Raydium LaunchLab REST API for token
// discovery and onchain PDA for unclaimed fees.
//
// Program: LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj
// Fee vault PDA: ["platform_fee_sol_vault", creator]
// ═══════════════════════════════════════════════

const RAYDIUM_LAUNCHLAB_PROGRAM = new PublicKey(RAYDIUM_LAUNCHLAB_PROGRAM_ID);

/** Rent-exempt minimum for a 0-byte account. */
const RENT_EXEMPT_MINIMUM = 890_880n;

// ═══════════════════════════════════════════════
// API Types
// ═══════════════════════════════════════════════

interface LaunchLabToken {
  mint?: string;
  tokenMint?: string;
  symbol?: string;
  name?: string;
  imageUri?: string;
  image?: string;
  creator?: string;
}

interface LaunchLabResponse {
  success: boolean;
  data?: {
    rows?: LaunchLabToken[];
  };
}

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

/**
 * Derive the creator fee vault PDA for Raydium LaunchLab.
 * Seeds: ["platform_fee_sol_vault", creator_pubkey]
 */
function deriveCreatorVault(creator: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('platform_fee_sol_vault'), creator.toBuffer()],
    RAYDIUM_LAUNCHLAB_PROGRAM
  );
}

/**
 * Fetch tokens created by a wallet from Raydium LaunchLab API.
 */
async function fetchCreatorTokens(
  wallet: string
): Promise<LaunchLabToken[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(
      `${RAYDIUM_LAUNCHLAB_API}/get/by/user?wallet=${encodeURIComponent(wallet)}&size=100`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = (await res.json()) as LaunchLabResponse;
    return data.data?.rows ?? [];
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════
// Raydium LaunchLab Adapter
// ═══════════════════════════════════════════════

export const raydiumAdapter: PlatformAdapter = {
  platform: 'raydium',
  chain: 'sol',
  supportsIdentityResolution: false,
  supportsLiveFees: true,
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

  async getCreatorTokens(wallet: string): Promise<CreatorToken[]> {
    if (!isValidSolanaAddress(wallet)) return [];

    try {
      const tokens = await fetchCreatorTokens(wallet);
      return tokens.map((t) => ({
        tokenAddress: t.mint ?? t.tokenMint ?? '',
        chain: 'sol' as const,
        platform: 'raydium' as const,
        symbol: sanitizeTokenSymbol(t.symbol),
        name: t.name ? sanitizeTokenSymbol(t.name) : null,
        imageUrl: t.imageUri ?? t.image ?? null,
      })).filter((t) => t.tokenAddress.length > 0);
    } catch (err) {
      console.warn(
        '[raydium] getCreatorTokens failed:',
        err instanceof Error ? err.message : err
      );
      return [];
    }
  },

  async getHistoricalFees(wallet: string): Promise<TokenFee[]> {
    // Same as live — onchain vault is the source of truth
    return this.getLiveUnclaimedFees(wallet);
  },

  async getLiveUnclaimedFees(wallet: string): Promise<TokenFee[]> {
    if (!isValidSolanaAddress(wallet)) return [];

    try {
      const creatorPk = new PublicKey(wallet);
      const [vault] = deriveCreatorVault(creatorPk);

      const balance = await withRpcFallback(
        (c) => c.getBalance(vault),
        'raydium-vault-balance'
      );
      const balanceBig = BigInt(balance);
      const unclaimed = balanceBig > RENT_EXEMPT_MINIMUM
        ? balanceBig - RENT_EXEMPT_MINIMUM
        : 0n;

      if (unclaimed === 0n) return [];

      return [{
        tokenAddress: `SOL:raydium:${vault.toBase58()}`,
        tokenSymbol: 'SOL',
        chain: 'sol',
        platform: 'raydium',
        totalEarned: '0',
        totalClaimed: '0',
        totalUnclaimed: unclaimed.toString(),
        totalEarnedUsd: null,
        royaltyBps: null,
      }];
    } catch (err) {
      console.warn(
        '[raydium] getLiveUnclaimedFees failed:',
        err instanceof Error ? err.message : err
      );
      return [];
    }
  },

  async getClaimHistory(_wallet: string): Promise<ClaimEvent[]> {
    return [];
  },
};
