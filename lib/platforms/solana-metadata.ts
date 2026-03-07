import 'server-only';
import { fetchTokenMetadataBatch } from '@/lib/chains/solana';
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

interface HeliusDasResponse {
  result?: HeliusDasAsset[];
}

const HELIUS_BATCH_SIZE = 1000;
const HELIUS_TIMEOUT_MS = 10_000;

/**
 * Fetch token metadata via Helius DAS `getAssetBatch`.
 * Returns a Map<mint, {symbol, name}> for found tokens.
 * Requires HELIUS_API_KEY env var.
 */
async function fetchHeliusMetadata(
  mints: string[]
): Promise<Map<string, { symbol: string; name: string }>> {
  const result = new Map<string, { symbol: string; name: string }>();
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey || mints.length === 0) return result;

  for (let i = 0; i < mints.length; i += HELIUS_BATCH_SIZE) {
    const batch = mints.slice(i, i + HELIUS_BATCH_SIZE);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HELIUS_TIMEOUT_MS);
      const res = await fetch(
        `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'claimscan-metadata',
            method: 'getAssetBatch',
            params: {
              ids: batch,
              displayOptions: { showFungible: true },
            },
          }),
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);
      if (!res.ok) break;

      const data = (await res.json()) as HeliusDasResponse;
      for (const asset of data.result ?? []) {
        const symbol =
          asset.token_info?.symbol ||
          asset.content?.metadata?.symbol ||
          '';
        const name = asset.content?.metadata?.name || '';
        if (symbol || name) {
          result.set(asset.id, { symbol, name });
        }
      }
    } catch (err) {
      console.warn(
        '[solana-metadata] Helius DAS batch failed:',
        err instanceof Error ? err.message : err
      );
      break;
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
    // Try Helius DAS first (faster, richer, handles Token-2022)
    let metadata: Map<string, { symbol: string; name: string }>;

    if (process.env.HELIUS_API_KEY) {
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
  } catch {
    return fees;
  }
}
