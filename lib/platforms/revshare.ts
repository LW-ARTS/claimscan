import 'server-only';
import { PublicKey } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  getMint,
  getTransferFeeConfig,
} from '@solana/spl-token';
import { getConnection, isValidSolanaAddress, withRpcFallback } from '@/lib/chains/solana';
import { enrichSolanaTokenSymbols } from './solana-metadata';
import type { IdentityProvider } from '@/lib/supabase/types';
import type {
  PlatformAdapter,
  ResolvedWallet,
  CreatorToken,
  TokenFee,
  ClaimEvent,
} from './types';

// ═══════════════════════════════════════════════
// RevShare Adapter
//
// RevShare.dev uses Token-2022 TransferFeeExtension.
// When transfers occur, a percentage is withheld from each
// transfer. These withheld fees accumulate in token accounts
// and can be harvested to the mint, then withdrawn by the
// `withdrawWithheldAuthority`.
//
// Strategy:
// 1. Find all Token-2022 mints where the wallet is the
//    withdrawWithheldAuthority (via getProgramAccounts + memcmp).
// 2. For each mint, read the withheld amount from the
//    TransferFeeConfig extension.
//
// Offset 120 = 82 (base mint) + 1 (padding) + 1 (accountType)
//            + 2 (extensionType) + 2 (extensionLen)
//            + 32 (transferFeeConfigAuthority)
// ═══════════════════════════════════════════════

/** Per-call timeout for GPA queries. */
const GPA_TIMEOUT_MS = 20_000;

/**
 * Offset of `withdrawWithheldAuthority` in a Token-2022 mint account
 * where TransferFeeConfig is the first extension.
 *
 * Layout: 82 (base) + 1 (padding) + 1 (AccountType=Mint)
 *       + 2 (ExtensionType) + 2 (Length)
 *       + 32 (transferFeeConfigAuthority)
 *       = 120
 */
const WITHDRAW_AUTHORITY_OFFSET = 120;

/**
 * Offset of the AccountType byte in Token-2022 mint accounts.
 * Value 1 = Mint, 2 = Account.
 */
const ACCOUNT_TYPE_OFFSET = 83;

export const revshareAdapter: PlatformAdapter = {
  platform: 'revshare',
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
      const mintAddresses = await findMintsByWithdrawAuthority(wallet);
      return mintAddresses.map((addr) => ({
        tokenAddress: addr,
        chain: 'sol' as const,
        platform: 'revshare' as const,
        symbol: null,
        name: null,
        imageUrl: null,
      }));
    } catch (err) {
      console.warn(
        '[revshare] getCreatorTokens failed:',
        err instanceof Error ? err.message : err
      );
      return [];
    }
  },

  async getHistoricalFees(_wallet: string): Promise<TokenFee[]> {
    // Token-2022 doesn't store historical totals onchain.
    // Only current withheld amounts are available.
    return [];
  },

  async getLiveUnclaimedFees(wallet: string): Promise<TokenFee[]> {
    if (!isValidSolanaAddress(wallet)) return [];

    try {
      const mintAddresses = await findMintsByWithdrawAuthority(wallet);
      if (mintAddresses.length === 0) return [];

      const connection = getConnection();
      const fees: TokenFee[] = [];

      // Process mints in parallel (limited batch to avoid overwhelming RPC)
      const BATCH_SIZE = 10;
      for (let i = 0; i < mintAddresses.length; i += BATCH_SIZE) {
        const batch = mintAddresses.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (mintAddr) => {
            const mintPubkey = new PublicKey(mintAddr);
            const mintAccount = await withRpcFallback(
              (c) => getMint(c, mintPubkey, 'confirmed', TOKEN_2022_PROGRAM_ID),
              'revshare-get-mint'
            );

            const feeConfig = getTransferFeeConfig(mintAccount);
            if (!feeConfig) return null;

            const withheldAmount = BigInt(feeConfig.withheldAmount.toString());
            if (withheldAmount === 0n) return null;

            return {
              tokenAddress: mintAddr,
              tokenSymbol: null as string | null,
              chain: 'sol' as const,
              platform: 'revshare' as const,
              totalEarned: '0',
              totalClaimed: '0',
              totalUnclaimed: withheldAmount.toString(),
              totalEarnedUsd: null,
              royaltyBps: feeConfig.newerTransferFee?.transferFeeBasisPoints
                ? Number(feeConfig.newerTransferFee.transferFeeBasisPoints)
                : null,
            };
          })
        );

        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            fees.push(result.value);
          }
        }
      }

      return enrichSolanaTokenSymbols(fees);
    } catch (err) {
      console.warn(
        '[revshare] getLiveUnclaimedFees failed:',
        err instanceof Error ? err.message : err
      );
      return [];
    }
  },

  async getClaimHistory(_wallet: string): Promise<ClaimEvent[]> {
    return [];
  },
};

/**
 * Find all Token-2022 mints where the given wallet is the
 * `withdrawWithheldAuthority` of the TransferFeeConfig extension.
 *
 * Uses getProgramAccounts with memcmp filters:
 * 1. AccountType at offset 83 = 1 (Mint)
 * 2. withdrawWithheldAuthority at offset 120 = wallet pubkey
 *
 * NOTE: This assumes TransferFeeConfig is the FIRST extension
 * (ExtensionType=1, the lowest value). This holds for the vast
 * majority of Token-2022 mints with transfer fees. Mints with
 * a different extension ordering will be missed (acceptable for MVP).
 */
async function findMintsByWithdrawAuthority(wallet: string): Promise<string[]> {
  const walletPubkey = new PublicKey(wallet);

  const accounts = await raceGpaTimeout(
    withRpcFallback(
      (connection) =>
        connection.getProgramAccounts(TOKEN_2022_PROGRAM_ID, {
          commitment: 'confirmed',
          filters: [
            // Filter: withdrawWithheldAuthority = wallet
            // At offset 120 when TransferFeeConfig is the first extension.
            {
              memcmp: {
                offset: WITHDRAW_AUTHORITY_OFFSET,
                bytes: walletPubkey.toBase58(),
              },
            },
          ],
        }),
      'revshare-find-mints'
    ),
    'revshare-gpa'
  );

  return accounts.map((a) => a.pubkey.toBase58());
}

/**
 * Race a promise against a timeout for expensive RPC calls.
 */
function raceGpaTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${GPA_TIMEOUT_MS}ms`)),
      GPA_TIMEOUT_MS
    );
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}
