import { ClaimStatusBadge } from './ClaimStatusBadge';
import { PlatformIcon } from './PlatformIcon';
import { PLATFORM_CONFIG } from '@/lib/constants';
import { formatTokenAmount, formatUsd } from '@/lib/utils';
import type { Database } from '@/lib/supabase/types';

type FeeRecord = Database['public']['Tables']['fee_records']['Row'];

export function TokenFeeTable({ fees }: { fees: FeeRecord[] }) {
  if (fees.length === 0) {
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
      {fees.map((fee) => {
        const platformConfig = PLATFORM_CONFIG[fee.platform];
        const decimals = fee.chain === 'sol' ? 9 : 18;
        const safeSymbol = (fee.token_symbol || '').replace(/[^\w\s\-\.]/g, '').slice(0, 20) || null;
        return (
          <div key={fee.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold uppercase text-muted-foreground">
                  {(safeSymbol || '?')[0]}
                </span>
                <span className="font-mono text-sm font-medium">
                  {safeSymbol || fee.token_address.slice(0, 8) + '...'}
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
                <p className="font-mono tabular-nums">{formatTokenAmount(fee.total_earned, decimals)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">USD</p>
                <p className="font-medium tabular-nums">{formatUsd(fee.total_earned_usd ?? 0)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Unclaimed</p>
                <p className="font-mono tabular-nums">{formatTokenAmount(fee.total_unclaimed, decimals)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Claimed</p>
                <p className="font-mono tabular-nums text-muted-foreground">{formatTokenAmount(fee.total_claimed, decimals)}</p>
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
            {fees.map((fee) => {
              const platformConfig = PLATFORM_CONFIG[fee.platform];
              const decimals = fee.chain === 'sol' ? 9 : 18;
              return (
                <tr
                  key={fee.id}
                  className="transition-colors hover:bg-muted/50"
                >
                  <td className="whitespace-nowrap px-4 py-3">
                    {(() => {
                      // Defense-in-depth: strip zero-width/RTL chars at render time
                      const safeSymbol = (fee.token_symbol || '').replace(/[^\w\s\-\.]/g, '').slice(0, 20) || null;
                      return (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold uppercase text-muted-foreground" aria-hidden="true">
                            {(safeSymbol || '?')[0]}
                          </span>
                          <span className="font-mono text-sm font-medium">
                            {safeSymbol || fee.token_address.slice(0, 8) + '...'}
                          </span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <PlatformIcon platform={fee.platform} className="h-3.5 w-3.5 opacity-70" aria-hidden />
                      <span>{platformConfig?.name ?? fee.platform}</span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-sm tabular-nums">
                    {formatTokenAmount(fee.total_earned, decimals)}
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-right font-mono text-sm tabular-nums text-muted-foreground md:table-cell">
                    {formatTokenAmount(fee.total_claimed, decimals)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-sm tabular-nums">
                    {formatTokenAmount(fee.total_unclaimed, decimals)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium tabular-nums">
                    {formatUsd(fee.total_earned_usd ?? 0)}
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
    </>
  );
}
