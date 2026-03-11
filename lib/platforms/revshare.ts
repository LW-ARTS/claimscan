import 'server-only';
import { PublicKey } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  getMint,
  getTransferFeeConfig,
} from '@solana/spl-token';
import { isValidSolanaAddress, withRpcFallback, getRpcUrls } from '@/lib/chains/solana';
import { fetchTokenClaimTotal } from '@/lib/helius/transactions';
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

            // Fetch claimed total from Helius token transfer history
            const claimed = await fetchTokenClaimTotal(mintAddr, wallet, mintAddr);

            if (withheldAmount === 0n && claimed === 0n) return null;

            return {
              tokenAddress: mintAddr,
              tokenSymbol: null as string | null,
              chain: 'sol' as const,
              platform: 'revshare' as const,
              totalEarned: (withheldAmount + claimed).toString(),
              totalClaimed: claimed.toString(),
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
          } else if (result.status === 'rejected') {
            console.warn('[revshare] mint read failed:', result.reason instanceof Error ? result.reason.message : result.reason);
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
 * Uses Helius getProgramAccountsV2 with cursor-based pagination to handle
 * the large Token-2022 program account set. Falls back to standard
 * getProgramAccounts if getProgramAccountsV2 is unavailable.
 *
 * NOTE: This assumes TransferFeeConfig is the FIRST extension
 * (ExtensionType=1, the lowest value). This holds for the vast
 * majority of Token-2022 mints with transfer fees. Mints with
 * a different extension ordering will be missed (acceptable for MVP).
 */
async function findMintsByWithdrawAuthority(wallet: string): Promise<string[]> {
  const walletPubkey = new PublicKey(wallet);
  const rpcUrls = getRpcUrls();

  const filters = [
    {
      memcmp: {
        offset: ACCOUNT_TYPE_OFFSET,
        bytes: '2', // base58 encoding of byte [1] (Mint)
      },
    },
    {
      memcmp: {
        offset: WITHDRAW_AUTHORITY_OFFSET,
        bytes: walletPubkey.toBase58(),
      },
    },
  ];

  // Try each RPC with fallback
  for (let rpcIdx = 0; rpcIdx < rpcUrls.length; rpcIdx++) {
    const rpcUrl = rpcUrls[rpcIdx];
    try {
      // Attempt getProgramAccountsV2 (Helius) with cursor pagination
      const accounts = await fetchGpaV2(rpcUrl, filters);
      return accounts;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // If method not found, this RPC doesn't support V2 — try standard GPA
      if (msg.includes('Method not found') || msg.includes('not found')) {
        try {
          return await fetchGpaStandard(rpcUrl, filters);
        } catch (fallbackErr) {
          console.warn(
            `[revshare] findMintsByWithdrawAuthority standard GPA failed on RPC #${rpcIdx + 1}:`,
            fallbackErr instanceof Error ? fallbackErr.message : fallbackErr
          );
        }
      } else {
        console.warn(
          `[revshare] findMintsByWithdrawAuthority failed on RPC #${rpcIdx + 1}:`,
          msg
        );
      }
    }
  }

  return [];
}

/** Helius getProgramAccountsV2 with cursor-based pagination. */
async function fetchGpaV2(
  rpcUrl: string,
  filters: Array<{ memcmp: { offset: number; bytes: string } }>
): Promise<string[]> {
  const accounts: string[] = [];
  let paginationKey: string | null = null;
  const MAX_PAGES = 20; // safety cap

  for (let page = 0; page < MAX_PAGES; page++) {
    const params: Record<string, unknown> = {
      encoding: 'base64',
      commitment: 'confirmed',
      dataSlice: { offset: 0, length: 0 }, // only need pubkeys
      filters,
    };
    if (paginationKey) params.paginationKey = paginationKey;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GPA_TIMEOUT_MS);

    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getProgramAccountsV2',
        params: [TOKEN_2022_PROGRAM_ID.toBase58(), params],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const json = await res.json();
    if (json.error) throw new Error(json.error.message);

    const result = json.result;
    for (const item of result.accounts ?? []) {
      accounts.push(item.pubkey);
    }

    paginationKey = result.paginationKey ?? null;
    if (!paginationKey || (result.accounts ?? []).length === 0) break;
  }

  return accounts;
}

/** Standard getProgramAccounts via raw HTTP (fallback for non-Helius RPCs). */
async function fetchGpaStandard(
  rpcUrl: string,
  filters: Array<{ memcmp: { offset: number; bytes: string } }>
): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GPA_TIMEOUT_MS);

  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getProgramAccounts',
      params: [
        TOKEN_2022_PROGRAM_ID.toBase58(),
        {
          encoding: 'base64',
          commitment: 'confirmed',
          dataSlice: { offset: 0, length: 0 },
          filters,
        },
      ],
    }),
    signal: controller.signal,
  });
  clearTimeout(timeout);

  const json = await res.json();
  if (json.error) throw new Error(json.error.message);

  return (json.result ?? []).map((item: { pubkey: string }) => item.pubkey);
}
