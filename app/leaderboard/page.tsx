import type { Metadata } from 'next';
import { LeaderboardTable } from '@/app/components/LeaderboardTable';
import { APP_URL } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Leaderboard — ClaimScan',
  description: 'Top creator fee earners across Pump.fun, Bags.fm, Clanker, Zora, and 5 more launchpads on Solana and Base.',
  alternates: { canonical: `${APP_URL}/leaderboard` },
};

export default async function LeaderboardPage() {
  // Fetch initial data server-side for SEO
  let initialData: { entries: Array<{
    handle: string;
    display_name: string | null;
    total_earned_usd: number;
    platform_count: number;
    token_count: number;
  }>; total: number } = { entries: [], total: 0 };

  try {
    const res = await fetch(`${APP_URL}/api/leaderboard?limit=50`, {
      next: { revalidate: 300 }, // 5min ISR
    });
    if (res.ok) {
      initialData = await res.json();
    }
  } catch {
    // SSR fetch failed — client will retry
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
