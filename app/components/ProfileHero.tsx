'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { track } from '@vercel/analytics';
import { PlatformIcon } from './PlatformIcon';
import { PLATFORM_CONFIG, CHAIN_CONFIG } from '@/lib/constants';
import { safeBigInt, formatUsd, toUsdValue, copyToClipboard, computeFeeUsd } from '@/lib/utils';
import { CountUpLazy } from './anim/CountUpLazy';
import { useLiveFees, liveFeeKey, type LiveFeeKey } from './LiveFeesProvider';
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
  token_address: string;
  claim_status: 'claimed' | 'unclaimed' | 'partially_claimed' | 'auto_distributed';
}

interface WalletInput {
  address: string;
  chain: string;
  sourcePlatform: string;
}

interface ProfileHeroProps {
  creator: Creator;
  wallets: Wallet[];
  initialFees: FeeInput[];
  walletsForLive: WalletInput[];
  solPrice: number;
  ethPrice: number;
  bnbPrice?: number;
  handle: string;
  totalEarnedUsd: number;
  platformCount: number;
  resolveMs: number;
}

const chainMeta: Record<string, { label: string; color: string; bg: string }> = {
  sol: { label: 'Solana', color: 'text-muted-foreground', bg: 'bg-muted border-border' },
  base: { label: 'Base', color: 'text-muted-foreground', bg: 'bg-muted border-border' },
  eth: { label: 'Ethereum', color: 'text-muted-foreground', bg: 'bg-muted border-border' },
  bsc: { label: 'BNB', color: 'text-muted-foreground', bg: 'bg-muted border-border' },
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

function WalletPill({ address, chain }: { address: string; chain: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(address);
    if (ok) {
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    }
  }, [address]);

  return (
    <button
      onClick={handleCopy}
      title={copied ? 'Copied!' : `Copy ${address}`}
      className="pressable hover-glow cursor-pointer rounded-[20px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-1.5 flex items-center gap-2 shrink-0 text-[11px] hover:bg-[var(--bg-surface-hover)]"
    >
      <span className={`h-2 w-2 rounded-full ${copied ? 'bg-[var(--success)]' : 'bg-[var(--text-secondary)]'}`} aria-hidden="true" />
      <span className="font-mono text-[var(--text-secondary)]">
        {copied ? 'Copied!' : `${address.slice(0, 6)}...${address.slice(-4)}`}
      </span>
      {copied ? (
        <svg className="h-3 w-3 text-[var(--success)]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
      ) : (
        <svg className="h-3 w-3 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" /></svg>
      )}
    </button>
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

  return (
    <div className="row-hover group flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 hover:bg-muted/50">
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
        className={`pressable inline-flex shrink-0 items-center justify-center rounded-md p-3 -m-2 ${
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
  bnbPrice = 0,
  handle,
  totalEarnedUsd,
  platformCount,
  resolveMs,
}: ProfileHeroProps) {
  const [showAllWallets, setShowAllWallets] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  // Live SSE state is now owned by LiveFeesProvider; this component just
  // consumes the merged Map and the loading flag for the pulsing dot.
  const { liveRecords, loading } = useLiveFees();

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

  // ── Helpers ──
  const feeToUsd = useCallback((chain: string, amount: bigint) => {
    const prices: Record<string, number> = { sol: solPrice, eth: ethPrice, base: ethPrice, bsc: bnbPrice };
    const config = CHAIN_CONFIG[chain as keyof typeof CHAIN_CONFIG];
    return toUsdValue(amount, config?.nativeDecimals ?? 18, prices[chain] ?? ethPrice);
  }, [solPrice, ethPrice, bnbPrice]);

  // ── Computed values ──
  // Per-token merge: live data takes precedence over cached total_unclaimed
  // for any row with a matching composite key, and live-only rows add to the
  // total as virtual entries. This keeps the Total Unclaimed stat aligned
  // with the PlatformBreakdown filter + list which apply the same merge.
  const displayUnclaimedUsd = useMemo(() => {
    let total = 0;
    const seenKeys = new Set<LiveFeeKey>();

    // 1. Walk cached records, overlay live data when present
    for (const f of initialFees) {
      const key = liveFeeKey(f.platform, f.chain, f.token_address);
      const live = liveRecords.get(key);
      if (live) seenKeys.add(key);

      if (live) {
        const unclaimed = safeBigInt(live.totalUnclaimed);
        if (unclaimed === 0n) continue;
        total += feeToUsd(f.chain, unclaimed);
      } else {
        // Cache-only: respect claim_status so DB data rot never inflates the stat
        if (f.claim_status !== 'unclaimed' && f.claim_status !== 'partially_claimed') continue;
        const unclaimed = safeBigInt(f.total_unclaimed);
        if (unclaimed === 0n) continue;
        total += feeToUsd(f.chain, unclaimed);
      }
    }

    // 2. Virtual rows: live records with no cached counterpart
    for (const [key, live] of liveRecords) {
      if (seenKeys.has(key)) continue;
      const amount = safeBigInt(live.totalUnclaimed);
      if (amount === 0n) continue;
      total += feeToUsd(live.chain, amount);
    }

    return total;
  }, [initialFees, liveRecords, feeToUsd]);

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
  }, [initialFees, feeToUsd]);

  // ── Display values ──
  const displayName = creator.display_name || creator.twitter_handle || creator.github_handle || 'Unknown';
  const chains = [...new Set(wallets.map((w) => w.chain))];
  // Use unavatar.io directly (same source as OG card) — bypasses /api/avatar proxy
  // Daily cache buster ensures browser doesn't serve stale avatars after profile pic changes
  const avatarHandle = handle || creator.twitter_handle;
  const isValidHandle = avatarHandle && /^[a-zA-Z0-9_]{1,50}$/.test(avatarHandle);
  const cacheBuster = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const avatarUrl = isValidHandle ? `https://unavatar.io/x/${avatarHandle}?_cb=${cacheBuster}` : null;

  // ── Computed values for new layout ──
  const solWallets = wallets.filter(w => w.chain === 'sol').length;
  const evmWallets = wallets.length - solWallets;
  const largestFeeUsd = Math.max(0, ...initialFees.map(f => computeFeeUsd(f, solPrice, ethPrice, bnbPrice)));

  const profileUrl = `https://claimscan.tech/${encodeURIComponent(handle)}`;
  const ogUrl = `/${encodeURIComponent(handle)}/opengraph-image`;

  const tweetText = [
    `I earned ${formatUsd(totalEarnedUsd)} in creator fees across ${platformCount} platform${platformCount !== 1 ? 's' : ''}`,
    '',
    `How much are you leaving on the table?`,
    '',
    'via claimscan.tech | @lwartss',
  ].join('\n');

  const tweetIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(profileUrl)}`;

  const [linkCopied, setLinkCopied] = useState(false);
  const linkTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleCopyLink = useCallback(async () => {
    if (linkTimerRef.current) clearTimeout(linkTimerRef.current);
    track('share_copy_link', { handle });
    const ok = await copyToClipboard(profileUrl);
    if (ok) {
      setLinkCopied(true);
      linkTimerRef.current = setTimeout(() => setLinkCopied(false), 2000);
    }
  }, [profileUrl, handle]);

  const handleSaveImage = useCallback(async () => {
    if (saving) return;
    track('share_save_image', { handle });
    setSaving(true);
    try {
      // Use dedicated download API route with Content-Disposition: attachment
      // (blob: URLs are blocked by CSP default-src 'self')
      const a = document.createElement('a');
      a.href = `/api/og-download/${encodeURIComponent(handle)}`;
      a.click();
      setSaved(true);
      if (linkTimerRef.current) clearTimeout(linkTimerRef.current);
      linkTimerRef.current = setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.warn('[ProfileHero] Image save failed:', err instanceof Error ? err.message : err);
    } finally {
      setSaving(false);
    }
  }, [handle, saving, ogUrl]);

  const displayWallets = wallets.slice(0, 6);
  const remainingWallets = wallets.length - displayWallets.length;

  return (
    <div>
      {/* Section 1 — Profile Info Bar */}
      <div className="border-b border-[var(--border-subtle)] px-5 py-6 sm:px-12 sm:py-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          {/* Left: avatar + name + pills */}
          <div className="flex items-center gap-4">
            <div className="animate-scale-in relative shrink-0">
              {avatarUrl && !avatarError ? (
                <Image
                  src={avatarUrl}
                  alt={displayName}
                  width={64}
                  height={64}
                  priority
                  className="hover-ring h-12 w-12 rounded-full object-cover sm:h-16 sm:w-16"
                  onError={() => setAvatarError(true)}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="hover-ring flex h-12 w-12 items-center justify-center rounded-full bg-[var(--text-primary)] text-lg font-black text-[var(--text-inverse)] sm:h-16 sm:w-16 sm:text-xl">
                  {displayName[0]?.toUpperCase()}
                </div>
              )}
            </div>

            <div className="animate-fade-in-up delay-100 min-w-0">
              <h1 className="truncate text-[24px] font-bold tracking-tight text-[var(--text-primary)]">
                {displayName}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="hover-glow inline-flex items-center gap-1.5 rounded-[20px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-1 text-[11px] text-[var(--text-secondary)]">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3" />
                  </svg>
                  {wallets.length} wallet{wallets.length !== 1 ? 's' : ''}
                </span>
                {(solWallets > 0 || evmWallets > 0) && (
                  <span className="hover-glow inline-flex items-center gap-1.5 rounded-[20px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-1 text-[11px] text-[var(--text-secondary)]">
                    {evmWallets > 0 && <>{evmWallets} EVM</>}
                    {evmWallets > 0 && solWallets > 0 && <> &middot; </>}
                    {solWallets > 0 && <>{solWallets} SOL</>}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: 3 action buttons */}
          <div className="animate-fade-in-up delay-200 flex w-full items-center gap-2 sm:w-auto sm:shrink-0">
            <button
              onClick={handleSaveImage}
              disabled={saving}
              className="pressable hover-glow-primary flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-[8px] bg-white px-3 py-[10px] text-[12px] font-semibold text-[var(--text-inverse)] hover:opacity-90 disabled:opacity-60 sm:flex-initial sm:px-[18px] sm:text-[13px]"
            >
              {saved ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              )}
              {saved ? 'Saved!' : saving ? 'Saving...' : (<><span className="sm:hidden">Save</span><span className="hidden sm:inline">Save OG Card</span></>)}
            </button>
            <button
              onClick={handleCopyLink}
              className="pressable hover-glow flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-[8px] border border-[var(--border-accent)] px-3 py-[10px] text-[12px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] sm:flex-initial sm:px-[18px] sm:text-[13px]"
            >
              {linkCopied ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg>
              )}
              {linkCopied ? 'Copied!' : (<><span className="sm:hidden">Copy</span><span className="hidden sm:inline">Copy Link</span></>)}
            </button>
            <a
              href={tweetIntentUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('share_x_clicked', { handle })}
              className="pressable hover-glow flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-[8px] border border-[var(--border-accent)] px-3 py-[10px] text-[12px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] sm:flex-initial sm:px-[18px] sm:text-[13px]"
            >
              <XIcon className="h-4 w-4" />
              <span className="sm:hidden">Share</span><span className="hidden sm:inline">Share on X</span>
            </a>
          </div>
        </div>
      </div>

      {/* Section 2 — Wallet Pills Bar (click to copy) */}
      {wallets.length > 0 && (
        <div className="px-5 py-3 sm:px-12 sm:py-4 border-b border-[var(--border-subtle)] flex items-center gap-2 overflow-x-auto scrollbar-hide">
          {displayWallets.map((w) => (
            <WalletPill key={w.id} address={w.address} chain={w.chain} />
          ))}
          {remainingWallets > 0 && (
            <button
              onClick={() => setShowAllWallets(true)}
              className="pressable hover-glow cursor-pointer rounded-[20px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-1.5 shrink-0 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
            >
              +{remainingWallets} more
            </button>
          )}
        </div>
      )}

      {/* Section 3 — Aggregate Stats */}
      <div className="px-5 py-6 sm:px-12 sm:py-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="card-hover rounded-[14px] bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 sm:p-6">
            <p className="text-[11px] sm:text-[13px] text-[var(--text-secondary)] uppercase tracking-wide">Total Unclaimed</p>
            <p className="mt-1.5 text-xl sm:text-[32px] font-bold tracking-tight text-[var(--text-primary)]">
              <span aria-hidden="true">
                <CountUpLazy value={displayUnclaimedUsd} variant="usd" />
              </span>
              {loading && <PulsingDot className="ml-1.5 inline-flex h-1.5 w-1.5 text-[var(--text-primary)]" />}
              <span className="sr-only" aria-live="polite" aria-atomic="true">
                Total unclaimed: {formatUsd(displayUnclaimedUsd)}
              </span>
            </p>
          </div>
          <div className="card-hover rounded-[14px] bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 sm:p-6">
            <p className="text-[11px] sm:text-[13px] text-[var(--text-secondary)] uppercase tracking-wide">Total Claimed</p>
            <p className="mt-1.5 text-xl sm:text-[32px] font-bold tracking-tight text-[var(--text-primary)]">
              <CountUpLazy value={displayClaimedUsd} variant="usd" />
            </p>
          </div>
          <div className="card-hover rounded-[14px] bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 sm:p-6">
            <p className="text-[11px] sm:text-[13px] text-[var(--text-secondary)] uppercase tracking-wide">Largest Single Fee</p>
            <p className="mt-1.5 text-xl sm:text-[32px] font-bold tracking-tight text-[var(--text-primary)]">
              <CountUpLazy value={largestFeeUsd} variant="usd" />
            </p>
          </div>
          <div className="card-hover rounded-[14px] bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 sm:p-6">
            <p className="text-[11px] sm:text-[13px] text-[var(--text-secondary)] uppercase tracking-wide">Platforms with Fees</p>
            <p className="mt-1.5 text-xl sm:text-[32px] font-bold tracking-tight text-[var(--text-primary)]">
              {platformCount} of {Object.keys(PLATFORM_CONFIG).length}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
