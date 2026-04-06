import type { Metadata } from 'next';
import { LeaderboardTable } from '@/app/components/LeaderboardTable';
import { SearchBar } from '@/app/components/SearchBar';
import { APP_URL } from '@/lib/constants';
import { fetchLeaderboard } from '@/lib/services/leaderboard';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Leaderboard — ClaimScan',
    description:
      'Top creator fee earners across Pump.fun, Bags.fm, Clanker, Zora, and 5 more launchpads on Solana and Base.',
    alternates: { canonical: `${APP_URL}/leaderboard` },
    openGraph: {
      title: 'Leaderboard — Top Creator Fee Earners | ClaimScan',
      description:
        'See who earns the most in creator fees across 9 DeFi launchpads on Solana, Base, and BNB Chain.',
      url: `${APP_URL}/leaderboard`,
      siteName: 'ClaimScan',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image' as const,
      site: '@lwartss',
      creator: '@lwartss',
      title: 'Leaderboard — Top Creator Fee Earners | ClaimScan',
      description:
        'See who earns the most in creator fees across 9 DeFi launchpads on Solana, Base, and BNB Chain.',
    },
  };
}

const TIME_FILTERS = ['All Time', '30D', '7D'] as const;

export default async function LeaderboardPage() {
  // Fetch initial data server-side for SEO — direct DB call, no HTTP self-fetch
  let initialData: { entries: Array<{
    handle: string;
    handle_type: 'twitter' | 'github';
    display_name: string | null;
    total_earned_usd: number;
    platform_count: number;
    token_count: number;
  }>; total: number } = { entries: [], total: 0 };

  try {
    initialData = await fetchLeaderboard({ limit: 15 });
  } catch {
    // DB fetch failed — client will retry
  }

  return (
    <div
      style={{
        background: `
          radial-gradient(ellipse 50% 35% at 20% 40%, #FFFFFF05 0%, transparent 100%),
          radial-gradient(ellipse 110% 50% at 50% 12%, #FFFFFF0A 0%, transparent 100%),
          linear-gradient(180deg, #16161A 0%, #09090B 100%)
        `,
      }}
    >
      {/* Header — Pencil: padding 48px 40px 32px 40px */}
      <div className="flex items-end justify-between px-5 pt-12 pb-8 sm:px-10 sm:pt-12 sm:pb-8">
        <div className="space-y-3">
          <p className="text-[11px] font-semibold tracking-[3px] text-[var(--text-tertiary)] uppercase">
            Leaderboard
          </p>
          <h1 className="text-[32px] font-bold tracking-tight text-[var(--text-primary)]">
            TOP CREATOR FEE EARNERS
          </h1>
          <p className="text-[15px] text-[var(--text-secondary)]">
            Rankings based on total lifetime fees across all supported platforms
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-1">
          {TIME_FILTERS.map((label) => (
            <button
              key={label}
              className={
                label === 'All Time'
                  ? 'rounded-[6px] bg-white text-[var(--text-inverse)] px-4 py-2 text-[13px] font-medium'
                  : 'rounded-[6px] bg-[var(--bg-surface)] text-[var(--text-secondary)] px-4 py-2 text-[13px]'
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Search — Pencil: padding 0 40px 16px 40px */}
      <div className="px-5 pb-4 sm:px-10">
        <SearchBar />
      </div>

      {/* Table — Pencil: padding 0 40px */}
      <div className="px-5 sm:px-10">
        <LeaderboardTable
          initialEntries={initialData.entries}
          initialTotal={initialData.total}
        />
      </div>
    </div>
  );
}
