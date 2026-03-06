'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LIVE_POLL_INTERVAL_MS } from '@/lib/constants';
import { safeBigInt, formatUsd } from '@/lib/utils';
import { toUsdValue } from '@/lib/prices';

interface LiveFee {
  totalUnclaimed: string;
  chain: string;
}

interface WalletInput {
  address: string;
  chain: string;
  sourcePlatform: string;
}

interface FeeInput {
  total_earned_usd: number | null;
  total_earned: string | null;
  total_unclaimed: string | null;
  chain: string;
  platform: string;
}

interface FeeSummaryCardProps {
  initialFees: FeeInput[];
  wallets: WalletInput[];
  solPrice: number;
  ethPrice: number;
}

export function FeeSummaryCard({
  initialFees,
  wallets,
  solPrice,
  ethPrice,
}: FeeSummaryCardProps) {
  const [liveFees, setLiveFees] = useState<LiveFee[]>([]);
  const [loading, setLoading] = useState(true);

  // Stabilize wallets dependency to prevent infinite re-polling
  const walletsKey = useMemo(
    () => JSON.stringify(wallets),
    [wallets]
  );

  // AbortController ref to cancel in-flight fetches on cleanup
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    async function pollLiveFees() {
      try {
        const params = encodeURIComponent(walletsKey);
        const res = await fetch(`/api/fees/live?wallets=${params}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          setLiveFees(data.fees ?? []);
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        // Silently fail — cached data still shows
      } finally {
        setLoading(false);
      }
    }

    pollLiveFees();
    let interval = setInterval(pollLiveFees, LIVE_POLL_INTERVAL_MS);

    // Pause polling when tab is hidden to save battery/bandwidth
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

  const totalEarnedUsd = useMemo(
    () => initialFees.reduce((sum, fee) => {
      // Prefer DB-stored USD; fall back to computing from amounts × native price
      const dbUsd = fee.total_earned_usd;
      if (typeof dbUsd === 'number' && Number.isFinite(dbUsd) && dbUsd > 0) {
        return sum + dbUsd;
      }
      const unclaimed = safeBigInt(fee.total_unclaimed);
      const earned = safeBigInt(fee.total_earned);
      const amount = unclaimed > 0n ? unclaimed : earned;
      if (amount === 0n) return sum;
      const price = fee.chain === 'sol' ? solPrice : ethPrice;
      const decimals = fee.chain === 'sol' ? 9 : 18;
      return sum + toUsdValue(amount, decimals, price);
    }, 0),
    [initialFees, solPrice, ethPrice]
  );

  const platformCount = useMemo(
    () => new Set(initialFees.map((f) => f.platform)).size,
    [initialFees]
  );

  const liveUnclaimedUsd = useMemo(() => {
    let total = 0;
    for (const fee of liveFees) {
      const amount = safeBigInt(fee.totalUnclaimed);
      if (amount === 0n) continue;
      const price = fee.chain === 'sol' ? solPrice : ethPrice;
      const decimals = fee.chain === 'sol' ? 9 : 18;
      const divisor = 10n ** BigInt(decimals);
      const whole = amount / divisor;
      const remainder = amount % divisor;
      const fracStr = remainder.toString().padStart(decimals, '0');
      const tokenValue = parseFloat(`${whole}.${fracStr}`);
      total += tokenValue * price;
    }
    return total;
  }, [liveFees, solPrice, ethPrice]);

  const cards = [
    {
      title: 'Total Earned',
      value: formatUsd(totalEarnedUsd),
      description: 'All-time across platforms',
      icon: (
        <svg className="h-5 w-5 text-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      ),
    },
    {
      title: 'Unclaimed (Live)',
      value: loading ? null : formatUsd(liveUnclaimedUsd),
      description: 'Real-time onchain balance',
      icon: (
        <svg className="h-5 w-5 text-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" />
        </svg>
      ),
    },
    {
      title: 'Platforms',
      value: platformCount > 0 ? String(platformCount) : '—',
      description: 'Active fee sources',
      icon: (
        <svg className="h-5 w-5 text-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.title}
          className="group relative cursor-default overflow-hidden rounded-xl border border-border bg-card p-4 sm:p-5 transition-all duration-300 hover:border-foreground/20"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              {card.icon}
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              {card.title}
            </p>
          </div>

          <div className="mt-4">
            {card.value === null ? (
              <div className="flex items-center gap-2" aria-label="Loading live unclaimed balance">
                <div className="h-8 w-24 animate-pulse rounded-lg bg-muted" aria-hidden="true" />
                <span className="sr-only">Loading…</span>
                <span className="relative flex h-2 w-2" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-foreground/40 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-foreground" />
                </span>
              </div>
            ) : (
              <p
                className="text-2xl font-bold tabular-nums tracking-tight sm:text-3xl"
                aria-live={card.title === 'Unclaimed (Live)' ? 'polite' : undefined}
                aria-atomic={card.title === 'Unclaimed (Live)' ? true : undefined}
              >
                {card.value}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {card.description}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
