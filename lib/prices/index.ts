import {
  COINGECKO_API,
  DEXSCREENER_API,
  JUPITER_PRICE_API,
} from '@/lib/constants';

export interface TokenPrice {
  chain: 'sol' | 'base' | 'eth';
  tokenAddress: string;
  symbol: string;
  priceUsd: number;
  source: 'coingecko' | 'dexscreener' | 'jupiter' | 'none';
}

/** Default timeout for external price fetches (10s). */
const FETCH_TIMEOUT_MS = 10_000;

/** Minimum liquidity (USD) for a DexScreener pair to be trusted. */
const MIN_LIQUIDITY_USD = 1_000;

/**
 * Create a fetch with an AbortSignal timeout.
 */
function fetchWithTimeout(
  url: string,
  opts: RequestInit & { next?: { revalidate: number } } = {},
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() =>
    clearTimeout(timeout)
  );
}

/**
 * Return price only if it's a valid positive finite number.
 */
function sanitizePrice(raw: unknown): number | null {
  const num = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
  if (Number.isFinite(num) && num > 0) return num;
  return null;
}

// ═══════════════════════════════════════════════
// Native Token Prices (SOL, ETH)
// ═══════════════════════════════════════════════

export async function getNativeTokenPrices(): Promise<{
  sol: number;
  eth: number;
}> {
  try {
    const res = await fetchWithTimeout(
      `${COINGECKO_API}/simple/price?ids=solana,ethereum&vs_currencies=usd`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data = await res.json();
    return {
      sol: sanitizePrice(data.solana?.usd) ?? 0,
      eth: sanitizePrice(data.ethereum?.usd) ?? 0,
    };
  } catch (err) {
    console.error('[prices] CoinGecko fetch failed:', err instanceof Error ? err.message : err);
    return { sol: 0, eth: 0 };
  }
}

// ═══════════════════════════════════════════════
// Token Price — Waterfall (DexScreener → Jupiter)
// ═══════════════════════════════════════════════

async function fetchDexScreenerPrice(
  chain: 'sol' | 'base',
  tokenAddress: string
): Promise<number | null> {
  try {
    const CHAIN_SLUG_MAP: Record<string, string> = { sol: 'solana', base: 'base' };
    const chainSlug = CHAIN_SLUG_MAP[chain];
    if (!chainSlug) return null;
    const res = await fetchWithTimeout(
      `${DEXSCREENER_API}/tokens/v1/${chainSlug}/${encodeURIComponent(tokenAddress)}`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) {
      console.warn(`[prices] DexScreener returned HTTP ${res.status} for ${tokenAddress}`);
      return null;
    }
    const data = await res.json();

    // Pick the most liquid pair instead of blindly using pairs[0]
    const pairs = data.pairs ?? [];
    const validPair = pairs
      .filter((p: { liquidity?: { usd?: number }; priceUsd?: string }) => {
        const liq = p.liquidity?.usd ?? 0;
        return liq >= MIN_LIQUIDITY_USD && p.priceUsd;
      })
      .sort(
        (a: { liquidity?: { usd?: number } }, b: { liquidity?: { usd?: number } }) =>
          (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0)
      )[0];

    return validPair ? sanitizePrice(validPair.priceUsd) : null;
  } catch (err) {
    console.warn('[prices] DexScreener fetch failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function fetchJupiterPrice(
  tokenAddress: string
): Promise<number | null> {
  try {
    const headers: Record<string, string> = {};
    if (process.env.JUP_API_KEY) {
      headers['x-api-key'] = process.env.JUP_API_KEY;
    }
    const res = await fetchWithTimeout(
      `${JUPITER_PRICE_API}?ids=${encodeURIComponent(tokenAddress)}`,
      { headers, next: { revalidate: 300 } }
    );
    if (!res.ok) {
      console.warn(`[prices] Jupiter returned HTTP ${res.status} for ${tokenAddress}`);
      return null;
    }
    const data = await res.json();
    const price = data.data?.[tokenAddress]?.usdPrice ?? data.data?.[tokenAddress]?.price;
    return sanitizePrice(price);
  } catch (err) {
    console.warn('[prices] Jupiter fetch failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function getTokenPriceWithSource(
  chain: 'sol' | 'base' | 'eth',
  tokenAddress: string
): Promise<{ price: number; source: TokenPrice['source'] }> {
  // DexScreener only supports sol and base; eth tokens on Base use 'base' slug
  const dexChain = chain === 'eth' ? 'base' : chain;
  const dexPrice = await fetchDexScreenerPrice(dexChain, tokenAddress);
  if (dexPrice !== null) {
    return { price: dexPrice, source: 'dexscreener' };
  }

  // Jupiter fallback for Solana SPL tokens only
  if (chain === 'sol') {
    const jupPrice = await fetchJupiterPrice(tokenAddress);
    if (jupPrice !== null) {
      return { price: jupPrice, source: 'jupiter' };
    }
  }

  return { price: 0, source: 'none' };
}

export async function getTokenPrice(
  chain: 'sol' | 'base' | 'eth',
  tokenAddress: string
): Promise<number> {
  const { price } = await getTokenPriceWithSource(chain, tokenAddress);
  return price;
}

export async function batchGetTokenPrices(
  tokens: Array<{ chain: 'sol' | 'base' | 'eth'; address: string; symbol: string }>
): Promise<TokenPrice[]> {
  const results = await Promise.allSettled(
    tokens.map(async (t) => {
      const { price, source } = await getTokenPriceWithSource(t.chain, t.address);
      return {
        chain: t.chain,
        tokenAddress: t.address,
        symbol: t.symbol,
        priceUsd: price,
        source,
      };
    })
  );

  const fulfilled: TokenPrice[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      fulfilled.push(result.value);
    } else {
      console.warn('[prices] batchGetTokenPrices item failed:', result.reason instanceof Error ? result.reason.message : result.reason);
    }
  }
  return fulfilled;
}

// Re-export toUsdValue from utils for backward compatibility.
// The canonical definition lives in lib/utils to avoid bundling server-side
// fetch code into client components that only need the conversion helper.
export { toUsdValue } from '@/lib/utils';
