'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { PlatformIcon } from './PlatformIcon';
import { ShareButton } from './ShareButton';
import { PLATFORM_CONFIG, LIVE_POLL_INTERVAL_MS } from '@/lib/constants';
import { safeBigInt, formatUsd, toUsdValue } from '@/lib/utils';
import type { Database } from '@/lib/supabase/types';

type Creator = Database['public']['Tables']['creators']['Row'];
type Wallet = Database['public']['Tables']['wallets']['Row'];

interface FeeInput {
  total_earned_usd: number | null;
  total_earned: string | null;
  total_unclaimed: string | null;
  chain: string;
  platform: string;
}

interface WalletInput {
  address: string;
  chain: string;
  sourcePlatform: string;
}

interface LiveFee {
  totalUnclaimed: string;
  chain: string;
}

export interface TopPlatform {
  key: string;
  name: string;
  color: string;
  usdValue: number;
  percentage: number;
}

interface ProfileHeroProps {
  creator: Creator;
  wallets: Wallet[];
  initialFees: FeeInput[];
  walletsForLive: WalletInput[];
  solPrice: number;
  ethPrice: number;
  handle: string;
  totalEarnedUsd: number;
  platformCount: number;
}

const chainMeta: Record<string, { label: string; color: string; bg: string }> = {
  sol: { label: 'Solana', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
  base: { label: 'Base', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
  eth: { label: 'Ethereum', color: 'text-blue-300', bg: 'bg-blue-400/10 border-blue-400/20' },
};

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.334a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

function WalletRow({ wallet }: { wallet: Wallet }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const meta = chainMeta[wallet.chain] ?? { label: wallet.chain, color: 'text-muted-foreground', bg: 'bg-muted border-border' };
  const platformConfig = PLATFORM_CONFIG[wallet.source_platform as keyof typeof PLATFORM_CONFIG];

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const handleCopy = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = wallet.address;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) {
        setCopied(true);
        timerRef.current = setTimeout(() => setCopied(false), 2000);
      }
    }
  }, [wallet.address]);

  return (
    <div className="group flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 transition-colors hover:bg-muted/50">
      <span className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.bg} ${meta.color}`}>
        {wallet.chain}
      </span>
      <span className="min-w-0 flex-1 overflow-hidden">
        <span className="block truncate font-mono text-[11px] leading-relaxed text-foreground/80 sm:text-xs">
          {wallet.address}
        </span>
      </span>
      <button
        onClick={handleCopy}
        aria-label={copied ? 'Copied!' : 'Copy address'}
        title={copied ? 'Copied!' : 'Copy address'}
        className={`inline-flex shrink-0 items-center justify-center rounded-md p-1 transition-all ${
          copied
            ? 'text-emerald-400'
            : 'text-muted-foreground/40 hover:bg-muted hover:text-foreground/70'
        }`}
      >
        {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
      </button>
      <span className="hidden shrink-0 items-center gap-1 text-[11px] text-muted-foreground/50 sm:flex">
        via
        <PlatformIcon platform={wallet.source_platform} className="h-3 w-3 opacity-60" aria-hidden />
        <span className="font-medium">{platformConfig?.name ?? wallet.source_platform}</span>
      </span>
    </div>
  );
}

export function ProfileHero({
  creator,
  wallets,
  initialFees,
  walletsForLive,
  solPrice,
  ethPrice,
  handle,
  totalEarnedUsd,
  platformCount,
}: ProfileHeroProps) {
  const [showAllWallets, setShowAllWallets] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  // ── Live polling (migrated from FeeSummaryCard) ──
  const [liveFees, setLiveFees] = useState<LiveFee[]>([]);
  const [loading, setLoading] = useState(true);

  const walletsKey = useMemo(() => JSON.stringify(walletsForLive), [walletsForLive]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    async function pollLiveFees() {
      try {
        const res = await fetch('/api/fees/live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallets: JSON.parse(walletsKey) }),
          cache: 'no-store',
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          setLiveFees(data.fees ?? []);
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      } finally {
        setLoading(false);
      }
    }

    pollLiveFees();
    let interval = setInterval(pollLiveFees, LIVE_POLL_INTERVAL_MS);

    function handleVisibility() {
      if (document.hidden) {
        clearInterval(interval);
      } else {
        pollLiveFees();
        interval = setInterval(pollLiveFees, LIVE_POLL_INTERVAL_MS);
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      controller.abort();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [walletsKey]);

  // ── Computed values ──
  const cachedUnclaimedUsd = useMemo(() => {
    let total = 0;
    for (const fee of initialFees) {
      const amount = safeBigInt(fee.total_unclaimed);
      if (amount === 0n) continue;
      const price = fee.chain === 'sol' ? solPrice : ethPrice;
      const decimals = fee.chain === 'sol' ? 9 : 18;
      total += toUsdValue(amount, decimals, price);
    }
    return total;
  }, [initialFees, solPrice, ethPrice]);

  const liveUnclaimedUsd = useMemo(() => {
    let total = 0;
    for (const fee of liveFees) {
      const amount = safeBigInt(fee.totalUnclaimed);
      if (amount === 0n) continue;
      const price = fee.chain === 'sol' ? solPrice : ethPrice;
      const decimals = fee.chain === 'sol' ? 9 : 18;
      total += toUsdValue(amount, decimals, price);
    }
    return total;
  }, [liveFees, solPrice, ethPrice]);

  const displayUnclaimedUsd = liveFees.length > 0 ? liveUnclaimedUsd : cachedUnclaimedUsd;

  // ── Display values ──
  const displayName = creator.display_name || creator.twitter_handle || creator.github_handle || 'Unknown';
  const chains = [...new Set(wallets.map((w) => w.chain))];
  const avatarUrl = creator.twitter_handle ? `/api/avatar?handle=${encodeURIComponent(creator.twitter_handle)}` : null;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Main hero section */}
      <div className="p-5 sm:p-8">
        {/* Desktop: side-by-side | Mobile: stacked */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          {/* Left: identity */}
          <div className="flex items-start gap-3.5 sm:gap-5">
            {/* Avatar */}
            <div className="relative shrink-0">
              {avatarUrl && !avatarError ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  width={80}
                  height={80}
                  className="h-14 w-14 rounded-full border-2 border-border object-cover sm:h-[72px] sm:w-[72px]"
                  onError={() => setAvatarError(true)}
                  loading="eager"
                  fetchPriority="high"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-border bg-muted text-xl font-black text-foreground sm:h-[72px] sm:w-[72px] sm:text-2xl">
                  {displayName[0]?.toUpperCase()}
                </div>
              )}
            </div>

            {/* Name + badges */}
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">
                {displayName}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {creator.twitter_handle && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-xs text-muted-foreground">
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                    @{creator.twitter_handle}
                  </span>
                )}
                {creator.github_handle && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-xs text-muted-foreground">
                    {creator.github_handle}
                  </span>
                )}
                {chains.map((chain) => {
                  const meta = chainMeta[chain] ?? { label: chain, color: 'text-muted-foreground', bg: 'bg-muted border-border' };
                  return (
                    <span
                      key={chain}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${meta.bg} ${meta.color}`}
                    >
                      <span className="relative flex h-1 w-1" aria-hidden="true">
                        <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-current opacity-75" />
                        <span className="relative inline-flex h-1 w-1 rounded-full bg-current" />
                      </span>
                      {meta.label}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: hero total (desktop) / centered (mobile) */}
          <div className="text-center sm:text-right sm:shrink-0">
            <p className="text-5xl font-black tabular-nums tracking-tighter sm:text-6xl">
              {formatUsd(totalEarnedUsd)}
            </p>
            <p className="mt-1 text-xs tracking-wide text-muted-foreground/50">
              Total Earned
            </p>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-5 flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground/50 text-xs">Unclaimed</span>
            <span className="font-semibold tabular-nums" aria-live="polite" aria-atomic>
              {formatUsd(displayUnclaimedUsd)}
            </span>
            {loading && (
              <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-foreground/40 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-foreground" />
              </span>
            )}
          </div>
          <span className="h-3.5 w-px bg-border/60" aria-hidden="true" />
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground/50 text-xs">Platforms</span>
            <span className="font-semibold tabular-nums">
              {platformCount > 0 ? platformCount : '—'}
            </span>
          </div>
        </div>

        {/* Share buttons */}
        {totalEarnedUsd > 0 && (
          <div className="mt-5 pt-5 border-t border-border/40">
            <ShareButton
              handle={handle}
              totalEarnedUsd={totalEarnedUsd}
              platformCount={platformCount}
            />
          </div>
        )}
      </div>

      {/* Wallets section */}
      {wallets.length > 0 && (
        <div className="border-t border-border/40 px-5 py-3 sm:px-8">
          {!showAllWallets ? (
            <button
              onClick={() => setShowAllWallets(true)}
              className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-[11px] transition-colors hover:bg-muted/40 group"
            >
              <span className="font-medium uppercase tracking-wider text-muted-foreground/40 group-hover:text-muted-foreground">
                Resolved Wallets
              </span>
              <span className="flex items-center gap-1.5 tabular-nums text-muted-foreground/30 group-hover:text-muted-foreground">
                {wallets.length} wallet{wallets.length !== 1 ? 's' : ''}
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </span>
            </button>
          ) : (
            <>
              <div className="mb-2.5 flex items-center justify-between px-1">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/40">
                  Resolved Wallets
                </p>
                <p className="text-[11px] tabular-nums text-muted-foreground/30">
                  {wallets.length} wallet{wallets.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="space-y-1.5">
                {wallets.map((w) => (
                  <WalletRow key={w.id} wallet={w} />
                ))}
              </div>
              <button
                onClick={() => setShowAllWallets(false)}
                className="mt-2 w-full rounded-lg py-1.5 text-center text-[11px] font-medium text-muted-foreground/50 transition-colors hover:bg-muted/40 hover:text-muted-foreground"
              >
                Hide wallets
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
