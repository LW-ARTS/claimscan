'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { signedFetch } from '@/lib/signed-fetch';
import { PLATFORM_CONFIG, LIVE_POLL_INTERVAL_MS } from '@/lib/constants';

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

/** Composite key that uniquely identifies a fee row: platform + chain + tokenAddress. */
export type LiveFeeKey = string;

export const liveFeeKey = (
  platform: string,
  chain: string,
  tokenAddress: string,
): LiveFeeKey => `${platform}:${chain}:${tokenAddress}`;

/**
 * A single live fee record. Mirrors TokenFee from lib/platforms/types.ts but
 * with only the fields we actually use downstream in ProfileHero and
 * PlatformBreakdown. Keeps tokenAddress so live data can be matched to cached
 * FeeRecord rows 1:1 instead of the lossy platform-level aggregate the old
 * ProfileHero.LiveFee type used.
 */
export interface LiveFeeRecord {
  tokenAddress: string;
  tokenSymbol: string | null;
  platform: string;
  chain: string;
  totalEarned: string;
  totalClaimed: string;
  totalUnclaimed: string;
  totalEarnedUsd: number | null;
  feeType?: string;
  feeLocked?: boolean;
  claimRightLost?: boolean;
  vaultType?: 'base-v1' | 'base-v2' | 'unknown';
}

interface WalletForLive {
  address: string;
  chain: string;
  sourcePlatform: string;
}

interface LiveFeesContextValue {
  liveRecords: Map<LiveFeeKey, LiveFeeRecord>;
  loading: boolean;
  pollError: boolean;
}

const LiveFeesContext = createContext<LiveFeesContextValue>({
  liveRecords: new Map(),
  loading: false,
  pollError: false,
});

export function useLiveFees(): LiveFeesContextValue {
  return useContext(LiveFeesContext);
}

// ═══════════════════════════════════════════════
// Provider
// ═══════════════════════════════════════════════

interface LiveFeesProviderProps {
  walletsForLive: WalletForLive[];
  children: ReactNode;
}

export function LiveFeesProvider({ walletsForLive, children }: LiveFeesProviderProps) {
  const [liveRecords, setLiveRecords] = useState<Map<LiveFeeKey, LiveFeeRecord>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [pollError, setPollError] = useState(false);

  const walletsKey = useMemo(() => JSON.stringify(walletsForLive), [walletsForLive]);

  // Polling effect — owns all SSE streaming, webhook, and fallback for
  // the entire profile page. Both ProfileHero and PlatformBreakdown read
  // from the same Map so their views stay in sync.
  useEffect(() => {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let webhookSSE: EventSource | null = null;

    // Accumulated fees from streaming partial results. Each adapter's
    // results REPLACE previous results for that platform so stale tokens
    // don't linger after a token is fully claimed.
    const streamedByPlatform = new Map<string, LiveFeeRecord[]>();

    function flushStreamedFees() {
      const next = new Map<LiveFeeKey, LiveFeeRecord>();
      for (const [, records] of streamedByPlatform) {
        for (const r of records) {
          next.set(liveFeeKey(r.platform, r.chain, r.tokenAddress), r);
        }
      }
      setLiveRecords(next);
    }

    /**
     * Primary: Stream live fees via SSE — each adapter pushes results
     * as it completes, so fast adapters appear instantly.
     */
    async function streamLiveFees(): Promise<void> {
      try {
        const res = await signedFetch('/api/fees/live-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallets: JSON.parse(walletsKey) }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          console.warn(`[LiveFeesProvider] live-stream returned HTTP ${res.status}`);
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
                if (
                  currentEvent === 'partial-result' &&
                  Array.isArray(data.fees) &&
                  data.platform in PLATFORM_CONFIG
                ) {
                  // Store the FULL per-token records (tokenAddress preserved).
                  // Backend contract: each item in data.fees has the TokenFee shape.
                  const normalized: LiveFeeRecord[] = (data.fees as Array<Record<string, unknown>>).map((f) => ({
                    tokenAddress: String(f.tokenAddress ?? ''),
                    tokenSymbol: f.tokenSymbol == null ? null : String(f.tokenSymbol),
                    platform: String(data.platform),
                    chain: String(data.chain ?? f.chain ?? ''),
                    totalEarned: String(f.totalEarned ?? '0'),
                    totalClaimed: String(f.totalClaimed ?? '0'),
                    totalUnclaimed: String(f.totalUnclaimed ?? '0'),
                    totalEarnedUsd: typeof f.totalEarnedUsd === 'number' ? f.totalEarnedUsd : null,
                    feeType: f.feeType == null ? undefined : String(f.feeType),
                    feeLocked: typeof f.feeLocked === 'boolean' ? f.feeLocked : undefined,
                    claimRightLost: typeof f.claimRightLost === 'boolean' ? f.claimRightLost : undefined,
                    vaultType: f.vaultType === 'base-v1' || f.vaultType === 'base-v2' || f.vaultType === 'unknown' ? f.vaultType : undefined,
                  }));
                  streamedByPlatform.set(String(data.platform), normalized);
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
        console.warn('[LiveFeesProvider] live-stream failed, falling back to JSON:', err instanceof Error ? err.message : err);
        return pollLiveFees();
      } finally {
        setLoading(false);
      }
    }

    /**
     * Fallback: traditional JSON fetch (subject to 10s Vercel limit).
     * /api/fees/live returns legacy platform-level aggregates so we
     * can't populate the per-token Map on this path — we just mark the
     * error state and let the UI fall back to cached data.
     */
    async function pollLiveFees(): Promise<void> {
      try {
        const res = await signedFetch('/api/fees/live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallets: JSON.parse(walletsKey) }),
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!res.ok) {
          console.warn(`[LiveFeesProvider] live fees returned HTTP ${res.status}`);
          return;
        }
        const data = await res.json();
        if (Array.isArray(data?.fees)) setPollError(false);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.warn('[LiveFeesProvider] live fee poll failed:', err instanceof Error ? err.message : err);
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

    // Listen for claim-complete events from PlatformBreakdown so a claim
    // triggers immediate re-stream instead of waiting for the 30s fallback.
    function handleClaimComplete() {
      if (!controller.signal.aborted) {
        streamLiveFees();
      }
    }
    window.addEventListener('claimscan:claim-complete', handleClaimComplete);

    function handleVisibility() {
      if (document.hidden) {
        if (timeoutId) clearTimeout(timeoutId);
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
      if (timeoutId) clearTimeout(timeoutId);
      controller.abort();
      webhookSSE?.close();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('claimscan:claim-complete', handleClaimComplete);
    };
  }, [walletsKey]);

  const value = useMemo<LiveFeesContextValue>(
    () => ({ liveRecords, loading, pollError }),
    [liveRecords, loading, pollError],
  );

  return <LiveFeesContext.Provider value={value}>{children}</LiveFeesContext.Provider>;
}
