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
      `${DEXSCREENER_API}/tokens/${chainSlug}/${encodeURIComponent(tokenAddress)}`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) return null;
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
  } catch {
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
    if (!res.ok) return null;
    const data = await res.json();
    const price = data.data?.[tokenAddress]?.price;
    return sanitizePrice(price);
  } catch {
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

  return results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => (r as PromiseFulfilledResult<TokenPrice>).value);
}

/**
 * Convert a raw token amount (bigint) to USD value.
 * Uses Number() split for whole/remainder to avoid parseFloat precision loss.
 */
export function toUsdValue(
  amount: bigint,
  decimals: number,
  priceUsd: number
): number {
  if (amount === 0n || priceUsd === 0) return 0;

  // Guard against invalid decimals
  if (!Number.isInteger(decimals) || decimals < 0) return 0;

  // For amounts that fit safely in Number (< 2^53), use direct division
  if (amount < BigInt(Number.MAX_SAFE_INTEGER)) {
    return (Number(amount) / Math.pow(10, decimals)) * priceUsd;
  }

  // For larger amounts, split into whole + remainder using BigInt arithmetic
  // then convert each part to Number separately to minimize precision loss.
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const remainder = amount % divisor;

  // Number(whole) may lose precision for very large whole parts (> 2^53),
  // but this is the best we can do without arbitrary-precision float libraries.
  // Number(remainder) / Number(divisor) preserves the fractional part.
  const tokenValue = Number(whole) + Number(remainder) / Number(divisor);
  return tokenValue * priceUsd;
}
