import 'server-only';
import { BAGS_API_BASE } from '@/lib/constants';
import { createLogger } from '@/lib/logger';
const log = createLogger('bags-api');

// ═══════════════════════════════════════════════
// Multi-key rotation with distributed rate limit tracking (Upstash Redis)
// Falls back to in-memory Map when Redis is not configured.
// ═══════════════════════════════════════════════

let redis: import('@upstash/redis').Redis | null = null;
const REDIS_PREFIX = 'claimscan:bags:rl:';

try {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    // Dynamic import resolved at build time by bundler — lazy init avoids import cycle
    const { Redis } = require('@upstash/redis') as typeof import('@upstash/redis');
    redis = new Redis({ url, token });
  }
} catch {
  // Redis unavailable — fall back to in-memory
}

/** Parse API keys from BAGS_API_KEYS (comma-separated) or legacy BAGS_API_KEY. */
export function getApiKeys(): string[] {
  const multi = process.env.BAGS_API_KEYS;
  if (multi) return multi.split(',').map((k) => k.trim()).filter(Boolean);
  const single = process.env.BAGS_API_KEY;
  if (single) return [single.replace(/\n$/, '').trim()];
  return [];
}

/** In-memory fallback when Redis is unavailable. */
const memRateLimits = new Map<string, number>();
let memKeyIndex = 0;

/** Mark a key as rate-limited until `resetAt` (epoch ms). */
async function markKeyLimited(keyIdx: number, resetAt: number): Promise<void> {
  const ttlMs = resetAt - Date.now();
  if (ttlMs <= 0) return;
  if (redis) {
    try {
      await redis.set(`${REDIS_PREFIX}${keyIdx}`, resetAt, { px: ttlMs });
      return;
    } catch {
      // Redis write failed — fall through to memory
    }
  }
  memRateLimits.set(String(keyIdx), resetAt);
}

/** Check if a key is currently rate-limited. Returns resetAt or 0. */
async function getKeyResetAt(keyIdx: number): Promise<number> {
  if (redis) {
    try {
      const val = await redis.get<number>(`${REDIS_PREFIX}${keyIdx}`);
      return val ?? 0;
    } catch {
      // Redis read failed — fall through to memory
    }
  }
  return memRateLimits.get(String(keyIdx)) ?? 0;
}

/** Get the next available (non-rate-limited) API key, or null if all exhausted. */
export async function getAvailableKey(): Promise<string | null> {
  const keys = getApiKeys();
  if (keys.length === 0) return null;
  const now = Date.now();

  // Get round-robin index from Redis for distributed rotation
  let startIdx = memKeyIndex;
  if (redis) {
    try {
      const next = await redis.incr(`${REDIS_PREFIX}idx`);
      startIdx = (next - 1) % keys.length;
    } catch {
      // Redis unavailable — use memory index
    }
  }

  for (let i = 0; i < keys.length; i++) {
    const idx = (startIdx + i) % keys.length;
    const limitedUntil = await getKeyResetAt(idx);
    if (now >= limitedUntil) {
      memKeyIndex = (idx + 1) % keys.length;
      return keys[idx];
    }
  }
  return null;
}

export async function isRateLimited(): Promise<boolean> {
  const keys = getApiKeys();
  if (keys.length === 0) return true;
  const now = Date.now();
  for (let i = 0; i < keys.length; i++) {
    const resetAt = await getKeyResetAt(i);
    if (now >= resetAt) return false;
  }
  return true;
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

  const apiKey = await getAvailableKey();
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
      } catch (parseErr) {
        log.warn('Could not parse 429 resetTime, using 5min default', { error: parseErr instanceof Error ? parseErr.message : String(parseErr) });
      }
      const keyIdx = keys.indexOf(apiKey);
      await markKeyLimited(keyIdx, resetAt);
      log.warn(`key #${keyIdx} rate limited until ${new Date(resetAt).toISOString()}`);
      // Try next key if any remain
      return bagsFetch<T>(path, options, attempt + 1);
    }
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        const keyIdx = keys.indexOf(apiKey);
        log.error(`CRITICAL: API key #${keyIdx} returned HTTP ${res.status} for ${path} — possible key revocation`);
      } else if (res.status >= 500) {
        log.error(`fetch ${path} returned HTTP ${res.status} (server error)`);
      } else {
        log.warn(`fetch ${path} returned HTTP ${res.status}`);
      }
      return null;
    }
    return await res.json() as T;
  } catch (err) {
    log.warn(`fetch ${path} failed`, { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

// ═══════════════════════════════════════════════
// Short-lived positions cache
// ═══════════════════════════════════════════════

/** Bags API returns lamport amounts as strings for BigInt precision.
 * Accept string | number to handle both formats gracefully. */
interface BagsClaimablePosition {
  baseMint: string;
  quoteMint?: string | null;
  totalClaimableLamportsUserShare: string | number;
  claimableDisplayAmount?: string | number | null;
  userBps?: number | null;
  isMigrated?: boolean;
  isCustomFeeVault?: boolean;
  virtualPool?: string;
  virtualPoolAddress?: string | null;
  dammPoolAddress?: string | null;
  virtualPoolClaimableLamportsUserShare?: string | number | null;
  dammPoolClaimableLamportsUserShare?: string | number | null;
  userVaultClaimableLamportsUserShare?: string | number | null;
  programId?: string | null;
  customFeeVaultBalance?: string | number | null;
  customFeeVaultBps?: number | null;
  customFeeVaultClaimerSide?: string | null;
  customFeeVaultClaimerA?: string | null;
  customFeeVaultClaimerB?: string | null;
  claimerIndex?: number | null;
}

interface BagsApiResponse<T> {
  success: boolean;
  response?: T;
}

const positionsCache = new Map<string, { data: BagsClaimablePosition[]; ts: number }>();
const POSITIONS_CACHE_TTL_MS = 30_000;

export async function getClaimablePositionsCached(wallet: string, signal?: AbortSignal): Promise<BagsClaimablePosition[]> {
  const cached = positionsCache.get(wallet);
  if (cached && Date.now() - cached.ts < POSITIONS_CACHE_TTL_MS) {
    return cached.data;
  }

  if (signal?.aborted) return cached?.data ?? [];

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
