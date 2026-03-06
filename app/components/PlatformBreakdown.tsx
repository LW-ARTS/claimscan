'use client';

import { useState, useId } from 'react';
import { TokenFeeTable } from './TokenFeeTable';
import { PlatformIcon } from './PlatformIcon';
import { PLATFORM_CONFIG } from '@/lib/constants';
import type { Database, Platform } from '@/lib/supabase/types';

type FeeRecord = Database['public']['Tables']['fee_records']['Row'];

export function PlatformBreakdown({ fees }: { fees: FeeRecord[] }) {
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

  const platforms = Array.from(byPlatform.keys());

  if (platforms.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 text-center">
        <p className="text-sm text-muted-foreground">No platform data available</p>
      </div>
    );
  }

  const filteredFees = activeTab === 'all' ? fees : (byPlatform.get(activeTab as Platform) ?? []);
  const tabKeys = ['all', ...platforms];

  return (
    <div className="space-y-4">
      {/* Accessible tab list with arrow key navigation */}
      <div role="tablist" aria-label="Filter by platform" className="flex flex-wrap gap-2" onKeyDown={(e) => handleTabKeyDown(e, tabKeys)}>
        <button
          role="tab"
          aria-selected={activeTab === 'all'}
          aria-controls={`${tabsId}-panel`}
          id={`${tabsId}-tab-all`}
          tabIndex={activeTab === 'all' ? 0 : -1}
          onClick={() => setActiveTab('all')}
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-2 sm:py-1.5 text-sm font-medium transition-all duration-200 ${
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
        {platforms.map((platform) => {
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
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-2 sm:py-1.5 text-sm font-medium transition-all duration-200 ${
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

      {/* Tab panel */}
      <div
        role="tabpanel"
        id={`${tabsId}-panel`}
        aria-labelledby={`${tabsId}-tab-${activeTab}`}
        tabIndex={0}
      >
        <TokenFeeTable fees={filteredFees} />
      </div>
    </div>
  );
}
