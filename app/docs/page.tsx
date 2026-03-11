import type { Metadata } from 'next';
import Link from 'next/link';
import { ScrollReveal } from '../components/ScrollReveal';

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

/* ── Data ── */

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

const toc = [
  { id: 'v2', label: 'V2 Roadmap' },
  { id: 'intro', label: 'Introduction' },
  { id: 'problem', label: 'The Problem' },
  { id: 'solution', label: 'The Solution' },
  { id: 'how', label: 'How It Works' },
  { id: 'platforms', label: 'Platforms' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'security', label: 'Security' },
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'team', label: 'Team' },
];

/* ── Components ── */

function SectionNum({ n }: { n: string }) {
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-foreground text-[10px] font-bold text-background">
      {n}
    </span>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-black/8 bg-white/[0.97] p-5 shadow-sm sm:p-6 ${className}`}>
      {children}
    </div>
  );
}

function InvertedCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl bg-foreground p-5 sm:p-6 ${className}`}>
      {children}
    </div>
  );
}

/* ── Page ── */

export default function DocsPage() {
  return (
    <div className="flex flex-col items-center gap-8 pb-16">
      {/* Header */}
      <div className="animate-fade-in w-full max-w-3xl text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
          V1 Documentation
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
          Documentation
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Architecture, roadmap, and what&apos;s coming next.
        </p>
      </div>

      {/* Table of Contents */}
      <ScrollReveal className="w-full max-w-3xl" delay={0.05}>
        <Card>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Contents
          </p>
          <div className="flex flex-wrap gap-2">
            {toc.map((item, i) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-foreground/30 hover:bg-muted/50"
              >
                <span className="text-[10px] text-muted-foreground/60">0{i + 1}</span>
                {item.label}
              </a>
            ))}
          </div>
        </Card>
      </ScrollReveal>

      {/* ─── V2 ROADMAP ─── */}
      <ScrollReveal className="w-full max-w-3xl" delay={0.1}>
        <div id="v2">
          <InvertedCard>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center rounded-md bg-background px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-foreground">
                V2
              </span>
              <h2 className="text-lg font-bold tracking-tight text-background sm:text-xl">
                Token Fee Scanner
              </h2>
              <span className="rounded-md border border-background/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-background/50">
                Coming Soon
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-background/60">
              Someone is collecting fees on every token you trade. Drop any Solana or Base contract address and find out who, how much, and whether the money has been claimed.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                { title: 'Who Gets Paid', desc: 'Paste a contract address. See which wallet collects the creator fees and trace their on-chain identity.' },
                { title: 'How Much', desc: 'Earned, claimed, and unclaimed. Every number in native tokens with live USD conversion.' },
                { title: 'Claim Status', desc: 'Three states: Claimed (fully collected), Partial (some collected, some remaining), and Unclaimed (nothing claimed yet).' },
              ].map((item) => (
                <div key={item.title} className="rounded-lg border border-background/10 bg-background/5 p-3.5">
                  <h3 className="text-xs font-bold text-background">{item.title}</h3>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-background/50">{item.desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-lg border border-background/10 bg-background/5 p-3.5">
              <h3 className="text-xs font-bold text-background">Claim From Here</h3>
              <p className="mt-1.5 text-[11px] leading-relaxed text-background/50">
                Connect your wallet and claim all your uncollected fees in one place. No more jumping between 10 different platforms.
              </p>
            </div>

            <div className="mt-4 flex items-center gap-2 text-[11px] text-background/40">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-background/30" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-background/50" />
              </span>
              In development. Solana and Base.
            </div>
          </InvertedCard>
        </div>
      </ScrollReveal>

      {/* ─── WHITEPAPER DOWNLOAD ─── */}
      <ScrollReveal className="w-full max-w-3xl">
        <Card className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center rounded-md border border-border/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              V1
            </span>
            <span className="text-sm font-bold">Whitepaper</span>
          </div>
          <a
            href="/ClaimScan-Whitepaper-V1.pdf"
            download
            className="inline-flex items-center gap-2 rounded-lg bg-foreground px-3.5 py-2 text-xs font-semibold text-background transition-opacity hover:opacity-90"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download PDF
          </a>
        </Card>
      </ScrollReveal>

      {/* Content sections */}
      <div className="w-full max-w-3xl space-y-8">

        {/* ── 01: Introduction ── */}
        <ScrollReveal>
          <Card>
            <div id="intro" className="space-y-5">
              <div className="flex items-center gap-3">
                <SectionNum n="01" />
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl">What is ClaimScan?</h2>
              </div>

              <p className="text-sm leading-relaxed text-muted-foreground">
                You launched tokens. Platforms collected fees for you. But nobody told you where the money went. ClaimScan scans 9 launchpads across Solana and Base in real time, showing you exactly how much you&apos;ve earned, what you&apos;ve claimed, and what&apos;s still sitting uncollected on-chain.
              </p>

              <div className="rounded-lg border-l-[3px] border-foreground bg-muted/40 px-4 py-3 text-sm italic text-muted-foreground">
                &ldquo;Your money is already on-chain. ClaimScan tells you where.&rdquo;
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {[
                  { value: '9', label: 'Platforms' },
                  { value: '2', label: 'Chains' },
                  { value: '~40%', label: 'Go Unclaimed' },
                  { value: '<30s', label: 'Scan Time' },
                  { value: '$0', label: 'Always Free' },
                  { value: '24/7', label: 'Always Live' },
                ].map((stat, i) => (
                  <div
                    key={stat.label}
                    className={`flex flex-col items-center justify-center rounded-lg py-3.5 text-center ${
                      i < 3 ? 'bg-foreground text-background' : 'border border-border/60'
                    }`}
                  >
                    <span className="text-lg font-bold tracking-tight sm:text-xl">{stat.value}</span>
                    <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider opacity-50">{stat.label}</span>
                  </div>
                ))}
              </div>

              <p className="text-sm leading-relaxed text-muted-foreground">
                Whether you launched on Pump.fun last week or Clanker six months ago. Enter your handle or wallet address and see exactly what&apos;s waiting for you. No signups. No wallet connection. Just answers.
              </p>
            </div>
          </Card>
        </ScrollReveal>

        {/* ── 02: The Problem ── */}
        <ScrollReveal>
          <Card>
            <div id="problem" className="space-y-5">
              <div className="flex items-center gap-3">
                <SectionNum n="02" />
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl">The Creator Fee Problem</h2>
              </div>

              <p className="text-sm leading-relaxed text-muted-foreground">
                You launched a token on Pump.fun. A few on Clanker. Maybe one on Believe. Each platform deposited creator fees into different wallets, on different chains. You claimed some. You forgot about others. Some you never knew existed.
              </p>

              <div className="space-y-2">
                {[
                  { title: 'Fragmented Dashboards', desc: '9 platforms. 9 different dashboards. 9 different login flows. No creator checks all of them.' },
                  { title: 'Cross-Chain Complexity', desc: 'Solana and Base use different wallets, explorers, and token standards. Two separate workflows just to see what you\'re owed.' },
                  { title: 'Identity Sprawl', desc: 'Your Twitter handle, Farcaster account, 0x wallet, Solana address. All disconnected. No tool connects the dots.' },
                ].map((item) => (
                  <div key={item.title} className="rounded-lg border border-border/40 border-l-[3px] border-l-foreground p-3.5">
                    <h3 className="text-xs font-bold">{item.title}</h3>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{item.desc}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg bg-foreground px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-background">
                Result: creator fees sitting unclaimed across DeFi. Yours included.
              </div>
            </div>
          </Card>
        </ScrollReveal>

        {/* ── Inline CTA ── */}
        <ScrollReveal>
          <div className="flex flex-col items-center gap-3 rounded-xl border border-black/8 bg-white/[0.97] py-6 text-center shadow-sm">
            <p className="text-sm font-semibold">Think you might have unclaimed fees?</p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-sm font-bold text-background transition-opacity hover:opacity-90"
            >
              Scan Your Handle <span aria-hidden="true">&rarr;</span>
            </Link>
            <p className="text-[11px] text-muted-foreground/50">Free. No signup. Takes 30 seconds.</p>
          </div>
        </ScrollReveal>

        {/* ── 03: The Solution ── */}
        <ScrollReveal>
          <Card>
            <div id="solution" className="space-y-5">
              <div className="flex items-center gap-3">
                <SectionNum n="03" />
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl">How ClaimScan Solves It</h2>
              </div>

              <div className="space-y-2">
                {[
                  { title: 'One Search, All Platforms', desc: 'Type your @handle. ClaimScan queries all 9 platforms simultaneously in seconds.', dark: true },
                  { title: 'Cross-Chain Aggregation', desc: 'Solana and Base in one view. No chain switching, no separate dashboards.', dark: false },
                  { title: 'Real-Time Tracking', desc: 'Live polling every 30 seconds. Leave the tab open. Numbers update automatically.', dark: true },
                  { title: 'Identity Resolution', desc: 'Enter a Twitter handle → wallets found. Farcaster name → all chains mapped.', dark: false },
                  { title: 'USD Valuation', desc: 'Live prices from CoinGecko, DexScreener, and Jupiter. Updated every 5 minutes.', dark: true },
                  { title: 'Zero Cost', desc: 'Free. Not freemium. We built ClaimScan as an internal tool and opened it up.', dark: false },
                ].map((item) => (
                  <div
                    key={item.title}
                    className={`rounded-lg p-3.5 ${
                      item.dark ? 'bg-foreground' : 'border border-border/50'
                    }`}
                  >
                    <h3 className={`text-xs font-bold ${item.dark ? 'text-background' : ''}`}>{item.title}</h3>
                    <p className={`mt-1 text-[11px] leading-relaxed ${item.dark ? 'text-background/60' : 'text-muted-foreground'}`}>
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </ScrollReveal>

        {/* ── 04: How It Works ── */}
        <ScrollReveal>
          <Card>
            <div id="how" className="space-y-5">
              <div className="flex items-center gap-3">
                <SectionNum n="04" />
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl">How It Works</h2>
              </div>

              <p className="text-sm text-muted-foreground">
                From @handle to full fee breakdown in under 30 seconds.
              </p>

              <div className="relative space-y-0 pl-10">
                <div className="absolute left-[15px] top-3 bottom-3 w-px border-l border-dashed border-border" />

                {[
                  { title: 'You Enter a Handle', desc: 'Twitter handle, Farcaster name, GitHub username, or raw wallet address.' },
                  { title: 'We Find Your Wallets', desc: 'Your social identity gets resolved to wallet addresses across both chains.' },
                  { title: 'All 9 Platforms Scanned', desc: 'Every supported launchpad queried simultaneously. No manual checking.' },
                  { title: 'Fees Collected & Organized', desc: 'Earned, claimed, partially claimed, and unclaimed fees pulled for every token. Duplicates filtered.' },
                  { title: 'Converted to USD', desc: 'Live price feeds turn raw token amounts into real dollar figures.' },
                  { title: 'Live Dashboard Ready', desc: 'Platform breakdown, chain breakdown, token-level details, updating every 30s.' },
                ].map((step, i) => (
                  <div key={i} className="relative flex gap-4 pb-5 last:pb-0">
                    <div className="absolute -left-10 flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-background">
                      {i + 1}
                    </div>
                    <div>
                      <h3 className="text-xs font-bold">{step.title}</h3>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border-l-2 border-foreground bg-muted/40 px-4 py-2.5 text-[11px] text-muted-foreground">
                All scanning is read-only. No wallet connection. No signatures. No transaction risk.
              </div>
            </div>
          </Card>
        </ScrollReveal>

        {/* ── 05: Supported Platforms ── */}
        <ScrollReveal>
          <Card>
            <div id="platforms" className="space-y-5">
              <div className="flex items-center gap-3">
                <SectionNum n="05" />
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Supported Platforms</h2>
              </div>

              <p className="text-sm text-muted-foreground">
                9 platforms across 2 blockchains. More coming in V2.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Solana */}
                <div>
                  <div className="mb-2 flex items-center justify-between rounded-lg bg-foreground px-3 py-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-background">Solana</span>
                    <span className="text-[10px] font-medium text-background/50">6 Platforms</span>
                  </div>
                  <div className="divide-y divide-border/30">
                    {solanaPlatforms.map((p) => (
                      <div key={p.name} className="flex items-center gap-3 py-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
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
                  <div className="mb-2 flex items-center justify-between rounded-lg bg-foreground px-3 py-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-background">Base</span>
                    <span className="text-[10px] font-medium text-background/50">3 Platforms</span>
                  </div>
                  <div className="divide-y divide-border/30">
                    {basePlatforms.map((p) => (
                      <div key={p.name} className="flex items-center gap-3 py-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                        <div>
                          <span className="text-xs font-semibold">{p.name}</span>
                          <span className="ml-2 text-[10px] text-muted-foreground">{p.desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 rounded-lg bg-muted/40 p-2.5 text-[10px] text-muted-foreground">
                    + More platforms coming in V2. Ethereum L1, Arbitrum, and more.
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </ScrollReveal>

        {/* ── 06: Architecture ── */}
        <ScrollReveal>
          <Card>
            <div id="architecture" className="space-y-5">
              <div className="flex items-center gap-3">
                <SectionNum n="06" />
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Architecture & Tech Stack</h2>
              </div>

              <div className="overflow-hidden rounded-lg border border-border/40">
                {techStack.map((row, i) => (
                  <div
                    key={row.category}
                    className={`flex items-center gap-4 px-4 py-2.5 ${
                      i % 2 === 0 ? 'bg-muted/30' : ''
                    } ${i < techStack.length - 1 ? 'border-b border-border/20' : ''}`}
                  >
                    <span className="w-24 shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {row.category}
                    </span>
                    <span className="font-mono text-xs text-foreground/80">{row.tech}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-lg bg-muted/30 p-4">
                <h3 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Database Schema</h3>
                <pre className="font-mono text-[11px] leading-relaxed text-foreground/70">
{`creators  →  wallets  →  fee_records
    |            |            |
identity     blockchain    per-token fees
resolution   addresses     & USD values`}
                </pre>
              </div>

              <div>
                <h3 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Key Architecture Decisions</h3>
                <div className="space-y-2">
                  {[
                    { title: 'In-flight deduplication', desc: 'Prevents duplicate API calls for concurrent requests to the same creator.' },
                    { title: '30-second timeout', desc: 'All resolve operations timeout gracefully for serverless environments.' },
                    { title: '40-minute cache TTL', desc: 'Creator and fee data cached in Supabase. Fresh scans only trigger after TTL expires.' },
                    { title: 'Dynamic dust filter', desc: 'Positions below $15 in unclaimed fees are skipped during claimed-amount computation. The threshold uses live SOL price from CoinGecko, adjusting automatically as prices change.' },
                    { title: 'Multi-key API rotation', desc: '10 API keys from separate accounts enable 10,000 requests/hour with round-robin rotation and per-key rate limit tracking.' },
                    { title: 'Batched concurrency', desc: 'API requests processed in batches of 40 to avoid connection overload on both bags.fm and Vercel.' },
                    { title: 'Visibility-aware polling', desc: 'Live polling stops when the browser tab is hidden, resuming on focus.' },
                    { title: 'Privacy-first logging', desc: 'All search queries SHA256-hashed before storage. No raw PII stored.' },
                  ].map((item) => (
                    <div key={item.title} className="flex gap-2 text-xs">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
                      <span className="leading-relaxed text-muted-foreground">
                        <strong className="text-foreground">{item.title}</strong> &mdash; {item.desc}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </ScrollReveal>

        {/* ── 07: Security & Privacy ── */}
        <ScrollReveal>
          <div id="security">
            <InvertedCard>
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-background text-[10px] font-bold text-foreground">
                    07
                  </span>
                  <h2 className="text-xl font-bold tracking-tight text-background sm:text-2xl">Security & Privacy</h2>
                </div>

                <p className="text-sm italic text-background/50">
                  We don&apos;t touch your wallet. We don&apos;t store your data. That&apos;s not a promise. It&apos;s the architecture.
                </p>

                <div className="space-y-2">
                  {[
                    { title: 'Your Searches Stay Private', desc: 'All search queries are SHA256 hashed before logging. Nobody can see who you looked up.' },
                    { title: 'Nothing Runs in Your Browser', desc: 'All sensitive operations run server-side. API keys never touch the client.' },
                    { title: 'No Wallet Connection', desc: '100% read-only. No signatures. No approvals. Zero transaction risk.' },
                    { title: 'No Data Collected', desc: 'No personal data. No cookies. No tracking pixels. Just anonymized, hashed analytics.' },
                    { title: 'Verify On-Chain', desc: 'Every fee record can be independently verified on the blockchain. Nothing is fabricated.' },
                  ].map((item) => (
                    <div key={item.title} className="rounded-lg border border-background/10 border-l-[3px] border-l-background/30 p-3.5">
                      <h3 className="text-xs font-bold text-background">{item.title}</h3>
                      <p className="mt-1 text-[11px] leading-relaxed text-background/45">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </InvertedCard>
          </div>
        </ScrollReveal>

        {/* ── 08: Roadmap ── */}
        <ScrollReveal>
          <Card>
            <div id="roadmap" className="space-y-5">
              <div className="flex items-center gap-3">
                <SectionNum n="08" />
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl">What&apos;s Next</h2>
              </div>

              <div className="space-y-3">
                {/* V1 */}
                <div className="rounded-lg bg-foreground p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-background">V1</span>
                    <span className="text-[10px] uppercase tracking-wider text-background/40">Current &middot; March 2025</span>
                  </div>
                  <ul className="mt-3 space-y-1">
                    {[
                      '9 platform support (Solana + Base)',
                      'Multi-identity search (Twitter, GitHub, Farcaster, Wallet)',
                      'Real-time fee polling with 30s intervals',
                      'USD conversion with live price feeds',
                      'Dynamic dust filtering ($15 threshold)',
                      'Multi-key API rotation (10,000 req/hr)',
                      'Privacy-preserving analytics (SHA256 hashed)',
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-2 text-[11px] text-background/60">
                        <span className="text-[#00D4AA]">&gt;</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* V2 */}
                <div className="rounded-lg border-2 border-foreground p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold">V2</span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Coming Soon</span>
                  </div>
                  <ul className="mt-3 space-y-1">
                    {[
                      'Token Fee Scanner (paste any contract address)',
                      'Fee recipient discovery (who gets paid)',
                      'Earnings breakdown (earned, claimed, unclaimed in USD)',
                      'Tri-state claim status (claimed, partial, unclaimed)',
                      'One-click claim across all platforms',
                      'Additional chain support (Ethereum L1, Arbitrum)',
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="text-muted-foreground/40">&rarr;</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* V3 */}
                <div className="rounded-lg bg-muted/30 p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-muted-foreground/50">V3</span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground/40">2026+</span>
                  </div>
                  <ul className="mt-3 space-y-1">
                    {[
                      'Automated claim scheduling',
                      'Creator analytics & insights dashboard',
                      'Portfolio dashboard for multi-creator agencies',
                      'SDK for platform integrations',
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-2 text-[11px] text-muted-foreground/50">
                        <span className="text-muted-foreground/30">&rarr;</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <p className="text-center text-sm font-bold">This is V1. We&apos;re just getting started.</p>
            </div>
          </Card>
        </ScrollReveal>

        {/* ── 09: Team ── */}
        <ScrollReveal>
          <Card>
            <div id="team" className="space-y-5">
              <div className="flex items-center gap-3">
                <SectionNum n="09" />
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Built by LW</h2>
              </div>

              <p className="text-sm leading-relaxed text-muted-foreground">
                4-person Web3 studio. 408+ projects shipped. Every build handled by the same team you talk to on Telegram. No layers, no outsourcing.
              </p>

              <div className="rounded-lg border-l-[3px] border-foreground bg-muted/40 px-4 py-3 text-sm italic text-muted-foreground">
                &ldquo;We built ClaimScan because we needed it. Then we opened it to everyone.&rdquo;
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col items-center justify-center rounded-lg bg-foreground py-3.5 text-center">
                  <span className="text-lg font-bold text-background">408+</span>
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-background/50">Projects Delivered</span>
                </div>
                <div className="flex flex-col items-center justify-center rounded-lg bg-foreground py-3.5 text-center">
                  <span className="text-lg font-bold text-background">$1.6B+</span>
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-background/50">Market Cap Generated</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { code: 'LW-2201', role: 'Branding Specialist', desc: 'Brand psychology, logos, visual identity' },
                  { code: 'LW-2202', role: 'Frontend Developer', desc: 'Websites, dApps, bots, dashboards' },
                  { code: 'LW-2203', role: 'Backend Engineer', desc: 'APIs, databases, contract integrations' },
                  { code: 'LW-2204', role: 'Motion Designer', desc: 'Promo videos, animated logos, TGS stickers' },
                ].map((m) => (
                  <div key={m.code} className="rounded-lg border border-border/40 p-3">
                    <span className="inline-block rounded bg-foreground px-1.5 py-0.5 font-mono text-[9px] font-bold text-background">
                      {m.code}
                    </span>
                    <h3 className="mt-1.5 text-xs font-bold">{m.role}</h3>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{m.desc}</p>
                  </div>
                ))}
              </div>

              <div className="h-px w-full bg-border" />

              <div className="grid grid-cols-3 gap-3 text-center">
                <a href="https://x.com/lwartss" target="_blank" rel="noopener noreferrer" className="group">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">X / Twitter</span>
                  <p className="mt-0.5 text-xs font-semibold group-hover:underline">@lwartss</p>
                </a>
                <a href="https://t.me/lwarts" target="_blank" rel="noopener noreferrer" className="group">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">Telegram</span>
                  <p className="mt-0.5 text-xs font-semibold group-hover:underline">t.me/lwarts</p>
                </a>
                <a href="https://lwdesigns.art" target="_blank" rel="noopener noreferrer" className="group">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">Website</span>
                  <p className="mt-0.5 text-xs font-semibold group-hover:underline">lwdesigns.art</p>
                </a>
              </div>
            </div>
          </Card>
        </ScrollReveal>

        {/* ── Final CTA ── */}
        <ScrollReveal>
          <InvertedCard className="flex flex-col items-center gap-4 py-10 text-center">
            <h2 className="text-xl font-bold tracking-tight text-background sm:text-2xl">
              Ready to find your money?
            </h2>
            <p className="max-w-md text-sm text-background/50">
              Enter your handle. See what you&apos;re owed. Takes 30 seconds.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg bg-background px-6 py-3 text-sm font-bold text-foreground transition-opacity hover:opacity-90"
            >
              Scan Now <span aria-hidden="true">&rarr;</span>
            </Link>
            <p className="text-[11px] text-background/25">Free forever. No wallet connection needed.</p>
          </InvertedCard>
        </ScrollReveal>
      </div>
    </div>
  );
}
