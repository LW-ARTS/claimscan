import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { CHAIN_CONFIG, PLATFORM_CONFIG } from '@/lib/constants';

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

  const cacheKey = `${CACHE_KEY}:v2:${limit}:${offset}:${platform ?? 'all'}:${chain ?? 'all'}`;

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
    // Fetch native token prices for USD conversion
    const { data: prices } = await supabase
      .from('token_prices')
      .select('chain, token_address, price_usd')
      .in('token_address', ['SOL', 'ETH', 'BNB']);

    const priceMap: Record<string, number> = {};
    for (const p of prices ?? []) {
      priceMap[p.chain] = Number(p.price_usd);
    }

    // Fetch all fee_records with earned > 0
    let query = supabase
      .from('fee_records')
      .select('creator_id, platform, chain, token_address, total_earned, total_earned_usd')
      .neq('total_earned', '0');

    const VALID_PLATFORMS = new Set(Object.keys(PLATFORM_CONFIG));
    const VALID_CHAINS = new Set(Object.keys(CHAIN_CONFIG));

    if (platform && platform !== 'all') {
      if (!VALID_PLATFORMS.has(platform)) {
        return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
      }
      query = query.eq('platform', platform as import('@/lib/supabase/types').Platform);
    }
    if (chain && chain !== 'all') {
      if (!VALID_CHAINS.has(chain)) {
        return NextResponse.json({ error: 'Invalid chain' }, { status: 400 });
      }
      query = query.eq('chain', chain as import('@/lib/supabase/types').Chain);
    }

    const { data: feeRecords, error } = await query.limit(50000);

    if (error) {
      console.error('[leaderboard] query failed:', error.message);
      return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
    }

    // Fetch creator info
    const creatorIds = [...new Set((feeRecords ?? []).map((r) => r.creator_id))];
    const { data: creators } = await supabase
      .from('creators')
      .select('id, twitter_handle, display_name')
      .in('id', creatorIds.slice(0, 1000));

    const creatorInfo = new Map(
      (creators ?? []).map((c) => [c.id, { twitter: c.twitter_handle, display: c.display_name }])
    );

    // Aggregate by creator, computing USD from raw amounts + native prices
    const creatorMap = new Map<string, {
      total_usd: number;
      platforms: Set<string>;
      tokens: Set<string>;
    }>();

    for (const r of feeRecords ?? []) {
      const existing = creatorMap.get(r.creator_id) ?? {
        total_usd: 0,
        platforms: new Set<string>(),
        tokens: new Set<string>(),
      };

      // Use total_earned_usd if available, otherwise compute from raw amount
      let usd = r.total_earned_usd ? Number(r.total_earned_usd) : 0;
      if (!usd && r.total_earned !== '0') {
        const nativePrice = priceMap[r.chain] ?? 0;
        const decimals = CHAIN_CONFIG[r.chain as keyof typeof CHAIN_CONFIG]?.nativeDecimals ?? 18;
        const amount = Number(BigInt(r.total_earned)) / 10 ** decimals;
        usd = amount * nativePrice;
      }

      existing.total_usd += usd;
      existing.platforms.add(r.platform);
      existing.tokens.add(r.token_address);

      creatorMap.set(r.creator_id, existing);
    }

    // Anti-gaming: min 2 tokens, min $1 total (relaxed for early data)
    const allEntries = Array.from(creatorMap.entries())
      .filter(([, c]) => c.tokens.size >= 2 && c.total_usd >= 1)
      .sort(([, a], [, b]) => b.total_usd - a.total_usd)
      .map(([id, c]) => {
        const info = creatorInfo.get(id);
        const handle = info?.twitter ?? info?.display ?? null;
        if (!handle) return null; // Skip creators without a public handle
        return {
          handle,
          display_name: info?.display ?? null,
          total_earned_usd: Math.round(c.total_usd * 100) / 100,
          platform_count: c.platforms.size,
          token_count: c.tokens.size,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    const total = allEntries.length;
    const entries = allEntries.slice(offset, offset + limit);
    const result = { entries, total, offset, limit };

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
