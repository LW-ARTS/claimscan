'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { track } from '@vercel/analytics';
import { PlatformIcon } from './PlatformIcon';
import { ShareButton } from './ShareButton';
import { PLATFORM_CONFIG, LIVE_POLL_INTERVAL_MS } from '@/lib/constants';
import { safeBigInt, formatUsd, toUsdValue, copyToClipboard } from '@/lib/utils';
import { signedFetch } from '@/lib/signed-fetch';
import type { Database, Chain, Platform } from '@/lib/supabase/types';

type Creator = Database['public']['Tables']['creators']['Row'];
type Wallet = Database['public']['Tables']['wallets']['Row'];

interface FeeInput {
  total_earned_usd: number | null;
  total_earned: string | null;
  total_claimed: string | null;
  total_unclaimed: string | null;
  chain: Chain;
  platform: Platform;
}

interface WalletInput {
  address: string;
  chain: string;
  sourcePlatform: string;
}

interface LiveFee {
  totalUnclaimed: string;
  chain: string;
  platform: string;
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
  resolveMs: number;
}

const chainMeta: Record<string, { label: string; color: string; bg: string }> = {
  sol: { label: 'Solana', color: 'text-muted-foreground', bg: 'bg-muted border-border' },
  base: { label: 'Base', color: 'text-muted-foreground', bg: 'bg-muted border-border' },
  eth: { label: 'Ethereum', color: 'text-muted-foreground', bg: 'bg-muted border-border' },
};

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.334a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
    </svg>
  );
}

function PulsingDot({ className = 'h-1.5 w-1.5' }: { className?: string }) {
  return (
    <span className={`relative flex ${className}`} aria-hidden="true">
      <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-current opacity-75" />
      <span className={`relative inline-flex ${className} rounded-full bg-current`} />
    </span>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
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
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const meta = chainMeta[wallet.chain] ?? { label: wallet.chain, color: 'text-muted-foreground', bg: 'bg-muted border-border' };
  const platformConfig = PLATFORM_CONFIG[wallet.source_platform as keyof typeof PLATFORM_CONFIG];

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const handleCopy = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const ok = await copyToClipboard(wallet.address);
    setCopyState(ok ? 'copied' : 'failed');
    timerRef.current = setTimeout(() => setCopyState('idle'), 2000);
  }, [wallet.address]);

  const copied = copyState === 'copied';

  return (
    <div className="group flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 transition-colors hover:bg-muted/50">
      <span className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${meta.bg} ${meta.color}`}>
        {wallet.chain}
      </span>
      <span className="min-w-0 flex-1 overflow-hidden">
        <span className="block truncate font-mono text-xs leading-relaxed text-foreground/80" title={wallet.address}>
          {wallet.address}
        </span>
      </span>
      <button
        onClick={handleCopy}
        aria-label={copyState === 'copied' ? 'Copied!' : copyState === 'failed' ? 'Copy failed' : 'Copy address'}
        title={copyState === 'copied' ? 'Copied!' : copyState === 'failed' ? 'Failed to copy' : 'Copy address'}
        className={`inline-flex shrink-0 items-center justify-center rounded-md p-3 -m-2 transition-all ${
          copyState === 'copied'
            ? 'text-emerald-400'
            : copyState === 'failed'
              ? 'text-red-400'
              : 'text-muted-foreground/40 hover:bg-muted hover:text-foreground/70'
        }`}
      >
        {copyState === 'copied' ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
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
  resolveMs,
}: ProfileHeroProps) {
  const [showAllWallets, setShowAllWallets] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  // ── Live polling (migrated from FeeSummaryCard) ──
  const [liveFees, setLiveFees] = useState<LiveFee[]>([]);
  const [loading, setLoading] = useState(true);
  const [pollError, setPollError] = useState(false);

  const walletsKey = useMemo(() => JSON.stringify(walletsForLive), [walletsForLive]);

  // Track profile load once on mount
  useEffect(() => {
    const safeHandle = /^(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(handle)
      ? `${handle.slice(0, 6)}...${handle.slice(-4)}`
      : handle;
    track('profile_loaded', {
      handle: safeHandle,
      platform_count: platformCount,
      total_earned_usd: Math.round(totalEarnedUsd * 100) / 100,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout>;
    let webhookSSE: EventSource | null = null;

    // Accumulated fees from streaming partial results.
    // Each adapter's results replace previous results for that platform.
    const streamedFees = new Map<string, LiveFee[]>();

    function flushStreamedFees() {
      const all: LiveFee[] = [];
      for (const fees of streamedFees.values()) all.push(...fees);
      setLiveFees(all);
    }

    /**
     * Primary: Stream live fees via SSE — each adapter pushes results
     * as it completes, so fast adapters appear instantly.
     */
    async function streamLiveFees() {
      try {
        const res = await signedFetch('/api/fees/live-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallets: JSON.parse(walletsKey) }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          console.warn(`[ProfileHero] live-stream returned HTTP ${res.status}`);
          // Fallback to JSON endpoint
          return pollLiveFees();
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          let currentEvent = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ') && currentEvent) {
              try {
                const data = JSON.parse(line.slice(6));
                if (currentEvent === 'partial-result' && data.fees && data.platform in PLATFORM_CONFIG) {
                  streamedFees.set(data.platform, data.fees);
                  flushStreamedFees();
                  setLoading(false);
                  setPollError(false);
                }
              } catch {
                // Ignore parse errors in stream
              }
              currentEvent = '';
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.warn('[ProfileHero] live-stream failed, falling back to JSON:', err instanceof Error ? err.message : err);
        return pollLiveFees();
      } finally {
        setLoading(false);
      }
    }

    /** Fallback: traditional JSON fetch (subject to 10s Vercel limit). */
    async function pollLiveFees() {
      try {
        const res = await signedFetch('/api/fees/live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallets: JSON.parse(walletsKey) }),
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!res.ok) {
          console.warn(`[ProfileHero] live fees returned HTTP ${res.status}`);
          return;
        }
        const data = await res.json();
        setLiveFees(data.fees ?? []);
        setPollError(false);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.warn('[ProfileHero] live fee poll failed:', err instanceof Error ? err.message : err);
        setPollError(true);
      } finally {
        setLoading(false);
      }
    }

    function connectWebhookSSE() {
      try {
        const walletData = JSON.parse(walletsKey);
        const url = `/api/fees/stream?wallets=${encodeURIComponent(JSON.stringify(walletData))}`;
        webhookSSE = new EventSource(url);

        webhookSSE.onmessage = () => {
          // Webhook triggered — re-stream live fees
          streamLiveFees();
        };

        webhookSSE.onerror = () => {
          webhookSSE?.close();
          webhookSSE = null;
          // Fall back to periodic polling for updates
          if (!controller.signal.aborted) {
            timeoutId = setTimeout(() => {
              streamLiveFees().then(() => {
                if (!controller.signal.aborted) {
                  timeoutId = setTimeout(() => streamLiveFees(), LIVE_POLL_INTERVAL_MS);
                }
              });
            }, LIVE_POLL_INTERVAL_MS);
          }
        };
      } catch {
        if (!controller.signal.aborted) {
          timeoutId = setTimeout(() => streamLiveFees(), LIVE_POLL_INTERVAL_MS);
        }
      }
    }

    // Initial streaming fetch, then connect webhook SSE for real-time updates
    streamLiveFees().then(() => {
      if (!controller.signal.aborted) {
        connectWebhookSSE();
      }
    });

    // Listen for claim-complete events from PlatformBreakdown to trigger
    // immediate refresh instead of waiting for the next 30s poll cycle.
    function handleClaimComplete() {
      if (!controller.signal.aborted) {
        streamLiveFees();
      }
    }
    window.addEventListener('claimscan:claim-complete', handleClaimComplete);

    function handleVisibility() {
      if (document.hidden) {
        clearTimeout(timeoutId);
      } else if (!webhookSSE || webhookSSE.readyState === EventSource.CLOSED) {
        streamLiveFees().then(() => {
          if (!controller.signal.aborted) connectWebhookSSE();
        });
      } else {
        streamLiveFees();
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
      webhookSSE?.close();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('claimscan:claim-complete', handleClaimComplete);
    };
  }, [walletsKey]);

  // ── Helpers ──
  const feeToUsd = useCallback((chain: string, amount: bigint) => {
    const price = chain === 'sol' ? solPrice : ethPrice;
    const decimals = chain === 'sol' ? 9 : 18;
    return toUsdValue(amount, decimals, price);
  }, [solPrice, ethPrice]);

  // ── Computed values ──
  // Per-platform merge with floor: live data can increase a platform's unclaimed
  // total (new fees arrived) but never reduce it below the cached DB value.
  const displayUnclaimedUsd = useMemo(() => {
    const platformUsd = new Map<string, number>();
    for (const f of initialFees) {
      const amount = safeBigInt(f.total_unclaimed);
      if (amount === 0n) continue;
      platformUsd.set(f.platform, (platformUsd.get(f.platform) ?? 0) + feeToUsd(f.chain, amount));
    }
    if (liveFees.length > 0) {
      const livePlatformUsd = new Map<string, number>();
      for (const f of liveFees) {
        const amount = safeBigInt(f.totalUnclaimed);
        if (amount === 0n) continue;
        livePlatformUsd.set(f.platform, (livePlatformUsd.get(f.platform) ?? 0) + feeToUsd(f.chain, amount));
      }
      for (const [platform, liveUsd] of livePlatformUsd) {
        const cachedUsd = platformUsd.get(platform) ?? 0;
        platformUsd.set(platform, Math.max(cachedUsd, liveUsd));
      }
    }
    let total = 0;
    for (const usd of platformUsd.values()) total += usd;
    return total;
  }, [initialFees, liveFees, feeToUsd]);

  // Claimed USD computed directly from DB total_claimed — not derived from
  // totalEarned - unclaimed, which drifts when live polling updates unclaimed.
  const displayClaimedUsd = useMemo(() => {
    let total = 0;
    for (const f of initialFees) {
      const amount = safeBigInt(f.total_claimed);
      if (amount === 0n) continue;
      total += feeToUsd(f.chain, amount);
    }
    return total;
  }, [initialFees, solPrice, ethPrice]);

  // ── Display values ──
  const displayName = creator.display_name || creator.twitter_handle || creator.github_handle || 'Unknown';
  const chains = [...new Set(wallets.map((w) => w.chain))];
  // Use unavatar.io directly (same source as OG card) — bypasses /api/avatar proxy
  // Daily cache buster ensures browser doesn't serve stale avatars after profile pic changes
  const avatarHandle = handle || creator.twitter_handle;
  const isValidHandle = avatarHandle && /^[a-zA-Z0-9_]{1,50}$/.test(avatarHandle);
  const cacheBuster = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const avatarUrl = isValidHandle ? `https://unavatar.io/x/${avatarHandle}?_cb=${cacheBuster}` : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="px-5 py-6 sm:px-14 sm:py-12">
        {/* Hero: side-by-side on desktop, stacked on mobile */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          {/* Left: avatar + name + badges */}
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="animate-scale-in relative shrink-0">
              {avatarUrl && !avatarError ? (
                <Image
                  src={avatarUrl}
                  alt={displayName}
                  width={100}
                  height={100}
                  priority
                  className="h-14 w-14 rounded-full object-cover sm:h-[100px] sm:w-[100px]"
                  onError={() => setAvatarError(true)}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-xl font-black text-background sm:h-[100px] sm:w-[100px] sm:text-4xl">
                  {displayName[0]?.toUpperCase()}
                </div>
              )}
            </div>

            <div className="animate-fade-in-up delay-100 min-w-0 space-y-2 sm:space-y-3">
              <h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-[32px]">
                {displayName}
              </h1>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                {creator.twitter_handle && (
                  <span className="inline-flex items-center gap-1.5 border border-border px-2 py-1 text-xs text-foreground sm:px-3 sm:py-1.5 sm:text-[13px]">
                    <XIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                    @{creator.twitter_handle}
                  </span>
                )}
                {creator.github_handle && (
                  <span className="inline-flex items-center gap-1.5 border border-border px-2 py-1 text-xs text-muted-foreground sm:px-3 sm:py-1.5 sm:text-[13px]">
                    {creator.github_handle}
                  </span>
                )}
                {chains.map((chain) => {
                  const meta = chainMeta[chain] ?? { label: chain, color: '', bg: '' };
                  return (
                    <span
                      key={chain}
                      className="inline-flex items-center gap-1.5 border border-border px-2 py-1.5 text-xs text-muted-foreground sm:px-3 sm:py-1.5"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-foreground" aria-hidden="true" />
                      {meta.label}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: TOTAL EARNED */}
          <div className="animate-fade-in-up delay-200 shrink-0 text-center sm:text-right">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Total Earned
            </p>
            <p className="mt-1 text-4xl font-black tabular-nums tracking-tighter text-foreground sm:text-6xl">
              {formatUsd(totalEarnedUsd)}
            </p>
            {totalEarnedUsd > 0 && (
              <div className="mt-2 inline-flex items-center border border-border px-3 py-1.5 sm:mt-3 sm:px-4 sm:py-2">
                <span className="font-mono text-xs text-muted-foreground sm:text-[13px]">
                  {formatUsd(displayClaimedUsd)} claimed
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="animate-fade-in-up delay-300 mt-6 flex flex-wrap gap-2 sm:mt-8 sm:gap-3 *:min-w-0 *:flex-1">
          <div className="border border-border px-4 py-4 sm:px-6 sm:py-5">
            <p className="font-mono text-[11px] font-normal uppercase tracking-[1px] text-muted-foreground sm:text-xs">Unclaimed</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-foreground sm:mt-1.5 sm:text-[26px]" aria-live="polite" aria-atomic="true">
              {formatUsd(displayUnclaimedUsd)}
              {loading && <PulsingDot className="ml-1.5 inline-flex h-1.5 w-1.5 text-foreground" />}
              {pollError && !loading && (
                <span className="ml-1.5 inline-flex text-destructive" title="Live data may be outdated. Showing cached values." aria-label="Live fee polling error">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                </span>
              )}
            </p>
          </div>
          <div className="border border-border px-4 py-4 sm:px-6 sm:py-5">
            <p className="font-mono text-[11px] font-normal uppercase tracking-[1px] text-muted-foreground sm:text-xs">Platforms</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-foreground sm:mt-1.5 sm:text-[26px]">
              {platformCount > 0 ? platformCount : '\u2014'}
            </p>
          </div>
          {resolveMs > 0 && (
            <div className="border border-border px-4 py-4 sm:px-6 sm:py-5">
              <p className="font-mono text-[11px] font-normal uppercase tracking-[1px] text-muted-foreground sm:text-xs">Scanned In</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-foreground sm:mt-1.5 sm:text-[26px]">
                {(resolveMs / 1000).toFixed(1)}s
              </p>
            </div>
          )}
        </div>

        {/* Divider + Action buttons */}
        {totalEarnedUsd > 0 && (
          <div className="animate-fade-in-up delay-400 mt-8 space-y-4 sm:mt-10">
            <div className="h-px bg-border" />
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
        <div className="animate-fade-in-up delay-500 px-5 pb-5 sm:px-14 sm:pb-6">
          {!showAllWallets ? (
            <button
              onClick={() => setShowAllWallets(true)}
              aria-expanded={false}
              className="group flex w-full cursor-pointer items-center justify-between py-2 transition-colors"
            >
              <span className="font-mono text-[11px] font-medium uppercase tracking-[2px] text-muted-foreground/60 sm:text-xs">
                Resolved Wallets
              </span>
              <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground/60 sm:text-[13px]">
                {wallets.length} wallet{wallets.length !== 1 ? 's' : ''}
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </span>
            </button>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <p className="font-mono text-[11px] font-medium uppercase tracking-[2px] text-muted-foreground/60 sm:text-xs">
                  Resolved Wallets
                </p>
                <p className="font-mono text-xs tabular-nums text-muted-foreground/60 sm:text-[13px]">
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
                className="mt-3 w-full cursor-pointer py-3 text-center font-mono text-xs font-medium text-muted-foreground/60 transition-colors hover:text-foreground"
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
