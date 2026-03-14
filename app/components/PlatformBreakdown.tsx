'use client';

import { useState, useId, useMemo, useCallback, useEffect, Component, type ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import dynamic from 'next/dynamic';
import { TokenFeeTable } from './TokenFeeTable';
import { PlatformIcon } from './PlatformIcon';
import { ChainIcon } from './ChainIcon';
import { PLATFORM_CONFIG, CHAIN_CONFIG } from '@/lib/constants';
import { computeFeeUsd, formatUsd, safeBigInt } from '@/lib/utils';
import type { Database, Platform, Chain } from '@/lib/supabase/types';

const ClaimDialog = dynamic(
  () => import('./ClaimDialog').then((m) => ({ default: m.ClaimDialog })),
  { ssr: false },
);

/** Error boundary that falls back to rendering children without claim UI. */
class ClaimErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    console.warn('[ClaimErrorBoundary] Wallet UI error caught:', error.message);
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

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
  partialCount: number;
}

export function PlatformBreakdown({ fees, solPrice = 0, ethPrice = 0 }: PlatformBreakdownProps) {
  const [activeTab, setActiveTab] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unclaimed' | 'claimed' | 'partial'>('all');
  const tabsId = useId();
  const { publicKey } = useWallet();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Only expose wallet after client mount to avoid SSR issues
  const connectedWallet = mounted ? (publicKey?.toBase58() ?? null) : null;

  // Claim dialog state
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [selectedForClaim, setSelectedForClaim] = useState<string[]>([]);

  // Local optimistic updates for claimed tokens
  const [claimedMints, setClaimedMints] = useState<Set<string>>(new Set());

  // Apply optimistic updates to fees
  const displayFees = useMemo(() => {
    if (claimedMints.size === 0) return fees;
    return fees.map((fee) => {
      if (claimedMints.has(fee.token_address) && fee.platform === 'bags') {
        return { ...fee, total_unclaimed: '0', claim_status: 'claimed' as const };
      }
      return fee;
    });
  }, [fees, claimedMints]);

  const handleClaimToken = useCallback((tokenMint: string) => {
    setSelectedForClaim([tokenMint]);
    setClaimDialogOpen(true);
  }, []);

  const handleClaimAllBags = useCallback(() => {
    const bagsUnclaimed = displayFees.filter(
      (f) => f.platform === 'bags' && f.claim_status !== 'claimed' && safeBigInt(f.total_unclaimed) > 0n
    );
    setSelectedForClaim(bagsUnclaimed.map((f) => f.token_address));
    setClaimDialogOpen(true);
  }, [displayFees]);

  const handleClaimComplete = useCallback((confirmedMints: string[]) => {
    setClaimedMints((prev) => {
      const next = new Set(prev);
      for (const mint of confirmedMints) next.add(mint);
      return next;
    });
    // Dispatch custom event so ProfileHero can trigger an immediate live fee refresh
    // instead of waiting for the next 30s poll cycle.
    window.dispatchEvent(new CustomEvent('claimscan:claim-complete', {
      detail: { mints: confirmedMints },
    }));
  }, []);

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
    for (const fee of displayFees) {
      const existing = byChain.get(fee.chain) ?? {
        chain: fee.chain,
        name: CHAIN_CONFIG[fee.chain]?.name ?? fee.chain,
        totalUsd: 0,
        unclaimedCount: 0,
        partialCount: 0,
      };
      existing.totalUsd += computeFeeUsd(fee, solPrice, ethPrice);
      if (fee.claim_status === 'unclaimed') existing.unclaimedCount += 1;
      if (fee.claim_status === 'partially_claimed') existing.partialCount += 1;
      byChain.set(fee.chain, existing);
    }
    return Array.from(byChain.values());
  }, [displayFees, solPrice, ethPrice]);

  // Group fees by platform (memoized — fees can contain hundreds of records)
  const { byPlatform, platformsWithData, platformsEmpty } = useMemo(() => {
    const byPlatform = new Map<Platform, FeeRecord[]>();
    for (const fee of displayFees) {
      const existing = byPlatform.get(fee.platform) ?? [];
      existing.push(fee);
      byPlatform.set(fee.platform, existing);
    }
    const platformsWithData = ALL_PLATFORMS.filter((p) => (byPlatform.get(p)?.length ?? 0) > 0);
    const platformsEmpty = ALL_PLATFORMS.filter((p) => (byPlatform.get(p)?.length ?? 0) === 0);
    return { byPlatform, platformsWithData, platformsEmpty };
  }, [displayFees]);

  const platformFiltered = activeTab === 'all' ? displayFees : (byPlatform.get(activeTab as Platform) ?? []);
  const filteredFees = statusFilter === 'all'
    ? platformFiltered
    : statusFilter === 'unclaimed'
      ? platformFiltered.filter((f) => f.claim_status === 'unclaimed' || f.claim_status === 'partially_claimed')
      : statusFilter === 'claimed'
        ? platformFiltered.filter((f) => f.claim_status === 'claimed' || f.claim_status === 'partially_claimed')
        : platformFiltered.filter((f) => f.claim_status === 'partially_claimed');

  // Status counts for the active platform tab
  const statusCounts = useMemo(() => {
    let unclaimed = 0;
    let claimed = 0;
    let partial = 0;
    for (const f of platformFiltered) {
      if (f.claim_status === 'unclaimed') unclaimed++;
      else if (f.claim_status === 'claimed') claimed++;
      else if (f.claim_status === 'partially_claimed') partial++;
    }
    return {
      all: platformFiltered.length,
      unclaimed: unclaimed + partial,
      claimed: claimed + partial,
      partial,
    };
  }, [platformFiltered]);
  const tabKeys = ['all', ...platformsWithData];

  const totalUnclaimed = chainSummaries.reduce((sum, c) => sum + c.unclaimedCount, 0);
  const totalPartial = chainSummaries.reduce((sum, c) => sum + c.partialCount, 0);

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
          {(totalUnclaimed > 0 || totalPartial > 0) && (
            <>
              <span className="h-3.5 w-px bg-border/50" aria-hidden="true" />
              <span className="inline-flex items-center gap-1.5 rounded-md border border-foreground/15 bg-foreground/[0.04] px-2.5 py-1 text-xs font-semibold text-foreground">
                <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-foreground opacity-40" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-foreground" />
                </span>
                {totalUnclaimed > 0 && <>{totalUnclaimed} unclaimed</>}
                {totalUnclaimed > 0 && totalPartial > 0 && <span className="text-muted-foreground/40">&middot;</span>}
                {totalPartial > 0 && <>{totalPartial} partial</>}
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
            {displayFees.length}
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
          aria-disabled="true"
          disabled
          aria-controls={`${tabsId}-panel`}
          id={`${tabsId}-tab-${platform}`}
          tabIndex={-1}
          className="sr-only"
        >
          {PLATFORM_CONFIG[platform]?.name ?? platform} (0)
        </button>
      ))}

      {/* Status filter */}
      <div className="flex items-center gap-0.5 rounded-xl bg-muted/50 p-1">
        {(['all', 'unclaimed', 'claimed', ...(totalPartial > 0 ? ['partial'] as const : [])] as const).map((status) => {
          const count = statusCounts[status as keyof typeof statusCounts] ?? 0;
          const isActive = statusFilter === status;
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(status as typeof statusFilter)}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isActive
                  ? 'bg-foreground text-background shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {status}
              <span className={`tabular-nums text-[10px] ${
                isActive ? 'text-background/60' : 'text-muted-foreground/50'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Claim All button for Bags unclaimed */}
      {connectedWallet && (activeTab === 'all' || activeTab === 'bags') && (() => {
        const bagsUnclaimed = (activeTab === 'all' ? displayFees : (byPlatform.get('bags') ?? []))
          .filter((f) => f.platform === 'bags' && f.claim_status !== 'claimed' && safeBigInt(f.total_unclaimed) > 0n);
        if (bagsUnclaimed.length === 0) return null;
        return (
          <button
            onClick={handleClaimAllBags}
            className="w-full rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-all hover:opacity-90 active:scale-[0.99]"
          >
            Claim All Unclaimed ({bagsUnclaimed.length} Bags token{bagsUnclaimed.length !== 1 ? 's' : ''})
          </button>
        );
      })()}

      {/* Tab panel */}
      <div
        role="tabpanel"
        id={`${tabsId}-panel`}
        aria-labelledby={`${tabsId}-tab-${activeTab}`}
        tabIndex={-1}
      >
        {filteredFees.length > 0 ? (
          <TokenFeeTable
            fees={filteredFees}
            solPrice={solPrice}
            ethPrice={ethPrice}
            connectedWallet={connectedWallet}
            onClaimToken={handleClaimToken}
          />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border border-border/30 bg-card py-12 text-center">
            <PlatformIcon platform={activeTab} className="mb-2 h-6 w-6 text-muted-foreground/30" aria-hidden />
            <p className="text-sm text-muted-foreground/60">
              {activeTab === 'all'
                ? 'No fees found across any platform'
                : `No fees found on ${PLATFORM_CONFIG[activeTab as Platform]?.name ?? activeTab}`}
            </p>
          </div>
        )}
      </div>

      {/* Claim Dialog — wrapped in error boundary for wallet/connection failures */}
      {connectedWallet && claimDialogOpen && (
        <ClaimErrorBoundary fallback={
          <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            Failed to load claim dialog. Please refresh the page and try again.
          </p>
        }>
          <ClaimDialog
            open={claimDialogOpen}
            onOpenChange={setClaimDialogOpen}
            wallet={connectedWallet}
            fees={displayFees.filter((f) => selectedForClaim.includes(f.token_address) && f.platform === 'bags')}
            solPrice={solPrice}
            onClaimComplete={handleClaimComplete}
          />
        </ClaimErrorBoundary>
      )}
    </div>
  );
}
