import 'server-only';
import { PublicKey } from '@solana/web3.js';
import { RAYDIUM_LAUNCHLAB_API, RAYDIUM_LAUNCHLAB_PROGRAM_ID } from '@/lib/constants';
import { isValidSolanaAddress, withRpcFallback } from '@/lib/chains/solana';
import { sanitizeTokenName, sanitizeTokenSymbol } from '@/lib/utils';
import type { IdentityProvider } from '@/lib/supabase/types';
import type {
  PlatformAdapter,
  ResolvedWallet,
  CreatorToken,
  TokenFee,
} from './types';
import { createLogger } from '@/lib/logger';
const log = createLogger('raydium');

const RAYDIUM_LAUNCHLAB_PROGRAM = new PublicKey(RAYDIUM_LAUNCHLAB_PROGRAM_ID);

/** WSOL mint — Raydium LaunchLab uses WSOL as quote token (mintB). */
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

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

/**
 * Derive the per-token creator fee vault PDA.
 * Seeds: [creator, mintB] — each token has its own fee vault per creator.
 * mintB is the quote token (WSOL for LaunchLab tokens).
 */
function deriveCreatorVault(
  creator: PublicKey,
  mintB: PublicKey = WSOL_MINT
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [creator.toBuffer(), mintB.toBuffer()],
    RAYDIUM_LAUNCHLAB_PROGRAM
  );
}

async function fetchCreatorTokens(
  wallet: string,
  externalSignal?: AbortSignal
): Promise<LaunchLabToken[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const combinedSignal = externalSignal
      ? AbortSignal.any([externalSignal, controller.signal])
      : controller.signal;
    const res = await fetch(
      `${RAYDIUM_LAUNCHLAB_API}/get/by/user?wallet=${encodeURIComponent(wallet)}&size=100`,
      { signal: combinedSignal }
    );
    clearTimeout(timeout);
    if (!res.ok) {
      log.warn(`fetchCreatorTokens returned HTTP ${res.status}`);
      return [];
    }
    const data = (await res.json()) as LaunchLabResponse;
    return data.data?.rows ?? [];
  } catch (err) {
    log.warn('fetchCreatorTokens failed', { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

export const raydiumAdapter: PlatformAdapter = {
  platform: 'raydium',
  chain: 'sol',
  supportsIdentityResolution: false,
  supportsLiveFees: true,
  supportsHandleBasedFees: false,
  historicalCoversLive: true,

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
        name: sanitizeTokenName(t.name),
        imageUrl: (t.imageUri ?? t.image ?? '').startsWith('https://') ? (t.imageUri ?? t.image ?? null) : null,
      })).filter((t) => t.tokenAddress.length > 0);
    } catch (err) {
      log.warn('getCreatorTokens failed', { error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  },

  async getHistoricalFees(wallet: string): Promise<TokenFee[]> {
    return this.getLiveUnclaimedFees(wallet);
  },

  async getLiveUnclaimedFees(wallet: string, signal?: AbortSignal): Promise<TokenFee[]> {
    if (!isValidSolanaAddress(wallet)) return [];

    try {
      const creatorPk = new PublicKey(wallet);

      // Discover tokens first, then check per-token vaults
      const tokens = await fetchCreatorTokens(wallet, signal);
      if (tokens.length === 0) return [];

      // LaunchLab vault PDA is [creator, WSOL_MINT] — one vault per creator
      // (all LaunchLab tokens use WSOL as quote). Query ONCE, report once.
      const [vault] = deriveCreatorVault(creatorPk, WSOL_MINT);
      const balance = await withRpcFallback(
        (c) => c.getBalance(vault),
        `raydium-vault-${wallet.slice(0, 8)}`,
        signal
      );
      // Vault balance includes rent-exempt minimum (890,880 lamports)
      const RENT_EXEMPT_MINIMUM = 890_880n;
      const rawBalance = BigInt(balance);
      const unclaimed = rawBalance > RENT_EXEMPT_MINIMUM ? rawBalance - RENT_EXEMPT_MINIMUM : 0n;

      if (unclaimed <= 0n) return [];

      // Fee Key NFT detection:
      // Raydium has 2 fee phases. The bonding curve vault (what we read above)
      // does NOT require a Fee Key NFT — the creator just signs.
      // The Fee Key NFT is only needed for post-graduation LP fees (Burn & Earn
      // via CLMM PersonalPosition). Since we only track bonding curve fees here,
      // claimRightLost is not applicable. When LP fee tracking is added,
      // use hasRaydiumFeeKeyNft() from lib/chains/solana.ts.

      // Report as SOL earnings from the vault, not attributed to any specific token.
      // The vault PDA is [creator, WSOL_MINT] — one vault per creator shared by
      // ALL their LaunchLab tokens. Attributing to a single token is wrong when
      // the creator has multiple tokens.
      return [{
        tokenAddress: WSOL_MINT.toBase58(),
        tokenSymbol: 'SOL',
        chain: 'sol',
        platform: 'raydium',
        // totalEarned = unclaimed since claimed tracking was removed
        // (fetchVaultClaimTotal was unreliable). MAX preservation in
        // creator.ts ensures existing claimed values are never regressed.
        totalEarned: unclaimed.toString(),
        totalClaimed: '0',
        totalUnclaimed: unclaimed.toString(),
        totalEarnedUsd: null,
        royaltyBps: null,
      }];
    } catch (err) {
      log.warn('getLiveUnclaimedFees failed', { error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  },

};
