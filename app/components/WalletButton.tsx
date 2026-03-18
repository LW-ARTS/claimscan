'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { copyToClipboard } from '@/lib/utils';

export function WalletButton() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Don't render anything until client-side (wallet context may not be available during SSR)
  if (!mounted) return null;

  return <WalletButtonInner />;
}

function WalletButtonInner() {
  const { publicKey, disconnect, connecting, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMenu]);

  // Close menu on Escape key and return focus to trigger
  useEffect(() => {
    if (!showMenu) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setShowMenu(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showMenu]);

  // Focus first menu item when menu opens
  useEffect(() => {
    if (!showMenu) return;
    const id = requestAnimationFrame(() => firstItemRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [showMenu]);

  const handleCopy = useCallback(async () => {
    if (!publicKey) return;
    const ok = await copyToClipboard(publicKey.toBase58());
    if (ok) {
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    }
  }, [publicKey]);

  const handleDisconnect = useCallback(async () => {
    setShowMenu(false);
    await disconnect();
  }, [disconnect]);

  if (!connected || !publicKey) {
    return (
      <button
        onClick={() => setVisible(true)}
        disabled={connecting}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:border-foreground/20 hover:text-foreground disabled:opacity-50"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3" />
        </svg>
        {connecting ? 'Connecting...' : 'Connect Wallet'}
      </button>
    );
  }

  const address = publicKey.toBase58();
  const truncated = `${address.slice(0, 4)}...${address.slice(-4)}`;

  return (
    <div className="relative" ref={menuRef}>
      <button
        ref={triggerRef}
        onClick={() => setShowMenu((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={showMenu}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:border-foreground/20 hover:text-foreground"
      >
        <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 motion-safe:animate-ping" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
        <span className="font-mono">{truncated}</span>
        <svg className={`h-3 w-3 transition-transform ${showMenu ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {showMenu && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1.5 w-48 rounded-xl border border-border bg-card shadow-lg"
          onKeyDown={(e) => {
            const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
            if (!items?.length) return;
            const idx = Array.from(items).indexOf(e.target as HTMLButtonElement);
            if (e.key === 'ArrowDown') { e.preventDefault(); items[(idx + 1) % items.length].focus(); }
            if (e.key === 'ArrowUp') { e.preventDefault(); items[(idx - 1 + items.length) % items.length].focus(); }
          }}
        >
          <button
            ref={firstItemRef}
            role="menuitem"
            onClick={handleCopy}
            className="flex w-full items-center gap-2 rounded-t-xl px-3 py-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {copied ? (
              <>
                <svg className="h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" /></svg>
                Copy Address
              </>
            )}
          </button>
          <div className="h-px bg-border" />
          <button
            role="menuitem"
            onClick={handleDisconnect}
            className="flex w-full items-center gap-2 rounded-b-xl px-3 py-2.5 text-xs text-red-400 transition-colors hover:bg-muted"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
