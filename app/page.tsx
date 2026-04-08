import Link from 'next/link';
import dynamic from 'next/dynamic';
import { SearchBar } from './components/SearchBar';
import { CountUpLazy } from './components/anim/CountUpLazy';
import { RevealOnScroll } from './components/anim/RevealOnScroll';
import { PLATFORM_CONFIG } from '@/lib/constants';
import { fetchLeaderboard } from '@/lib/services/leaderboard';
import { getStats } from '@/lib/services/stats';
import { formatUsd } from '@/lib/utils';

// Revalidate homepage once per day so stats refresh daily
export const revalidate = 86400;

const MoneyFaceEmoji = dynamic(() => import('./components/MoneyFaceEmoji'), {
  loading: () => <div className="size-7 sm:size-10 md:size-14 lg:size-[72px]" />,
});


export default async function Home() {
  const platformEntries = Object.entries(PLATFORM_CONFIG);

  // Fetch stats and leaderboard preview in parallel (direct DB calls, no self-fetch)
  let stats = { totalFeesUsd: 0, walletsScanned: 0, unclaimedPercent: 0 };
  let leaderboardPreview: Array<{
    handle: string;
    handle_type: 'twitter' | 'github' | 'tiktok';
    display_name: string | null;
    total_earned_usd: number;
    platform_count: number;
    token_count: number;
  }> = [];

  try {
    const [statsResult, lbResult] = await Promise.all([
      getStats().catch(() => stats),
      fetchLeaderboard({ limit: 5 }).catch(() => ({ entries: [], total: 0 })),
    ]);
    stats = statsResult;
    leaderboardPreview = lbResult.entries;
  } catch { /* use defaults */ }

  const marqueeLogos: { name: string; src: string | null }[] = [
    { name: 'Pump.fun', src: '/logos/pump.svg' },
    { name: 'Bags.fm', src: '/logos/bags.png' },
    { name: 'Believe', src: '/logos/believe.svg' },
    { name: 'Raydium', src: '/logos/raydium.svg' },
    { name: 'Jupiter', src: '/logos/jupiter.png' },
    { name: 'Meteora', src: '/logos/meteora.png' },
    { name: 'Clanker', src: '/logos/clanker.png' },
    { name: 'Zora', src: '/logos/zora-zorb.png' },
    { name: 'Bankr', src: '/logos/bankr-favicon.svg' },
    { name: 'Coinbarrel', src: '/logos/coinbarrel.svg' },
    { name: 'RevShare', src: '/logos/revshare.png' },
    { name: 'Dexscreener', src: '/logos/dexscreener.png' },
    { name: 'Solana', src: '/logos/solana.png' },
    { name: 'Base', src: '/logos/base.png' },
    { name: 'Ethereum', src: '/logos/ethereum.png' },
    { name: 'BSC', src: '/logos/bsc.png' },
    { name: 'OWS', src: '/logos/ows.png' },
    { name: 'x402', src: null },
  ];

  // Derive per-chain launchpad counts from PLATFORM_CONFIG (single source of truth).
  // Base/ETH/BSC share EVM platforms (Clanker runs on Base + BSC, Zora on Base + ETH).
  const platformsByChain = Object.values(PLATFORM_CONFIG).reduce<Record<string, number>>(
    (acc, p) => {
      acc[p.chain] = (acc[p.chain] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const chainCards = [
    { name: 'Solana', launchpads: platformsByChain.sol ?? 0 },
    { name: 'Base', launchpads: platformsByChain.base ?? 0 },
    { name: 'Ethereum', launchpads: 1 }, // Zora extends to ETH L1
    { name: 'BSC', launchpads: 1 }, // Clanker extends to BSC
  ];

  const steps = [
    {
      step: 1,
      title: 'PASTE A HANDLE',
      desc: `Enter any creator @handle, wallet address, or ENS name. ClaimScan will instantly scan all ${Object.keys(PLATFORM_CONFIG).length} launchpads across Solana, Base, Ethereum and BSC.`,
      icon: (
        <svg className="h-7 w-7 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
      ),
    },
    {
      step: 2,
      title: 'SEE YOUR FEES',
      desc: 'Get a complete breakdown of earned, claimed, and unclaimed fees. See exactly how much you have left on the table, per platform, per token.',
      icon: (
        <svg className="h-7 w-7 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
        </svg>
      ),
    },
    {
      step: 3,
      title: 'CLAIM DIRECTLY',
      desc: 'Claim your unclaimed fees directly through ClaimScan in one click. No need to visit each platform separately. It everything in one place.',
      icon: (
        <svg className="h-7 w-7 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      ),
    },
  ];

  return (
    <div
      style={{
        background: `
          radial-gradient(ellipse 80% 30% at 50% 0%, #FFFFFF12 0%, transparent 70%),
          radial-gradient(ellipse 40% 35% at 85% 45%, #FFFFFF06 0%, transparent 100%),
          radial-gradient(ellipse 50% 40% at 15% 50%, #FFFFFF08 0%, transparent 100%),
          linear-gradient(180deg, #18181B 0%, #09090B 100%)
        `,
      }}
    >
    <div data-page="home" className="flex min-h-0 flex-col items-center pt-12 pb-[21px] sm:min-h-[calc(75vh-4rem)] sm:justify-center sm:pt-24 sm:pb-[21px]">
      {/* Hero: badge + heading + subtitle + search (narrow center) */}
      <div className="relative w-full max-w-3xl px-5 text-center sm:px-8">
        {/* Badge */}
        <div className="animate-fade-in-up mb-6 flex justify-center sm:mb-8">
          <span className="inline-flex items-center gap-2.5 rounded-[20px] border border-[#FFFFFF12] bg-[#FFFFFF08] px-4 py-1.5">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--success)] text-[var(--success)]" aria-hidden />
            <span className="text-[11px] font-semibold uppercase tracking-[2px] text-[var(--text-secondary)]">
              Free Crypto Fee Tracker
            </span>
          </span>
        </div>

        {/* Main heading — 2 lines per Pencil: "TRACK YOUR ■" / "「CREATOR」 REVENUE" */}
        <h1 className="sr-only">Find unclaimed creator fees across {platformEntries.length} launchpads on Solana and Base</h1>
        <div aria-hidden="true" className="animate-fade-in-up delay-100 flex flex-col items-center gap-1">
          <div className="flex items-center justify-center gap-2 sm:gap-3">
            <span className="text-3xl font-black uppercase tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl">Track your</span>
            <MoneyFaceEmoji size={64} className="size-7 sm:size-10 md:size-14 lg:size-[72px] brightness-0 invert" />
          </div>
          <div className="flex items-center justify-center gap-1.5 text-3xl font-black uppercase tracking-tighter sm:gap-4 sm:text-5xl md:text-6xl lg:text-7xl">
            <span>CREATOR</span>
            <span>REVENUE</span>
          </div>
        </div>

        {/* Subtitle */}
        <p className="animate-fade-in-up delay-200 mx-auto mt-5 max-w-[620px] text-base leading-relaxed text-[var(--text-tertiary)] sm:mt-6 sm:text-lg">
          Paste any @handle or wallet. See what you&apos;ve earned, claimed, and left on the table across {platformEntries.length} launchpads.{' '}
          <Link href="/docs" className="text-link text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            Learn how it works
          </Link>
        </p>

        {/* Search bar */}
        <div className="animate-fade-in-up delay-300 mx-auto mt-6 w-full max-w-[720px] sm:mt-10">
          <SearchBar size="lg" />
        </div>
      </div>

      {/* Stats — full width per Pencil: padding 16px 48px, 3 equal cards */}
      <div className="animate-fade-in-up delay-500 mt-8 w-full px-5 sm:mt-16 sm:px-12">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <div className="card-hover rounded-2xl border border-[#FFFFFF10] bg-[#FFFFFF06] px-5 py-6 text-center shadow-[0_2px_48px_#FFFFFF05] sm:px-7 sm:py-8">
            <p className="text-2xl font-bold tabular-nums text-[var(--text-primary)] sm:text-[38px]">
              <CountUpLazy value={stats.totalFeesUsd} variant="compact" />
            </p>
            <p className="mt-2 text-[13px] tracking-wide text-[var(--text-secondary)]">Fees Tracked</p>
          </div>
          <div className="card-hover rounded-2xl border border-[#FFFFFF10] bg-[#FFFFFF06] px-5 py-6 text-center shadow-[0_2px_48px_#FFFFFF05] sm:px-7 sm:py-8">
            <p className="text-2xl font-bold tabular-nums text-[var(--text-primary)] sm:text-[38px]">
              <CountUpLazy value={stats.walletsScanned} variant="walletsCompact" />
            </p>
            <p className="mt-2 text-[13px] tracking-wide text-[var(--text-secondary)]">Wallets Scanned</p>
          </div>
          <div className="card-hover rounded-2xl border border-[#FFFFFF10] bg-[#FFFFFF06] px-5 py-6 text-center shadow-[0_2px_48px_#FFFFFF05] sm:px-7 sm:py-8">
            <p className="text-2xl font-bold tabular-nums text-[var(--text-primary)] sm:text-[38px]">~40%</p>
            <p className="mt-2 text-[13px] tracking-wide text-[var(--text-secondary)]">Left Unclaimed</p>
          </div>
        </div>
        <p className="mt-4 text-center text-[11px] text-[var(--text-tertiary)]">
          Stats refreshed every 24 hours from on-chain data.
        </p>
      </div>

      {/* Supported Platforms — infinite dual marquee */}
      <div className="mt-12 w-full space-y-8 sm:mt-16">
        <div className="space-y-3 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[2px] text-white">
            {'// '}Supported Platforms
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-[32px]">
            SUPPORTED PLATFORMS
          </h2>
        </div>

        {(() => {
          const half = Math.ceil(marqueeLogos.length / 2);
          const rowA = marqueeLogos.slice(0, half);
          const rowB = marqueeLogos.slice(half);
          const maskStyle = {
            maskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
            WebkitMaskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
          };
          return (
            <div className="space-y-6">
              {/* Row 1 — left to right */}
              <div className="marquee-container relative overflow-hidden" style={maskStyle}>
                <div className="flex w-max marquee-left items-center gap-16 pr-16">
                  {[...rowA, ...rowA].map((logo, i) => (
                    <div
                      key={`a-${logo.name}-${i}`}
                      className="hover-lift flex shrink-0 items-center gap-3 opacity-60 transition-opacity hover:opacity-100"
                    >
                      {logo.src && (
                        <img
                          src={logo.src}
                          alt={logo.name}
                          className="h-10 w-10 rounded-md object-contain"
                          loading="lazy"
                        />
                      )}
                      <span className="text-2xl font-bold text-[var(--text-primary)] whitespace-nowrap">
                        {logo.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Row 2 — right to left */}
              <div className="marquee-container relative overflow-hidden" style={maskStyle}>
                <div className="flex w-max marquee-right items-center gap-16 pr-16">
                  {[...rowB, ...rowB].map((logo, i) => (
                    <div
                      key={`b-${logo.name}-${i}`}
                      className="hover-lift flex shrink-0 items-center gap-3 opacity-60 transition-opacity hover:opacity-100"
                    >
                      {logo.src && (
                        <img
                          src={logo.src}
                          alt={logo.name}
                          className="h-10 w-10 rounded-md object-contain"
                          loading="lazy"
                        />
                      )}
                      <span className="text-2xl font-bold text-[var(--text-primary)] whitespace-nowrap">
                        {logo.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
    {/* ═══ Homepage Bottom Sections ═══ */}
    <div className="space-y-24 px-5 pt-16 pb-24 sm:px-12 lg:px-[120px]">

      {/* Multi-Chain Coverage */}
      <section className="space-y-10 text-center">
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[2px] text-white">
            Multi-Chain
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-[32px]">
            MULTI-CHAIN COVERAGE
          </h2>
        </div>
        <div className="stagger-in grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {chainCards.map((chain, i) => (
            <div key={chain.name} style={{ ['--stagger-index' as string]: i }} className="card-hover flex items-center gap-4 rounded-[10px] border border-[#FFFFFF10] bg-[var(--bg-card)] px-5 py-4 sm:px-6 sm:py-5">
              <span className="live-dot h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--text-secondary)] text-[var(--text-secondary)]" aria-hidden />
              <div className="text-left">
                <p className="text-sm font-bold text-[var(--text-primary)]">{chain.name}</p>
                <p className="text-[11px] text-[var(--text-tertiary)]">{chain.launchpads} Launchpads</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Leaderboard Preview */}
      <section className="space-y-8 text-center">
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[2px] text-white">Top Earners</p>
          <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-[32px]">
            CREATOR FEE LEADERBOARD
          </h2>
        </div>

        {leaderboardPreview.length > 0 && (
          <div className="overflow-hidden rounded-[14px] border border-[#FFFFFF10] bg-[var(--bg-card)]">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-3 py-3 text-[11px] font-medium uppercase tracking-[1px] text-[var(--text-tertiary)] sm:gap-8 sm:px-4">
              <span className="w-8 shrink-0 text-center sm:w-12 sm:text-left">#</span>
              <span className="min-w-0 flex-1 text-left">Creator</span>
              <span className="shrink-0 text-right sm:w-32">Total Fees</span>
              <span className="hidden w-24 text-center sm:block">Platforms</span>
              <span className="hidden w-20 text-center sm:block">Tokens</span>
            </div>
            {/* Rows */}
            <div className="stagger-in">
            {leaderboardPreview.map((entry, idx) => {
              // SQL function prefixes non-twitter handles (`gh:`, `tt:`); strip
              // for display while keeping the prefix in the URL so parseSearchQuery
              // routes to the right provider on click.
              const bareHandle = entry.handle.startsWith('gh:') || entry.handle.startsWith('tt:')
                ? entry.handle.slice(3)
                : entry.handle;
              const avatarProvider: 'x' | 'tiktok' | null =
                entry.handle_type === 'twitter' ? 'x'
                : entry.handle_type === 'tiktok' ? 'tiktok'
                : null;
              return (
              <Link
                key={entry.handle}
                href={`/${encodeURIComponent(entry.handle)}`}
                style={{ ['--stagger-index' as string]: idx }}
                className={`row-hover flex items-center gap-3 px-3 py-3.5 sm:gap-8 sm:px-4 hover:bg-[var(--bg-surface-hover)] ${
                  idx === 0
                    ? 'pulse-glow border-l-2 border-l-white bg-[#FFFFFF0A]'
                    : idx % 2 === 1
                      ? 'bg-[var(--bg-surface)]'
                      : ''
                } ${idx < leaderboardPreview.length - 1 ? 'border-b border-[var(--border-subtle)]' : ''}`}
              >
                <span className={`flex w-8 shrink-0 items-center justify-center gap-1 tabular-nums text-sm font-bold sm:w-12 ${idx === 0 ? 'text-white' : 'text-[var(--text-tertiary)]'}`}>
                  {idx === 0 && (
                    <svg className="hidden h-3.5 w-3.5 shrink-0 sm:inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                    </svg>
                  )}
                  {idx + 1}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                  {avatarProvider ? (
                    <img
                      src={`https://unavatar.io/${avatarProvider}/${bareHandle}`}
                      alt=""
                      className="avatar-ring h-7 w-7 shrink-0 rounded-full object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="avatar-ring flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--bg-surface)] text-[11px] font-bold uppercase text-[var(--text-secondary)]">
                      {bareHandle[0]?.toUpperCase()}
                    </span>
                  )}
                  <span className="truncate text-sm font-semibold text-[var(--text-primary)]">@{bareHandle}</span>
                </span>
                <span className="w-auto shrink-0 whitespace-nowrap text-right text-sm font-bold text-[var(--text-primary)] sm:w-32">
                  {formatUsd(entry.total_earned_usd).replace(/\.\d+K$/, 'K')}
                </span>
                <span className="hidden w-24 text-center text-sm text-[var(--text-secondary)] sm:block">
                  {entry.platform_count}
                </span>
                <span className="hidden w-20 text-center text-sm text-[var(--text-secondary)] sm:block">
                  {entry.token_count}
                </span>
              </Link>
              );
            })}
            </div>
          </div>
        )}

        <div className="flex justify-center">
          <Link
            href="/leaderboard"
            className="pressable hover-glow-primary inline-flex items-center gap-2 rounded-[10px] bg-white px-6 py-3 text-[13px] font-semibold text-[var(--text-inverse)] transition-all hover:bg-white/90"
          >
            View Full Leaderboard
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </section>

      {/* How It Works */}
      <section className="space-y-10 text-center">
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[2px] text-white">How It Works</p>
          <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-[32px]">
            THREE SIMPLE STEPS
          </h2>
          <p className="mx-auto max-w-md text-[15px] text-[var(--text-secondary)]">
            Track and claim your creator fees in minutes.
          </p>
        </div>

        <div className="stagger-in grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
          {steps.map((s, i) => (
            <div key={s.step} style={{ ['--stagger-index' as string]: i }} className="card-hover flex flex-col items-start gap-5 rounded-[14px] border border-[#FFFFFF10] bg-[var(--bg-card)] p-6 text-left sm:p-8">
              <div className="flex items-center justify-between self-stretch">
                <span className="rounded-[20px] border border-[#FFFFFF18] bg-[#FFFFFF10] px-3 py-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                  STEP {s.step}
                </span>
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#FFFFFF10] bg-[#FFFFFF06]">
                {s.icon}
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-[var(--text-primary)] sm:text-xl">{s.title}</h3>
                <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-center">
          <Link
            href="/docs"
            className="pressable hover-glow-primary inline-flex items-center gap-2 rounded-[10px] border border-[var(--border-accent)] bg-white px-6 py-3 text-[13px] font-semibold text-[var(--text-inverse)] transition-all hover:bg-white/90"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
            </svg>
            Read the Docs
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </section>
    </div>
    </div>
  );
}
