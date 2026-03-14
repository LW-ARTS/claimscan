import 'server-only';
import { BAGS_API_BASE } from '@/lib/constants';

// ═══════════════════════════════════════════════
// Multi-key rotation with per-key rate limit tracking
// ═══════════════════════════════════════════════

/** Parse API keys from BAGS_API_KEYS (comma-separated) or legacy BAGS_API_KEY. */
export function getApiKeys(): string[] {
  const multi = process.env.BAGS_API_KEYS;
  if (multi) return multi.split(',').map((k) => k.trim()).filter(Boolean);
  const single = process.env.BAGS_API_KEY;
  if (single) return [single.replace(/\n$/, '').trim()];
  return [];
}

/** Per-key rate limit expiry timestamps. */
const keyRateLimits = new Map<string, number>();
let keyIndex = 0;

/** Get the next available (non-rate-limited) API key, or null if all exhausted. */
export function getAvailableKey(): string | null {
  const keys = getApiKeys();
  if (keys.length === 0) return null;
  const now = Date.now();
  for (let i = 0; i < keys.length; i++) {
    const idx = (keyIndex + i) % keys.length;
    const key = keys[idx];
    const limitedUntil = keyRateLimits.get(key) ?? 0;
    if (now >= limitedUntil) {
      keyIndex = (idx + 1) % keys.length;
      return key;
    }
  }
  return null;
}

export function isRateLimited(): boolean {
  const keys = getApiKeys();
  if (keys.length === 0) return true;
  const now = Date.now();
  return keys.every((k) => (keyRateLimits.get(k) ?? 0) > now);
}

/**
 * Generic fetch wrapper for the Bags API with multi-key rotation.
 * Supports GET (default) and POST methods.
 */
export async function bagsFetch<T>(
  path: string,
  options?: { method?: 'GET' | 'POST'; body?: unknown },
  attempt = 0
): Promise<T | null> {
  const keys = getApiKeys();
  if (attempt >= keys.length) return null;

  const apiKey = getAvailableKey();
  if (!apiKey) return null;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(`${BAGS_API_BASE}${path}`, {
      method: options?.method ?? 'GET',
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.status === 429) {
      let resetAt = Date.now() + 5 * 60_000;
      try {
        const body = await res.json() as { resetTime?: string };
        if (body.resetTime) resetAt = new Date(body.resetTime).getTime();
      } catch { /* use default */ }
      keyRateLimits.set(apiKey, resetAt);
      const keysLeft = keys.filter((k) => (keyRateLimits.get(k) ?? 0) <= Date.now()).length;
      console.warn(`[bags] key ${apiKey.slice(-6)} rate limited until ${new Date(resetAt).toISOString()} (${keysLeft} keys remaining)`);
      if (keysLeft > 0) return bagsFetch<T>(path, options, attempt + 1);
      return null;
    }
    if (!res.ok) {
      console.warn(`[bags] fetch ${path} returned HTTP ${res.status}`);
      return null;
    }
    return await res.json() as T;
  } catch (err) {
    console.warn(`[bags] fetch ${path} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ═══════════════════════════════════════════════
// Short-lived positions cache
// ═══════════════════════════════════════════════

interface BagsClaimablePosition {
  baseMint: string;
  quoteMint?: string | null;
  totalClaimableLamportsUserShare: number;
  claimableDisplayAmount?: number | null;
  userBps?: number | null;
  isMigrated?: boolean;
  isCustomFeeVault?: boolean;
  virtualPool?: string;
  virtualPoolAddress?: string | null;
  dammPoolAddress?: string | null;
  virtualPoolClaimableLamportsUserShare?: number | null;
  dammPoolClaimableLamportsUserShare?: number | null;
  userVaultClaimableLamportsUserShare?: number | null;
}

interface BagsApiResponse<T> {
  success: boolean;
  response?: T;
}

const positionsCache = new Map<string, { data: BagsClaimablePosition[]; ts: number }>();
const POSITIONS_CACHE_TTL_MS = 30_000;

export async function getClaimablePositionsCached(wallet: string): Promise<BagsClaimablePosition[]> {
  const cached = positionsCache.get(wallet);
  if (cached && Date.now() - cached.ts < POSITIONS_CACHE_TTL_MS) {
    return cached.data;
  }

  const res = await bagsFetch<BagsApiResponse<BagsClaimablePosition[]>>(
    `/token-launch/claimable-positions?wallet=${encodeURIComponent(wallet)}`
  );

  // Don't cache failure responses — return stale data if available, otherwise empty
  if (!res || !Array.isArray(res.response)) {
    return cached?.data ?? [];
  }

  const data = res.response;

  if (positionsCache.size > 100) {
    const now = Date.now();
    for (const [key, entry] of positionsCache) {
      if (now - entry.ts > POSITIONS_CACHE_TTL_MS) positionsCache.delete(key);
    }
  }

  positionsCache.set(wallet, { data, ts: Date.now() });
  return data;
}

/** Invalidate the positions cache for a wallet (e.g. after claim). */
export function invalidatePositionsCache(wallet: string): void {
  positionsCache.delete(wallet);
}

export type { BagsClaimablePosition, BagsApiResponse };
