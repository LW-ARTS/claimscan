import Link from 'next/link';
import dynamic from 'next/dynamic';
import { SearchBar } from './components/SearchBar';
import { PLATFORM_CONFIG } from '@/lib/constants';
import { fetchLeaderboard } from '@/lib/services/leaderboard';
import { formatUsd } from '@/lib/utils';

const MoneyFaceEmoji = dynamic(() => import('./components/MoneyFaceEmoji'), {
  loading: () => <div className="size-7 sm:size-10 md:size-14 lg:size-[72px]" />,
});

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M+`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K+`;
  return String(n);
}

async function getStats() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL ? '' : 'http://localhost:3001'}/api/stats`, {
      next: { revalidate: 1800 },
    });
    if (res.ok) return res.json();
  } catch { /* fallback */ }
  return { totalFeesUsd: 12_400_000, walletsScanned: 84_000 };
}

export default async function Home() {
  const platformEntries = Object.entries(PLATFORM_CONFIG);

  // Fetch stats and leaderboard preview in parallel
  let stats = { totalFeesUsd: 12_400_000, walletsScanned: 84_000 };
  let leaderboardPreview: Array<{
    handle: string;
    handle_type: 'twitter' | 'github';
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

  const platformRows = [
    ['Pump.fun', 'Believe', 'Virtuals', 'Moonshot', 'LetsBonk'],
    ['Raydium', 'Jupiter', 'Meteora', 'Clanker', 'Wow'],
    ['Solana', 'Base', 'Ethereum', 'BSC', 'Dexscreener'],
  ];

  const chainCards = [
    { name: 'Solana', launchpads: 5 },
    { name: 'Base', launchpads: 3 },
    { name: 'Ethereum', launchpads: 1 },
    { name: 'BSC', launchpads: 1 },
  ];

  const steps = [
    {
      step: 1,
      title: 'PASTE A HANDLE',
      desc: 'Enter any creator @handle, wallet address, or ENS name. ClaimScan will instantly scan all 10 launchpads across Solana, Base, Ethereum and BSC.',
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
    <div data-page="home" className="flex min-h-0 flex-col items-center pt-12 pb-8 sm:min-h-[calc(75vh-4rem)] sm:justify-center sm:pt-24 sm:pb-[72px]">
      {/* Hero: badge + heading + subtitle + search (narrow center) */}
      <div className="relative w-full max-w-3xl text-center">
        {/* Badge */}
        <div className="animate-fade-in-up mb-6 flex justify-center sm:mb-8">
          <span className="inline-flex items-center gap-2.5 rounded-[20px] border border-[#FFFFFF12] bg-[#FFFFFF08] px-4 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" aria-hidden />
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
          <div className="flex items-center justify-center gap-2 text-3xl font-black uppercase tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl">
            <span className="font-light text-[var(--text-secondary)]">{'\u300C'}</span>
            <span>CREATOR</span>
            <span className="font-light text-[var(--text-secondary)]">{'\u300D'}</span>
            <span className="ml-2 sm:ml-4">REVENUE</span>
          </div>
        </div>

        {/* Subtitle */}
        <p className="animate-fade-in-up delay-200 mx-auto mt-5 max-w-[620px] text-base leading-relaxed text-[var(--text-tertiary)] sm:mt-6 sm:text-lg">
          Paste any @handle or wallet. See what you&apos;ve earned, claimed, and left on the table across {platformEntries.length} launchpads.{' '}
          <Link href="/docs" className="text-[var(--text-secondary)] underline decoration-[var(--border-subtle)] underline-offset-2 transition-colors hover:text-[var(--text-primary)] hover:decoration-[var(--text-tertiary)]">
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
          <div className="rounded-2xl border border-[#FFFFFF10] bg-[#FFFFFF06] px-5 py-6 text-center shadow-[0_2px_48px_#FFFFFF05] sm:px-7 sm:py-8">
            <p className="font-mono text-2xl font-bold tabular-nums text-[var(--text-primary)] sm:text-[38px]">{formatCompact(stats.totalFeesUsd)}</p>
            <p className="mt-2 text-[13px] tracking-wide text-[var(--text-secondary)]">Fees Tracked</p>
          </div>
          <div className="rounded-2xl border border-[#FFFFFF10] bg-[#FFFFFF06] px-5 py-6 text-center shadow-[0_2px_48px_#FFFFFF05] sm:px-7 sm:py-8">
            <p className="font-mono text-2xl font-bold tabular-nums text-[var(--text-primary)] sm:text-[38px]">{stats.walletsScanned >= 1000 ? `${(stats.walletsScanned / 1000).toFixed(0)},000+` : `${stats.walletsScanned}+`}</p>
            <p className="mt-2 text-[13px] tracking-wide text-[var(--text-secondary)]">Wallets Scanned</p>
          </div>
          <div className="rounded-2xl border border-[#FFFFFF10] bg-[#FFFFFF06] px-5 py-6 text-center shadow-[0_2px_48px_#FFFFFF05] sm:px-7 sm:py-8">
            <p className="font-mono text-2xl font-bold tabular-nums text-[var(--text-primary)] sm:text-[38px]">~40%</p>
            <p className="mt-2 text-[13px] tracking-wide text-[var(--text-secondary)]">Left Unclaimed</p>
          </div>
        </div>
      </div>

      {/* Supported Platforms — full width per Pencil: padding 48px 120px */}
      <div className="mt-12 w-full space-y-6 px-5 sm:mt-16 sm:px-12 lg:px-[120px]">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[2px] text-white">
          // Supported Platforms
        </p>
        <div className="space-y-4">
          {platformRows.map((row, i) => (
            <div key={i} className="flex items-center justify-between">
              {row.map((name, j) => (
                <span
                  key={name}
                  className={`text-sm font-bold sm:text-xl ${j % 2 === 0 ? 'opacity-50' : 'opacity-[0.35]'}`}
                >
                  {name}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
    {/* ═══ Homepage Bottom Sections ═══ */}
    <div className="space-y-24 px-5 py-24 sm:px-12 lg:px-[120px]">

      {/* Multi-Chain Coverage */}
      <section className="space-y-10 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[2px] text-white">
          Multi-Chain Coverage
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {chainCards.map((chain) => (
            <div key={chain.name} className="flex items-center gap-4 rounded-[10px] border border-[#FFFFFF10] bg-[var(--bg-card)] px-5 py-4 sm:px-6 sm:py-5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--text-secondary)]" aria-hidden />
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
            <div className="flex items-center border-b border-[var(--border-subtle)] px-4 py-3 text-[11px] font-medium uppercase tracking-[1px] text-[var(--text-tertiary)]">
              <span className="w-12">#</span>
              <span className="flex-1 text-left">Creator</span>
              <span className="w-28 text-right">Earned</span>
              <span className="hidden w-28 text-right sm:block">USD</span>
              <span className="hidden w-28 text-right sm:block">Top Platform</span>
            </div>
            {/* Rows */}
            {leaderboardPreview.map((entry, idx) => (
              <Link
                key={entry.handle}
                href={`/${entry.handle}`}
                className={`flex items-center px-4 py-3.5 transition-colors hover:bg-[var(--bg-surface-hover)] ${
                  idx === 0
                    ? 'border-l-2 border-l-white bg-[#FFFFFF0A] shadow-[0_0_20px_#FFFFFF10]'
                    : idx % 2 === 1
                      ? 'bg-[var(--bg-surface)]'
                      : ''
                } ${idx < leaderboardPreview.length - 1 ? 'border-b border-[var(--border-subtle)]' : ''}`}
              >
                <span className="w-12 text-sm font-bold tabular-nums text-[var(--text-tertiary)]">
                  {idx === 0 && <span className="mr-1">🏆</span>}
                  {idx + 1}
                </span>
                <span className="flex flex-1 items-center gap-2.5 text-left">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--bg-surface)] text-[11px] font-bold uppercase text-[var(--text-secondary)]">
                    {entry.handle[0]?.toUpperCase()}
                  </span>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">@{entry.handle}</span>
                </span>
                <span className="w-28 text-right font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
                  {formatUsd(entry.total_earned_usd)}
                </span>
                <span className="hidden w-28 text-right font-mono text-sm tabular-nums text-[var(--text-secondary)] sm:block">
                  {formatUsd(entry.total_earned_usd)}
                </span>
                <span className="hidden w-28 text-right text-[13px] text-[var(--text-tertiary)] sm:block">
                  pump.fun
                </span>
              </Link>
            ))}
          </div>
        )}

        <div className="flex justify-center">
          <Link
            href="/leaderboard"
            className="inline-flex items-center gap-2 rounded-[10px] bg-white px-6 py-3 text-[13px] font-semibold text-[var(--text-inverse)] transition-all hover:bg-white/90 active:scale-[0.97]"
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
          {steps.map((s) => (
            <div key={s.step} className="flex flex-col items-start gap-5 rounded-[14px] border border-[#FFFFFF10] bg-[var(--bg-card)] p-6 text-left sm:p-8">
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
            className="inline-flex items-center gap-2 rounded-[10px] border border-[var(--border-accent)] bg-white px-6 py-3 text-[13px] font-semibold text-[var(--text-inverse)] transition-all hover:bg-white/90 active:scale-[0.97]"
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
