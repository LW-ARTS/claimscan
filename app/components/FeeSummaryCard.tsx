'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LIVE_POLL_INTERVAL_MS } from '@/lib/constants';
import { safeBigInt, formatUsd, toUsdValue } from '@/lib/utils';

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

  // Instant unclaimed from DB (shows immediately, no network wait)
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
      const divisor = 10n ** BigInt(decimals);
      const whole = amount / divisor;
      const remainder = amount % divisor;
      const fracStr = remainder.toString().padStart(decimals, '0');
      const tokenValue = parseFloat(`${whole}.${fracStr}`);
      total += tokenValue * price;
    }
    return total;
  }, [liveFees, solPrice, ethPrice]);

  // Show live value when available, otherwise show cached DB value instantly
  const displayUnclaimedUsd = liveFees.length > 0 ? liveUnclaimedUsd : cachedUnclaimedUsd;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card shimmer">
      {/* Hero total */}
      <div className="px-4 py-6 sm:px-6 sm:py-8 text-center">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50 mb-2">
          Total Fees Earned
        </p>
        <p className="text-4xl sm:text-5xl font-bold tabular-nums tracking-tight">
          {formatUsd(totalEarnedUsd)}
        </p>
      </div>

      {/* Secondary stats row */}
      <div className="border-t border-dashed border-border/60 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center justify-center gap-4 sm:gap-6 text-sm">
          {/* Unclaimed (Live) */}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground/60 text-xs">Unclaimed</span>
            <span
              className="font-semibold tabular-nums"
              aria-live="polite"
              aria-atomic
            >
              {formatUsd(displayUnclaimedUsd)}
            </span>
            {loading && (
              <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-foreground/40 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-foreground" />
              </span>
            )}
          </div>

          <span className="h-4 w-px bg-border" aria-hidden="true" />

          {/* Platform count */}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground/60 text-xs">Platforms</span>
            <span className="font-semibold tabular-nums">
              {platformCount > 0 ? platformCount : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
