import { withX402 } from '@x402/next';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { x402Server, feeRouteConfig } from '@/lib/x402/server';

const WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$|^0x[0-9a-fA-F]{40}$/;

const handler = async (req: NextRequest): Promise<NextResponse<unknown>> => {
  const wallet = req.nextUrl.searchParams.get('wallet');
  const format = req.nextUrl.searchParams.get('format') ?? 'csv';

  if (!wallet || !WALLET_RE.test(wallet)) {
    return NextResponse.json(
      { error: 'Valid wallet address required' },
      { status: 400 },
    );
  }

  const supabase = await createServerSupabase();

  const { data: walletRow } = await supabase
    .from('wallets')
    .select('creator_id')
    .eq('address', wallet)
    .limit(1)
    .single();

  if (!walletRow) {
    return NextResponse.json({ error: 'No creator found for this wallet' }, { status: 404 });
  }

  const { data: fees, error } = await supabase
    .from('fee_records')
    .select('platform, chain, token_address, token_symbol, total_earned, total_claimed, total_unclaimed, total_earned_usd, claim_status, last_synced_at')
    .eq('creator_id', walletRow.creator_id)
    .order('total_earned_usd', { ascending: false })
    .limit(1000);

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch fees' }, { status: 500 });
  }

  if (format === 'json') {
    return NextResponse.json({ wallet, fees: fees ?? [], exported_at: new Date().toISOString() });
  }

  // CSV
  const header = 'platform,chain,token_symbol,token_address,total_earned,total_claimed,total_unclaimed,total_earned_usd,claim_status,last_synced_at';
  const rows = (fees ?? []).map(f =>
    [f.platform, f.chain, f.token_symbol, f.token_address, f.total_earned, f.total_claimed, f.total_unclaimed, f.total_earned_usd, f.claim_status, f.last_synced_at]
      .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`)
      .join(',')
  );

  const csv = [header, ...rows].join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="claimscan-${wallet.slice(0, 8)}-fees.csv"`,
    },
  });
};

export const GET = withX402(
  handler,
  feeRouteConfig('$0.05', 'ClaimScan fee export — CSV or JSON'),
  x402Server,
);
