import 'server-only';
import { withX402 } from '@x402/next';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { x402Server, feeRouteConfig } from '@/lib/x402/server';

export const maxDuration = 60;

const WALLET_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$|^0x[0-9a-fA-F]{40}$/;
const VALID_FORMATS = new Set(['csv', 'json']);

const handler = async (req: NextRequest): Promise<NextResponse<unknown>> => {
  const wallet = req.nextUrl.searchParams.get('wallet');
  const format = req.nextUrl.searchParams.get('format') ?? 'csv';

  if (!wallet || !WALLET_RE.test(wallet)) {
    return NextResponse.json({ error: 'Valid wallet address required' }, { status: 400 });
  }

  if (!VALID_FORMATS.has(format)) {
    return NextResponse.json({ error: 'format must be csv or json' }, { status: 400 });
  }

  const supabase = await createServerSupabase();

  const { data: walletRow, error: walletError } = await supabase
    .from('wallets')
    .select('creator_id')
    .eq('address', wallet)
    .limit(1)
    .single();

  if (walletError) {
    if (walletError.code === 'PGRST116') {
      return NextResponse.json({ error: 'No creator found for this wallet' }, { status: 404 });
    }
    console.error('[v2/export] wallet lookup failed:', walletError.message);
    return NextResponse.json({ error: 'Wallet lookup failed' }, { status: 500 });
  }

  const { data: fees, error: feeError } = await supabase
    .from('fee_records')
    .select('platform, chain, token_address, token_symbol, total_earned, total_claimed, total_unclaimed, total_earned_usd, claim_status, last_synced_at')
    .eq('creator_id', walletRow.creator_id)
    .order('total_earned_usd', { ascending: false })
    .limit(1000);

  if (feeError) {
    console.error('[v2/export] fee query failed:', feeError.message);
    return NextResponse.json({ error: 'Failed to fetch fees' }, { status: 500 });
  }

  if (format === 'json') {
    return NextResponse.json({ wallet, fees: fees ?? [], exported_at: new Date().toISOString() });
  }

  const header = 'platform,chain,token_symbol,token_address,total_earned,total_claimed,total_unclaimed,total_earned_usd,claim_status,last_synced_at';
  const rows = (fees ?? []).map(f =>
    [f.platform, f.chain, f.token_symbol, f.token_address, f.total_earned, f.total_claimed, f.total_unclaimed, f.total_earned_usd, f.claim_status, f.last_synced_at]
      .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`)
      .join(',')
  );

  return new NextResponse([header, ...rows].join('\n'), {
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
