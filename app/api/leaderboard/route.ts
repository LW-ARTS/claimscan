import { NextResponse } from 'next/server';
import { fetchLeaderboard } from '@/lib/services/leaderboard';

export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 100);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10) || 0;
  const platform = url.searchParams.get('platform');
  const chain = url.searchParams.get('chain');

  try {
    const result = await fetchLeaderboard({ limit, offset, platform, chain });

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = message === 'Invalid platform' || message === 'Invalid chain' ? 400 : 500;
    console.error('[leaderboard] error:', message);
    return NextResponse.json({ error: message }, { status });
  }
}
