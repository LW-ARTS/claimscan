import Link from 'next/link';
import dynamic from 'next/dynamic';
import { SearchBar } from './components/SearchBar';
import { PlatformIcon } from './components/PlatformIcon';
import { PLATFORM_CONFIG } from '@/lib/constants';
import { HeroReveal } from './components/HeroReveal';

// Lazy-load decorative / animation-heavy components (auto code-split)
const TrueFocus = dynamic(() => import('./components/TrueFocus'));
const OrbitingLogos = dynamic(
  () => import('./components/OrbitingLogos').then((m) => ({ default: m.OrbitingLogos })),
);
const MoneyFaceEmoji = dynamic(() => import('./components/MoneyFaceEmoji'), {
  loading: () => <div className="size-7 sm:size-10 md:size-14 lg:size-[72px]" />,
});
export default function Home() {
  const platformEntries = Object.entries(PLATFORM_CONFIG);

  return (
    <HeroReveal>
    <div data-page="home" className="flex min-h-0 flex-col items-center pt-4 pb-8 sm:min-h-[calc(75vh-4rem)] sm:justify-center sm:pt-0 sm:pb-0">
      {/* Orbiting logos — homepage only, hidden on mobile */}
      <div className="fixed pointer-events-none -z-10 opacity-50 hidden md:block md:bottom-0 md:left-0 md:-translate-x-1/3 md:translate-y-1/3 md:w-[500px] md:h-[500px]">
        <OrbitingLogos />
      </div>

      <div className="relative w-full max-w-3xl text-center">
        {/* Status line */}
        <div className="animate-fade-in-up mb-6 inline-flex flex-wrap items-center justify-center gap-2 font-mono text-xs tracking-wide text-muted-foreground sm:mb-8 sm:gap-3">
          <span className="scan-line relative overflow-hidden rounded-sm border border-foreground/10 bg-foreground/[0.03] px-2.5 py-1 uppercase">
            {platformEntries.length} launchpads
          </span>
          <span className="text-foreground/15" aria-hidden>
            /
          </span>
          <span className="rounded-sm border border-foreground/10 bg-foreground/[0.03] px-2.5 py-1 uppercase">
            4 chains
          </span>
          <span className="text-foreground/15" aria-hidden>
            /
          </span>
          <span className="inline-flex items-center gap-1.5 uppercase">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-foreground/30" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-foreground/50" />
            </span>
            live
          </span>
        </div>

        {/* Main heading — animated TrueFocus */}
        <h1 className="sr-only">Find unclaimed creator fees across 9 launchpads on Solana and Base</h1>
        <div aria-hidden="true" className="animate-fade-in-up delay-100 flex flex-col items-center gap-1 sm:gap-2">
          <div className="flex items-center justify-center gap-2 sm:gap-3">
            <span className="text-3xl font-black uppercase tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl">Track your</span>
            <MoneyFaceEmoji size={64} className="size-7 sm:size-10 md:size-14 lg:size-[72px]" />
          </div>
          <TrueFocus
            sentence="creator revenue"
            manualMode={false}
            blurAmount={1.5}
            borderColor="currentColor"
            animationDuration={0.4}
            pauseBetweenAnimations={1.5}
            className="text-3xl font-black uppercase tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl text-muted-foreground"
          />
        </div>

        <p className="animate-fade-in-up delay-200 mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:mt-6 sm:text-xl">
          Paste any @handle or wallet. See what you&apos;ve earned, claimed, and left on the table across {platformEntries.length} launchpads.
        </p>

        {/* Search bar */}
        <div className="animate-fade-in-up delay-300 mx-auto mt-6 w-full max-w-xl sm:mt-10">
          <SearchBar size="lg" />
        </div>

        {/* Platforms + Stats */}
        <div className="animate-fade-in-up delay-500 mx-auto mt-8 max-w-2xl sm:mt-16">
          {/* Platform pills */}
          <div className="flex flex-wrap justify-center gap-1.5">
            {platformEntries.map(([key, p]) => (
              <span
                key={key}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: p.color }}
                  aria-hidden
                />
                <PlatformIcon platform={key} className="h-3 w-3 opacity-50" aria-hidden />
                <span>{p.name}</span>
              </span>
            ))}
          </div>
          {/* Value prop strip — compact to not compete with hero heading */}
          <div className="shimmer mt-4 overflow-hidden rounded-2xl border border-foreground/[0.08] glass-strong">
            <div className="grid grid-cols-3 divide-x divide-foreground/[0.08]">
              <div className="px-2 py-3 sm:px-4 sm:py-5 text-center">
                <p className="text-xl font-black tabular-nums tracking-tighter sm:text-2xl md:text-3xl text-foreground">$0</p>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground sm:text-xs">Always Free</p>
              </div>
              <div className="px-2 py-3 sm:px-4 sm:py-5 text-center">
                <p className="text-xl font-black tabular-nums tracking-tighter sm:text-2xl md:text-3xl text-foreground">&lt;30s</p>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground sm:text-xs">Full Scan</p>
              </div>
              <div className="px-2 py-3 sm:px-4 sm:py-5 text-center">
                <p className="text-xl font-black tabular-nums tracking-tighter sm:text-2xl md:text-3xl text-foreground">~40%</p>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground sm:text-xs">Left Behind</p>
              </div>
            </div>
          </div>

          {/* LW ARTS attribution */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-1 font-mono text-xs tracking-wide text-muted-foreground/60">
            <span>Built by</span>
            <a
              href="https://lwdesigns.art"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-1.5 py-3 text-muted-foreground/80 underline decoration-foreground/10 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/30"
            >
              LW ARTS
            </a>
            <span>&middot;</span>
            <Link
              href="/docs"
              className="inline-flex items-center px-1.5 py-3 text-muted-foreground/80 underline decoration-foreground/10 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/30"
            >
              Docs
            </Link>
            <span>&middot;</span>
            <a
              href="https://x.com/lwartss"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-2.5 py-3 text-muted-foreground/80 underline decoration-foreground/10 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/30"
              aria-label="LW ARTS on X"
            >
              X
            </a>
            <span>&middot;</span>
            <a
              href="https://t.me/lwarts"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-1.5 py-3 text-muted-foreground/80 underline decoration-foreground/10 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/30"
              aria-label="LW ARTS on Telegram"
            >
              Telegram
            </a>
          </div>
        </div>
      </div>
    </div>
    </HeroReveal>
  );
}
