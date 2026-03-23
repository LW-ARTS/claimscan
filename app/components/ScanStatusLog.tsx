'use client';

import { useState } from 'react';
import { PlatformIcon } from './PlatformIcon';
import { PLATFORM_CONFIG } from '@/lib/constants';
import type { Platform, Chain, Database } from '@/lib/supabase/types';

type FeeRecord = Database['public']['Tables']['fee_records']['Row'];

const ALL_PLATFORMS = Object.keys(PLATFORM_CONFIG) as Platform[];

interface ScanStatusLogProps {
  fees: FeeRecord[];
  resolvedChains: Chain[];
}

type ScanResult = 'found' | 'empty' | 'no_wallet';

interface PlatformScanStatus {
  platform: Platform;
  chain: Chain;
  result: ScanResult;
  count: number;
}

function getScanStatuses(fees: FeeRecord[], resolvedChains: Chain[]): PlatformScanStatus[] {
  const feeCounts = new Map<Platform, number>();
  for (const fee of fees) {
    feeCounts.set(fee.platform, (feeCounts.get(fee.platform) ?? 0) + 1);
  }

  return ALL_PLATFORMS.map((platform) => {
    const config = PLATFORM_CONFIG[platform];
    const chain = config.chain;
    const count = feeCounts.get(platform) ?? 0;

    let result: ScanResult;
    if (!resolvedChains.includes(chain)) {
      result = 'no_wallet';
    } else if (count > 0) {
      result = 'found';
    } else {
      result = 'empty';
    }

    return { platform, chain, count, result };
  });
}

const dotStyle: Record<ScanResult, string> = {
  found: 'bg-foreground',
  empty: 'bg-foreground/15',
  no_wallet: 'bg-foreground/[0.06]',
};

export function ScanStatusLog({ fees, resolvedChains }: ScanStatusLogProps) {
  const [expanded, setExpanded] = useState(false);
  const statuses = getScanStatuses(fees, resolvedChains);

  const foundCount = statuses.filter((s) => s.result === 'found').length;
  const totalChecked = statuses.filter((s) => s.result !== 'no_wallet').length;

  return (
    <div className="rounded-xl border border-border/40 bg-muted/20">
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
      >
        {/* Status dots summary */}
        <div className="flex items-center gap-1" aria-hidden="true">
          {statuses.map((s) => (
            <span
              key={s.platform}
              className={`h-1.5 w-1.5 rounded-full ${dotStyle[s.result]}`}
              title={`${PLATFORM_CONFIG[s.platform].name}: ${s.result}`}
            />
          ))}
        </div>

        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          {foundCount}/{totalChecked} platforms with fees
        </span>

        <svg
          className={`ml-auto h-3.5 w-3.5 text-muted-foreground/50 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-border/30 px-4 py-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5">
            {statuses.map((s) => {
              const config = PLATFORM_CONFIG[s.platform];
              const isFound = s.result === 'found';
              return (
                <div
                  key={s.platform}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
                    isFound ? 'text-foreground/80' : 'text-muted-foreground/30'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotStyle[s.result]}`}
                    aria-hidden="true"
                  />
                  <PlatformIcon
                    platform={s.platform}
                    className={`h-3 w-3 shrink-0 ${!isFound ? 'opacity-30' : 'opacity-70'}`}
                    aria-hidden
                  />
                  <span className="truncate font-medium">{config.name}</span>
                  {isFound && (
                    <span className="ml-auto tabular-nums text-[11px] font-semibold text-foreground/50">
                      {s.count}
                    </span>
                  )}
                  {s.result === 'no_wallet' && (
                    <span className="ml-auto text-[11px]">no wallet</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
