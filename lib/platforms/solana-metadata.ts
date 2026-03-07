import 'server-only';
import { fetchTokenMetadataBatch } from '@/lib/chains/solana';
import { sanitizeTokenSymbol } from '@/lib/utils';
import type { TokenFee } from './types';

/**
 * Enrich Solana TokenFee entries that have null tokenSymbol
 * with on-chain Metaplex metadata (name/symbol).
 *
 * Skips non-Solana tokens and entries that already have a symbol.
 * Batches all unknown mints into a single RPC call for efficiency.
 */
export async function enrichSolanaTokenSymbols(
  fees: TokenFee[]
): Promise<TokenFee[]> {
  const unknownMints = fees
    .filter(
      (f) =>
        !f.tokenSymbol &&
        f.chain === 'sol' &&
        f.tokenAddress &&
        // Skip synthetic addresses like "SOL:believe:..."
        !f.tokenAddress.includes(':')
    )
    .map((f) => f.tokenAddress);

  if (unknownMints.length === 0) return fees;

  try {
    const metadata = await fetchTokenMetadataBatch(unknownMints);
    return fees.map((f) => {
      if (f.tokenSymbol) return f;
      const meta = metadata.get(f.tokenAddress);
      if (!meta) return f;
      return {
        ...f,
        tokenSymbol: sanitizeTokenSymbol(meta.symbol || meta.name) || null,
      };
    });
  } catch {
    return fees;
  }
}
