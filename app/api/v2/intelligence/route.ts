import { withX402 } from '@x402/next';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { x402Server, feeRouteConfig } from '@/lib/x402/server';
import { getTransactions, getPnl } from '@/lib/allium/client';

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

  // 1. Find creator + all wallets
  const { data: walletRows } = await supabase
    .from('wallets')
    .select('creator_id, address, chain')
    .eq('address', wallet);

  if (!walletRows?.length) {
    return NextResponse.json({ error: 'No creator found for this wallet' }, { status: 404 });
  }

  const creatorId = walletRows[0].creator_id;

  // Get all wallets for this creator (for cross-chain Allium queries)
  const { data: allWallets } = await supabase
    .from('wallets')
    .select('address, chain')
    .eq('creator_id', creatorId);

  // 2. ClaimScan fees
  const { data: fees } = await supabase
    .from('fee_records')
    .select('platform, chain, token_symbol, total_earned, total_claimed, total_unclaimed, total_earned_usd, claim_status')
    .eq('creator_id', creatorId)
    .order('total_earned_usd', { ascending: false })
    .limit(200);

  let totalEarnedUsd = 0;
  for (const f of fees ?? []) {
    if (typeof f.total_earned_usd === 'number' && Number.isFinite(f.total_earned_usd)) {
      totalEarnedUsd += f.total_earned_usd;
    }
  }

  // 3. Allium enrichment (parallel — transactions + PnL)
  const walletsForAllium = (allWallets ?? []).slice(0, 20); // Allium max 20

  let transactions = null;
  let pnl = null;
  let alliumError = null;

  if (process.env.ALLIUM_API_KEY) {
    try {
      const [txResult, pnlResult] = await Promise.allSettled([
        getTransactions(walletsForAllium, 25),
        getPnl(walletsForAllium),
      ]);

      transactions = txResult.status === 'fulfilled' ? txResult.value : null;
      pnl = pnlResult.status === 'fulfilled' ? pnlResult.value : null;

      if (txResult.status === 'rejected') alliumError = txResult.reason?.message;
      if (pnlResult.status === 'rejected') alliumError = pnlResult.reason?.message;
    } catch (e) {
      alliumError = e instanceof Error ? e.message : 'Allium request failed';
    }
  }

  // 4. Compose intelligence report
  const platformBreakdown: Record<string, { count: number; earnedUsd: number }> = {};
  for (const f of fees ?? []) {
    const p = f.platform;
    if (!platformBreakdown[p]) platformBreakdown[p] = { count: 0, earnedUsd: 0 };
    platformBreakdown[p].count++;
    if (typeof f.total_earned_usd === 'number') platformBreakdown[p].earnedUsd += f.total_earned_usd;
  }

  return NextResponse.json({
    wallet,
    creatorId,

    // ClaimScan intelligence
    feeIntelligence: {
      totalEarnedUsd: Math.round(totalEarnedUsd * 100) / 100,
      totalTokens: fees?.length ?? 0,
      platformBreakdown,
      topTokens: (fees ?? []).slice(0, 10).map(f => ({
        symbol: f.token_symbol,
        platform: f.platform,
        chain: f.chain,
        earnedUsd: f.total_earned_usd,
        status: f.claim_status,
      })),
    },

    // Allium enrichment
    alliumIntelligence: {
      recentTransactions: transactions?.items?.slice(0, 10) ?? null,
      portfolioPnl: pnl ?? null,
      error: alliumError,
    },

    // Meta
    dataSources: ['claimscan', ...(process.env.ALLIUM_API_KEY ? ['allium'] : [])],
    paidVia: 'x402',
    generatedAt: new Date().toISOString(),
  }, {
    status: 200,
    headers: { 'Cache-Control': 'private, no-store' },
  });
};

export const GET = withX402(
  handler,
  feeRouteConfig('$0.02', 'ClaimScan intelligence report — fees + Allium enrichment'),
  x402Server,
);
