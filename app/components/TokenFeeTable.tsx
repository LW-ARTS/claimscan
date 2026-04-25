'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { track } from '@vercel/analytics';
import { AlertTriangle } from 'lucide-react';
import { ClaimStatusBadge } from './ClaimStatusBadge';
import { PlatformIcon } from './PlatformIcon';
import { PLATFORM_CONFIG, CHAIN_CONFIG } from '@/lib/constants';
import { computeFeeUsd, formatTokenAmount, formatUsd, safeBigInt } from '@/lib/utils';
import type { Database } from '@/lib/supabase/types';

type FeeRecord = Database['public']['Tables']['fee_records']['Row'];

const PER_PAGE = 15;

interface TokenFeeTableProps {
  fees: FeeRecord[];
  solPrice?: number;
  ethPrice?: number;
  bnbPrice?: number;
  connectedWallet?: string | null;
  onClaimToken?: (tokenMint: string) => void;
}

/**
 * Format token display: $SYMBOL when available, shortened address as fallback.
 *
 * Some adapters annotate the symbol with a pool/source descriptor in
 * parentheses (e.g. Pump.fun's synthetic PumpSwap row returns
 * "SOL (PumpSwap)"). After stripping non-word/whitespace characters the
 * result becomes "SOL PumpSwap" — we keep only the first whitespace-
 * delimited token so the label stays a clean coin symbol.
 */
function tokenDisplay(fee: FeeRecord): { label: string; badge: string } {
  // Synthetic Flaunch row holding wallet-wide claimable not attributable to a
  // specific coin (mixed-PM wallets, or fees from old PositionManager).
  if (fee.token_address === 'BASE:flaunch-legacy') {
    return { label: 'Flaunch (claimable)', badge: 'F' };
  }
  const cleaned = (fee.token_symbol || '').replace(/[^\w\s\-\.]/g, '').trim();
  const symbol = cleaned.split(/\s+/)[0]?.slice(0, 20) ?? '';
  if (symbol) {
    return { label: `$${symbol}`, badge: symbol[0] };
  }
  const addr = fee.token_address || '';
  const short = addr.length > 8 ? addr.slice(0, 6) + '...' : addr;
  return { label: short, badge: '?' };
}

/**
 * For display-only adapters (no in-app claim), return the external claim URL.
 * Flaunch and Flap v1 link out to their native apps for user-driven claims.
 * Reown AppKit migration will unlock in-app claims in a future milestone.
 */
function externalClaimUrl(platform: string): string | null {
  if (platform === 'flaunch') return 'https://flaunch.gg';
  if (platform === 'flap') return 'https://flap.sh';
  return null;
}

export function TokenFeeTable({ fees, solPrice = 0, ethPrice = 0, bnbPrice = 0, connectedWallet, onClaimToken }: TokenFeeTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const tableTopRef = useRef<HTMLDivElement>(null);

  /** Scroll to the first row when paginating (so users see the new content). */
  const goToPage = useCallback((updater: (p: number) => number) => {
    setCurrentPage((p) => {
      const next = updater(p);
      if (next !== p) {
        // Defer to next frame so the new rows render before we scroll.
        requestAnimationFrame(() => {
          tableTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
      return next;
    });
  }, []);

  const handleCopy = useCallback(async (id: string, address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedId(id);
      setFailedId(null);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopiedId(null), 1500);
    } catch {
      setFailedId(id);
      setCopiedId(null);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setFailedId(null), 2000);
    }
  }, []);

  // Memoize sort + display value computation so it only re-runs when inputs change
  const sortedFees = useMemo(() => {
    const withUsd = fees.map((fee) => ({
      fee,
      usd: computeFeeUsd(fee, solPrice, ethPrice, bnbPrice),
      display: tokenDisplay(fee),
    }));
    withUsd.sort((a, b) => {
      if (b.usd !== a.usd) return b.usd - a.usd;
      return Number(safeBigInt(b.fee.total_unclaimed) - safeBigInt(a.fee.total_unclaimed));
    });
    return withUsd;
  }, [fees, solPrice, ethPrice, bnbPrice]);

  const totalPages = Math.max(1, Math.ceil(sortedFees.length / PER_PAGE));
  const displayedFees = sortedFees.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  /** Currency label based on chain — shown after formatted amounts */
  const currencyLabel = (chain: string) => {
    const symbol = CHAIN_CONFIG[chain as keyof typeof CHAIN_CONFIG]?.nativeToken ?? 'ETH';
    return <span className="ml-1 text-[11px] font-medium uppercase text-muted-foreground/60">{symbol}</span>;
  };

  if (sortedFees.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 text-center">
        <svg className="mb-3 h-10 w-10 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
        </svg>
        <p className="text-sm text-muted-foreground">No fee records found</p>
      </div>
    );
  }

  return (
    <>
    {/* Anchor for pagination scroll-to-top */}
    <div ref={tableTopRef} aria-hidden="true" className="scroll-mt-20" />
    {/* Mobile: stacked card layout */}
    <div className="space-y-3 md:hidden">
      {displayedFees.map(({ fee, usd, display: { label, badge } }, idx) => {
        const platformConfig = PLATFORM_CONFIG[fee.platform];
        const decimals = fee.chain === 'sol' ? 9 : 18;
        return (
          <div
            key={fee.id}
            className="card-hover rounded-xl border border-border/40 bg-card p-3.5"
            style={idx < 8 ? { animation: `fadeInUp 0.4s ease-out ${idx * 50}ms both` } : undefined}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-bold uppercase text-muted-foreground">
                  {badge}
                </span>
                <span className="font-mono text-sm font-semibold">
                  {label}
                </span>
                {fee.fee_type === 'cashback' && (
                  <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-700" title="This token distributes cashback to traders, not creator fees">
                    CASHBACK
                  </span>
                )}
                {fee.fee_locked && (
                  <svg className="h-3.5 w-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-label="Fee config locked" role="img">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                )}
                {fee.token_address && (
                  <button
                    type="button"
                    onClick={() => handleCopy(fee.id, fee.token_address!)}
                    aria-label={copiedId === fee.id ? 'Copied' : failedId === fee.id ? 'Copy failed' : 'Copy contract address'}
                    title="Copy contract address"
                    className="pressable inline-flex cursor-pointer items-center justify-center rounded p-3 -m-1.5 text-muted-foreground/60 hover:text-foreground"
                  >
                    {copiedId === fee.id ? (
                      <svg className="h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                    ) : failedId === fee.id ? (
                      <svg className="h-3.5 w-3.5 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                    ) : (
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" /></svg>
                    )}
                  </button>
                )}
              </div>
              <ClaimStatusBadge status={fee.claim_status} />
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <PlatformIcon platform={fee.platform} className="h-3.5 w-3.5" aria-hidden />
              <span>{platformConfig?.name ?? fee.platform}</span>
              {fee.platform === 'flaunch' && (
                <a
                  href="https://flaunch.gg"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80 hover:text-foreground"
                  aria-label="View on flaunch.gg"
                >
                  View on flaunch.gg &rarr;
                </a>
              )}
              {fee.platform === 'flap' && (
                <>
                  {fee.vault_type === 'unknown' && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-400"
                      aria-label="Claim method unknown"
                      title="Vault ABI not recognized by ClaimScan. Go to flap.sh to claim"
                    >
                      <AlertTriangle className="h-3 w-3" aria-hidden />
                      Claim method unknown
                    </span>
                  )}
                  <a
                    href="https://flap.sh"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80 hover:text-foreground"
                    aria-label="View on flap.sh"
                  >
                    View on flap.sh &rarr;
                  </a>
                </>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Earned</p>
                <p className="font-mono tabular-nums">{formatTokenAmount(fee.total_earned, decimals)}{currencyLabel(fee.chain)}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">USD</p>
                <p className="font-semibold tabular-nums">{formatUsd(usd)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Unclaimed</p>
                <p className="font-mono tabular-nums">{formatTokenAmount(fee.total_unclaimed, decimals)}{currencyLabel(fee.chain)}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Claimed</p>
                <p className="font-mono tabular-nums text-muted-foreground">{formatTokenAmount(fee.total_claimed, decimals)}{currencyLabel(fee.chain)}</p>
              </div>
            </div>
            {connectedWallet && onClaimToken && fee.platform === 'bags' && fee.claim_status !== 'claimed' && safeBigInt(fee.total_unclaimed) > 0n && (
              <button
                onClick={() => onClaimToken(fee.token_address)}
                aria-label={`Claim fees for ${fee.token_symbol || fee.token_address.slice(0, 8)}`}
                className="pressable hover-glow-primary mt-3 w-full cursor-pointer rounded-xl bg-foreground py-2.5 text-xs font-bold uppercase tracking-wider text-background duration-200"
              >
                <span className="flex items-center justify-center gap-1.5">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                  </svg>
                  Claim
                </span>
              </button>
            )}
          </div>
        );
      })}
    </div>

    {/* Desktop: table layout — 1:1 match with Pencil design */}
    <div className="hidden md:block">
      <table className="w-full font-mono" aria-label="Creator fee records by token">
        <caption className="sr-only">Fee records showing earned, claimed, and unclaimed amounts per token</caption>
        <thead>
          <tr className="border-b border-[var(--border-subtle)]">
            <th scope="col" className="py-3 pl-2 pr-0 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Token</th>
            <th scope="col" className="py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Platform</th>
            <th scope="col" className="py-3 text-right text-[11px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Earned</th>
            <th scope="col" className="py-3 text-right text-[11px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Claimed</th>
            <th scope="col" className="py-3 text-right text-[11px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Unclaimed</th>
            <th scope="col" className="py-3 text-right text-[11px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">USD</th>
            <th scope="col" className="py-3 text-center text-[11px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Status</th>
            {connectedWallet && onClaimToken && (
              <th scope="col" className="py-3 text-center text-[11px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Action</th>
            )}
          </tr>
        </thead>
        <tbody>
          {displayedFees.map(({ fee, usd, display: { label, badge } }, idx) => {
            const platformConfig = PLATFORM_CONFIG[fee.platform];
            const decimals = fee.chain === 'sol' ? 9 : 18;
            const chainLabel = CHAIN_CONFIG[fee.chain as keyof typeof CHAIN_CONFIG]?.nativeToken ?? 'ETH';
            const isZeroUnclaimed = safeBigInt(fee.total_unclaimed) === 0n;
            return (
              <tr
                key={fee.id}
                className={`row-hover border-b border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] ${idx % 2 === 0 ? 'bg-[#FFFFFF06]' : ''}`}
                style={idx < 10 ? { animation: `fadeInUp 0.4s ease-out ${idx * 40}ms both` } : undefined}
              >
                <td className="py-3.5 pl-2 pr-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-background"
                      aria-hidden="true"
                    >
                      {badge}
                    </span>
                    <span className="font-sans text-sm font-semibold text-foreground">
                      {label}
                    </span>
                    {fee.fee_type === 'cashback' && (
                      <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-700" title="This token distributes cashback to traders, not creator fees">
                        CASHBACK
                      </span>
                    )}
                    {fee.fee_locked && (
                      <svg className="h-3 w-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-label="Fee config locked" role="img">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                      </svg>
                    )}
                    {fee.token_address && (
                      <button
                        type="button"
                        onClick={() => handleCopy(fee.id, fee.token_address!)}
                        aria-label={copiedId === fee.id ? 'Copied' : 'Copy contract address'}
                        title="Copy contract address"
                        className="pressable inline-flex items-center justify-center rounded p-3 -m-2 cursor-pointer text-muted-foreground/60 hover:text-foreground"
                      >
                        {copiedId === fee.id ? (
                          <svg className="h-3 w-3 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                        ) : failedId === fee.id ? (
                          <svg className="h-3 w-3 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                        ) : (
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" /></svg>
                        )}
                      </button>
                    )}
                  </div>
                </td>
                <td className="py-3.5 text-[13px] text-foreground">
                  <div className="flex flex-col gap-0.5">
                    <span>{platformConfig?.name ?? fee.platform}</span>
                    {fee.platform === 'flaunch' && (
                      <a
                        href="https://flaunch.gg"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80 hover:text-foreground"
                        aria-label="View on flaunch.gg"
                      >
                        View on flaunch.gg &rarr;
                      </a>
                    )}
                    {fee.platform === 'flap' && (
                      <>
                        {fee.vault_type === 'unknown' && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-400"
                            aria-label="Claim method unknown"
                            title="Vault ABI not recognized by ClaimScan. Go to flap.sh to claim"
                          >
                            <AlertTriangle className="h-3 w-3" aria-hidden />
                            Claim method unknown
                          </span>
                        )}
                        <a
                          href="https://flap.sh"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80 hover:text-foreground"
                          aria-label="View on flap.sh"
                        >
                          View on flap.sh &rarr;
                        </a>
                      </>
                    )}
                  </div>
                </td>
                <td className="py-3.5 text-right text-[13px] tabular-nums text-foreground">
                  {formatTokenAmount(fee.total_earned, decimals)} {chainLabel}
                </td>
                <td className="py-3.5 text-right text-[13px] tabular-nums text-foreground">
                  {formatTokenAmount(fee.total_claimed, decimals)} {chainLabel}
                </td>
                <td className={`py-3.5 text-right text-[13px] tabular-nums ${isZeroUnclaimed ? 'text-muted-foreground/60' : 'text-foreground'}`}>
                  {formatTokenAmount(fee.total_unclaimed, decimals)} {chainLabel}
                </td>
                <td className="py-3.5 text-right font-sans text-[13px] font-bold tabular-nums text-foreground">
                  {formatUsd(usd)}
                </td>
                <td className="py-3.5 text-center">
                  {fee.claim_status === 'auto_distributed' ? (
                    <span className="inline-block bg-[#A1A1AA18] text-[var(--text-secondary)] rounded px-2.5 py-0.5 text-[11px] font-medium uppercase">
                      AUTO
                    </span>
                  ) : fee.claim_status === 'claimed' ? (
                    <span className="inline-block bg-[#A1A1AA18] text-[var(--text-secondary)] rounded px-2.5 py-0.5 text-[11px] font-medium uppercase">
                      CLAIMED
                    </span>
                  ) : fee.claim_status === 'partially_claimed' ? (
                    <span className="inline-block bg-[#FB923C18] text-[var(--partial)] rounded px-2.5 py-0.5 text-[11px] font-medium uppercase">
                      PARTIAL
                    </span>
                  ) : (
                    <span className="inline-block bg-[#FFFFFF10] text-[var(--text-primary)] rounded px-2.5 py-0.5 text-[11px] font-medium uppercase">
                      UNCLAIMED
                    </span>
                  )}
                </td>
                {connectedWallet && onClaimToken && (
                  <td className="py-3.5 text-center">
                    {(fee.platform === 'flaunch' || fee.platform === 'flap') ? (
                      <span className="text-[11px] text-muted-foreground/50" aria-hidden="true">-</span>
                    ) : fee.platform === 'bags' && fee.claim_status !== 'claimed' && safeBigInt(fee.total_unclaimed) > 0n ? (
                      <button
                        onClick={() => onClaimToken(fee.token_address)}
                        aria-label={`Claim fees for ${fee.token_symbol || fee.token_address.slice(0, 8)}`}
                        className="pressable hover-glow-primary inline-flex cursor-pointer items-center gap-1.5 bg-foreground px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[1px] text-background hover:bg-foreground/90"
                                             >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        CLAIM
                      </button>
                    ) : null}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>

    {/* Pagination */}
    {totalPages > 1 && (
      <div className="mt-6 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] px-4 pt-4">
        <p className="whitespace-nowrap text-[12px] text-[var(--text-tertiary)] sm:text-[13px]">
          {(currentPage - 1) * PER_PAGE + 1}&ndash;{Math.min(currentPage * PER_PAGE, sortedFees.length)} of {sortedFees.length}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => goToPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            aria-label="Previous page"
            className="pressable hover-glow shrink-0 cursor-pointer whitespace-nowrap rounded-[8px] border border-[var(--border-default)] px-2.5 py-1.5 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-30 sm:px-3 sm:text-[13px]"
          >
            &larr;<span className="hidden sm:inline"> Prev</span>
          </button>
          <span className="shrink-0 whitespace-nowrap px-2 py-1 font-mono text-[12px] text-[var(--text-primary)] sm:px-3 sm:text-[13px]">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => { goToPage((p) => Math.min(totalPages, p + 1)); track('fee_page_changed', { page: currentPage + 1 }); }}
            disabled={currentPage === totalPages}
            aria-label="Next page"
            className="pressable hover-glow shrink-0 cursor-pointer whitespace-nowrap rounded-[8px] border border-[var(--border-default)] px-2.5 py-1.5 text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-30 sm:px-3 sm:text-[13px]"
          >
            <span className="hidden sm:inline">Next </span>&rarr;
          </button>
        </div>
      </div>
    )}
    </>
  );
}
