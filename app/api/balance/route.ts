import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { withRpcFallback, isValidSolanaAddress } from '@/lib/chains/solana';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet');

  if (!wallet || !isValidSolanaAddress(wallet)) {
    return NextResponse.json({ error: 'Invalid wallet' }, { status: 400 });
  }

  try {
    const balance = await withRpcFallback(
      (c) => c.getBalance(new PublicKey(wallet)),
      'balance'
    );
    return NextResponse.json({ lamports: balance, sol: balance / 1e9 }, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    });
  } catch (err) {
    console.error('[balance] RPC call failed', { wallet, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'RPC error' }, { status: 502 });
  }
}
