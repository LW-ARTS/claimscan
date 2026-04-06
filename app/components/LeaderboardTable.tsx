'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { formatUsd } from '@/lib/utils';

interface LeaderboardEntry {
  handle: string;
  handle_type: 'twitter' | 'github';
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
    } catch {
      // Silently fail — user can retry
    } finally {
      setLoading(false);
    }
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const pageOffset = (currentPage - 1) * PER_PAGE;

  const resolveProfileUrl = (entry: LeaderboardEntry) => `/${entry.handle}`;
  const formatHandle = (entry: LeaderboardEntry) =>
    entry.handle_type === 'github' ? `${entry.handle} (GitHub)` : `@${entry.handle}`;

  // Build page numbers to display (max 7 visible)
  const getVisiblePages = (): number[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (currentPage <= 4) return [1, 2, 3, 4, 5, -1, totalPages];
    if (currentPage >= totalPages - 3) return [1, -1, totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    return [1, -1, currentPage - 1, currentPage, currentPage + 1, -2, totalPages];
  };

  const getRowClass = (idx: number): string => {
    const rank = pageOffset + idx + 1;
    const base = 'border-b border-[var(--border-subtle)] transition-colors hover:bg-[var(--bg-surface-hover)]';
    if (rank === 1) return `${base} bg-[#FFFFFF0A] shadow-[0_0_20px_#FFFFFF10] border-l-2 border-l-white relative`;
    if (rank === 2) return `${base} bg-[#FFFFFF06] border-l-[3px] border-l-[#FFFFFF30]`;
    if (rank === 3) return `${base} bg-[#FFFFFF04] border-l-[3px] border-l-[#FFFFFF20]`;
    // Alternating for rank 4+
    return idx % 2 === 0 ? `${base} bg-[#FFFFFF06]` : `${base} bg-transparent`;
  };

  const getRankDisplay = (idx: number): React.ReactNode => {
    const rank = pageOffset + idx + 1;
    if (rank === 1) return <span className="flex items-center gap-1">{'\u{1F3C6}'} {rank}</span>;
    return rank;
  };

  return (
    <div>
      {/* Table */}
      {entries.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-16 text-center">
          <p className="text-sm text-[var(--text-secondary)]">No creators found matching filters</p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {entries.map((entry, idx) => (
              <Link
                key={entry.handle}
                href={resolveProfileUrl(entry)}
                className="flex items-center gap-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-3 transition-colors hover:bg-[var(--bg-surface-hover)]"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[var(--text-inverse)] text-xs font-bold">
                  {pageOffset + idx + 1 === 1 ? `\u{1F3C6}` : pageOffset + idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                    {formatHandle(entry)}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {entry.platform_count} platform{entry.platform_count !== 1 ? 's' : ''} &middot; {entry.token_count} tokens
                  </p>
                </div>
                <span className="text-sm font-bold tabular-nums text-[var(--text-primary)]">
                  {formatUsd(entry.total_earned_usd)}
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
                  <th scope="col" className="py-3 text-center text-[11px] font-medium uppercase tracking-[1px] text-[var(--text-tertiary)]">Top Platform</th>
                  <th scope="col" className="py-3 text-center text-[11px] font-medium uppercase tracking-[1px] text-[var(--text-tertiary)]">Chains</th>
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
                    <td className="py-3.5 pl-4 text-sm font-bold tabular-nums text-[var(--text-tertiary)]">
                      {getRankDisplay(idx)}
                    </td>
                    <td className="py-3.5">
                      <Link href={resolveProfileUrl(entry)} className="flex items-center gap-2 transition-colors hover:text-[var(--text-primary)]">
                        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--bg-surface)] text-[11px] font-bold uppercase text-[var(--text-secondary)]">
                          {entry.handle[0].toUpperCase()}
                        </span>
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
                    <td className="py-3.5 text-center">
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block h-2 w-2 rounded-full bg-white" />
                        <span className="inline-block h-2 w-2 rounded-full bg-[var(--text-tertiary)]" />
                      </span>
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
                          ? 'rounded-[6px] bg-white text-[var(--text-inverse)] px-3 py-1.5 text-[13px] font-medium'
                          : 'rounded-[6px] bg-[var(--bg-surface)] text-[var(--text-secondary)] px-3 py-1.5 text-[13px] transition-colors hover:bg-[var(--bg-surface-hover)]'
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
