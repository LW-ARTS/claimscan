import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { PLATFORM_CONFIG, CHAIN_CONFIG } from '@/lib/constants';

export const maxDuration = 60;

const CACHE_KEY = 'claimscan:leaderboard';
const CACHE_TTL = 600; // 10 minutes

// Lazy Redis init — avoids crashing during Vercel build-time page data collection
let _redis: import('@upstash/redis').Redis | null | undefined;
function getRedis(): import('@upstash/redis').Redis | null {
  if (_redis !== undefined) return _redis;
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
    const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
    if (url && token) {
      const { Redis } = require('@upstash/redis') as typeof import('@upstash/redis');
      _redis = new Redis({ url, token });
    } else {
      _redis = null;
    }
  } catch {
    _redis = null;
  }
  return _redis;
}

interface LeaderboardEntry {
  handle: string;
  handle_type: 'twitter' | 'github';
  display_name: string | null;
  total_earned_usd: number;
  platform_count: number;
  token_count: number;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 100);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10) || 0;
  const platform = url.searchParams.get('platform');
  const chain = url.searchParams.get('chain');

  // Validate filters
  const VALID_PLATFORMS = new Set(Object.keys(PLATFORM_CONFIG));
  const VALID_CHAINS = new Set(Object.keys(CHAIN_CONFIG));
  if (platform && platform !== 'all' && !VALID_PLATFORMS.has(platform)) {
    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
  }
  if (chain && chain !== 'all' && !VALID_CHAINS.has(chain)) {
    return NextResponse.json({ error: 'Invalid chain' }, { status: 400 });
  }

  const cacheKey = `${CACHE_KEY}:v3:${limit}:${offset}:${platform ?? 'all'}:${chain ?? 'all'}`;

  // Try Redis cache
  if (getRedis()) {
    try {
      const cached = await getRedis()!.get<{ entries: LeaderboardEntry[]; total: number }>(cacheKey);
      if (cached) {
        return NextResponse.json({ ...cached, offset, limit, cached: true }, {
          headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' },
        });
      }
    } catch { /* Redis failure — proceed */ }
  }

  const supabase = createServiceClient();

  try {
    // M-7: Use Postgres function instead of fetching 50k rows and aggregating in JS.
    // The function joins fee_records + creators + token_prices and returns pre-ranked results.
    const platformFilter = platform && platform !== 'all' ? platform : null;
    const chainFilter = chain && chain !== 'all' ? chain : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- function added in migration 024, types not yet regenerated
    const rpc = supabase.rpc as any;
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
      console.error('[leaderboard] rpc failed:', error.message);
      return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
    }
    if (countError) {
      console.error('[leaderboard] count rpc failed:', countError.message);
    }

    const mapped: LeaderboardEntry[] = (entries ?? []).map((e: Record<string, unknown>) => ({
      handle: String(e.handle),
      handle_type: e.handle_type as 'twitter' | 'github',
      display_name: e.display_name ? String(e.display_name) : null,
      total_earned_usd: Number(e.total_earned_usd),
      platform_count: Number(e.platform_count),
      token_count: Number(e.token_count),
    }));

    const total = typeof countResult === 'number' ? countResult : (mapped.length + offset);
    const result = { entries: mapped, total, offset, limit };

    if (getRedis()) {
      getRedis()!.set(cacheKey, result, { ex: CACHE_TTL }).catch(() => {});
    }

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' },
    });
  } catch (err) {
    console.error('[leaderboard] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
