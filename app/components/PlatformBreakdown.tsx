'use client';

import { useState, useId } from 'react';
import { TokenFeeTable } from './TokenFeeTable';
import { PlatformIcon } from './PlatformIcon';
import { PLATFORM_CONFIG } from '@/lib/constants';
import type { Database, Platform } from '@/lib/supabase/types';

type FeeRecord = Database['public']['Tables']['fee_records']['Row'];

/** Ordered list of all platforms to always show in tabs */
const ALL_PLATFORMS = Object.keys(PLATFORM_CONFIG) as Platform[];

interface PlatformBreakdownProps {
  fees: FeeRecord[];
  solPrice?: number;
  ethPrice?: number;
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

  // Group fees by platform
  const byPlatform = new Map<Platform, FeeRecord[]>();
  for (const fee of fees) {
    const existing = byPlatform.get(fee.platform) ?? [];
    existing.push(fee);
    byPlatform.set(fee.platform, existing);
  }

  // Always show all platforms, sorted: platforms with data first, then empty ones
  const platformsWithData = ALL_PLATFORMS.filter((p) => (byPlatform.get(p)?.length ?? 0) > 0);
  const platformsEmpty = ALL_PLATFORMS.filter((p) => (byPlatform.get(p)?.length ?? 0) === 0);
  const orderedPlatforms = [...platformsWithData, ...platformsEmpty];

  const filteredFees = activeTab === 'all' ? fees : (byPlatform.get(activeTab as Platform) ?? []);
  const tabKeys = ['all', ...orderedPlatforms];

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <p className="text-xs tabular-nums text-muted-foreground/60">
          <span className="font-semibold text-foreground/80">{platformsWithData.length}</span>
          <span>/{ALL_PLATFORMS.length} platforms with fees</span>
        </p>
        <p className="text-xs tabular-nums text-muted-foreground/60">
          <span className="font-semibold text-foreground/80">{fees.length}</span>
          <span> tokens total</span>
        </p>
      </div>

      {/* Platform grid — compact visual overview */}
      <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10 sm:gap-2">
        {orderedPlatforms.map((platform) => {
          const config = PLATFORM_CONFIG[platform];
          const count = byPlatform.get(platform)?.length ?? 0;
          const hasData = count > 0;
          const isActive = activeTab === platform;
          return (
            <button
              key={platform}
              onClick={() => setActiveTab(isActive ? 'all' : platform)}
              title={`${config?.name ?? platform}: ${count} tokens`}
              className={`group relative flex flex-col items-center gap-1 rounded-xl border px-1 py-2.5 transition-all duration-200 ${
                isActive
                  ? 'border-foreground/30 bg-foreground/10 shadow-sm'
                  : hasData
                    ? 'border-border bg-card hover:border-foreground/20 hover:bg-muted/50'
                    : 'border-border/30 bg-card/30 opacity-40 hover:opacity-60'
              }`}
            >
              <PlatformIcon
                platform={platform}
                className={`h-4 w-4 transition-colors ${
                  isActive ? 'text-foreground' : hasData ? 'text-muted-foreground group-hover:text-foreground' : 'text-muted-foreground/40'
                }`}
                aria-hidden
              />
              <span className={`text-[9px] font-medium leading-tight ${
                isActive ? 'text-foreground' : hasData ? 'text-muted-foreground' : 'text-muted-foreground/40'
              }`}>
                {config?.name ?? platform}
              </span>
              {hasData && (
                <span
                  className={`absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums ${
                    isActive
                      ? 'bg-foreground text-background'
                      : 'bg-foreground/80 text-background'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filter tabs for keyboard/screen-reader accessibility */}
      <div
        role="tablist"
        aria-label="Filter by platform"
        className="flex flex-wrap gap-1.5"
        onKeyDown={(e) => handleTabKeyDown(e, tabKeys)}
      >
        <button
          role="tab"
          aria-selected={activeTab === 'all'}
          aria-controls={`${tabsId}-panel`}
          id={`${tabsId}-tab-all`}
          tabIndex={activeTab === 'all' ? 0 : -1}
          onClick={() => setActiveTab('all')}
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
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
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                activeTab === platform
                  ? 'bg-foreground text-background'
                  : 'border border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground'
              }`}
            >
              <PlatformIcon platform={platform} className="h-3 w-3" aria-hidden />
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
          <div className="flex flex-col items-center justify-center rounded-xl border border-border/50 bg-card/30 py-12 text-center">
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
