import type { Metadata } from 'next';
import { LeaderboardTable } from '@/app/components/LeaderboardTable';
import { SearchBar } from '@/app/components/SearchBar';
import { APP_URL } from '@/lib/constants';
import { fetchLeaderboard } from '@/lib/services/leaderboard';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Leaderboard | ClaimScan',
    description:
      'Top creator fee earners across Pump.fun, Bags.fm, Clanker, Zora, Flaunch, Flap and 5 more launchpads on Solana, Base, and BNB Chain.',
    alternates: { canonical: `${APP_URL}/leaderboard` },
    openGraph: {
      title: 'Leaderboard: Top Creator Fee Earners | ClaimScan',
      description:
        'See who earns the most in creator fees across 11 DeFi launchpads on Solana, Base, and BNB Chain.',
      url: `${APP_URL}/leaderboard`,
      siteName: 'ClaimScan',
      type: 'website',
      images: [
        {
          url: '/leaderboard/opengraph-image',
          width: 1200,
          height: 630,
          alt: 'ClaimScan Leaderboard',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image' as const,
      site: '@lwartss',
      creator: '@lwartss',
      title: 'Leaderboard: Top Creator Fee Earners | ClaimScan',
      description:
        'See who earns the most in creator fees across 11 DeFi launchpads on Solana, Base, and BNB Chain.',
      images: [
        {
          url: '/leaderboard/opengraph-image',
          width: 1200,
          height: 630,
          alt: 'ClaimScan Leaderboard',
        },
      ],
    },
  };
}


const LEADERBOARD_BREADCRUMB_LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  '@id': 'https://claimscan.tech/leaderboard#breadcrumb',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'ClaimScan',
      item: 'https://claimscan.tech',
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Leaderboard',
      item: 'https://claimscan.tech/leaderboard',
    },
  ],
}).replace(/[<>&\u2028\u2029]/g, (c) => ({ '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029' })[c]!);

export default async function LeaderboardPage() {
  // Fetch initial data server-side for SEO (direct DB call, no HTTP self-fetch).
  let initialData: { entries: Array<{
    handle: string;
    handle_type: 'twitter' | 'github' | 'tiktok';
    display_name: string | null;
    total_earned_usd: number;
    platform_count: number;
    token_count: number;
  }>; total: number } = { entries: [], total: 0 };

  try {
    initialData = await fetchLeaderboard({ limit: 15 });
  } catch {
    // DB fetch failed. Client will retry.
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: LEADERBOARD_BREADCRUMB_LD }}
      />
      {/* Header. Pencil: padding 48px 40px 32px 40px */}
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
      </div>

      {/* Search. Pencil: padding 0 40px 16px 40px */}
      <div className="px-5 pb-4 sm:px-10">
        <SearchBar size="lg" />
      </div>

      {/* Table. Pencil: padding 0 40px */}
      <div className="px-5 pb-16 sm:px-10">
        <LeaderboardTable
          initialEntries={initialData.entries}
          initialTotal={initialData.total}
        />
      </div>
    </div>
  );
}
