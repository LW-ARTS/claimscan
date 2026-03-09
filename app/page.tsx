import Link from 'next/link';
import dynamic from 'next/dynamic';
import { SearchBar } from './components/SearchBar';
import { PlatformIcon } from './components/PlatformIcon';
import { PLATFORM_CONFIG } from '@/lib/constants';
import TrueFocus from './components/TrueFocus';
import { HeroReveal } from './components/HeroReveal';

// Lazy-load decorative / animation-heavy components (auto code-split)
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
    <div className="flex min-h-[calc(75vh-4rem)] flex-col items-center justify-center pt-8 sm:pt-0">
      {/* Orbiting logos — homepage only, hidden on mobile */}
      <div className="fixed pointer-events-none -z-10 opacity-50 hidden md:block md:bottom-0 md:left-0 md:-translate-x-1/3 md:translate-y-1/3 md:w-[500px] md:h-[500px]">
        <OrbitingLogos />
      </div>

      <div className="relative w-full max-w-3xl text-center">
        {/* Status line */}
        <div className="animate-fade-in-up mb-8 inline-flex items-center gap-3 font-mono text-xs tracking-wide text-muted-foreground">
          <span className="scan-line relative overflow-hidden rounded-sm border border-foreground/10 bg-foreground/[0.03] px-2.5 py-1 uppercase">
            {platformEntries.length} launchpads
          </span>
          <span className="text-foreground/15" aria-hidden>
            /
          </span>
          <span className="rounded-sm border border-foreground/10 bg-foreground/[0.03] px-2.5 py-1 uppercase">
            2 chains
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
        <div className="animate-fade-in-up delay-100 flex flex-col items-center gap-1 sm:gap-2">
          <div className="flex items-center justify-center gap-2 sm:gap-3">
            <span className="text-4xl font-black uppercase tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl">Track your</span>
            <MoneyFaceEmoji size={64} className="size-7 sm:size-10 md:size-14 lg:size-[72px]" />
          </div>
          <TrueFocus
            sentence="creator revenue"
            manualMode={false}
            blurAmount={3}
            borderColor="currentColor"
            animationDuration={0.4}
            pauseBetweenAnimations={1.5}
            className="text-4xl font-black uppercase tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl text-muted-foreground"
          />
        </div>

        <p className="animate-fade-in-up delay-200 mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
          Paste any @handle or wallet. See what you&apos;ve earned, claimed, and left on the table across 10 launchpads.
        </p>

        {/* Search bar */}
        <div className="animate-fade-in-up delay-300 mx-auto mt-10 w-full max-w-xl">
          <SearchBar size="lg" />
        </div>

        {/* Platforms + Stats */}
        <div className="animate-fade-in-up delay-500 mx-auto mt-10 sm:mt-16 max-w-2xl">
          {/* Platform pills — 5 per row */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex flex-wrap justify-center gap-1.5">
              {platformEntries.slice(0, 5).map(([key, p]) => (
                <span
                  key={key}
                  className="inline-flex cursor-default items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-all duration-200 hover:border-foreground/20 hover:text-foreground"
                >
                  <PlatformIcon platform={key} className="h-3 w-3 opacity-50" aria-hidden />
                  <span>{p.name}</span>
                </span>
              ))}
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {platformEntries.slice(5).map(([key, p]) => (
                <span
                  key={key}
                  className="inline-flex cursor-default items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-all duration-200 hover:border-foreground/20 hover:text-foreground"
                >
                  <PlatformIcon platform={key} className="h-3 w-3 opacity-50" aria-hidden />
                  <span>{p.name}</span>
                </span>
              ))}
            </div>
          </div>
          {/* Value prop strip */}
          <div className="shimmer mt-4 overflow-hidden rounded-2xl border border-foreground/[0.08] glass-strong">
            <div className="grid grid-cols-3 divide-x divide-foreground/[0.08]">
              <div className="px-2 py-4 sm:p-6 text-center">
                <p className="text-2xl font-black tabular-nums tracking-tighter sm:text-4xl md:text-5xl text-foreground">~40%</p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground sm:mt-1.5 sm:text-[10px]">Go Unclaimed</p>
              </div>
              <div className="px-2 py-4 sm:p-6 text-center">
                <p className="text-2xl font-black tabular-nums tracking-tighter sm:text-4xl md:text-5xl text-foreground">&lt;30s</p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground sm:mt-1.5 sm:text-[10px]">Scan Time</p>
              </div>
              <div className="px-2 py-4 sm:p-6 text-center">
                <p className="text-2xl font-black tabular-nums tracking-tighter sm:text-4xl md:text-5xl text-foreground">$0</p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground sm:mt-1.5 sm:text-[10px]">Always Free</p>
              </div>
            </div>
          </div>

          {/* LW ARTS attribution */}
          <p className="mt-6 font-mono text-[11px] tracking-wide text-muted-foreground/60">
            Built by{' '}
            <a
              href="https://lwdesigns.art"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground/80 underline decoration-foreground/10 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/30"
            >
              LW ARTS
            </a>
            {' '}&middot;{' '}
            <Link
              href="/docs"
              className="text-muted-foreground/80 underline decoration-foreground/10 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/30"
            >
              Docs
            </Link>
            {' '}&middot;{' '}
            <a
              href="https://x.com/lwartss"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground/80 underline decoration-foreground/10 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/30"
              aria-label="LW ARTS on X"
            >
              X
            </a>
            {' '}&middot;{' '}
            <a
              href="https://t.me/lwarts"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground/80 underline decoration-foreground/10 underline-offset-2 transition-colors hover:text-foreground hover:decoration-foreground/30"
              aria-label="LW ARTS on Telegram"
            >
              Telegram
            </a>
          </p>
        </div>
      </div>
    </div>
    </HeroReveal>
  );
}
