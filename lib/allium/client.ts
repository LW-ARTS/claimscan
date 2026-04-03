import 'server-only';

const ALLIUM_BASE = 'https://api.allium.so/api/v1/developer/wallet';
const API_KEY = process.env.ALLIUM_API_KEY ?? '';

interface ChainAddress {
  chain: string;
  address: string;
}

// Map ClaimScan chain IDs to Allium chain names
const CHAIN_MAP: Record<string, string> = {
  sol: 'solana',
  base: 'base',
  eth: 'ethereum',
  bsc: 'bsc',
};

export function toAlliumChain(csChain: string): string {
  return CHAIN_MAP[csChain] ?? csChain;
}

async function alliumFetch<T>(path: string, body: ChainAddress[], params?: Record<string, string>): Promise<T> {
  if (!API_KEY) throw new Error('ALLIUM_API_KEY is not configured.');
  const url = new URL(`${ALLIUM_BASE}/${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': API_KEY,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Allium ${path} ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json() as Promise<T>;
}

// ── Transactions ──

export interface AlliumTransaction {
  id: string;
  chain: string;
  hash: string;
  block_timestamp: string;
  block_number: number;
  fee: { raw_amount: string; amount: number } | null;
  asset_transfers: AlliumAssetTransfer[];
  activities: AlliumActivity[];
}

export interface AlliumAssetTransfer {
  from: string;
  to: string;
  token_address: string | null;
  token_symbol: string | null;
  raw_amount: string;
  amount: number;
  usd_amount: number | null;
}

export interface AlliumActivity {
  type: string;
  protocol_name: string | null;
}

interface TransactionsResponse {
  items: AlliumTransaction[];
  cursor: string | null;
}

export async function getTransactions(
  wallets: { address: string; chain: string }[],
  limit = 50,
): Promise<TransactionsResponse> {
  const body = wallets.map(w => ({ chain: toAlliumChain(w.chain), address: w.address }));
  return alliumFetch<TransactionsResponse>('transactions', body, { limit: String(limit) });
}

// ── PnL / Holdings ──

export interface AlliumPnlToken {
  token_address: string;
  token_symbol: string | null;
  average_cost: number | null;
  raw_balance: string;
  current_price: number | null;
  current_balance: number | null;
  realized_pnl: number | null;
  unrealized_pnl: number | null;
}

export interface AlliumPnl {
  chain: string;
  address: string;
  tokens: AlliumPnlToken[];
  total_balance: number | null;
  total_realized_pnl: number | null;
  total_unrealized_pnl: number | null;
}

type PnlResponse = (AlliumPnl | { chain: string; address: string; error: string })[];

export async function getPnl(
  wallets: { address: string; chain: string }[],
): Promise<PnlResponse> {
  const body = wallets.map(w => ({ chain: toAlliumChain(w.chain), address: w.address }));
  return alliumFetch<PnlResponse>('pnl', body);
}
