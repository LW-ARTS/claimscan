import { notFound } from 'next/navigation';
import { resolveAndPersistCreator } from '@/lib/services/creator';
import { getNativeTokenPrices } from '@/lib/prices';
import { SearchBar } from '../components/SearchBar';
import { ProfileHeader } from '../components/ProfileHeader';
import { FeeSummaryCard } from '../components/FeeSummaryCard';
import { PlatformBreakdown } from '../components/PlatformBreakdown';
import { ChainBreakdown } from '../components/ChainBreakdown';

interface PageProps {
  params: Promise<{ handle: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { handle } = await params;
  const decoded = decodeURIComponent(handle);
  const safeName = decoded.replace(/[^a-zA-Z0-9_\-\.]/g, '').slice(0, 64);
  // Don't prefix wallet addresses with @
  const isWallet = /^(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(safeName);
  const displayName = isWallet ? safeName : `@${safeName}`;
  return {
    title: `${displayName} — ClaimScan | DeFi Fee Tracker`,
    description: `View creator fee earnings, claims, and unclaimed balances for ${displayName} across Pump.fun, Bags.fm, Clanker, Zora, and more DeFi launchpads.`,
    openGraph: {
      title: `${displayName} — ClaimScan`,
      description: `Creator fee summary for ${displayName} across DeFi launchpads.`,
    },
    twitter: {
      card: 'summary_large_image' as const,
    },
    alternates: {
      canonical: `https://claimscan.io/${encodeURIComponent(safeName)}`,
    },
  };
}

export default async function ProfilePage({ params }: PageProps) {
  const { handle } = await params;
  const decoded = decodeURIComponent(handle);

  // Validate input length before triggering expensive resolve pipeline
  if (!decoded || decoded.length < 2 || decoded.length > 256) {
    return notFound();
  }

  // Fetch creator data and native prices in parallel (independent operations)
  const [result, prices] = await Promise.all([
    resolveAndPersistCreator(decoded),
    getNativeTokenPrices(),
  ]);

  if (!result.creator) {
    return (
      <div className="space-y-8">
        <SearchBar />
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.06]">
            <svg className="h-7 w-7 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold">No results found</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Could not find any wallets or fees for &quot;{decoded.replace(/[\u200B-\u200D\uFEFF\u202A-\u202E]/g, '').slice(0, 64)}&quot;.
            Try a different handle, username, or wallet address.
          </p>
        </div>
      </div>
    );
  }

  const creator = result.creator;
  const wallets = result.wallets;
  const feeRecords = result.fees;

  const walletsForLive = wallets.map((w) => ({
    address: w.address,
    chain: w.chain,
    sourcePlatform: w.source_platform,
  }));

  return (
    <div className="space-y-5 sm:space-y-8">
      <SearchBar />

      <ProfileHeader creator={creator} wallets={wallets} />

      <FeeSummaryCard
        initialFees={feeRecords}
        wallets={walletsForLive}
        solPrice={prices.sol}
        ethPrice={prices.eth}
      />

      {/* Chain breakdown section */}
      <section>
        <div className="mb-3 sm:mb-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground/60">
            By Chain
          </h2>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
        </div>
        <ChainBreakdown fees={feeRecords} />
      </section>

      {/* Platform breakdown section */}
      <section>
        <div className="mb-3 sm:mb-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground/60">
            By Platform
          </h2>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
        </div>
        <PlatformBreakdown fees={feeRecords} key={creator.id} />
      </section>
    </div>
  );
}
