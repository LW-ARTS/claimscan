import 'server-only';
import { bagsFetch, getClaimablePositionsCached, invalidatePositionsCache } from './bags-api';
import type { BagsClaimablePosition } from './bags-api';

interface ClaimTxEntry {
  tx: string;
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
 * v3 accepts { feeClaimer, tokenMint } and handles all logic server-side.
 */
async function generateClaimTransactions(
  wallet: string,
  position: BagsClaimablePosition
): Promise<ClaimTransactionResult> {
  try {
    const data = await bagsFetch<BagsClaimTxResponse>(
      '/token-launch/claim-txs/v3',
      {
        method: 'POST',
        body: { feeClaimer: wallet, tokenMint: position.baseMint },
      }
    );

    if (!data?.success || !Array.isArray(data.response) || data.response.length === 0) {
      return {
        tokenMint: position.baseMint,
        transactions: [],
        error: data ? 'No claim transactions returned' : 'Bags API request failed',
      };
    }

    return {
      tokenMint: position.baseMint,
      transactions: data.response,
    };
  } catch (err) {
    return {
      tokenMint: position.baseMint,
      transactions: [],
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/** Max concurrent claim tx generation requests to Bags API. */
const CLAIM_CONCURRENCY = 5;

/**
 * Generate claim transactions for multiple tokens.
 * Fetches fresh positions from Bags API, matches by tokenMint,
 * then sends the full position object to claim-txs/v3.
 */
export async function generateBatchClaimTransactions(
  wallet: string,
  tokenMints: string[]
): Promise<ClaimTransactionResult[]> {
  // Invalidate cache before fetching to ensure fresh positions for claim accuracy
  invalidatePositionsCache(wallet);
  const positions = await getClaimablePositionsCached(wallet);
  const positionMap = new Map<string, BagsClaimablePosition>();
  for (const p of positions) {
    if (p.baseMint) positionMap.set(p.baseMint, p);
  }

  const results: ClaimTransactionResult[] = [];

  // Match requested mints to positions
  const matched: BagsClaimablePosition[] = [];
  for (const mint of tokenMints) {
    const position = positionMap.get(mint);
    if (!position) {
      results.push({
        tokenMint: mint,
        transactions: [],
        error: 'No claimable position found for this token',
      });
      continue;
    }
    matched.push(position);
  }

  // Process in batches of CLAIM_CONCURRENCY
  for (let i = 0; i < matched.length; i += CLAIM_CONCURRENCY) {
    const batch = matched.slice(i, i + CLAIM_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((position) => generateClaimTransactions(wallet, position))
    );
    results.push(...batchResults);
  }

  return results;
}

export type { ClaimTxEntry };
