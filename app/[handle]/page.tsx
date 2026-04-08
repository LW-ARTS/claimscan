import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import dynamic from 'next/dynamic';
import { resolveAndPersistCreator } from '@/lib/services/creator';
import { getNativeTokenPrices } from '@/lib/prices';
import { computeFeeUsd, isWalletAddress } from '@/lib/utils';
import { PLATFORM_CONFIG } from '@/lib/constants';
import { SearchBar } from '../components/SearchBar';
import { ProfileJsonLd } from '../components/ProfileJsonLd';
import { ProfileHero } from '../components/ProfileHero';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { LazySection } from '../components/LazySection';
import { LiveFeesProvider } from '../components/LiveFeesProvider';
import type { Chain } from '@/lib/supabase/types';

export const revalidate = 1800; // 30 minutes

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

/** Strip leaderboard prefix shorthands (`gh:`, `tt:`) so display names and
 * metadata read as the bare username, while the resolver still receives the
 * original prefixed string and routes via parseSearchQuery. */
function stripHandlePrefix(value: string): string {
  if (value.startsWith('gh:') && value.length > 3) return value.slice(3);
  if (value.startsWith('tt:') && value.length > 3) return value.slice(3);
  return value;
}

export async function generateMetadata({ params }: PageProps) {
  const { handle } = await params;
  const decoded = decodeURIComponent(handle);
  const cleanHandle = stripHandlePrefix(decoded);
  const safeName = cleanHandle.replace(/[^a-zA-Z0-9_\-\.]/g, '').slice(0, 64);
  // Don't prefix wallet addresses with @
  const isWallet = isWalletAddress(safeName);
  const displayName = isWallet ? safeName : `@${safeName}`;
  return {
    title: `${displayName} Unclaimed Creator Fees`,
    description: `See earned, claimed, and unclaimed fees for ${displayName} across Pump.fun, Bags.fm, Clanker, Zora and more. Real-time data on Solana, Base, and BNB Chain.`,
    ...(isWallet ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: `${displayName}: Earned & Unclaimed Fees | ClaimScan`,
      description: `Earnings breakdown for ${displayName} across 9 DeFi launchpads on Solana, Base, and BNB Chain.`,
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
      title: `${displayName}: Earned & Unclaimed Fees | ClaimScan`,
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
  const cleanHandle = stripHandlePrefix(decoded);

  // Validate input length before triggering expensive resolve pipeline
  if (!decoded || decoded.length < 2 || decoded.length > 256) {
    return notFound();
  }

  // Fetch creator data and native prices in parallel.
  // Creator resolve uses Promise.all (errors should propagate to error boundary, not show fake "not found").
  // Prices use a catch fallback (price failure should NOT crash the page).
  const [creatorResult, priceResult] = await Promise.all([
    resolveAndPersistCreator(decoded),
    getNativeTokenPrices().catch(() => ({ sol: 0, eth: 0, bnb: 0, stale: true as const })),
  ]);

  if (!creatorResult.creator) {
    return notFound();
  }

  const creator = creatorResult.creator;
  const wallets = creatorResult.wallets;
  const feeRecords = creatorResult.fees;

  const walletsForLive = wallets.map((w) => ({
    address: w.address,
    chain: w.chain,
    sourcePlatform: w.source_platform,
  }));

  // Determine which chains have resolved wallets (for scan status)
  const resolvedChains = [...new Set(wallets.map((w) => w.chain))] as Chain[];

  const feeToUsd = (fee: typeof feeRecords[number]): number => {
    return computeFeeUsd(fee, priceResult.sol, priceResult.eth, priceResult.bnb);
  };

  // Compute aggregate stats
  const totalEarnedUsd = feeRecords.reduce((sum, fee) => sum + feeToUsd(fee), 0);
  const platformCount = new Set(feeRecords.map((f) => f.platform)).size;

  // Identity disclaimers for notable handles
  const handleLower = cleanHandle.toLowerCase();
  const IDENTITY_DISCLAIMERS: Record<string, { title: string; body: string }> = {
    elonmusk: {
      title: 'Is this the real Elon Musk? No.',
      body: 'Someone registered \u201celonmusk\u201d on Bags.fm by linking the @elonmusk X account. These are their fees, not Elon\u2019s.',
    },
  };
  const NOTABLE_HANDLES = new Set([
    'elonmusk', 'vitalikbuterin', 'cz_binance', 'jack', 'naval',
    'balaborasclern', 'trump', 'donaldtrump', 'barackobama', 'joebiden',
    'mrbeast', 'pewdiepie', 'kanyewest', 'drake', 'snoopdogg',
  ]);
  const identityDisclaimer = IDENTITY_DISCLAIMERS[handleLower] ?? (
    NOTABLE_HANDLES.has(handleLower)
      ? { title: 'Handle not verified', body: 'ClaimScan shows fees for the wallet that registered this handle. It does not verify identity. Anyone can claim a username on supported platforms.' }
      : null
  );

  // Build display name for structured data
  const isWallet = isWalletAddress(cleanHandle);
  const displayName = isWallet ? cleanHandle : `@${cleanHandle}`;

  return (
    <div
      className="space-y-0"
      style={{
        background: `
          radial-gradient(ellipse 50% 35% at 75% 30%, #FFFFFF06 0%, transparent 100%),
          radial-gradient(ellipse 90% 50% at 30% 8%, #FFFFFF0C 0%, transparent 70%),
          linear-gradient(180deg, #16161A 0%, #09090B 100%)
        `,
      }}>
      <div className="px-5 py-4 sm:px-12">
        <SearchBar />
      </div>
      {!isWallet && (
        <ProfileJsonLd
          handle={cleanHandle}
          displayName={displayName}
          totalEarnedUsd={totalEarnedUsd}
          platformCount={platformCount}
          avatarUrl={creator.avatar_url ?? null}
          walletAddresses={wallets.map((w) => w.address)}
        />
      )}

      {/* ZONE 1: Profile Hero — wrapped in LiveFeesProvider so both
          ProfileHero and the PlatformBreakdown further down share the
          same live SSE stream via useLiveFees(). */}
      <LiveFeesProvider walletsForLive={walletsForLive}>
      <div className="animate-fade-in-up">
        <ErrorBoundary>
          <ProfileHero
            creator={creator}
            wallets={wallets}
            initialFees={feeRecords}
            walletsForLive={walletsForLive}
            solPrice={priceResult.sol}
            ethPrice={priceResult.eth}
            bnbPrice={priceResult.bnb}
            handle={cleanHandle}
            totalEarnedUsd={totalEarnedUsd}
            platformCount={platformCount}
            resolveMs={creatorResult.resolveMs}
          />
        </ErrorBoundary>
      </div>

      {/* SSR summary for crawlers */}
      <p className="sr-only">
        {displayName} has earned {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalEarnedUsd)} in creator fees across {platformCount} platform{platformCount !== 1 ? 's' : ''}.
        {feeRecords.filter(f => f.claim_status === 'unclaimed').length > 0 && ` ${feeRecords.filter(f => f.claim_status === 'unclaimed').length} fees remain unclaimed.`}
        {' '}Platforms: {[...new Set(feeRecords.map(f => PLATFORM_CONFIG[f.platform]?.name ?? f.platform))].join(', ')}.
      </p>

      {/* Identity disclaimer for notable/celebrity handles */}
      {identityDisclaimer && (
        <div className="animate-fade-in-up delay-100 mx-5 flex items-start gap-4 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-5 py-4 sm:mx-12">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06]">
            <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
            </svg>
          </div>
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium text-foreground/90">{identityDisclaimer.title}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">{identityDisclaimer.body}</p>
          </div>
        </div>
      )}

      {/* SSR fee data for screen readers + crawlers */}
      <div className="sr-only">
        <h2>All Fee Records</h2>
        <ul>
          {feeRecords.slice(0, 50).map(fee => (
            <li key={fee.id}>
              {fee.token_symbol || fee.token_address.slice(0,8)} on {PLATFORM_CONFIG[fee.platform]?.name ?? fee.platform}: {fee.claim_status}
            </li>
          ))}
        </ul>
      </div>

      {/* ZONE 2-4: Heavy content wrapped in Suspense so hero renders immediately */}
      <Suspense fallback={<BreakdownSkeleton />}>
        {/* ZONE 2: Breakdown (chain pills + platform tabs + table) */}
        <h2 className="sr-only">Fee Breakdown by Platform</h2>
        <LazySection minHeight={200}>
          <div className="animate-fade-in-up delay-150 px-[2%]">
            <PlatformBreakdown fees={feeRecords} solPrice={priceResult.sol} ethPrice={priceResult.eth} bnbPrice={priceResult.bnb} wallets={wallets} key={creator.id} />
          </div>
        </LazySection>

        {/* ZONE 3: Claim History */}
        <h2 className="sr-only">Claim History</h2>
        {creatorResult.claimEvents.length > 0 && (
          <LazySection minHeight={100}>
            <div className="animate-fade-in-up delay-200">
              <ClaimHistory events={creatorResult.claimEvents} />
            </div>
          </LazySection>
        )}

        {/* ZONE 4: Scan Status (minimal footnote) */}
        <h2 className="sr-only">Scan Status</h2>
        <LazySection minHeight={80}>
          <div className="animate-fade-in-up delay-300 px-[2%] py-4 mb-12">
            <ScanStatusLog fees={feeRecords} resolvedChains={resolvedChains} />
          </div>
        </LazySection>
      </Suspense>
      </LiveFeesProvider>
    </div>
  );
}

/** Skeleton fallback for the breakdown/history/status zones */
function BreakdownSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-label="Loading fee breakdown">
      {/* Platform tabs skeleton */}
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-20 rounded-lg bg-foreground/[0.06]" />
        ))}
      </div>
      {/* Table rows skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-8 w-8 rounded-full bg-foreground/[0.06]" />
            <div className="h-4 flex-1 rounded bg-foreground/[0.06]" />
            <div className="h-4 w-24 rounded bg-foreground/[0.06]" />
          </div>
        ))}
      </div>
    </div>
  );
}
