'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { ClaimStatusBadge } from './ClaimStatusBadge';
import { PlatformIcon } from './PlatformIcon';
import { PLATFORM_CONFIG } from '@/lib/constants';
import { computeFeeUsd, formatTokenAmount, formatUsd, safeBigInt } from '@/lib/utils';
import type { Database } from '@/lib/supabase/types';

type FeeRecord = Database['public']['Tables']['fee_records']['Row'];

/** How many tokens to show initially and per "Show More" click */
const INITIAL_COUNT = 15;
const LOAD_MORE_COUNT = 15;

interface TokenFeeTableProps {
  fees: FeeRecord[];
  solPrice?: number;
  ethPrice?: number;
  connectedWallet?: string | null;
  onClaimToken?: (tokenMint: string) => void;
}

/** Format token display: $SYMBOL when available, shortened address as fallback */
function tokenDisplay(fee: FeeRecord): { label: string; badge: string } {
  const raw = (fee.token_symbol || '').replace(/[^\w\s\-\.]/g, '').trim().slice(0, 20);
  if (raw) {
    return { label: `$${raw}`, badge: raw[0] };
  }
  const addr = fee.token_address || '';
  const short = addr.length > 8 ? addr.slice(0, 6) + '...' : addr;
  return { label: short, badge: '?' };
}

export function TokenFeeTable({ fees, solPrice = 0, ethPrice = 0, connectedWallet, onClaimToken }: TokenFeeTableProps) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const handleCopy = useCallback(async (id: string, address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedId(id);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Clipboard API not available (insecure context or permission denied)
    }
  }, []);

  // Memoize sort + display value computation so it only re-runs when inputs change
  const sortedFees = useMemo(() => {
    const withUsd = fees.map((fee) => ({
      fee,
      usd: computeFeeUsd(fee, solPrice, ethPrice),
      display: tokenDisplay(fee),
    }));
    withUsd.sort((a, b) => {
      if (b.usd !== a.usd) return b.usd - a.usd;
      return Number(safeBigInt(b.fee.total_unclaimed) - safeBigInt(a.fee.total_unclaimed));
    });
    return withUsd;
  }, [fees, solPrice, ethPrice]);

  const displayedFees = sortedFees.slice(0, visibleCount);
  const hasMore = visibleCount < sortedFees.length;

  /** Currency label based on chain — shown after formatted amounts */
  const currencyLabel = (chain: string) => (
    <span className="ml-1 text-[10px] font-medium uppercase text-muted-foreground/60">{chain === 'sol' ? 'SOL' : 'ETH'}</span>
  );

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
    {/* Mobile: stacked card layout */}
    <div className="space-y-3 md:hidden">
      {displayedFees.map(({ fee, usd, display: { label, badge } }) => {
        const platformConfig = PLATFORM_CONFIG[fee.platform];
        const decimals = fee.chain === 'sol' ? 9 : 18;
        return (
          <div key={fee.id} className="rounded-xl border border-border/40 bg-card p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold uppercase text-muted-foreground">
                  {badge}
                </span>
                <span className="font-mono text-sm font-semibold">
                  {label}
                </span>
                {fee.token_address && (
                  <button
                    type="button"
                    onClick={() => handleCopy(fee.id, fee.token_address!)}
                    aria-label={copiedId === fee.id ? 'Copied' : 'Copy contract address'}
                    title="Copy contract address"
                    className="inline-flex items-center justify-center rounded p-3 -m-1.5 text-muted-foreground/60 transition-all hover:text-foreground active:scale-90"
                  >
                    {copiedId === fee.id ? (
                      <svg className="h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
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
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Earned</p>
                <p className="font-mono tabular-nums">{formatTokenAmount(fee.total_earned, decimals)}{currencyLabel(fee.chain)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">USD</p>
                <p className="font-semibold tabular-nums">{formatUsd(usd)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Unclaimed</p>
                <p className="font-mono tabular-nums">{formatTokenAmount(fee.total_unclaimed, decimals)}{currencyLabel(fee.chain)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Claimed</p>
                <p className="font-mono tabular-nums text-muted-foreground">{formatTokenAmount(fee.total_claimed, decimals)}{currencyLabel(fee.chain)}</p>
              </div>
            </div>
            {connectedWallet && onClaimToken && fee.platform === 'bags' && fee.claim_status !== 'claimed' && safeBigInt(fee.total_unclaimed) > 0n && (
              <button
                onClick={() => onClaimToken(fee.token_address)}
                aria-label={`Claim fees for ${fee.token_symbol || fee.token_address.slice(0, 8)}`}
                className="mt-3 w-full rounded-xl bg-foreground py-2.5 text-xs font-bold uppercase tracking-wider text-background transition-all duration-200 hover:shadow-[0_0_16px_rgba(0,0,0,0.12)] hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
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

    {/* Desktop: table layout */}
    <div className="hidden md:block overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label="Creator fee records by token">
          <caption className="sr-only">Fee records showing earned, claimed, and unclaimed amounts per token</caption>
          <thead>
            <tr className="border-b border-border/50">
              <th scope="col" className="px-4 py-3 text-left text-[11px] font-normal tracking-wide text-muted-foreground/40">
                Token
              </th>
              <th scope="col" className="px-4 py-3 text-left text-[11px] font-normal tracking-wide text-muted-foreground/40">
                Platform
              </th>
              <th scope="col" className="px-4 py-3 text-right text-[11px] font-normal tracking-wide text-muted-foreground/40">
                Earned
              </th>
              <th scope="col" className="hidden px-4 py-3 text-right text-[11px] font-normal tracking-wide text-muted-foreground/40 md:table-cell">
                Claimed
              </th>
              <th scope="col" className="px-4 py-3 text-right text-[11px] font-normal tracking-wide text-muted-foreground/40">
                Unclaimed
              </th>
              <th scope="col" className="px-4 py-3 text-right text-[11px] font-normal tracking-wide text-muted-foreground/40">
                USD
              </th>
              <th scope="col" className="px-4 py-3 text-right text-[11px] font-normal tracking-wide text-muted-foreground/40">
                Status
              </th>
              {connectedWallet && onClaimToken && (
                <th scope="col" className="px-4 py-3 text-right text-[11px] font-normal tracking-wide text-muted-foreground/40">
                  Action
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {displayedFees.map(({ fee, usd, display: { label, badge } }) => {
              const platformConfig = PLATFORM_CONFIG[fee.platform];
              const decimals = fee.chain === 'sol' ? 9 : 18;
              return (
                <tr
                  key={fee.id}
                  className="group transition-colors hover:bg-muted/30"
                >
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold uppercase text-muted-foreground" aria-hidden="true">
                        {badge}
                      </span>
                      <span className="font-mono text-sm font-medium">
                        {label}
                      </span>
                      {fee.token_address && (
                        <button
                          type="button"
                          onClick={() => handleCopy(fee.id, fee.token_address!)}
                          aria-label={copiedId === fee.id ? 'Copied' : 'Copy contract address'}
                    title="Copy contract address"
                          className="inline-flex items-center justify-center rounded p-3 -m-1.5 text-muted-foreground/60 transition-all hover:text-foreground active:scale-90"
                        >
                          {copiedId === fee.id ? (
                            <svg className="h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                          ) : (
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" /></svg>
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <PlatformIcon platform={fee.platform} className="h-3.5 w-3.5 opacity-70" aria-hidden />
                      <span>{platformConfig?.name ?? fee.platform}</span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-sm tabular-nums">
                    {formatTokenAmount(fee.total_earned, decimals)}{currencyLabel(fee.chain)}
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-right font-mono text-sm tabular-nums text-muted-foreground md:table-cell">
                    {formatTokenAmount(fee.total_claimed, decimals)}{currencyLabel(fee.chain)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-sm tabular-nums">
                    {formatTokenAmount(fee.total_unclaimed, decimals)}{currencyLabel(fee.chain)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium tabular-nums">
                    {formatUsd(usd)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <ClaimStatusBadge status={fee.claim_status} />
                  </td>
                  {connectedWallet && onClaimToken && (
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {fee.platform === 'bags' && fee.claim_status !== 'claimed' && safeBigInt(fee.total_unclaimed) > 0n && (
                        <button
                          onClick={() => onClaimToken(fee.token_address)}
                          aria-label={`Claim fees for ${fee.token_symbol || fee.token_address.slice(0, 8)}`}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-background transition-all duration-200 hover:shadow-[0_0_12px_rgba(0,0,0,0.1)] hover:-translate-y-px active:translate-y-0 active:scale-95"
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                          </svg>
                          Claim
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>

    {/* Show More */}
    {hasMore && (
      <div className="mt-4 flex flex-col items-center gap-1">
        <button
          onClick={() => setVisibleCount((c) => c + LOAD_MORE_COUNT)}
          className="rounded-lg border border-border/60 bg-card/80 px-5 py-2 text-sm font-medium text-foreground/80 transition-all hover:bg-foreground hover:text-background active:scale-95"
        >
          Show more ({sortedFees.length - displayedFees.length} remaining)
        </button>
      </div>
    )}
    </>
  );
}
