import 'server-only';
import { createServiceClient } from '@/lib/supabase/service';
import { PLATFORM_CONFIG, CHAIN_CONFIG } from '@/lib/constants';

const CACHE_KEY = 'claimscan:leaderboard';
const CACHE_TTL = 600; // 10 minutes

// Lazy Redis init — avoids crashing during Vercel build-time page data collection
let _redis: import('@upstash/redis').Redis | null | undefined;
async function getRedis(): Promise<import('@upstash/redis').Redis | null> {
  if (_redis !== undefined) return _redis;
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
    const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
    if (url && token) {
      const { Redis } = await import('@upstash/redis');
      _redis = new Redis({ url, token });
    } else {
      _redis = null;
    }
  } catch {
    _redis = null;
  }
  return _redis;
}

export interface LeaderboardEntry {
  handle: string;
  handle_type: 'twitter' | 'github' | 'tiktok';
  display_name: string | null;
  total_earned_usd: number;
  platform_count: number;
  token_count: number;
}

export interface LeaderboardResult {
  entries: LeaderboardEntry[];
  total: number;
  offset: number;
  limit: number;
  cached?: boolean;
}

const VALID_PLATFORMS = new Set(Object.keys(PLATFORM_CONFIG));
const VALID_CHAINS = new Set(Object.keys(CHAIN_CONFIG));

/**
 * Fetch leaderboard data directly from Supabase (with Redis cache).
 * Used by both the API route and the SSR page to avoid HTTP self-fetch.
 */
export async function fetchLeaderboard(opts: {
  limit?: number;
  offset?: number;
  platform?: string | null;
  chain?: string | null;
}): Promise<LeaderboardResult> {
  const limit = Math.min(opts.limit ?? 50, 100);
  const offset = opts.offset ?? 0;
  const platform = opts.platform ?? null;
  const chain = opts.chain ?? null;

  // Validate filters
  if (platform && platform !== 'all' && !VALID_PLATFORMS.has(platform)) {
    throw new Error('Invalid platform');
  }
  if (chain && chain !== 'all' && !VALID_CHAINS.has(chain)) {
    throw new Error('Invalid chain');
  }

  const cacheKey = `${CACHE_KEY}:v3:${limit}:${offset}:${platform ?? 'all'}:${chain ?? 'all'}`;

  // Try Redis cache
  const redis = await getRedis();
  if (redis) {
    try {
      const cached = await redis.get<{ entries: LeaderboardEntry[]; total: number }>(cacheKey);
      if (cached) {
        return { ...cached, offset, limit, cached: true };
      }
    } catch { /* Redis failure — proceed */ }
  }

  const supabase = createServiceClient();

  const platformFilter = platform && platform !== 'all' ? platform : null;
  const chainFilter = chain && chain !== 'all' ? chain : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- function added in migration 024, types not yet regenerated
  const rpc = (supabase as any).rpc.bind(supabase);
  const [{ data: entries, error }, { data: countResult, error: countError }] = await Promise.all([
    rpc('get_leaderboard', {
      p_limit: limit,
      p_offset: offset,
      p_platform: platformFilter,
      p_chain: chainFilter,
    }),
    rpc('get_leaderboard_count', {
      p_platform: platformFilter,
      p_chain: chainFilter,
    }),
  ]);

  if (error) {
    throw new Error(`Leaderboard RPC failed: ${error.message}`);
  }
  if (countError) {
    console.error('[leaderboard] count rpc failed:', countError.message);
  }

  const mapped: LeaderboardEntry[] = (entries ?? []).map((e: Record<string, unknown>) => ({
    handle: String(e.handle),
    handle_type: e.handle_type as 'twitter' | 'github' | 'tiktok',
    display_name: e.display_name ? String(e.display_name) : null,
    total_earned_usd: Number(e.total_earned_usd),
    platform_count: Number(e.platform_count),
    token_count: Number(e.token_count),
  }));

  const total = typeof countResult === 'number' ? countResult : (mapped.length + offset);
  const result: LeaderboardResult = { entries: mapped, total, offset, limit };

  if (redis) {
    redis.set(cacheKey, result, { ex: CACHE_TTL }).catch(() => {});
  }

  return result;
}
