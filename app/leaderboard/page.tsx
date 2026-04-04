import type { Metadata } from 'next';
import { LeaderboardTable } from '@/app/components/LeaderboardTable';
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
    initialData = await fetchLeaderboard({ limit: 50 });
  } catch {
    // DB fetch failed — client will retry
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Leaderboard
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Top creator fee earners across 9 launchpads on Solana and Base.
        </p>
      </div>

      <LeaderboardTable
        initialEntries={initialData.entries}
        initialTotal={initialData.total}
      />
    </main>
  );
}
