import type { Metadata } from 'next';
import { Montserrat } from 'next/font/google';
import { ScrollReveal } from '../components/ScrollReveal';

const montserrat = Montserrat({
  variable: '--font-subtitle',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ClaimScan Docs: Architecture & Roadmap',
  description:
    'ClaimScan documentation. V1 creator fee tracking across 9 launchpads. V2 roadmap: token contract lookup, fee recipient discovery, and claim status on Solana and Base.',
  openGraph: {
    title: 'ClaimScan Docs',
    description:
      'Architecture, security, and roadmap for the cross-chain DeFi fee tracker powering 9 launchpads.',
  },
  twitter: {
    card: 'summary_large_image' as const,
    title: 'ClaimScan Docs',
    description:
      'Architecture, security, and roadmap for the cross-chain DeFi fee tracker.',
  },
  alternates: {
    canonical: 'https://claimscan.tech/docs',
  },
};

/* ── Platform data ── */

const solanaPlatforms = [
  { name: 'Pump.fun', desc: 'Largest Solana memecoin launchpad', color: '#00D4AA' },
  { name: 'Bags.fm', desc: 'Social token trading with creator fees', color: '#FF6B35' },
  { name: 'Believe', desc: 'Community token launches with fee splits', color: '#E91E63' },
  { name: 'RevShare', desc: 'On-chain revenue sharing for token creators', color: '#4CAF50' },
  { name: 'Coinbarrel', desc: 'Fast token launches with built-in fees', color: '#FF8C00' },
  { name: 'Raydium', desc: 'Solana DEX, LP fee tracking', color: '#6C5CE7' },
];

const basePlatforms = [
  { name: 'Clanker', desc: 'Base-native memecoin launcher via Farcaster', color: '#0052FF' },
  { name: 'Zora', desc: 'Creator token minting with protocol rewards', color: '#5B5BD6' },
  { name: 'Bankr', desc: 'AI-powered trading with creator fee splits', color: '#1DA1F2' },
];

const techStack = [
  { category: 'FRONTEND', tech: 'Next.js 16 + React 19 + Tailwind CSS v4' },
  { category: 'BLOCKCHAIN', tech: '@solana/web3.js + viem (EVM/Base)' },
  { category: 'DATABASE', tech: 'Supabase (PostgreSQL)' },
  { category: 'PRICE FEEDS', tech: 'CoinGecko, DexScreener, Jupiter API' },
  { category: 'IDENTITY', tech: 'Neynar API (Farcaster), Twitter API' },
  { category: 'MONITORING', tech: 'Sentry error tracking' },
  { category: 'DEPLOYMENT', tech: 'Vercel Edge Network' },
  { category: 'TYPOGRAPHY', tech: 'Exo 2 (headings) + JetBrains Mono' },
];

/* ── Components ── */

function SectionLabel({ num }: { num: string }) {
  return (
    <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/40">
      Section {num}
    </span>
  );
}

function SectionTitle({ lines }: { lines: string[] }) {
  return (
    <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
      {lines.map((l, i) => (
        <span key={i}>
          {l}
          {i < lines.length - 1 && <br />}
        </span>
      ))}
    </h2>
  );
}

function Divider() {
  return <div className="h-[2px] w-full bg-foreground/80" />;
}

function Quote({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="rounded-lg border-l-[3px] border-foreground bg-muted/30 px-4 py-3 text-sm italic leading-relaxed text-muted-foreground">
      {children}
    </blockquote>
  );
}

function StatBox({
  value,
  label,
  dark = false,
}: {
  value: string;
  label: string;
  dark?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-lg p-4 text-center ${
        dark
          ? 'bg-foreground text-background'
          : 'border border-border bg-card'
      }`}
    >
      <span className="text-2xl font-bold tracking-tight">{value}</span>
      <span className="mt-1 text-[10px] font-medium uppercase tracking-wider opacity-60">
        {label}
      </span>
    </div>
  );
}

/* ── Page ── */

export default function DocsPage() {
  return (
    <div className={`${montserrat.variable} flex flex-col items-center gap-10 pb-16`}>
      {/* Header */}
      <div className="animate-fade-in w-full max-w-4xl text-center">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Documentation
        </h1>
        <p className="mt-2 font-subtitle text-sm text-muted-foreground">
          Architecture, roadmap, and what&apos;s coming next
        </p>
      </div>

      {/* ─── V2 ROADMAP ─── */}
      <ScrollReveal className="w-full max-w-4xl" delay={0.1}>
        <div className="rounded-2xl border border-border/40 bg-card/50 p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center rounded-full bg-foreground px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-background">
              V2
            </span>
            <h2 className="text-lg font-bold tracking-tight sm:text-xl">
              Token Fee Scanner
            </h2>
            <span className="inline-flex items-center rounded-full border border-border/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
              Coming Soon
            </span>
          </div>
          <p className="mt-3 font-subtitle text-sm leading-relaxed text-muted-foreground">
            Someone is collecting fees on every token you trade. Drop any Solana or Base contract address and find out who, how much, and whether the money has been claimed.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border/30 bg-white/[0.02] p-4">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-muted-foreground/60" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <h3 className="text-sm font-semibold">Who Gets Paid</h3>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Paste a contract address. See which wallet collects the creator fees and trace their on-chain identity.
              </p>
            </div>

            <div className="rounded-xl border border-border/30 bg-white/[0.02] p-4">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-muted-foreground/60" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                <h3 className="text-sm font-semibold">How Much</h3>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Earned, claimed, and unclaimed. Every number in native tokens with live USD conversion.
              </p>
            </div>

            <div className="rounded-xl border border-border/30 bg-white/[0.02] p-4">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-muted-foreground/60" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                <h3 className="text-sm font-semibold">Claimed or Not</h3>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Check if the creator already collected their fees or if the money is still sitting on-chain.
              </p>
            </div>
          </div>

          {/* One-click claim */}
          <div className="mt-6 rounded-xl border border-border/30 bg-white/[0.02] p-4">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-muted-foreground/60" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3" />
              </svg>
              <h3 className="text-sm font-semibold">Claim From Here</h3>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Connect your wallet and claim all your uncollected fees in one place. No more jumping between 10 different platforms.
            </p>
          </div>

          <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground/50">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-foreground/30 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-foreground/50" />
            </span>
            In development. Solana and Base.
          </div>
        </div>
      </ScrollReveal>

      {/* ─── V1 WHITEPAPER (HTML) ─── */}
      <section className="w-full max-w-4xl">
        <ScrollReveal>
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              V1
            </span>
            <h2 className="text-lg font-bold tracking-tight sm:text-xl">
              Whitepaper
            </h2>
          </div>
          <a
            href="/ClaimScan-Whitepaper-V1.pdf"
            download
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:border-foreground/20 hover:text-foreground"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download PDF
          </a>
        </div>
        </ScrollReveal>

        <div className="space-y-10">

          {/* ── Section 01: Introduction ── */}
          <ScrollReveal>
          <div className="space-y-4">
            <SectionLabel num="01" />
            <SectionTitle lines={['What is', 'ClaimScan?']} />
            <Divider />
            <p className="font-subtitle text-sm leading-relaxed text-muted-foreground">
              You launched tokens. Platforms collected fees for you. But nobody told you where the money went. ClaimScan scans 9 launchpads across Solana and Base in real time, showing you exactly how much you&apos;ve earned, what you&apos;ve claimed, and what&apos;s still sitting uncollected on-chain.
            </p>
            <Quote>
              &ldquo;Your money is already on-chain. ClaimScan tells you where.&rdquo;
            </Quote>
            <div className="grid grid-cols-3 gap-3">
              <StatBox value="9" label="Platforms, One Search" dark />
              <StatBox value="2" label="Chains Unified" dark />
              <StatBox value="~40%" label="Fees Go Unclaimed*" dark />
              <StatBox value="<30s" label="Full Results" />
              <StatBox value="$0" label="No Fees, No Catch" />
              <StatBox value="24/7" label="Always Current" />
            </div>
            <p className="font-subtitle text-sm leading-relaxed text-muted-foreground">
              Whether you launched on Pump.fun last week or Clanker six months ago. Enter your handle or wallet address and see exactly what&apos;s waiting for you. No signups. No wallet connection. Just answers.
            </p>
          </div>
          </ScrollReveal>

          {/* ── Section 02: The Problem ── */}
          <ScrollReveal>
          <div className="space-y-4">
            <SectionLabel num="02" />
            <SectionTitle lines={['The Creator', 'Fee Problem']} />
            <Divider />
            <p className="font-subtitle text-sm leading-relaxed text-muted-foreground">
              You launched a token on Pump.fun. A few on Clanker. Maybe one on Believe. Each platform deposited creator fees into different wallets, on different chains. You claimed some. You forgot about others. Some you never knew existed. Right now, at this moment, your money is sitting unclaimed on-chain. And nobody is going to remind you.
            </p>

            <div className="space-y-3">
              {[
                {
                  title: 'Fragmented Dashboards',
                  desc: '9 platforms. 9 different dashboards. 9 different login flows. No creator checks all of them. Most check none. That\'s how fees expire unclaimed.',
                },
                {
                  title: 'Cross-Chain Complexity',
                  desc: 'Solana and Base use different wallets, explorers, and token standards. If you launched on both chains, you need two separate workflows just to see what you\'re owed.',
                },
                {
                  title: 'Identity Sprawl',
                  desc: 'Your Twitter handle, your Farcaster account, your 0x wallet, your Solana address. All disconnected. Platforms see fragments of you. No tool connects the dots to show you the full picture.',
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border/40 border-l-[3px] border-l-foreground p-4"
                >
                  <h3 className="text-sm font-semibold">{item.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-lg bg-foreground px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-background">
              The result: creator fees sitting unclaimed across DeFi. Yours included
            </div>
          </div>
          </ScrollReveal>

          {/* ── Inline CTA (post-problem) ── */}
          <ScrollReveal>
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border/30 bg-muted/20 py-6 text-center">
            <p className="text-sm font-medium">
              Think you might have unclaimed fees?
            </p>
            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
            >
              Scan Your Handle
              <span aria-hidden="true">&rarr;</span>
            </a>
            <p className="text-[11px] text-muted-foreground/50">
              Free. No signup. Takes 30 seconds.
            </p>
          </div>
          </ScrollReveal>

          {/* ── Section 03: The Solution ── */}
          <ScrollReveal>
          <div className="space-y-4">
            <SectionLabel num="03" />
            <SectionTitle lines={['How ClaimScan', 'Solves It']} />
            <Divider />

            <div className="space-y-2">
              {[
                {
                  title: 'One Search, All Platforms',
                  desc: 'Type your @handle. ClaimScan queries all 9 platforms simultaneously and shows you every fee across every chain in seconds.',
                  dark: true,
                },
                {
                  title: 'Cross-Chain Aggregation',
                  desc: 'Solana and Base in one view. No chain switching, no separate dashboards. Everything merged into a single results page.',
                  dark: false,
                },
                {
                  title: 'Real-Time Tracking',
                  desc: 'Live polling every 30 seconds catches new fees the moment they appear. Leave the tab open. Your numbers update automatically.',
                  dark: true,
                },
                {
                  title: 'Identity Resolution',
                  desc: 'Enter a Twitter handle and we find the wallets. Enter a Farcaster name and we map it to every chain. One identity in, all wallets out.',
                  dark: false,
                },
                {
                  title: 'USD Valuation',
                  desc: '"1,247 SOL earned" means nothing without context. ClaimScan converts everything to USD using live prices from CoinGecko, DexScreener, and Jupiter.',
                  dark: true,
                },
                {
                  title: 'Zero Cost, Zero Catch',
                  desc: 'Free. Not freemium. Not "free trial." We built ClaimScan as an internal tool and opened it to every creator in the ecosystem.',
                  dark: false,
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className={`rounded-lg p-4 ${
                    item.dark
                      ? 'bg-foreground text-background'
                      : 'border border-border bg-card'
                  }`}
                >
                  <h3 className={`text-sm font-semibold ${item.dark ? 'text-background' : ''}`}>
                    {item.title}
                  </h3>
                  <p className={`mt-1.5 text-xs leading-relaxed ${item.dark ? 'text-background/70' : 'text-muted-foreground'}`}>
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
          </ScrollReveal>

          {/* ── Section 04: How It Works ── */}
          <ScrollReveal>
          <div className="space-y-4">
            <SectionLabel num="04" />
            <SectionTitle lines={['How It', 'Works']} />
            <Divider />
            <p className="font-subtitle text-sm text-muted-foreground">
              From @handle to full fee breakdown in under 30 seconds.
            </p>

            <div className="relative space-y-0 pl-8">
              {/* Vertical line */}
              <div className="absolute left-[13px] top-4 bottom-4 w-px border-l border-dashed border-border/60" />

              {[
                { title: 'You Enter a Handle', desc: 'Twitter handle, Farcaster name, GitHub username, or raw wallet address. ClaimScan accepts all of them, even direct profile URLs.' },
                { title: 'We Find Your Wallets', desc: 'Your social identity gets resolved to wallet addresses automatically. One handle can unlock multiple wallets across both chains.' },
                { title: 'All 9 Platforms Scanned', desc: 'ClaimScan queries every supported launchpad on Solana and Base simultaneously. No manual checking. We hit them all at once.' },
                { title: 'Fees Collected & Organized', desc: 'Earned, claimed, and unclaimed fees are pulled for every token on every platform. Duplicates are filtered. Data is normalized.' },
                { title: 'Converted to USD', desc: 'Live price feeds from CoinGecko, DexScreener, and Jupiter turn raw token amounts into real dollar figures. Updated every 5 minutes.' },
                { title: 'Live Dashboard Ready', desc: 'Your results appear with platform breakdown, chain breakdown, token-level details, and claim status, updating every 30 seconds.' },
              ].map((step, i) => (
                <div key={i} className="relative flex gap-4 pb-6 last:pb-0">
                  <div className="absolute -left-8 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-background">
                    {i + 1}
                  </div>
                  <div className="pt-0.5">
                    <h3 className="text-sm font-semibold">{step.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {step.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border-l-2 border-foreground bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
              All scanning is read-only. No wallet connection. No signatures. No transaction risk.
            </div>
          </div>
          </ScrollReveal>

          {/* ── Section 05: Supported Platforms ── */}
          <ScrollReveal>
          <div className="space-y-4">
            <SectionLabel num="05" />
            <SectionTitle lines={['Supported', 'Platforms']} />
            <Divider />
            <p className="font-subtitle text-sm text-muted-foreground">
              9 platforms across 2 blockchains. More coming in V2.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Solana */}
              <div>
                <div className="mb-3 flex items-center justify-between rounded-lg bg-foreground px-3 py-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-background">Solana</span>
                  <span className="text-[10px] text-background/60">7 Platforms</span>
                </div>
                <div className="space-y-0 divide-y divide-border/30">
                  {solanaPlatforms.map((p) => (
                    <div key={p.name} className="flex items-center gap-3 py-2.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      <div>
                        <span className="text-xs font-semibold">{p.name}</span>
                        <span className="ml-2 text-[10px] text-muted-foreground">{p.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Base */}
              <div>
                <div className="mb-3 flex items-center justify-between rounded-lg bg-foreground px-3 py-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-background">Base</span>
                  <span className="text-[10px] text-background/60">3 Platforms</span>
                </div>
                <div className="space-y-0 divide-y divide-border/30">
                  {basePlatforms.map((p) => (
                    <div key={p.name} className="flex items-center gap-3 py-2.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      <div>
                        <span className="text-xs font-semibold">{p.name}</span>
                        <span className="ml-2 text-[10px] text-muted-foreground">{p.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-lg bg-muted/30 p-3 text-[10px] text-muted-foreground">
                  + More platforms coming in V2. Ethereum L1, Arbitrum, and more.
                </div>
              </div>
            </div>
          </div>
          </ScrollReveal>

          {/* ── Section 06: Architecture ── */}
          <ScrollReveal>
          <div className="space-y-4">
            <SectionLabel num="06" />
            <SectionTitle lines={['Architecture &', 'Tech Stack']} />
            <Divider />

            <div className="overflow-hidden rounded-lg border border-border/40">
              {techStack.map((row, i) => (
                <div
                  key={row.category}
                  className={`flex items-center gap-4 px-4 py-2.5 ${
                    i % 2 === 0 ? 'bg-muted/20' : ''
                  } ${i < techStack.length - 1 ? 'border-b border-border/20' : ''}`}
                >
                  <span className="w-28 shrink-0 text-[10px] font-bold uppercase tracking-wider">
                    {row.category}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {row.tech}
                  </span>
                </div>
              ))}
            </div>

            <div className="rounded-lg bg-muted/20 p-4">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider">Database Schema</h3>
              <pre className="font-mono text-[11px] leading-relaxed text-muted-foreground">
{`creators  →  wallets  →  fee_records
    |            |            |
identity     blockchain    per-token fees
resolution   addresses     & USD values`}
              </pre>
            </div>

            <div>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider">Key Architecture Decisions</h3>
              <ul className="space-y-2 text-xs leading-relaxed text-muted-foreground">
                <li className="flex gap-2">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
                  <span><strong className="text-foreground">In-flight deduplication</strong> prevents duplicate API calls for concurrent requests</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
                  <span><strong className="text-foreground">30-second timeout</strong> on all resolve operations for graceful serverless behavior</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
                  <span><strong className="text-foreground">5-minute cache TTL</strong> on creator and fee data for optimal performance</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
                  <span><strong className="text-foreground">Visibility-aware polling</strong> stops polling when the browser tab is hidden</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
                  <span><strong className="text-foreground">Privacy-first logging</strong> with SHA256 hashed search queries, no raw PII stored</span>
                </li>
              </ul>
            </div>
          </div>
          </ScrollReveal>

          {/* ── Section 07: Security & Privacy ── */}
          <ScrollReveal>
          <div className="space-y-4 rounded-2xl bg-foreground p-6 sm:p-8">
            <SectionLabel num="07" />
            <h2 className="text-xl font-bold tracking-tight text-background sm:text-2xl">
              Security &<br />Privacy
            </h2>
            <div className="h-[2px] w-full bg-background/20" />
            <p className="font-subtitle text-sm italic text-background/60">
              We don&apos;t touch your wallet. We don&apos;t store your data. That&apos;s not a promise. It&apos;s the architecture.
            </p>

            <div className="space-y-2">
              {[
                { title: 'Your Searches Stay Private', desc: 'All search queries are SHA256 hashed before logging. We never store raw search terms. Nobody can see who you looked up.' },
                { title: 'Nothing Runs in Your Browser', desc: 'All sensitive operations run server-side. API keys and credentials never touch the client. Your browser sees only the results.' },
                { title: 'No Wallet Connection Required', desc: 'ClaimScan is 100% read-only. No wallet signatures. No approvals. No blockchain write access. Zero transaction risk.' },
                { title: 'No Data Collected', desc: 'No personal data stored. No cookies. No tracking pixels. Just anonymized, hashed analytics. Privacy isn\'t a feature. It\'s how this works.' },
                { title: 'Verify Everything On-Chain', desc: 'Every fee record ClaimScan displays can be independently verified on the blockchain. We read directly from smart contracts. Nothing is fabricated.' },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-lg border border-background/10 border-l-[3px] border-l-background/40 p-4"
                >
                  <h3 className="text-xs font-semibold text-background">
                    {item.title}
                  </h3>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-background/50">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
          </ScrollReveal>

          {/* ── Section 08: Roadmap ── */}
          <ScrollReveal>
          <div className="space-y-4">
            <SectionLabel num="08" />
            <SectionTitle lines={["What's", 'Next']} />
            <Divider />

            <div className="space-y-3">
              {/* V1 */}
              <div className="rounded-lg bg-foreground p-5">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-background">V1</span>
                  <span className="text-[10px] uppercase tracking-wider text-background/50">
                    Current &middot; March 2026
                  </span>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {[
                    '9 platform support (Solana + Base)',
                    'Multi-identity search (Twitter, GitHub, Farcaster, Wallet)',
                    'Real-time fee polling with 30s intervals',
                    'USD conversion with live price feeds',
                    'Mobile-responsive design',
                    'Privacy-preserving search analytics',
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-xs text-background/70">
                      <span className="text-[#00D4AA]">&gt;</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* V2 */}
              <div className="rounded-lg border-2 border-foreground p-5">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold">V2</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Coming Soon
                  </span>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {[
                    'Token Fee Scanner (paste any contract address)',
                    'Fee recipient discovery (who gets paid)',
                    'Earnings breakdown (earned, claimed, unclaimed in USD)',
                    'Claim status checker (claimed or still on-chain)',
                    'One-click claim across all platforms from one place',
                    'Additional chain support (Ethereum L1, Arbitrum)',
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-muted-foreground/40">&rarr;</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* V3 */}
              <div className="rounded-lg bg-muted/30 p-5">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-muted-foreground/50">V3</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/40">
                    2026 &middot; Later
                  </span>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {[
                    'Automated claim scheduling',
                    'Creator analytics & insights dashboard',
                    'Portfolio dashboard for multi-creator agencies',
                    'SDK for platform integrations',
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-xs text-muted-foreground/50">
                      <span className="text-muted-foreground/30">&rarr;</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <p className="text-center text-sm font-semibold">
              This is V1. We&apos;re just getting started.
            </p>
          </div>
          </ScrollReveal>

          {/* ── Section 09: Team ── */}
          <ScrollReveal>
          <div className="space-y-4">
            <SectionLabel num="09" />
            <SectionTitle lines={['Built by', 'LW Team']} />
            <Divider />
            <p className="font-subtitle text-sm leading-relaxed text-muted-foreground">
              4-person Web3 studio. 408+ projects shipped. Every build handled by the same team you talk to on Telegram. No layers, no outsourcing.
            </p>
            <Quote>
              &ldquo;We built ClaimScan because we needed it. Then we opened it to everyone.&rdquo;
            </Quote>

            <div className="grid grid-cols-2 gap-3">
              <StatBox value="408+" label="Projects Delivered" dark />
              <StatBox value="$1.6B+" label="Market Cap Generated" dark />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { code: 'LW-2201', role: 'Branding Specialist', desc: 'Brand psychology, logos, visual identity' },
                { code: 'LW-2202', role: 'Frontend Developer', desc: 'Websites, dApps, bots, dashboards' },
                { code: 'LW-2203', role: 'Backend Engineer', desc: 'APIs, databases, contract integrations' },
                { code: 'LW-2204', role: 'Motion Designer', desc: 'Promo videos, animated logos, TGS stickers' },
              ].map((member) => (
                <div key={member.code} className="rounded-lg border border-border/40 p-3">
                  <span className="inline-block rounded bg-foreground px-1.5 py-0.5 font-mono text-[9px] font-bold text-background">
                    {member.code}
                  </span>
                  <h3 className="mt-2 text-xs font-semibold">{member.role}</h3>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{member.desc}</p>
                </div>
              ))}
            </div>

            <Divider />

            <div className="grid grid-cols-3 gap-3 text-center">
              <a href="https://x.com/lwartss" target="_blank" rel="noopener noreferrer" className="group">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40">
                  X / Twitter
                </span>
                <p className="mt-1 text-xs font-semibold group-hover:underline">@lwartss</p>
              </a>
              <a href="https://t.me/lwarts" target="_blank" rel="noopener noreferrer" className="group">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40">
                  Telegram
                </span>
                <p className="mt-1 text-xs font-semibold group-hover:underline">t.me/lwarts</p>
              </a>
              <a href="https://lwdesigns.art" target="_blank" rel="noopener noreferrer" className="group">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40">
                  Website
                </span>
                <p className="mt-1 text-xs font-semibold group-hover:underline">lwdesigns.art</p>
              </a>
            </div>
          </div>
          </ScrollReveal>

          {/* ── Final CTA ── */}
          <ScrollReveal>
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-foreground px-6 py-10 text-center">
            <h2 className="text-xl font-bold tracking-tight text-background sm:text-2xl">
              Ready to find your money?
            </h2>
            <p className="max-w-md text-sm text-background/60">
              Enter your handle. See what you&apos;re owed. Takes 30 seconds.
            </p>
            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-lg bg-background px-6 py-3 text-sm font-bold text-foreground transition-opacity hover:opacity-90"
            >
              Scan Now
              <span aria-hidden="true">&rarr;</span>
            </a>
            <p className="text-[11px] text-background/30">
              Free forever. No wallet connection needed.
            </p>
          </div>
          </ScrollReveal>

        </div>
      </section>
    </div>
  );
}
