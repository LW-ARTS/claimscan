'use client';

import { useState, useMemo } from 'react';
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

export function TokenFeeTable({ fees, solPrice = 0, ethPrice = 0 }: TokenFeeTableProps) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT);

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
          <div key={fee.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold uppercase text-muted-foreground">
                  {badge}
                </span>
                <span className="font-mono text-sm font-medium">
                  {label}
                </span>
              </div>
              <ClaimStatusBadge status={fee.claim_status} />
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <PlatformIcon platform={fee.platform} className="h-3.5 w-3.5 opacity-70" aria-hidden />
              <span>{platformConfig?.name ?? fee.platform}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Earned</p>
                <p className="font-mono tabular-nums">{formatTokenAmount(fee.total_earned, decimals)}{currencyLabel(fee.chain)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">USD</p>
                <p className="font-medium tabular-nums">{formatUsd(usd)}</p>
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
            <tr className="border-b border-border bg-muted">
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Token
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Platform
              </th>
              <th scope="col" className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Earned
              </th>
              <th scope="col" className="hidden px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground md:table-cell">
                Claimed
              </th>
              <th scope="col" className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Unclaimed
              </th>
              <th scope="col" className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                USD
              </th>
              <th scope="col" className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {displayedFees.map(({ fee, usd, display: { label, badge } }) => {
              const platformConfig = PLATFORM_CONFIG[fee.platform];
              const decimals = fee.chain === 'sol' ? 9 : 18;
              return (
                <tr
                  key={fee.id}
                  className="transition-colors hover:bg-muted/50"
                >
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold uppercase text-muted-foreground" aria-hidden="true">
                        {badge}
                      </span>
                      <span className="font-mono text-sm font-medium">
                        {label}
                      </span>
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
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
        >
          Show More
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
        <p className="text-[10px] text-muted-foreground/60 tabular-nums">
          Showing {displayedFees.length} of {sortedFees.length}
        </p>
      </div>
    )}
    </>
  );
}
