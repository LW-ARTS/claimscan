// Large creators (6k+ positions) need up to ~40s to resolve. Default 15s is too short.
export const maxDuration = 60;

import { notFound } from 'next/navigation';
import dynamic from 'next/dynamic';
import { resolveAndPersistCreator } from '@/lib/services/creator';
import { getNativeTokenPrices } from '@/lib/prices';
import { safeBigInt, toUsdValue } from '@/lib/utils';
import { PLATFORM_CONFIG } from '@/lib/constants';
import { SearchBar } from '../components/SearchBar';
import { ProfileHero } from '../components/ProfileHero';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { LazySection } from '../components/LazySection';
import type { Chain } from '@/lib/supabase/types';

// Lazy-load below-fold heavy client components
const PlatformBreakdown = dynamic(
  () => import('../components/PlatformBreakdown').then((m) => ({ default: m.PlatformBreakdown })),
);
const ScanStatusLog = dynamic(
  () => import('../components/ScanStatusLog').then((m) => ({ default: m.ScanStatusLog })),
);
const ClaimHistory = dynamic(
  () => import('../components/ClaimHistory').then((m) => ({ default: m.ClaimHistory })),
);

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
    title: `${displayName} Creator Fees`,
    description: `See earned, claimed, and unclaimed fees for ${displayName} across Pump.fun, Bags.fm, Clanker, Zora and more. Real-time data on Solana and Base.`,
    openGraph: {
      title: `${displayName} Creator Fees | ClaimScan`,
      description: `Earnings breakdown for ${displayName} across 9 DeFi launchpads on Solana and Base.`,
      images: [
        {
          url: `/${encodeURIComponent(safeName)}/opengraph-image`,
          width: 2400,
          height: 1260,
          alt: `${displayName} creator fee receipt on ClaimScan`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image' as const,
      site: '@lwartss',
      creator: '@lwartss',
      title: `${displayName} Creator Fees | ClaimScan`,
      description: `Earnings breakdown for ${displayName} across 9 DeFi launchpads.`,
      images: [
        {
          url: `/${encodeURIComponent(safeName)}/opengraph-image`,
          alt: `${displayName} creator fee receipt on ClaimScan`,
        },
      ],
    },
    alternates: {
      canonical: `https://claimscan.tech/${encodeURIComponent(safeName)}`,
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

  // Determine which chains have resolved wallets (for scan status)
  const resolvedChains = [...new Set(wallets.map((w) => w.chain))] as Chain[];

  // Compute USD value for a single fee record (uses DB cache, falls back to live price)
  const feeToUsd = (fee: typeof feeRecords[number]): number => {
    const dbUsd = fee.total_earned_usd;
    if (typeof dbUsd === 'number' && Number.isFinite(dbUsd) && dbUsd > 0) return dbUsd;
    const unclaimed = safeBigInt(fee.total_unclaimed);
    const earned = safeBigInt(fee.total_earned);
    // Prefer total_earned (claimed + unclaimed) when populated; fall back to unclaimed for stale data
    const amount = earned > 0n ? earned : unclaimed;
    if (amount === 0n) return 0;
    const price = fee.chain === 'sol' ? prices.sol : prices.eth;
    const decimals = fee.chain === 'sol' ? 9 : 18;
    return toUsdValue(amount, decimals, price);
  };

  // Compute aggregate stats
  const totalEarnedUsd = feeRecords.reduce((sum, fee) => sum + feeToUsd(fee), 0);
  const platformCount = new Set(feeRecords.map((f) => f.platform)).size;

  return (
    <div className="space-y-8 sm:space-y-10">
      <SearchBar />

      {/* ZONE 1: Profile Hero */}
      <div className="animate-fade-in-up">
        <ErrorBoundary>
          <ProfileHero
            creator={creator}
            wallets={wallets}
            initialFees={feeRecords}
            walletsForLive={walletsForLive}
            solPrice={prices.sol}
            ethPrice={prices.eth}
            handle={decoded}
            totalEarnedUsd={totalEarnedUsd}
            platformCount={platformCount}
            resolveMs={result.resolveMs}
          />
        </ErrorBoundary>
      </div>

      {/* ZONE 2: Breakdown (chain pills + platform tabs + table) */}
      <LazySection minHeight={200}>
        <div className="animate-fade-in-up delay-150">
          <PlatformBreakdown fees={feeRecords} solPrice={prices.sol} ethPrice={prices.eth} key={creator.id} />
        </div>
      </LazySection>

      {/* ZONE 3: Claim History */}
      {result.claimEvents.length > 0 && (
        <LazySection minHeight={100}>
          <div className="animate-fade-in-up delay-200">
            <ClaimHistory events={result.claimEvents} />
          </div>
        </LazySection>
      )}

      {/* ZONE 4: Scan Status (minimal footnote) */}
      <LazySection minHeight={80}>
        <div className="animate-fade-in-up delay-300">
          <ScanStatusLog fees={feeRecords} resolvedChains={resolvedChains} />
        </div>
      </LazySection>
    </div>
  );
}
