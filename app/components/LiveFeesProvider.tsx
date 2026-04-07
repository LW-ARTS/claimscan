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
  // Task 2 fills this in. Placeholder below just clears loading.
  useEffect(() => {
    void walletsKey;
    void setLiveRecords;
    void setPollError;
    setLoading(false);
    return () => {};
  }, [walletsKey]);

  const value = useMemo<LiveFeesContextValue>(
    () => ({ liveRecords, loading, pollError }),
    [liveRecords, loading, pollError],
  );

  return <LiveFeesContext.Provider value={value}>{children}</LiveFeesContext.Provider>;
}
