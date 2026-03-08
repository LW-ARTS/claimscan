'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Image from 'next/image';
import { PlatformIcon } from './PlatformIcon';
import { PLATFORM_CONFIG } from '@/lib/constants';
import type { Database } from '@/lib/supabase/types';

type Creator = Database['public']['Tables']['creators']['Row'];
type Wallet = Database['public']['Tables']['wallets']['Row'];

interface ProfileHeaderProps {
  creator: Creator;
  wallets: Wallet[];
}

const chainMeta: Record<string, { label: string; color: string; bg: string }> = {
  sol: { label: 'Solana', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
  base: { label: 'Base', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
  eth: { label: 'Ethereum', color: 'text-blue-300', bg: 'bg-blue-400/10 border-blue-400/20' },
};

/** Max wallets shown before expand toggle */
const WALLETS_COLLAPSED = 4;

/** Clipboard copy icon */
function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.334a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
    </svg>
  );
}

/** Check icon (shown after copy) */
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

/** Individual wallet row with copy functionality */
function WalletRow({ wallet }: { wallet: Wallet }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const meta = chainMeta[wallet.chain] ?? { label: wallet.chain, color: 'text-muted-foreground', bg: 'bg-muted border-border' };
  const platformConfig = PLATFORM_CONFIG[wallet.source_platform as keyof typeof PLATFORM_CONFIG];

  // Cleanup timer on unmount to avoid setting state on unmounted component
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
      // Fallback for insecure contexts
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
      {/* Chain pill */}
      <span className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.bg} ${meta.color}`}>
        {wallet.chain}
      </span>

      {/* Full address — scrollable on mobile */}
      <span className="min-w-0 flex-1 overflow-hidden">
        <span className="block truncate font-mono text-[11px] leading-relaxed text-foreground/80 sm:text-xs">
          {wallet.address}
        </span>
      </span>

      {/* Copy button */}
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
        {copied ? (
          <CheckIcon className="h-3.5 w-3.5" />
        ) : (
          <CopyIcon className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Via platform */}
      <span className="hidden shrink-0 items-center gap-1 text-[11px] text-muted-foreground/50 sm:flex">
        via
        <PlatformIcon platform={wallet.source_platform} className="h-3 w-3 opacity-60" aria-hidden />
        <span className="font-medium">{platformConfig?.name ?? wallet.source_platform}</span>
      </span>
    </div>
  );
}

export function ProfileHeader({ creator, wallets }: ProfileHeaderProps) {
  const [showAllWallets, setShowAllWallets] = useState(false);

  const displayName =
    creator.display_name ||
    creator.twitter_handle ||
    creator.github_handle ||
    'Unknown';

  const chains = [...new Set(wallets.map((w) => w.chain))];
  const visibleWallets = showAllWallets ? wallets : wallets.slice(0, WALLETS_COLLAPSED);
  const hiddenCount = wallets.length - WALLETS_COLLAPSED;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-6">
      <div className="flex items-start gap-3 sm:gap-5">
        {/* Avatar */}
        <div className="relative shrink-0">
          {creator.avatar_url?.startsWith('https://') &&
           /^https:\/\/(pbs\.twimg\.com|abs\.twimg\.com|avatars\.githubusercontent\.com|imagedelivery\.net|ipfs\.io)\//.test(creator.avatar_url) ? (
            <Image
              src={creator.avatar_url}
              alt={displayName}
              width={80}
              height={80}
              sizes="(max-width: 640px) 64px, 80px"
              className="relative h-16 w-16 rounded-full border-2 border-border object-cover sm:h-20 sm:w-20"
              priority
            />
          ) : (
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-border bg-muted text-2xl font-black text-foreground sm:h-20 sm:w-20 sm:text-3xl">
              {displayName[0]?.toUpperCase()}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
            {displayName}
          </h1>

          {/* Social handles + chain badges */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {creator.twitter_handle && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-sm font-medium text-foreground">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                @{creator.twitter_handle}
              </span>
            )}
            {creator.github_handle && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-sm font-medium text-muted-foreground">
                {creator.github_handle}
              </span>
            )}
            {chains.map((chain) => {
              const meta = chainMeta[chain] ?? { label: chain, color: 'text-muted-foreground', bg: 'bg-muted border-border' };
              return (
                <span
                  key={chain}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${meta.bg} ${meta.color}`}
                >
                  <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-current opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
                  </span>
                  {meta.label}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Resolved Wallets */}
      {wallets.length > 0 && (
        <div className="mt-4 border-t border-border/50 pt-4">
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
              Resolved Wallets
            </p>
            <p className="text-[11px] tabular-nums text-muted-foreground/40">
              {wallets.length} wallet{wallets.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="space-y-1.5">
            {visibleWallets.map((w) => (
              <WalletRow key={w.id} wallet={w} />
            ))}
          </div>

          {/* Show more/less toggle */}
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowAllWallets((v) => !v)}
              className="mt-2 w-full rounded-lg py-1.5 text-center text-[11px] font-medium text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-muted-foreground"
            >
              {showAllWallets ? 'Show less' : `Show ${hiddenCount} more wallet${hiddenCount > 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
