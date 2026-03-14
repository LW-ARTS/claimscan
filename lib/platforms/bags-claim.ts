import 'server-only';
import { bagsFetch } from './bags-api';
import type { BagsApiResponse } from './bags-api';

interface ClaimTxEntry {
  tx: string; // Serialized VersionedTransaction (base58 in v3, base64 in v2 — client handles both)
  blockhash: {
    blockhash: string;
    lastValidBlockHeight: number;
  };
}

interface BagsClaimTxResponse {
  success: boolean;
  response?: ClaimTxEntry[];
}

export interface ClaimTransactionResult {
  tokenMint: string;
  transactions: ClaimTxEntry[];
  error?: string;
}

/**
 * Generate claim transactions for a single token via Bags API v3.
 * Returns serialized transactions ready for wallet signing.
 */
export async function generateClaimTransactions(
  wallet: string,
  tokenMint: string
): Promise<ClaimTransactionResult> {
  try {
    const data = await bagsFetch<BagsClaimTxResponse>(
      '/token-launch/claim-txs/v3',
      {
        method: 'POST',
        body: { feeClaimer: wallet, tokenMint },
      }
    );

    if (!data?.success || !Array.isArray(data.response) || data.response.length === 0) {
      return {
        tokenMint,
        transactions: [],
        error: data ? 'No claim transactions returned' : 'Bags API request failed',
      };
    }

    return {
      tokenMint,
      transactions: data.response,
    };
  } catch (err) {
    return {
      tokenMint,
      transactions: [],
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/** Max concurrent claim tx generation requests to Bags API. */
const CLAIM_CONCURRENCY = 10;

/**
 * Generate claim transactions for multiple tokens in parallel.
 * Limits concurrency to avoid overwhelming the Bags API.
 */
export async function generateBatchClaimTransactions(
  wallet: string,
  tokenMints: string[]
): Promise<ClaimTransactionResult[]> {
  const results: ClaimTransactionResult[] = [];

  // Process in batches of CLAIM_CONCURRENCY
  for (let i = 0; i < tokenMints.length; i += CLAIM_CONCURRENCY) {
    const batch = tokenMints.slice(i, i + CLAIM_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((mint) => generateClaimTransactions(wallet, mint))
    );
    results.push(...batchResults);
  }

  return results;
}

export type { ClaimTxEntry };
