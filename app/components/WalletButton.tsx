'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { track } from '@vercel/analytics';
import { copyToClipboard } from '@/lib/utils';

/**
 * Single entry point. Renders a skeleton until hydrated to prevent CLS,
 * then either the connect button or the connected wallet panel trigger.
 */
export function WalletButton() {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount guard, intentional
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-10 w-[100px] sm:w-[140px] rounded-[10px] bg-[var(--bg-surface)] animate-pulse" />;
  return <WalletButtonInner />;
}

function WalletButtonInner() {
  const { publicKey, disconnect, connecting, connected, wallet } = useWallet();
  const { setVisible } = useWalletModal();
  const prevConnectedRef = useRef(false);

  // Track wallet connect transitions
  useEffect(() => {
    if (connected && publicKey && !prevConnectedRef.current) {
      track('wallet_connected', { wallet_name: wallet?.adapter.name ?? 'unknown' });
    }
    prevConnectedRef.current = connected;
  }, [connected, publicKey, wallet]);

  // Disconnected state — plain white "Connect Wallet" button
  if (!connected || !publicKey) {
    return (
      <button
        onClick={() => setVisible(true)}
        disabled={connecting}
        className="pressable hover-glow-primary inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-white px-3 py-2 sm:px-5 sm:py-2.5 text-[13px] font-semibold text-[var(--text-inverse)] hover:bg-white/90 disabled:cursor-wait disabled:opacity-50"
      >
        {connecting ? 'Connecting...' : (
          <>
            <span className="sm:hidden">Connect</span>
            <span className="hidden sm:inline">Connect Wallet</span>
          </>
        )}
      </button>
    );
  }

  return <ConnectedWalletButton publicKey={publicKey.toBase58()} onDisconnect={disconnect} />;
}

// ═══════════════════════════════════════════════
// Connected state — pill button + dropdown panel
// ═══════════════════════════════════════════════

interface ConnectedWalletButtonProps {
  publicKey: string;
  onDisconnect: () => Promise<void> | void;
}

function ConnectedWalletButton({ publicKey, onDisconnect }: ConnectedWalletButtonProps) {
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();
  const [open, setOpen] = useState(false);
  const [openCount, setOpenCount] = useState(0);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [solPrice, setSolPrice] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch SOL balance from the current RPC connection
  useEffect(() => {
    let cancelled = false;
    async function fetchBalance() {
      try {
        const { PublicKey } = await import('@solana/web3.js');
        const pk = new PublicKey(publicKey);
        const lamports = await connection.getBalance(pk, 'confirmed');
        if (!cancelled) setSolBalance(lamports / 1_000_000_000);
      } catch (err) {
        console.warn('[wallet] balance fetch failed', err);
        if (!cancelled) setSolBalance(0);
      }
    }
    fetchBalance();
    return () => {
      cancelled = true;
    };
  }, [connection, publicKey]);

  // Fetch SOL price (uses existing /api/prices endpoint)
  useEffect(() => {
    let cancelled = false;
    async function fetchPrice() {
      try {
        const res = await fetch('/api/prices');
        if (!res.ok) return;
        const data = await res.json();
        // /api/prices returns { sol: number, eth: number, bnb: number, stale: boolean }
        // (see lib/prices/index.ts getNativeTokenPrices). Earlier code read
        // data.sol.price which is always undefined, so price stayed at 0 and
        // every wallet rendered $0.00 even with SOL on chain.
        if (!cancelled && typeof data?.sol === 'number' && data.sol > 0) {
          setSolPrice(data.sol);
        }
      } catch {
        // Silent failure, price stays at 0
      }
    }
    fetchPrice();
    return () => {
      cancelled = true;
    };
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const walletList = useMemo(
    () => [
      { address: publicKey, chain: 'sol' as const, balance: solBalance, priceUsd: solPrice },
    ],
    [publicKey, solBalance, solPrice],
  );

  const totalUsd = useMemo(() => {
    return walletList.reduce(
      (sum, w) => sum + (w.balance != null ? w.balance * w.priceUsd : 0),
      0,
    );
  }, [walletList]);

  const walletCount = walletList.length;

  const handleDisconnect = useCallback(async () => {
    setOpen(false);
    track('wallet_disconnected');
    await onDisconnect();
  }, [onDisconnect]);

  return (
    <div className="relative animate-fade-in-up" ref={containerRef}>
      {/* Pill trigger button — matches Pencil xH7vx walletBtn */}
      <button
        onClick={() => {
          setOpen((v) => {
            if (!v) setOpenCount((c) => c + 1);
            return !v;
          });
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="pressable hover-glow inline-flex cursor-pointer items-center gap-2 rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2 sm:px-[18px] sm:py-[10px] hover:bg-[var(--bg-surface-hover)]"
      >
        <span
          className="live-dot h-2 w-2 rounded-full bg-[var(--success)] text-[var(--success)]"
          aria-hidden="true"
        />
        <span className="font-mono text-[12px] font-medium text-[var(--text-primary)]">
          {walletCount} {walletCount === 1 ? 'Wallet' : 'Wallets'}
        </span>
        <svg
          className={`h-[14px] w-[14px] text-[var(--text-secondary)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Mobile backdrop (full-screen overlay) */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Dropdown panel — matches Pencil xH7vx walletDropdown (380px).
          Uses bg-popover so the --popover CSS var controls opacity (solid
          since MODAL-FIX 2026-04-14). The transition class was switched from
          transition-[opacity,transform] to the plain transition utility
          because the arbitrary-property variant wasn't producing a visible
          fade in production. */}
      <div
        role="dialog"
        aria-label="Connected wallets"
        className={`
          fixed inset-x-4 top-20 z-50 mx-auto max-w-[380px]
          sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[380px]
          origin-top sm:origin-top-right transition-[opacity,transform] duration-300 ease-[var(--ease-sharp)]
          rounded-[16px] border border-[var(--border-default)] bg-popover
          shadow-[0_8px_32px_#00000060]
          ${open ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'}
        `}
      >
        {/* Header: "Connected Wallets" + count badge */}
        <div className="flex items-center justify-between px-5 py-4">
          <span className="text-[14px] font-semibold text-[var(--text-primary)]">
            Connected Wallets
          </span>
          <span className="inline-flex items-center rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-[3px] text-[11px] font-mono text-[var(--text-secondary)]">
            {walletCount}
          </span>
        </div>

        {/* Total USD */}
        <div className="px-5 pb-4">
          <p className="font-mono text-[28px] font-bold tabular-nums text-[var(--text-primary)]">
            {formatUsdValue(totalUsd)}
          </p>
          <p className="text-[11px] text-[var(--text-tertiary)]">Total across all wallets</p>
        </div>

        {/* Divider */}
        <div className="h-px w-full bg-[var(--border-subtle)]" />

        {/* Solana Wallets section */}
        <div className="px-5 py-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[1.5px] text-[var(--text-tertiary)]">
            Solana Wallets
          </p>
          <ul key={openCount} className="stagger-in space-y-0.5">
            {walletList.map((w, i) => (
              <WalletRow key={w.address} wallet={w} index={i} />
            ))}
          </ul>
        </div>

        {/* Divider */}
        <div className="h-px w-full bg-[var(--border-subtle)]" />

        {/* Actions section */}
        <div className="py-1">
          <button
            onClick={() => {
              // Close the dropdown first, then open the wallet adapter modal.
              // The Solana wallet adapter connects one wallet at a time — picking
              // a new one from the modal replaces the current connection. The
              // label stays "Add Wallet" to match the Pencil layout for future
              // multi-wallet support (Reown AppKit migration noted in CLAUDE.md).
              setOpen(false);
              setVisible(true);
            }}
            className="pressable flex w-full cursor-pointer items-center gap-3 px-5 py-3 text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Wallet
          </button>
          <button
            onClick={async () => {
              const ok = await copyToClipboard(publicKey);
              if (ok) track('wallet_address_copied');
            }}
            className="pressable flex w-full cursor-pointer items-center gap-3 px-5 py-3 text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
            </svg>
            Copy Address
          </button>
        </div>

        {/* Divider */}
        <div className="h-px w-full bg-[var(--border-subtle)]" />

        {/* Disconnect button */}
        <div className="px-5 py-3">
          <button
            onClick={handleDisconnect}
            className="pressable hover-glow flex w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-[var(--border-default)] py-3 text-[13px] font-semibold text-[var(--error)] hover:bg-[var(--error)]/10"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
            </svg>
            Disconnect All
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// Wallet row — address truncated + balance USD
// ═══════════════════════════════════════════════

interface WalletRowItem {
  address: string;
  chain: 'sol';
  balance: number | null;
  priceUsd: number;
}

function WalletRow({ wallet, index }: { wallet: WalletRowItem; index?: number }) {
  const [copied, setCopied] = useState(false);
  const truncated = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`;
  const balanceUsd = wallet.balance != null ? wallet.balance * wallet.priceUsd : null;

  const handleCopy = async () => {
    const ok = await copyToClipboard(wallet.address);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <li style={index != null ? { ['--stagger-index' as string]: index } : undefined}>
      <button
        onClick={handleCopy}
        className="pressable flex w-full cursor-pointer items-center gap-2.5 rounded-[6px] py-2 text-left transition-colors hover:bg-[var(--bg-surface-hover)]"
        title={copied ? 'Copied!' : `Copy ${wallet.address}`}
      >
        <span className="live-dot h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--success)] text-[var(--success)]" aria-hidden="true" />
        <span className="flex-1 font-mono text-[12px] text-[var(--text-secondary)]">
          {copied ? 'Copied!' : truncated}
        </span>
        <span className="font-mono text-[12px] tabular-nums text-[var(--text-primary)]">
          {balanceUsd != null ? formatUsdValue(balanceUsd) : '—'}
        </span>
      </button>
    </li>
  );
}

// ═══════════════════════════════════════════════
// Utils
// ═══════════════════════════════════════════════

function formatUsdValue(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '$0.00';
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
