'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { formatUsd } from '@/lib/utils';
import { PLATFORM_CONFIG } from '@/lib/constants';

interface LeaderboardEntry {
  creator_id: string;
  twitter_handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  total_earned_usd: number;
  platform_count: number;
  token_count: number;
}

interface LeaderboardTableProps {
  initialEntries: LeaderboardEntry[];
  initialTotal: number;
}

const LOAD_MORE_COUNT = 50;

export function LeaderboardTable({ initialEntries, initialTotal }: LeaderboardTableProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [platform, setPlatform] = useState('all');
  const [chain, setChain] = useState('all');

  const fetchEntries = useCallback(async (offset: number, plat: string, ch: string, append = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(LOAD_MORE_COUNT),
        offset: String(offset),
        ...(plat !== 'all' && { platform: plat }),
        ...(ch !== 'all' && { chain: ch }),
      });
      const res = await fetch(`/api/leaderboard?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setEntries((prev) => append ? [...prev, ...data.entries] : data.entries);
      setTotal(data.total);
    } catch {
      // Silently fail — user can retry
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFilterChange = (newPlatform: string, newChain: string) => {
    setPlatform(newPlatform);
    setChain(newChain);
    fetchEntries(0, newPlatform, newChain);
  };

  const handleLoadMore = () => {
    fetchEntries(entries.length, platform, chain, true);
  };

  const resolveHandle = (entry: LeaderboardEntry) =>
    entry.twitter_handle || entry.display_name || entry.creator_id.slice(0, 8);

  const resolveProfileUrl = (entry: LeaderboardEntry) =>
    entry.twitter_handle ? `/${entry.twitter_handle}` : `/${entry.creator_id}`;

  return (
    <div>
      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-2">
        <select
          value={platform}
          onChange={(e) => handleFilterChange(e.target.value, chain)}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground"
          aria-label="Filter by platform"
        >
          <option value="all">All Platforms</option>
          {Object.entries(PLATFORM_CONFIG).map(([key, config]) => (
            <option key={key} value={key}>{config.name}</option>
          ))}
        </select>
        <select
          value={chain}
          onChange={(e) => handleFilterChange(platform, e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground"
          aria-label="Filter by chain"
        >
          <option value="all">All Chains</option>
          <option value="sol">Solana</option>
          <option value="base">Base</option>
          <option value="eth">Ethereum</option>
        </select>
        <span className="flex items-center text-xs text-muted-foreground">
          {total} creators
        </span>
      </div>

      {/* Table */}
      {entries.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 text-center">
          <p className="text-sm text-muted-foreground">No creators found matching filters</p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {entries.map((entry, idx) => (
              <Link
                key={entry.creator_id}
                href={resolveProfileUrl(entry)}
                className="flex items-center gap-3 rounded-xl border border-border/40 bg-card p-3 transition-colors hover:bg-muted/50"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {entry.twitter_handle ? `@${entry.twitter_handle}` : entry.display_name || 'Anonymous'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entry.platform_count} platform{entry.platform_count !== 1 ? 's' : ''} &middot; {entry.token_count} tokens
                  </p>
                </div>
                <span className="text-sm font-bold tabular-nums text-foreground">
                  {formatUsd(entry.total_earned_usd)}
                </span>
              </Link>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <table className="w-full" aria-label="Creator leaderboard">
              <thead>
                <tr className="bg-muted">
                  <th scope="col" className="w-12 py-3 pl-4 text-left text-[11px] font-medium uppercase tracking-[1px] text-muted-foreground">#</th>
                  <th scope="col" className="py-3 text-left text-[11px] font-medium uppercase tracking-[1px] text-muted-foreground">Creator</th>
                  <th scope="col" className="py-3 text-right text-[11px] font-medium uppercase tracking-[1px] text-muted-foreground">Total Earned</th>
                  <th scope="col" className="py-3 text-center text-[11px] font-medium uppercase tracking-[1px] text-muted-foreground">Platforms</th>
                  <th scope="col" className="py-3 pr-4 text-center text-[11px] font-medium uppercase tracking-[1px] text-muted-foreground">Tokens</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, idx) => (
                  <tr
                    key={entry.creator_id}
                    className="border-b border-border transition-colors hover:bg-muted/50"
                    style={idx < 10 ? { animation: `fadeInUp 0.4s ease-out ${idx * 40}ms both` } : undefined}
                  >
                    <td className="py-3.5 pl-4 text-sm font-bold tabular-nums text-muted-foreground">
                      {idx + 1}
                    </td>
                    <td className="py-3.5">
                      <Link href={resolveProfileUrl(entry)} className="flex items-center gap-2 transition-colors hover:text-foreground">
                        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold uppercase text-muted-foreground">
                          {(entry.twitter_handle?.[0] || entry.display_name?.[0] || '?').toUpperCase()}
                        </span>
                        <span className="text-sm font-semibold text-foreground">
                          {entry.twitter_handle ? `@${entry.twitter_handle}` : entry.display_name || 'Anonymous'}
                        </span>
                      </Link>
                    </td>
                    <td className="py-3.5 text-right text-sm font-bold tabular-nums text-foreground">
                      {formatUsd(entry.total_earned_usd)}
                    </td>
                    <td className="py-3.5 text-center text-sm tabular-nums text-foreground">
                      {entry.platform_count}
                    </td>
                    <td className="py-3.5 pr-4 text-center text-sm tabular-nums text-foreground">
                      {entry.token_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Load more */}
          {entries.length < total && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={handleLoadMore}
                disabled={loading}
                className="cursor-pointer rounded-lg border border-border/60 bg-card/80 px-5 py-2 text-sm font-medium text-foreground/80 transition-all hover:bg-foreground hover:text-background active:scale-95 disabled:opacity-50"
              >
                {loading ? 'Loading...' : `Show more (${total - entries.length} remaining)`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
