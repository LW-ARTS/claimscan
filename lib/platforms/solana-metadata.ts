import 'server-only';
import { fetchTokenMetadataBatch } from '@/lib/chains/solana';
import { heliusDasRpc, isHeliusAvailable } from '@/lib/helius/client';
import { sanitizeTokenSymbol } from '@/lib/utils';
import type { TokenFee } from './types';

// ═══════════════════════════════════════════════
// Helius DAS API (primary) + Metaplex on-chain (fallback)
// ═══════════════════════════════════════════════

interface HeliusDasAsset {
  id: string;
  content?: {
    metadata?: { name?: string; symbol?: string };
    links?: { image?: string };
  };
  token_info?: { symbol?: string; decimals?: number };
}

const HELIUS_BATCH_SIZE = 1000;

/**
 * Fetch token metadata via Helius DAS `getAssetBatch`.
 * Returns a Map<mint, {symbol, name}> for found tokens.
 */
async function fetchHeliusMetadata(
  mints: string[]
): Promise<Map<string, { symbol: string; name: string }>> {
  const result = new Map<string, { symbol: string; name: string }>();
  if (mints.length === 0) return result;

  for (let i = 0; i < mints.length; i += HELIUS_BATCH_SIZE) {
    const batch = mints.slice(i, i + HELIUS_BATCH_SIZE);
    const data = await heliusDasRpc<HeliusDasAsset[]>(
      'getAssetBatch',
      { ids: batch, displayOptions: { showFungible: true } },
      `metadata-batch-${i}`
    );

    if (!data) continue;

    for (const asset of data) {
      const symbol =
        asset.token_info?.symbol ||
        asset.content?.metadata?.symbol ||
        '';
      const name = asset.content?.metadata?.name || '';
      if (symbol || name) {
        result.set(asset.id, { symbol, name });
      }
    }
  }

  return result;
}

/**
 * Enrich Solana TokenFee entries that have null tokenSymbol.
 *
 * Strategy:
 * 1. If HELIUS_API_KEY is set → use Helius DAS getAssetBatch (1000/call, pre-parsed)
 * 2. Fallback → on-chain Metaplex metadata via getMultipleAccountsInfo (100/call)
 *
 * Skips non-Solana tokens and entries that already have a symbol.
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
    let metadata: Map<string, { symbol: string; name: string }>;

    if (isHeliusAvailable()) {
      metadata = await fetchHeliusMetadata(unknownMints);

      // If Helius returned nothing (API error, key invalid), fallback to Metaplex
      if (metadata.size === 0) {
        const metaplexResult = await fetchTokenMetadataBatch(unknownMints);
        metadata = new Map(
          [...metaplexResult.entries()].map(([k, v]) => [k, { symbol: v.symbol, name: v.name }])
        );
      }
    } else {
      // No Helius key — use on-chain Metaplex directly
      const metaplexResult = await fetchTokenMetadataBatch(unknownMints);
      metadata = new Map(
        [...metaplexResult.entries()].map(([k, v]) => [k, { symbol: v.symbol, name: v.name }])
      );
    }

    return fees.map((f) => {
      if (f.tokenSymbol) return f;
      const meta = metadata.get(f.tokenAddress);
      if (!meta) return f;
      return {
        ...f,
        tokenSymbol: sanitizeTokenSymbol(meta.symbol || meta.name) || null,
      };
    });
  } catch (err) {
    console.warn('[solana-metadata] enrichSolanaTokenSymbols failed:', err instanceof Error ? err.message : err);
    return fees;
  }
}
