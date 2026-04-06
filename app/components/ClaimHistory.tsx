'use client';

import { useState } from 'react';
import { track } from '@vercel/analytics';
import { PlatformIcon } from './PlatformIcon';
import { PLATFORM_CONFIG, CHAIN_CONFIG } from '@/lib/constants';
import { formatTokenAmount } from '@/lib/utils';
import type { Database, Chain } from '@/lib/supabase/types';

type ClaimEvent = Database['public']['Tables']['claim_events']['Row'];

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function timeAgo(dateStr: string): string {
  if (!dateStr || isNaN(new Date(dateStr).getTime())) return 'unknown';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/** Chain-aware block explorer URL for transaction hashes. Returns null for invalid hashes. */
const SOL_TX_RE = /^[1-9A-HJ-NP-Za-km-z]{86,88}$/;
const EVM_TX_RE = /^0x[a-fA-F0-9]{64}$/;
function getExplorerTxUrl(txHash: string, chain: Chain): string | null {
  switch (chain) {
    case 'base': return EVM_TX_RE.test(txHash) ? `https://basescan.org/tx/${txHash}` : null;
    case 'eth': return EVM_TX_RE.test(txHash) ? `https://etherscan.io/tx/${txHash}` : null;
    case 'bsc': return EVM_TX_RE.test(txHash) ? `https://bscscan.com/tx/${txHash}` : null;
    default: return SOL_TX_RE.test(txHash) ? `https://solscan.io/tx/${txHash}` : null;
  }
}

/** Human-readable explorer name for aria-labels. */
function getExplorerName(chain: Chain): string {
  switch (chain) {
    case 'base': return 'Basescan';
    case 'eth': return 'Etherscan';
    case 'bsc': return 'BscScan';
    default: return 'Solscan';
  }
}

interface ClaimHistoryProps {
  events: ClaimEvent[];
}

export function ClaimHistory({ events }: ClaimHistoryProps) {
  const [expanded, setExpanded] = useState(false);

  if (events.length === 0) return null;

  const displayed = expanded ? events : events.slice(0, 3);

  return (
    <div className="space-y-3">
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="pressable flex w-full cursor-pointer items-center justify-between py-3 text-left group sm:py-1"
      >
        <h3 className="text-sm font-semibold tracking-tight">
          Claim History
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            ({events.length})
          </span>
        </h3>
        <svg
          className={`h-4 w-4 text-muted-foreground/50 transition-transform duration-200 group-hover:text-muted-foreground ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      <div className="space-y-1.5">
        {displayed.map((event) => {
          const config = PLATFORM_CONFIG[event.platform as keyof typeof PLATFORM_CONFIG];
          const nativeSymbol = event.chain === 'sol' ? 'SOL' : event.chain === 'bsc' ? 'BNB' : 'ETH';

          return (
            <div
              key={event.id}
              className="card-hover flex items-center gap-3 rounded-lg border border-border/30 bg-card px-3 py-2.5 text-sm"
            >
              <PlatformIcon platform={event.platform} className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">{config?.name ?? event.platform}</span>
                  <span className="text-muted-foreground/40">&middot;</span>
                  <span className="font-mono text-xs text-muted-foreground/60">
                    {truncateAddress(event.token_address)}
                  </span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <span className="font-semibold tabular-nums">
                  {formatTokenAmount(event.amount, CHAIN_CONFIG[event.chain]?.nativeDecimals ?? 9)} {nativeSymbol}
                </span>
                {event.amount_usd != null && event.amount_usd > 0 && (
                  <span className="ml-1 text-xs text-muted-foreground/50">
                    (${event.amount_usd.toFixed(2)})
                  </span>
                )}
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <span className="text-xs text-muted-foreground/40 tabular-nums">
                  {timeAgo(event.claimed_at)}
                </span>
                {event.tx_hash && getExplorerTxUrl(event.tx_hash, event.chain) && (
                  <a
                    href={getExplorerTxUrl(event.tx_hash, event.chain)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => track('external_link_clicked', { explorer: getExplorerName(event.chain), chain: event.chain })}
                    className="pressable inline-flex items-center justify-center min-h-[44px] min-w-[44px] text-muted-foreground/60 hover:text-foreground"
                    aria-label={`View on ${getExplorerName(event.chain)}`}
                    title={`View on ${getExplorerName(event.chain)}`}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {events.length > 3 && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="pressable w-full cursor-pointer rounded-lg py-3 text-center text-xs font-medium text-muted-foreground/50 hover:bg-muted/40 hover:text-muted-foreground sm:py-1.5"
        >
          Show {events.length - 3} more
        </button>
      )}
    </div>
  );
}
