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
    setMounted(true);
  }, []);

  const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;

  useEffect(() => {
    if (!endpoint) {
      console.error('[Providers] NEXT_PUBLIC_SOLANA_RPC_URL is not configured');
    } else if (/[?&](api[-_]?key|apikey)=/i.test(endpoint)) {
      console.error('[Providers] SECURITY: NEXT_PUBLIC_SOLANA_RPC_URL appears to contain an API key visible to browsers. Use a read-only key or proxy through /api/balance.');
    }
  }, [endpoint]);

  const rpcUrl = useMemo(
    () => endpoint || 'https://api.mainnet-beta.solana.com',
    [endpoint]
  );

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
