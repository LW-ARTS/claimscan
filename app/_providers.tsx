'use client';

import { useMemo, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';

import '@solana/wallet-adapter-react-ui/styles.css';

/**
 * Wallet providers wrapper. Delays rendering wallet-dependent UI
 * until client-side mount to avoid SSR issues.
 *
 * Wallets array is empty — wallet-adapter-react auto-discovers all
 * Wallet Standard compatible wallets (Phantom, Solflare, Backpack, etc.)
 * without needing explicit adapter imports.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount guard, intentional
    setMounted(true);
  }, []);

  // WalletButton reads SOL balance client-side via useConnection().getBalance,
  // so we need a browser-safe RPC. NEXT_PUBLIC_SOLANA_RPC_URL is the Helius
  // frontend key (domain-locked to canonical hosts). Public mainnet-beta is the
  // fallback for local dev and preview deploys where the locked key won't work.
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

  const wallets = useMemo(() => [], []);

  if (!mounted) {
    // Render children without wallet context during SSR
    return <>{children}</>;
  }

  return (
    <ConnectionProvider endpoint={rpcUrl}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
