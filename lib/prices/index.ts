import {
  COINGECKO_API,
  DEXSCREENER_API,
  JUPITER_PRICE_API,
} from '@/lib/constants';
import type { Chain } from '@/lib/supabase/types';
import { createLogger } from '@/lib/logger';
const log = createLogger('prices');

export interface TokenPrice {
  chain: Chain;
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

// Stale-while-revalidate cache for native prices
let lastKnownNativePrices: { sol: number; eth: number; bnb: number; fetchedAt: number } | null = null;

export async function getNativeTokenPrices(): Promise<{
  sol: number;
  eth: number;
  bnb: number;
  stale: boolean;
}> {
  try {
    const headers: Record<string, string> = {};
    if (process.env.COINGECKO_API_KEY) {
      headers['x-cg-demo-api-key'] = process.env.COINGECKO_API_KEY;
    }
    const res = await fetchWithTimeout(
      `${COINGECKO_API}/simple/price?ids=solana,ethereum,binancecoin&vs_currencies=usd`,
      { headers, next: { revalidate: 300 } }
    );
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data = await res.json();
    const prices = {
      sol: sanitizePrice(data.solana?.usd) ?? 0,
      eth: sanitizePrice(data.ethereum?.usd) ?? 0,
      bnb: sanitizePrice(data.binancecoin?.usd) ?? 0,
    };
    lastKnownNativePrices = { ...prices, fetchedAt: Date.now() };
    return { ...prices, stale: false };
  } catch (err) {
    log.error('CoinGecko fetch failed', { error: err instanceof Error ? err.message : String(err) });
    if (lastKnownNativePrices) {
      const ageMin = Math.round((Date.now() - lastKnownNativePrices.fetchedAt) / 60_000);
      log.warn(`Returning stale native prices (${ageMin}min old)`);
      return { sol: lastKnownNativePrices.sol, eth: lastKnownNativePrices.eth, bnb: lastKnownNativePrices.bnb, stale: true };
    }
    // Cold start fallback: read last known prices from DB
    try {
      const { createServiceClient } = await import('@/lib/supabase/service');
      const supabase = createServiceClient();
      const { data: rows } = await supabase
        .from('token_prices')
        .select('token_address, price_usd')
        .in('token_address', ['SOL', 'ETH', 'BNB']);
      if (rows && rows.length > 0) {
        const priceMap: Record<string, number> = {};
        for (const row of rows) {
          priceMap[row.token_address] = row.price_usd;
        }
        const dbPrices = {
          sol: sanitizePrice(priceMap['SOL']) ?? 0,
          eth: sanitizePrice(priceMap['ETH']) ?? 0,
          bnb: sanitizePrice(priceMap['BNB']) ?? 0,
        };
        log.warn('Using DB fallback native prices (cold start)');
        return { ...dbPrices, stale: true };
      }
    } catch (dbErr) {
      log.error('DB fallback for native prices also failed', { error: dbErr instanceof Error ? dbErr.message : String(dbErr) });
    }
    return { sol: 0, eth: 0, bnb: 0, stale: true };
  }
}

// ═══════════════════════════════════════════════
// Token Price — Waterfall (DexScreener → Jupiter)
// ═══════════════════════════════════════════════

async function fetchDexScreenerPrice(
  chain: Chain,
  tokenAddress: string
): Promise<number | null> {
  try {
    const CHAIN_SLUG_MAP: Record<string, string> = { sol: 'solana', base: 'base', eth: 'ethereum', bsc: 'bsc' };
    const chainSlug = CHAIN_SLUG_MAP[chain];
    if (!chainSlug) return null;
    const res = await fetchWithTimeout(
      `${DEXSCREENER_API}/tokens/v1/${chainSlug}/${encodeURIComponent(tokenAddress)}`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) {
      log.warn(`DexScreener returned HTTP ${res.status}`, { tokenAddress });
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
    log.warn('DexScreener fetch failed', { error: err instanceof Error ? err.message : String(err) });
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
      log.warn(`Jupiter returned HTTP ${res.status}`, { tokenAddress });
      return null;
    }
    const data = await res.json();
    const entry = data?.[tokenAddress];
    if (!entry) {
      log.debug('Jupiter returned no entry for token', { tokenAddress, responseKeys: Object.keys(data ?? {}).slice(0, 5) });
      return null;
    }
    return sanitizePrice(entry.usdPrice);
  } catch (err) {
    log.warn('Jupiter fetch failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export async function getTokenPriceWithSource(
  chain: Chain,
  tokenAddress: string
): Promise<{ price: number; source: TokenPrice['source'] }> {
  // For Solana tokens, race both sources in parallel
  if (chain === 'sol') {
    const [dex, jup] = await Promise.allSettled([
      fetchDexScreenerPrice(chain, tokenAddress),
      fetchJupiterPrice(tokenAddress),
    ]);
    if (dex.status === 'fulfilled' && dex.value !== null) return { price: dex.value, source: 'dexscreener' };
    if (jup.status === 'fulfilled' && jup.value !== null) return { price: jup.value, source: 'jupiter' };
    return { price: 0, source: 'none' };
  }

  // For non-Solana, DexScreener only
  const dexPrice = await fetchDexScreenerPrice(chain, tokenAddress);
  if (dexPrice !== null) return { price: dexPrice, source: 'dexscreener' };
  return { price: 0, source: 'none' };
}

export async function getTokenPrice(
  chain: Chain,
  tokenAddress: string
): Promise<number> {
  const { price } = await getTokenPriceWithSource(chain, tokenAddress);
  return price;
}

export async function batchGetTokenPrices(
  tokens: Array<{ chain: Chain; address: string; symbol: string }>
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
      log.warn('batchGetTokenPrices item failed', { error: result.reason instanceof Error ? result.reason.message : String(result.reason) });
    }
  }
  return fulfilled;
}

