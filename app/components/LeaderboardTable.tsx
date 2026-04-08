'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { formatUsd } from '@/lib/utils';

function CreatorAvatar({ handle, handleType }: { handle: string; handleType: string }) {
  const [error, setError] = useState(false);

  // unavatar.io supports both /x/{username} and /tiktok/{username}.
  // GitHub creators fall through to the initials fallback because GitHub
  // avatars are usually generic and rarely meaningful in this context.
  const provider = handleType === 'twitter' ? 'x' : handleType === 'tiktok' ? 'tiktok' : null;

  if (!provider || error) {
    return (
      <span className="avatar-ring inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--bg-surface)] text-[11px] font-bold uppercase text-[var(--text-secondary)]">
        {handle[0].toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={`https://unavatar.io/${provider}/${handle}`}
      alt=""
      className="avatar-ring h-7 w-7 shrink-0 rounded-full object-cover"
      onError={() => setError(true)}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
}

interface LeaderboardEntry {
  handle: string;
  handle_type: 'twitter' | 'github' | 'tiktok';
  display_name: string | null;
  total_earned_usd: number;
  platform_count: number;
  token_count: number;
}

interface LeaderboardTableProps {
  initialEntries: LeaderboardEntry[];
  initialTotal: number;
}

const PER_PAGE = 15;

export function LeaderboardTable({ initialEntries, initialTotal }: LeaderboardTableProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  // Keep filter state for future use but hide selects
  const [platform] = useState('all');
  const [chain] = useState('all');
  const topRef = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(async (page: number, plat: string, ch: string) => {
    setLoading(true);
    try {
      const offset = (page - 1) * PER_PAGE;
      const params = new URLSearchParams({
        limit: String(PER_PAGE),
        offset: String(offset),
        ...(plat !== 'all' && { platform: plat }),
        ...(ch !== 'all' && { chain: ch }),
      });
      const res = await fetch(`/api/leaderboard?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setEntries(data.entries);
      setTotal(data.total);
      setCurrentPage(page);
      // Scroll back to the first row so the user sees rank #1 of the new page
      // instead of landing somewhere in the middle of a scrolled list.
      requestAnimationFrame(() => {
        topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch {
      // Silently fail — user can retry
    } finally {
      setLoading(false);
    }
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const pageOffset = (currentPage - 1) * PER_PAGE;

  // The SQL function returns prefixed handles for non-twitter creators
  // (`gh:gakonst`, `tt:khaby.lame`); strip the prefix for display while
  // keeping it in the URL so parseSearchQuery routes to the right provider.
  const stripPrefix = (h: string) =>
    h.startsWith('gh:') || h.startsWith('tt:') ? h.slice(3) : h;
  const resolveProfileUrl = (entry: LeaderboardEntry) => `/${encodeURIComponent(entry.handle)}`;
  const formatHandle = (entry: LeaderboardEntry) => {
    const bare = stripPrefix(entry.handle);
    if (entry.handle_type === 'github') return `${bare} (GitHub)`;
    if (entry.handle_type === 'tiktok') return `@${bare} (TikTok)`;
    return `@${bare}`;
  };
  const avatarHandle = (entry: LeaderboardEntry) => stripPrefix(entry.handle);

  // Build page numbers to display (max 7 visible)
  const getVisiblePages = (): number[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (currentPage <= 4) return [1, 2, 3, 4, 5, -1, totalPages];
    if (currentPage >= totalPages - 3) return [1, -1, totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    return [1, -1, currentPage - 1, currentPage, currentPage + 1, -2, totalPages];
  };

  const getRowClass = (idx: number): string => {
    const rank = pageOffset + idx + 1;
    const base = 'row-hover border-b border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)]';
    if (rank === 1) return `${base} pulse-glow bg-[#FFFFFF0A] border-l-2 border-l-white relative`;
    if (rank === 2) return `${base} bg-[#FFFFFF06] border-l-[3px] border-l-[#FFFFFF30]`;
    if (rank === 3) return `${base} bg-[#FFFFFF04] border-l-[3px] border-l-[#FFFFFF20]`;
    // Alternating for rank 4+
    return idx % 2 === 0 ? `${base} bg-[#FFFFFF06]` : `${base} bg-transparent`;
  };

  const getRankDisplay = (idx: number): React.ReactNode => {
    const rank = pageOffset + idx + 1;
    if (rank === 1) return (
      <span className="flex items-center gap-2.5 text-[18px] font-extrabold text-white">
        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
        </svg>
        {rank}
      </span>
    );
    return rank;
  };

  return (
    <div>
      {/* Scroll anchor — pagination jumps here so rank #1 of the new page
          is visible instead of wherever the user was in the previous page. */}
      <div ref={topRef} aria-hidden="true" className="scroll-mt-24" />
      {/* Table */}
      {entries.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-16 text-center">
          <p className="text-sm text-[var(--text-secondary)]">No creators found matching filters</p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="stagger-in space-y-2 md:hidden">
            {entries.map((entry, idx) => (
              <Link
                key={entry.handle}
                href={resolveProfileUrl(entry)}
                style={idx < 6 ? { ['--stagger-index' as string]: idx } : undefined}
                className={`pressable row-hover flex items-center gap-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3 hover:bg-[var(--bg-surface-hover)] ${pageOffset + idx === 0 ? 'pulse-glow' : ''}`}
              >
                <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-[var(--text-tertiary)]">
                  {pageOffset + idx + 1}
                </span>
                <CreatorAvatar handle={avatarHandle(entry)} handleType={entry.handle_type} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                    {formatHandle(entry)}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {entry.platform_count} platform{entry.platform_count !== 1 ? 's' : ''} &middot; {entry.token_count} tokens
                  </p>
                </div>
                <span className="whitespace-nowrap text-sm font-bold text-[var(--text-primary)]">
                  {formatUsd(entry.total_earned_usd).replace(/\.\d+K$/, 'K')}
                </span>
              </Link>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <table className="w-full" aria-label="Creator leaderboard">
              <thead>
                <tr className="bg-transparent">
                  <th scope="col" className="w-12 py-3 pl-4 text-left text-[11px] font-medium uppercase tracking-[1px] text-[var(--text-tertiary)]">#</th>
                  <th scope="col" className="py-3 text-left text-[11px] font-medium uppercase tracking-[1px] text-[var(--text-tertiary)]">Trader</th>
                  <th scope="col" className="py-3 text-right text-[11px] font-medium uppercase tracking-[1px] text-[var(--text-tertiary)]">Total Fees</th>
                  <th scope="col" className="py-3 text-center text-[11px] font-medium uppercase tracking-[1px] text-[var(--text-tertiary)]">Platforms</th>
                  <th scope="col" className="py-3 text-center text-[11px] font-medium uppercase tracking-[1px] text-[var(--text-tertiary)]">Tokens</th>
                  <th scope="col" className="w-10 py-3 pr-4" aria-label="View profile" />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, idx) => (
                  <tr
                    key={entry.handle}
                    className={`${getRowClass(idx)} text-[var(--text-primary)]`}
                    style={idx < 10 ? { animation: `fadeInUp 0.4s ease-out ${idx * 40}ms both` } : undefined}
                  >
                    <td className={`py-3.5 pl-4 text-sm font-bold tabular-nums text-[var(--text-tertiary)] ${pageOffset + idx === 0 ? 'pr-4' : 'pr-1'}`}>
                      {getRankDisplay(idx)}
                    </td>
                    <td className="py-3.5">
                      <Link href={resolveProfileUrl(entry)} className="flex items-center gap-2.5 hover:text-[var(--text-primary)]">
                        <CreatorAvatar handle={avatarHandle(entry)} handleType={entry.handle_type} />
                        <span className="text-sm font-semibold text-[var(--text-primary)]">
                          {formatHandle(entry)}
                        </span>
                      </Link>
                    </td>
                    <td className="py-3.5 text-right text-sm font-bold tabular-nums text-[var(--text-primary)]">
                      {formatUsd(entry.total_earned_usd)}
                    </td>
                    <td className="py-3.5 text-center text-sm tabular-nums text-[var(--text-primary)]">
                      {entry.platform_count}
                    </td>
                    <td className="py-3.5 text-center text-sm tabular-nums text-[var(--text-secondary)]">
                      {entry.token_count}
                    </td>
                    <td className="py-3.5 pr-4 text-right text-sm text-[var(--text-tertiary)]">
                      <Link href={resolveProfileUrl(entry)} aria-label={`View ${entry.handle} profile`}>
                        &rarr;
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex flex-col items-center gap-3">
              <div className="flex items-center gap-2">
                {getVisiblePages().map((p, i) =>
                  p < 0 ? (
                    <span key={`ellipsis-${i}`} className="px-1 text-[var(--text-tertiary)]">&hellip;</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => fetchPage(p, platform, chain)}
                      disabled={loading}
                      className={
                        p === currentPage
                          ? 'pressable hover-glow-primary rounded-[6px] bg-white text-[var(--text-inverse)] px-3 py-1.5 text-[13px] font-medium'
                          : 'pressable hover-glow rounded-[6px] bg-[var(--bg-surface)] text-[var(--text-secondary)] px-3 py-1.5 text-[13px] hover:bg-[var(--bg-surface-hover)]'
                      }
                    >
                      {p}
                    </button>
                  )
                )}
              </div>
              <p className="text-[13px] text-[var(--text-tertiary)]">
                Showing {pageOffset + 1}&ndash;{Math.min(pageOffset + entries.length, total)} of {total}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
