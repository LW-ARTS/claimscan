import { NextResponse } from 'next/server';
import { Connection } from '@solana/web3.js';
import { PublicKey } from '@solana/web3.js';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet');

  if (!wallet || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
    return NextResponse.json({ error: 'Invalid wallet' }, { status: 400 });
  }

  try {
    const connection = new Connection(RPC_URL, { commitment: 'confirmed' });
    const balance = await connection.getBalance(new PublicKey(wallet));
    return NextResponse.json({ lamports: balance, sol: balance / 1e9 });
  } catch {
    return NextResponse.json({ error: 'RPC error' }, { status: 502 });
  }
}
