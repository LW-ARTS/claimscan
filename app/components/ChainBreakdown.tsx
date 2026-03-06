import { CHAIN_CONFIG } from '@/lib/constants';
import { ChainIcon } from './ChainIcon';
import { formatUsd } from '@/lib/utils';
import type { Database, Chain } from '@/lib/supabase/types';

type FeeRecord = Database['public']['Tables']['fee_records']['Row'];

interface ChainSummary {
  chain: Chain;
  name: string;
  nativeToken: string;
  totalUsd: number;
  unclaimedCount: number;
  totalRecords: number;
}


export function ChainBreakdown({ fees }: { fees: FeeRecord[] }) {
  const byChain = new Map<Chain, ChainSummary>();

  for (const fee of fees) {
    const existing = byChain.get(fee.chain) ?? {
      chain: fee.chain,
      name: CHAIN_CONFIG[fee.chain]?.name ?? fee.chain,
      nativeToken: CHAIN_CONFIG[fee.chain]?.nativeToken ?? '?',
      totalUsd: 0,
      unclaimedCount: 0,
      totalRecords: 0,
    };

    existing.totalUsd += fee.total_earned_usd ?? 0;
    existing.totalRecords += 1;
    if (fee.claim_status === 'unclaimed') existing.unclaimedCount += 1;

    byChain.set(fee.chain, existing);
  }

  const chains = Array.from(byChain.values());

  if (chains.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2">
      {chains.map((chain) => {
        return (
          <div
            key={chain.chain}
            className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 sm:p-5 transition-all duration-300 hover:border-foreground/20"
          >

            <div className="relative">
              <div className="flex items-center gap-3">
                <ChainIcon chain={chain.chain} className="h-7 w-7" />
                <div>
                  <h3 className="text-sm font-semibold">{chain.name}</h3>
                  <p className="text-xs text-muted-foreground">{chain.nativeToken}</p>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-2xl font-bold tabular-nums tracking-tight">
                  {formatUsd(chain.totalUsd)}
                </p>
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    {chain.totalRecords} token{chain.totalRecords !== 1 ? 's' : ''}
                  </span>
                  <span className="h-3 w-px bg-border" />
                  {chain.unclaimedCount > 0 ? (
                    <span className="flex items-center gap-1 font-medium text-foreground">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-foreground/40 opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-foreground" />
                      </span>
                      {chain.unclaimedCount} unclaimed
                    </span>
                  ) : (
                    <span className="text-muted-foreground">All claimed</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
