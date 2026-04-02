import 'server-only';
import { execFileSync } from 'child_process';

type Chain = 'sol' | 'base' | 'eth' | 'bsc';

export interface ResolvedOWSWallet {
  address: string;
  chain: Chain;
  chainId: string;
  source: 'ows';
}

// Map CAIP-2 chain IDs to ClaimScan chain identifiers
const CAIP_TO_CHAIN: Record<string, Chain> = {
  'eip155:1': 'eth',
  'eip155:8453': 'base',
  'eip155:56': 'bsc',
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': 'sol',
};

function caipToChain(chainId: string): Chain | null {
  if (CAIP_TO_CHAIN[chainId]) return CAIP_TO_CHAIN[chainId];
  if (chainId.startsWith('solana:')) return 'sol';
  if (chainId.startsWith('eip155:8453')) return 'base';
  if (chainId.startsWith('eip155:56')) return 'bsc';
  if (chainId === 'eip155:1') return 'eth';
  return null;
}

/**
 * Resolve OWS wallet via CLI (`ows wallet list --json`).
 * Uses execFileSync (no shell injection risk).
 * Falls back gracefully if OWS CLI is not installed.
 */
export function resolveOWSWallet(walletName: string): ResolvedOWSWallet[] {
  try {
    // Sanitize wallet name (alphanumeric, hyphens, underscores only)
    if (!/^[a-zA-Z0-9_-]+$/.test(walletName)) return [];

    const output = execFileSync('ows', ['wallet', 'list', '--json'], {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    const wallets = JSON.parse(output) as Array<{
      id: string;
      name: string;
      accounts: Array<{ chainId: string; address: string }>;
    }>;

    const wallet = wallets.find(w => w.name === walletName || w.id === walletName);
    if (!wallet) return [];

    const results: ResolvedOWSWallet[] = [];
    for (const account of wallet.accounts) {
      const chain = caipToChain(account.chainId);
      if (chain) {
        results.push({
          address: account.address,
          chain,
          chainId: account.chainId,
          source: 'ows',
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Check if OWS CLI is available on the system.
 */
export function isOWSAvailable(): boolean {
  try {
    execFileSync('which', ['ows'], {
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}
