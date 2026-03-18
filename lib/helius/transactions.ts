import 'server-only';
import { heliusRestApi, isHeliusAvailable } from './client';
import type { ClaimEvent } from '@/lib/platforms/types';
import type { Platform } from '@/lib/supabase/types';
import {
  PUMP_PROGRAM_ID,
  PUMPSWAP_PROGRAM_ID,
  METEORA_DBC_PROGRAM,
  COINBARREL_PROGRAM_ID,
  RAYDIUM_LAUNCHLAB_PROGRAM_ID,
} from '@/lib/constants';

// ═══════════════════════════════════════════════
// Enhanced Transactions — Claim History Parser
// Fetches parsed transaction history from Helius and extracts
// claim events (fee transfers from known program vaults).
// ═══════════════════════════════════════════════

interface EnhancedTransaction {
  signature: string;
  timestamp: number;
  type: string;
  source: string;
  fee: number;
  nativeTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }>;
  tokenTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    mint: string;
    tokenAmount: number;
  }>;
  accountData?: Array<{
    account: string;
    nativeBalanceChange: number;
  }>;
}

/** Map Helius source labels → ClaimScan platform IDs */
const SOURCE_TO_PLATFORM: Record<string, Platform> = {
  'PUMP_FUN': 'pump',
  'RAYDIUM': 'raydium',
  'METEORA': 'believe',
};

const KNOWN_PROGRAM_IDS = new Map<string, Platform>([
  [PUMP_PROGRAM_ID, 'pump'],
  [PUMPSWAP_PROGRAM_ID, 'pump'],
  [METEORA_DBC_PROGRAM, 'believe'],
  [COINBARREL_PROGRAM_ID, 'coinbarrel'],
  [RAYDIUM_LAUNCHLAB_PROGRAM_ID, 'raydium'],
]);

/**
 * Fetch enhanced transaction history for a wallet and extract claim events.
 *
 * Cost: 100 credits per call (up to 100 transactions).
 */
export async function fetchClaimHistory(
  wallet: string,
  options?: { beforeSignature?: string; limit?: number },
  signal?: AbortSignal
): Promise<ClaimEvent[]> {
  if (!isHeliusAvailable()) return [];

  const limit = Math.min(options?.limit ?? 100, 100);
  let path = `/v0/addresses/${wallet}/transactions?limit=${limit}`;
  if (options?.beforeSignature) {
    path += `&before=${options.beforeSignature}`;
  }

  const txns = await heliusRestApi<EnhancedTransaction[]>(
    path,
    { method: 'GET' },
    'enhanced-txns',
    signal
  );

  if (!txns || txns.length === 0) return [];

  const claims: ClaimEvent[] = [];

  for (const tx of txns) {
    // Only interested in transfers (fee claims are transfers from vault → wallet)
    if (tx.type !== 'TRANSFER' && tx.type !== 'UNKNOWN') continue;

    const platform = SOURCE_TO_PLATFORM[tx.source] ?? detectPlatformFromTx(tx);
    if (!platform) continue;

    // Extract SOL transfers TO this wallet
    for (const transfer of tx.nativeTransfers ?? []) {
      if (
        transfer.toUserAccount === wallet &&
        transfer.amount > 0 &&
        transfer.fromUserAccount !== wallet
      ) {
        claims.push({
          tokenAddress: 'SOL',
          chain: 'sol',
          platform,
          amount: transfer.amount.toString(),
          amountUsd: null,
          txHash: tx.signature,
          claimedAt: new Date(tx.timestamp * 1000).toISOString(),
        });
      }
    }

    // Extract SPL token transfers TO this wallet
    for (const transfer of tx.tokenTransfers ?? []) {
      if (
        transfer.toUserAccount === wallet &&
        transfer.tokenAmount > 0 &&
        transfer.fromUserAccount !== wallet
      ) {
        claims.push({
          tokenAddress: transfer.mint,
          chain: 'sol',
          platform,
          amount: transfer.tokenAmount.toString(),
          amountUsd: null,
          txHash: tx.signature,
          claimedAt: new Date(tx.timestamp * 1000).toISOString(),
        });
      }
    }
  }

  return claims;
}

/**
 * Detect platform from transaction account data when source label doesn't match.
 */
function detectPlatformFromTx(tx: EnhancedTransaction): Platform | null {
  for (const account of tx.accountData ?? []) {
    const platform = KNOWN_PROGRAM_IDS.get(account.account);
    if (platform) return platform;
  }
  return null;
}

// ═══════════════════════════════════════════════
// Vault Claim Total — Paginated SOL outflow sum
// Queries a vault PDA's tx history and sums all
// outbound SOL transfers (= total claimed by creator).
// ═══════════════════════════════════════════════

const MAX_PAGES = 5;
const PAGE_SIZE = 100;

/**
 * Sum all outbound SOL transfers from a vault address.
 * This represents the total SOL claimed from that vault.
 *
 * Cost: 100 credits per page (up to MAX_PAGES pages).
 */
export async function fetchVaultClaimTotal(
  vaultAddress: string,
  signal?: AbortSignal,
): Promise<bigint> {
  if (!isHeliusAvailable()) return 0n;

  let total = 0n;
  let beforeSig: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    if (signal?.aborted) break;

    let path = `/v0/addresses/${vaultAddress}/transactions?limit=${PAGE_SIZE}`;
    if (beforeSig) path += `&before=${beforeSig}`;

    const txns = await heliusRestApi<EnhancedTransaction[]>(
      path,
      { method: 'GET' },
      `vault-claim-${page}`,
      signal
    );

    if (!txns || txns.length === 0) break;

    for (const tx of txns) {
      for (const transfer of tx.nativeTransfers ?? []) {
        if (
          transfer.fromUserAccount === vaultAddress &&
          transfer.amount > 0
        ) {
          // Note: Helius returns amount as JS number — precision loss for > 2^53 lamports (~9000 SOL).
          // Use Math.trunc to avoid toFixed rounding, then convert to BigInt.
          total += BigInt(Math.trunc(transfer.amount));
        }
      }
    }

    // Paginate if we got a full page
    if (txns.length < PAGE_SIZE) break;
    beforeSig = txns[txns.length - 1].signature;
  }

  return total;
}

/**
 * Sum all outbound SPL token transfers of a specific mint
 * from a source address to a recipient.
 *
 * Used for Token-2022 RevShare claim totals where
 * the "vault" is the mint address itself.
 *
 * Cost: 100 credits per page (up to MAX_PAGES pages).
 */
export async function fetchTokenClaimTotal(
  sourceAddress: string,
  recipient: string,
  tokenMint: string,
  signal?: AbortSignal
): Promise<bigint> {
  if (!isHeliusAvailable()) return 0n;

  let total = 0n;
  let beforeSig: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    if (signal?.aborted) break;

    let path = `/v0/addresses/${sourceAddress}/transactions?limit=${PAGE_SIZE}`;
    if (beforeSig) path += `&before=${beforeSig}`;

    const txns = await heliusRestApi<EnhancedTransaction[]>(
      path,
      { method: 'GET' },
      `token-claim-${page}`,
      signal
    );

    if (!txns || txns.length === 0) break;

    for (const tx of txns) {
      for (const transfer of tx.tokenTransfers ?? []) {
        if (
          transfer.toUserAccount === recipient &&
          transfer.mint === tokenMint &&
          transfer.tokenAmount > 0
        ) {
          // Note: Helius returns tokenAmount as JS number — precision loss for > 2^53.
          total += BigInt(Math.trunc(transfer.tokenAmount));
        }
      }
    }

    if (txns.length < PAGE_SIZE) break;
    beforeSig = txns[txns.length - 1].signature;
  }

  return total;
}
