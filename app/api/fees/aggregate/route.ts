import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const creatorId = searchParams.get('creator_id');

  if (!creatorId || !UUID_RE.test(creatorId)) {
    return NextResponse.json(
      { error: 'Valid creator_id parameter required' },
      { status: 400 }
    );
  }

  // Use anon-key server client (least privilege) — fee_records have public read RLS
  const supabase = await createServerSupabase();

  const { data: fees, error } = await supabase
    .from('fee_records')
    .select('id, platform, chain, token_address, token_symbol, total_earned, total_claimed, total_unclaimed, total_earned_usd, claim_status, last_synced_at')
    .eq('creator_id', creatorId)
    .order('last_synced_at', { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch fee records' },
      { status: 500 }
    );
  }

  // Aggregate totals
  let totalEarnedUsd = 0;
  let totalClaimedCount = 0;
  let totalUnclaimedCount = 0;

  for (const fee of fees ?? []) {
    const usd = fee.total_earned_usd;
    if (typeof usd === 'number' && Number.isFinite(usd) && usd >= 0) totalEarnedUsd += usd;
    if (fee.claim_status === 'claimed') totalClaimedCount++;
    if (fee.claim_status === 'unclaimed') totalUnclaimedCount++;
  }

  return NextResponse.json({
    fees: fees ?? [],
    summary: {
      totalEarnedUsd,
      totalRecords: fees?.length ?? 0,
      claimedCount: totalClaimedCount,
      unclaimedCount: totalUnclaimedCount,
    },
  });
}
