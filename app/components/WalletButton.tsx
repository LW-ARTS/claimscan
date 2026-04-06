'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { track } from '@vercel/analytics';
import { copyToClipboard } from '@/lib/utils';

export function WalletButton() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Render a skeleton placeholder until client-side to prevent CLS
  if (!mounted) return <div className="h-10 w-[140px] rounded-lg bg-muted animate-pulse" />;

  return <WalletButtonInner />;
}

function WalletButtonInner() {
  const { publicKey, disconnect, connecting, connected, wallet } = useWallet();
  const { setVisible } = useWalletModal();
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prevConnectedRef = useRef(false);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  // Track wallet connect/disconnect transitions
  useEffect(() => {
    if (connected && publicKey && !prevConnectedRef.current) {
      track('wallet_connected', {
        wallet_name: wallet?.adapter.name ?? 'unknown',
      });
    }
    prevConnectedRef.current = connected;
  }, [connected, publicKey, wallet]);

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
    track('wallet_disconnected');
    await disconnect();
  }, [disconnect]);

  if (!connected || !publicKey) {
    return (
      <button
        onClick={() => setVisible(true)}
        disabled={connecting}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-[10px] bg-white px-4 py-2 sm:px-5 sm:py-2.5 text-[13px] font-semibold text-[var(--text-inverse)] transition-all duration-200 hover:bg-white/90 hover:-translate-y-px active:scale-[0.97] disabled:cursor-wait disabled:opacity-50 disabled:hover:translate-y-0 disabled:active:scale-100"
      >
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
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-200 hover:border-foreground/20 hover:text-foreground hover:shadow-[0_0_12px_rgba(255,255,255,0.06)] hover:-translate-y-px active:scale-[0.97] active:shadow-none"
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

      <div
        role="menu"
        className={`absolute right-0 top-full z-50 mt-1.5 w-48 rounded-xl border border-border bg-card shadow-lg transition-all duration-200 origin-top-right ${showMenu ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'}`}
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
          className="flex w-full items-center gap-2 rounded-t-xl px-3 py-3 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
          className="flex w-full items-center gap-2 rounded-b-xl px-3 py-3 text-xs text-red-400 transition-colors hover:bg-muted"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>
          Disconnect
        </button>
      </div>
    </div>
  );
}
