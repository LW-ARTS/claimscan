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

  // M-9: Use free public RPC for wallet adapter (client-side only).
  // No client components call the RPC directly — wallets use their own RPCs for send/confirm.
  // Paid RPC keys stay server-side only (SOLANA_RPC_URL, without NEXT_PUBLIC_ prefix).
  const rpcUrl = 'https://api.mainnet-beta.solana.com';

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
