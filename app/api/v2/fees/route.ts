import 'server-only';
import { withX402 } from '@x402/next';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { x402Server, feeRouteConfig } from '@/lib/x402/server';

export const maxDuration = 60;

const WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$|^0x[0-9a-fA-F]{40}$/;

const handler = async (req: NextRequest): Promise<NextResponse<unknown>> => {
  const wallet = req.nextUrl.searchParams.get('wallet');

  if (!wallet || !WALLET_RE.test(wallet)) {
    return NextResponse.json(
      { error: 'Valid wallet address required (Solana base58 or EVM 0x)' },
      { status: 400 },
    );
  }

  const supabase = await createServerSupabase();

  const { data: walletRow, error: walletError } = await supabase
    .from('wallets')
    .select('creator_id, chain')
    .eq('address', wallet)
    .limit(1)
    .single();

  if (walletError) {
    if (walletError.code === 'PGRST116') {
      return NextResponse.json({ error: 'No creator found for this wallet', wallet }, { status: 404 });
    }
    console.error('[v2/fees] wallet lookup failed:', walletError.message);
    return NextResponse.json({ error: 'Wallet lookup failed' }, { status: 500 });
  }

  const { data: fees, error: feeError } = await supabase
    .from('fee_records')
    .select('platform, chain, token_address, token_symbol, total_earned, total_claimed, total_unclaimed, total_earned_usd, claim_status, last_synced_at')
    .eq('creator_id', walletRow.creator_id)
    .order('total_earned_usd', { ascending: false })
    .limit(500);

  if (feeError) {
    console.error('[v2/fees] fee query failed:', feeError.message);
    return NextResponse.json({ error: 'Failed to fetch fees' }, { status: 500 });
  }

  let totalEarnedUsd = 0;
  let totalUnclaimedUsd = 0;
  for (const f of fees ?? []) {
    if (typeof f.total_earned_usd === 'number' && Number.isFinite(f.total_earned_usd)) {
      totalEarnedUsd += f.total_earned_usd;
    }
    if (f.claim_status === 'unclaimed' && typeof f.total_earned_usd === 'number') {
      totalUnclaimedUsd += f.total_earned_usd;
    }
  }

  return NextResponse.json({
    wallet,
    creatorId: walletRow.creator_id,
    fees: fees ?? [],
    summary: {
      totalEarnedUsd: Math.round(totalEarnedUsd * 100) / 100,
      totalUnclaimedUsd: Math.round(totalUnclaimedUsd * 100) / 100,
      totalRecords: fees?.length ?? 0,
      platforms: [...new Set((fees ?? []).map(f => f.platform))],
      chains: [...new Set((fees ?? []).map(f => f.chain))],
    },
    source: 'claimscan',
    paidVia: 'x402',
  }, {
    status: 200,
    headers: { 'Cache-Control': 'private, no-store' },
  });
};

export const GET = withX402(
  handler,
  feeRouteConfig('$0.01', 'ClaimScan fee report — all platforms, all chains'),
  x402Server,
);
