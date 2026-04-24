'use client';

import { useState, useId, useMemo, useCallback, useEffect, useRef, Component, type ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { track } from '@vercel/analytics';
import dynamic from 'next/dynamic';
import { TokenFeeTable } from './TokenFeeTable';
import { PlatformIcon } from './PlatformIcon';
import { PLATFORM_CONFIG, CHAIN_CONFIG } from '@/lib/constants';
import { computeFeeUsd, formatUsd, safeBigInt } from '@/lib/utils';
import { useLiveFees, liveFeeKey } from './LiveFeesProvider';
import type { ClaimStatus, Database, Platform, Chain } from '@/lib/supabase/types';

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

function TabButton({
  active, tabsId, tabKey, onClick, children, count,
}: {
  active: boolean; tabsId: string; tabKey: string;
  onClick: () => void; children: React.ReactNode; count: number;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      aria-controls={`${tabsId}-panel`}
      id={`${tabsId}-tab-${tabKey}`}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={`pressable inline-flex cursor-pointer items-center gap-2 px-4 py-3 text-[13px] font-medium sm:py-2 ${
        active
          ? 'hover-glow-primary bg-foreground text-background'
          : 'hover-glow border border-border text-foreground hover:bg-muted'
      }`}
    >
      {children}
      <span className={`font-mono text-xs tabular-nums ${active ? 'text-background/60' : 'text-muted-foreground'}`}>
        {count}
      </span>
    </button>
  );
}

type Wallet = Database['public']['Tables']['wallets']['Row'];

interface PlatformBreakdownProps {
  fees: FeeRecord[];
  solPrice?: number;
  ethPrice?: number;
  bnbPrice?: number;
  wallets?: Wallet[];
}

interface ChainSummary {
  chain: Chain;
  name: string;
  totalUsd: number;
  unclaimedCount: number;
  partialCount: number;
}

export function PlatformBreakdown({ fees, solPrice = 0, ethPrice = 0, bnbPrice = 0, wallets = [] }: PlatformBreakdownProps) {
  const [activeTab, setActiveTab] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unclaimed' | 'claimed' | 'partial'>('all');
  const [chainFilter, setChainFilter] = useState<'all' | Chain>('all');
  const tabsId = useId();
  const { publicKey } = useWallet();
  const { liveRecords } = useLiveFees();
  const [mounted, setMounted] = useState(false);
  const tabPanelRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR hydration guard; wallet context must be client-only to avoid mismatch
  useEffect(() => setMounted(true), []);
  // Only expose wallet after client mount to avoid SSR issues
  const connectedWallet = mounted ? (publicKey?.toBase58() ?? null) : null;

  // Extract the Bags-registered wallet for claim verification
  const bagsRegisteredWallet = useMemo(() => {
    const bagsWallet = wallets.find((w) => w.source_platform === 'bags' && w.chain === 'sol');
    return bagsWallet?.address ?? null;
  }, [wallets]);

  // Claim dialog state
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [selectedForClaim, setSelectedForClaim] = useState<string[]>([]);

  // Claim All confirmation state
  const [confirmingClaimAll, setConfirmingClaimAll] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    return () => { if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current); };
  }, []);

  // Wallet mismatch detection (shown before dialog opens)
  const bagsWalletMismatch = bagsRegisteredWallet && connectedWallet && connectedWallet !== bagsRegisteredWallet;

  // Local optimistic updates for claimed tokens
  const [claimedMints, setClaimedMints] = useState<Set<string>>(new Set());

  // Layered merge: live fees first, then claimedMints optimistic overlay.
  // Order matters — a user who just clicked Claim should see the token
  // disappear instantly even if the live stream still reports it as
  // unclaimed for the next 5-30s.
  const displayFees = useMemo<FeeRecord[]>(() => {
    const seenKeys = new Set<string>();

    // Step 1: walk cached fees, overlay live data when present
    const merged: FeeRecord[] = fees.map((fee) => {
      const key = liveFeeKey(fee.platform, fee.chain, fee.token_address);
      const live = liveRecords.get(key);
      if (!live) return fee;
      seenKeys.add(key);

      const claimed = safeBigInt(live.totalClaimed);
      const unclaimed = safeBigInt(live.totalUnclaimed);

      // Derive claim_status from the fresh amounts rather than trusting the
      // cached status. This is the one place live data overrides cache status.
      let status: ClaimStatus = fee.claim_status;
      if (unclaimed === 0n && claimed > 0n) status = 'claimed';
      else if (unclaimed > 0n && claimed > 0n) status = 'partially_claimed';
      else if (unclaimed > 0n && claimed === 0n) status = 'unclaimed';
      // else keep whatever the cache had (e.g. auto_distributed)

      return {
        ...fee,
        total_earned: live.totalEarned,
        total_claimed: live.totalClaimed,
        total_unclaimed: live.totalUnclaimed,
        total_earned_usd: live.totalEarnedUsd ?? fee.total_earned_usd,
        claim_status: status,
        fee_type: live.feeType ?? fee.fee_type,
        fee_locked: live.feeLocked ?? fee.fee_locked,
        vault_type: live.vaultType ?? fee.vault_type,
        token_symbol: live.tokenSymbol ?? fee.token_symbol,
      };
    });

    // Step 2: append virtual rows for live-only tokens (no cached counterpart)
    for (const [key, live] of liveRecords) {
      if (seenKeys.has(key)) continue;
      const unclaimed = safeBigInt(live.totalUnclaimed);
      if (unclaimed === 0n) continue; // nothing to show for empty live rows
      const claimed = safeBigInt(live.totalClaimed);
      const status: ClaimStatus = claimed > 0n ? 'partially_claimed' : 'unclaimed';

      merged.push({
        id: `live:${key}`,
        creator_id: '',
        creator_token_id: null,
        platform: live.platform as Platform,
        chain: live.chain as Chain,
        token_address: live.tokenAddress,
        token_symbol: live.tokenSymbol,
        total_earned: live.totalEarned,
        total_claimed: live.totalClaimed,
        total_unclaimed: live.totalUnclaimed,
        total_earned_usd: live.totalEarnedUsd,
        claim_status: status,
        royalty_bps: null,
        fee_type: live.feeType ?? null,
        fee_locked: live.feeLocked ?? null,
        vault_type: live.vaultType ?? null,
        last_synced_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      } as FeeRecord);
    }

    // Step 3: optimistic claimedMints overlay — just-claimed tokens zero out
    if (claimedMints.size === 0) return merged;
    return merged.map((fee) => {
      if (claimedMints.has(fee.token_address) && fee.platform === 'bags') {
        return { ...fee, total_unclaimed: '0', claim_status: 'claimed' as const };
      }
      return fee;
    });
  }, [fees, claimedMints, liveRecords]);

  const handleClaimToken = useCallback((tokenMint: string) => {
    setSelectedForClaim([tokenMint]);
    setClaimDialogOpen(true);
  }, []);

  const handleClaimAllBags = useCallback(() => {
    const bagsUnclaimed = displayFees.filter(
      (f) => f.platform === 'bags' && f.claim_status !== 'claimed' && safeBigInt(f.total_unclaimed) > 0n
    );
    track('claim_all_initiated', {
      platform: 'bags',
      token_count: bagsUnclaimed.length,
    });
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
      // Per WAI-ARIA tabs: focus stays on the tab, user presses Tab to enter panel
      const el = document.getElementById(`${tabsId}-tab-${tabKeys[newIdx]}`);
      el?.focus();
      el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
      existing.totalUsd += computeFeeUsd(fee, solPrice, ethPrice, bnbPrice);
      if (fee.claim_status === 'unclaimed') existing.unclaimedCount += 1;
      if (fee.claim_status === 'partially_claimed') existing.partialCount += 1;
      byChain.set(fee.chain, existing);
    }
    return Array.from(byChain.values());
  }, [displayFees, solPrice, ethPrice, bnbPrice]);

  // Chain filter applied before platform grouping
  const chainFiltered = useMemo(() => {
    if (chainFilter === 'all') return displayFees;
    return displayFees.filter(f => f.chain === chainFilter);
  }, [displayFees, chainFilter]);

  // Group fees by platform (memoized — fees can contain hundreds of records)
  const { byPlatform, platformsWithData, platformsEmpty } = useMemo(() => {
    const byPlatform = new Map<Platform, FeeRecord[]>();
    for (const fee of chainFiltered) {
      const existing = byPlatform.get(fee.platform) ?? [];
      existing.push(fee);
      byPlatform.set(fee.platform, existing);
    }
    const platformsWithData = ALL_PLATFORMS.filter((p) => (byPlatform.get(p)?.length ?? 0) > 0);
    const platformsEmpty = ALL_PLATFORMS.filter((p) => (byPlatform.get(p)?.length ?? 0) === 0);
    return { byPlatform, platformsWithData, platformsEmpty };
  }, [chainFiltered]);

  const platformFiltered = useMemo(
    () => activeTab === 'all' ? chainFiltered : (byPlatform.get(activeTab as Platform) ?? []),
    [activeTab, chainFiltered, byPlatform],
  );
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
    <div className="rounded-2xl bg-card">
      {/* Top Bar Section — 3-row filter system */}
      <div className="space-y-3 px-4 pt-6 sm:px-8">
        {/* Row 1 — Chain Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1 pr-4 sm:flex-wrap sm:overflow-visible sm:pb-0 sm:pr-0">
          {(['all', 'sol', 'base', 'eth', 'bsc'] as const).map(ch => (
            <button
              key={ch}
              onClick={() => setChainFilter(ch)}
              className={`pressable shrink-0 rounded-[6px] px-3 py-1.5 text-[13px] font-medium ${
                chainFilter === ch
                  ? 'hover-glow-primary bg-white text-[var(--text-inverse)]'
                  : 'hover-glow bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
              }`}
            >
              {ch === 'all' ? 'All' : CHAIN_CONFIG[ch]?.name ?? ch}
            </button>
          ))}
        </div>

        {/* Row 2 — Status Filters */}
        <div
          role="radiogroup"
          aria-label="Filter by claim status"
          className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-1 pr-4 sm:flex-wrap sm:overflow-visible sm:pb-0 sm:pr-0"
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            const items = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]');
            const idx = Array.from(items).indexOf(e.target as HTMLButtonElement);
            if (idx === -1) return;
            const next = e.key === 'ArrowRight' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
            items[next].focus();
            items[next].click();
          }}
        >
          {(['all', 'unclaimed', 'claimed', ...(totalPartial > 0 ? ['partial'] as const : [])] as const).map((status) => {
            const count = statusCounts[status as keyof typeof statusCounts] ?? 0;
            const isActive = statusFilter === status;
            return (
              <button
                key={status}
                role="radio"
                aria-checked={isActive}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setStatusFilter(status as typeof statusFilter)}
                className={`pressable hover-glow inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[20px] px-3 py-1.5 text-[13px] font-medium capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isActive
                    ? 'bg-[var(--bg-surface-hover)] border border-[var(--border-accent)] text-[var(--text-primary)]'
                    : 'bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                }`}
              >
                {status}
                <span className={`text-xs tabular-nums ${isActive ? 'text-[var(--text-secondary)]' : 'text-[var(--text-tertiary)]'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Row 3 — Launchpad/Platform Tabs */}
        <div
          role="tablist"
          aria-label="Filter by platform"
          className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1 pr-4 sm:flex-wrap sm:overflow-visible sm:pb-0 sm:pr-0"
          onKeyDown={(e) => handleTabKeyDown(e, tabKeys)}
        >
          <button
            role="tab"
            aria-selected={activeTab === 'all'}
            aria-controls={`${tabsId}-panel`}
            id={`${tabsId}-tab-all`}
            tabIndex={activeTab === 'all' ? 0 : -1}
            onClick={() => setActiveTab('all')}
            className={`pressable hover-glow inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[20px] px-3 py-1.5 text-[13px] font-medium ${
              activeTab === 'all'
                ? 'bg-[var(--bg-surface-hover)] border border-[var(--border-accent)] text-[var(--text-primary)]'
                : 'bg-[var(--bg-surface)] text-[var(--text-secondary)]'
            }`}
          >
            All
            <span className={`text-xs tabular-nums ${activeTab === 'all' ? 'text-[var(--text-secondary)]' : 'text-[var(--text-tertiary)]'}`}>
              {chainFiltered.length}
            </span>
          </button>
          {platformsWithData.map((platform) => {
            const config = PLATFORM_CONFIG[platform];
            const count = byPlatform.get(platform)?.length ?? 0;
            const isActive = activeTab === platform;
            return (
              <button
                key={platform}
                role="tab"
                aria-selected={isActive}
                aria-controls={`${tabsId}-panel`}
                id={`${tabsId}-tab-${platform}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(platform)}
                className={`pressable hover-glow inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[20px] px-3 py-1.5 text-[13px] font-medium ${
                  isActive
                    ? 'bg-[var(--bg-surface-hover)] border border-[var(--border-accent)] text-[var(--text-primary)]'
                    : 'bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                }`}
              >
                <PlatformIcon platform={platform} className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{config?.name ?? platform}</span>
                <span className={`text-xs tabular-nums ${isActive ? 'text-[var(--text-secondary)]' : 'text-[var(--text-tertiary)]'}`}>
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
      </div>

      {/* CTA — Claim All — 1:1 Pencil design */}
      {connectedWallet && (activeTab === 'all' || activeTab === 'bags') && (() => {
        const bagsUnclaimed = (activeTab === 'all' ? displayFees : (byPlatform.get('bags') ?? []))
          .filter((f) => f.platform === 'bags' && f.claim_status !== 'claimed' && safeBigInt(f.total_unclaimed) > 0n);
        if (bagsUnclaimed.length === 0) return null;
        return (
          <div className="px-4 pt-4 space-y-3 sm:px-8">
            {bagsWalletMismatch && (
              <div className="flex items-start gap-2.5 border border-border bg-muted px-4 py-3">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                <div>
                  <p className="text-xs font-semibold text-foreground">Wrong wallet connected</p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                    Bags.fm requires wallet {bagsRegisteredWallet!.slice(0, 4)}...{bagsRegisteredWallet!.slice(-4)} to claim.
                  </p>
                </div>
              </div>
            )}
            <button
              onClick={() => {
                if (confirmingClaimAll) {
                  handleClaimAllBags();
                  setConfirmingClaimAll(false);
                  if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
                } else {
                  setConfirmingClaimAll(true);
                  if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
                  confirmTimerRef.current = setTimeout(() => setConfirmingClaimAll(false), 5000);
                }
              }}
              className={`pressable hover-glow-primary flex h-12 w-full cursor-pointer items-center justify-center text-sm font-semibold uppercase tracking-[1px] duration-200 ${
                confirmingClaimAll
                  ? 'bg-foreground/90 text-background ring-2 ring-foreground/20'
                  : 'bg-foreground text-background hover:bg-foreground/85'
              }`}
            >
              {confirmingClaimAll
                ? `CONFIRM CLAIM ALL (${bagsUnclaimed.length} TOKEN${bagsUnclaimed.length !== 1 ? 'S' : ''})`
                : `CLAIM ALL UNCLAIMED (${bagsUnclaimed.length} BAGS TOKEN${bagsUnclaimed.length !== 1 ? 'S' : ''})`}
            </button>
          </div>
        );
      })()}

      {/* Tab panel — table with px-8 padding */}
      <div
        ref={tabPanelRef}
        role="tabpanel"
        id={`${tabsId}-panel`}
        aria-labelledby={`${tabsId}-tab-${activeTab}`}
        tabIndex={-1}
        className="px-4 pt-4 pb-2 sm:px-8"
        key={`${activeTab}-${statusFilter}`}
        style={{ animation: 'fadeIn 0.2s ease-out' }}
      >
        {filteredFees.length > 0 ? (
          <TokenFeeTable
            fees={filteredFees}
            solPrice={solPrice}
            ethPrice={ethPrice}
            bnbPrice={bnbPrice}
            connectedWallet={connectedWallet}
            onClaimToken={handleClaimToken}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <PlatformIcon platform={activeTab} className="mb-2 h-6 w-6 text-muted-foreground/30" aria-hidden />
            <p className="text-sm text-muted-foreground">
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
          <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Failed to load claim dialog. Please refresh the page and try again.
          </p>
        }>
          <ClaimDialog
            open={claimDialogOpen}
            onOpenChange={setClaimDialogOpen}
            wallet={connectedWallet}
            bagsRegisteredWallet={bagsRegisteredWallet}
            fees={displayFees.filter((f) => selectedForClaim.includes(f.token_address) && f.platform === 'bags')}
            solPrice={solPrice}
            onClaimComplete={handleClaimComplete}
          />
        </ClaimErrorBoundary>
      )}
    </div>
  );
}
