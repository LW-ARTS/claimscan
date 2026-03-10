'use client';

import { useState, useId, useMemo } from 'react';
import { TokenFeeTable } from './TokenFeeTable';
import { PlatformIcon } from './PlatformIcon';
import { ChainIcon } from './ChainIcon';
import { PLATFORM_CONFIG, CHAIN_CONFIG } from '@/lib/constants';
import { computeFeeUsd, formatUsd } from '@/lib/utils';
import type { Database, Platform, Chain } from '@/lib/supabase/types';

type FeeRecord = Database['public']['Tables']['fee_records']['Row'];

/** Ordered list of all platforms to always show in tabs */
const ALL_PLATFORMS = Object.keys(PLATFORM_CONFIG) as Platform[];

interface PlatformBreakdownProps {
  fees: FeeRecord[];
  solPrice?: number;
  ethPrice?: number;
}

interface ChainSummary {
  chain: Chain;
  name: string;
  totalUsd: number;
  unclaimedCount: number;
}

export function PlatformBreakdown({ fees, solPrice = 0, ethPrice = 0 }: PlatformBreakdownProps) {
  const [activeTab, setActiveTab] = useState('all');
  const tabsId = useId();

  // Arrow key navigation for WAI-ARIA tablist pattern
  function handleTabKeyDown(e: React.KeyboardEvent, tabKeys: string[]) {
    const idx = tabKeys.indexOf(activeTab);
    let newIdx = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      newIdx = (idx + 1) % tabKeys.length;
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      newIdx = (idx - 1 + tabKeys.length) % tabKeys.length;
      e.preventDefault();
    } else if (e.key === 'Home') {
      newIdx = 0;
      e.preventDefault();
    } else if (e.key === 'End') {
      newIdx = tabKeys.length - 1;
      e.preventDefault();
    }
    if (newIdx !== idx) {
      setActiveTab(tabKeys[newIdx]);
      document.getElementById(`${tabsId}-tab-${tabKeys[newIdx]}`)?.focus();
    }
  }

  // Compute chain summaries (absorbed from ChainBreakdown)
  const chainSummaries = useMemo(() => {
    const byChain = new Map<Chain, ChainSummary>();
    for (const fee of fees) {
      const existing = byChain.get(fee.chain) ?? {
        chain: fee.chain,
        name: CHAIN_CONFIG[fee.chain]?.name ?? fee.chain,
        totalUsd: 0,
        unclaimedCount: 0,
      };
      existing.totalUsd += computeFeeUsd(fee, solPrice, ethPrice);
      if (fee.claim_status === 'unclaimed') existing.unclaimedCount += 1;
      byChain.set(fee.chain, existing);
    }
    return Array.from(byChain.values());
  }, [fees, solPrice, ethPrice]);

  // Group fees by platform (memoized — fees can contain hundreds of records)
  const { byPlatform, platformsWithData, platformsEmpty } = useMemo(() => {
    const byPlatform = new Map<Platform, FeeRecord[]>();
    for (const fee of fees) {
      const existing = byPlatform.get(fee.platform) ?? [];
      existing.push(fee);
      byPlatform.set(fee.platform, existing);
    }
    const platformsWithData = ALL_PLATFORMS.filter((p) => (byPlatform.get(p)?.length ?? 0) > 0);
    const platformsEmpty = ALL_PLATFORMS.filter((p) => (byPlatform.get(p)?.length ?? 0) === 0);
    return { byPlatform, platformsWithData, platformsEmpty };
  }, [fees]);

  const filteredFees = activeTab === 'all' ? fees : (byPlatform.get(activeTab as Platform) ?? []);
  const tabKeys = ['all', ...platformsWithData];

  const totalUnclaimed = chainSummaries.reduce((sum, c) => sum + c.unclaimedCount, 0);

  return (
    <div className="space-y-4">
      {/* Chain summary pills (absorbed from ChainBreakdown) */}
      {chainSummaries.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {chainSummaries.map((chain, i) => (
            <div key={chain.chain} className="flex items-center gap-1.5">
              <ChainIcon chain={chain.chain} className="h-4 w-4" />
              <span className="text-sm font-medium">{chain.name}</span>
              <span className="text-sm font-semibold tabular-nums">{formatUsd(chain.totalUsd)}</span>
            </div>
          ))}
          {totalUnclaimed > 0 && (
            <>
              <span className="h-3.5 w-px bg-border/50" aria-hidden="true" />
              <span className="flex items-center gap-1.5 text-xs text-foreground/70">
                <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-current opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
                </span>
                {totalUnclaimed} unclaimed
              </span>
            </>
          )}
        </div>
      )}

      {/* Filter tabs */}
      <div
        role="tablist"
        aria-label="Filter by platform"
        className="flex flex-wrap gap-2"
        onKeyDown={(e) => handleTabKeyDown(e, tabKeys)}
      >
        <button
          role="tab"
          aria-selected={activeTab === 'all'}
          aria-controls={`${tabsId}-panel`}
          id={`${tabsId}-tab-all`}
          tabIndex={activeTab === 'all' ? 0 : -1}
          onClick={() => setActiveTab('all')}
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-all duration-200 ${
            activeTab === 'all'
              ? 'bg-foreground text-background'
              : 'border border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground'
          }`}
        >
          All
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
            activeTab === 'all' ? 'bg-background/20' : 'bg-muted'
          }`}>
            {fees.length}
          </span>
        </button>
        {platformsWithData.map((platform) => {
          const config = PLATFORM_CONFIG[platform];
          const count = byPlatform.get(platform)?.length ?? 0;
          return (
            <button
              key={platform}
              role="tab"
              aria-selected={activeTab === platform}
              aria-controls={`${tabsId}-panel`}
              id={`${tabsId}-tab-${platform}`}
              tabIndex={activeTab === platform ? 0 : -1}
              onClick={() => setActiveTab(platform)}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-all duration-200 ${
                activeTab === platform
                  ? 'bg-foreground text-background'
                  : 'border border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground'
              }`}
            >
              <PlatformIcon platform={platform} className="h-3.5 w-3.5" aria-hidden />
              <span>{config?.name ?? platform}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                activeTab === platform ? 'bg-background/20' : 'bg-muted'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Hidden tabs for platforms without data (for a11y completeness) */}
      {platformsEmpty.map((platform) => (
        <button
          key={platform}
          role="tab"
          aria-selected={false}
          aria-controls={`${tabsId}-panel`}
          id={`${tabsId}-tab-${platform}`}
          tabIndex={-1}
          onClick={() => setActiveTab(platform)}
          className="sr-only"
        >
          {PLATFORM_CONFIG[platform]?.name ?? platform} (0)
        </button>
      ))}

      {/* Tab panel */}
      <div
        role="tabpanel"
        id={`${tabsId}-panel`}
        aria-labelledby={`${tabsId}-tab-${activeTab}`}
        tabIndex={0}
      >
        {filteredFees.length > 0 ? (
          <TokenFeeTable fees={filteredFees} solPrice={solPrice} ethPrice={ethPrice} />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-border/30 py-12 text-center">
            <PlatformIcon platform={activeTab} className="mb-2 h-6 w-6 text-muted-foreground/30" aria-hidden />
            <p className="text-sm text-muted-foreground/60">
              {activeTab === 'all'
                ? 'No fees found across any platform'
                : `No fees found on ${PLATFORM_CONFIG[activeTab as Platform]?.name ?? activeTab}`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
