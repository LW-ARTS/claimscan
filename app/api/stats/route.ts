import { NextResponse } from 'next/server';
import { getStats } from '@/lib/services/stats';

export const revalidate = 86400; // 24h ISR

export async function GET() {
  const stats = await getStats();
  return NextResponse.json(stats, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
    },
  });
}
