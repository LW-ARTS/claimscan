import 'server-only';
import { execFileSync } from 'child_process';

type Chain = 'sol' | 'base' | 'eth' | 'bsc';

export interface ResolvedOWSWallet {
  address: string;
  chain: Chain;
  chainId: string;
  source: 'ows';
}

const CAIP_TO_CHAIN: Record<string, Chain> = {
  'eip155:1': 'eth',
  'eip155:8453': 'base',
  'eip155:56': 'bsc',
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': 'sol',
};

function caipToChain(chainId: string): Chain | null {
  if (CAIP_TO_CHAIN[chainId]) return CAIP_TO_CHAIN[chainId];
  if (chainId.startsWith('solana:')) return 'sol';
  // Default unknown EVM chains to eth (e.g. testnets)
  if (chainId.startsWith('eip155:')) return 'eth';
  return null;
}

// Cache at module load — avoids execFileSync on every request
let _owsAvailable: boolean | null = null;

export function isOWSAvailable(): boolean {
  if (_owsAvailable !== null) return _owsAvailable;
  try {
    execFileSync('which', ['ows'], {
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    _owsAvailable = true;
  } catch {
    _owsAvailable = false;
  }
  return _owsAvailable;
}

/**
 * Resolve OWS wallet via CLI. Distinguishes "not installed" (graceful)
 * from other errors (thrown).
 */
export function resolveOWSWallet(walletName: string): ResolvedOWSWallet[] {
  if (!/^[a-zA-Z0-9_-]+$/.test(walletName)) return [];
  if (!isOWSAvailable()) return [];

  let output: string;
  try {
    output = execFileSync('ows', ['wallet', 'list', '--json'], {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    console.error('[ows/resolve] CLI invocation failed:', err instanceof Error ? err.message : err);
    throw err;
  }

  let wallets: Array<{ id: string; name: string; accounts: Array<{ chainId: string; address: string }> }>;
  try {
    wallets = JSON.parse(output);
  } catch {
    console.error('[ows/resolve] CLI returned invalid JSON:', output.slice(0, 200));
    throw new Error('OWS CLI returned invalid JSON');
  }

  const wallet = wallets.find(w => w.name === walletName || w.id === walletName);
  if (!wallet) return [];

  const results: ResolvedOWSWallet[] = [];
  for (const account of wallet.accounts) {
    const chain = caipToChain(account.chainId);
    if (chain) {
      results.push({ address: account.address, chain, chainId: account.chainId, source: 'ows' });
    }
  }
  return results;
}
