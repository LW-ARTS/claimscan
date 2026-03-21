import type { Metadata } from 'next';
import Link from 'next/link';
import { LazySection } from '../components/LazySection';

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

/* ── Helpers ── */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/50">
      {children}
    </span>
  );
}

/* ── Page ── */

export default function DocsPage() {
  return (
    <article className="mx-auto w-full max-w-[720px] px-5 pb-24">

      {/* ═══ HEADER ═══ */}
      <LazySection>
        <header className="pb-16 pt-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3.5 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-foreground/30" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-foreground/60" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/70">
              V1.5 &middot; Live
            </span>
          </div>
          <h1 className="mt-6 text-[clamp(2rem,5vw,2.75rem)] font-bold leading-[1.1] tracking-tight">
            How ClaimScan Works
          </h1>
          <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground">
            Architecture, security model, and roadmap for the cross-chain creator fee tracker.
          </p>
          <div className="mx-auto mt-8 h-px w-12 bg-foreground/15" />
        </header>
      </LazySection>

      {/* ═══ OVERVIEW ═══ */}
      <LazySection rootMargin="300px 0px">
        <section className="glass rounded-2xl p-6 sm:p-8">
          <Label>Overview</Label>
          <h2 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">
            One search. 9 launchpads. 2 chains.
          </h2>
          <p className="mt-4 text-[15px] leading-[1.75] text-foreground/70">
            You launched tokens. Platforms collected fees for you. But nobody told you where the money is.
            ClaimScan scans 9 launchpads across Solana and Base in real time, showing what you&apos;ve
            earned, what you&apos;ve claimed, and what&apos;s still sitting uncollected on-chain.
          </p>

          <div className="mt-8 grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
            {[
              { v: '9', l: 'Platforms' },
              { v: '2', l: 'Chains' },
              { v: '~40%', l: 'Unclaimed' },
              { v: '<30s', l: 'Scan' },
              { v: '$0', l: 'Cost' },
              { v: '24/7', l: 'Uptime' },
            ].map((s) => (
              <div key={s.l} className="flex flex-col items-center rounded-xl bg-foreground py-3.5 text-background transition-transform duration-200 hover:scale-105">
                <span className="text-xl font-bold tracking-tight">{s.v}</span>
                <span className="mt-0.5 text-[8px] font-semibold uppercase tracking-wider text-background/50">{s.l}</span>
              </div>
            ))}
          </div>
        </section>
      </LazySection>

      {/* ═══ PLATFORMS ═══ */}
      <LazySection rootMargin="250px 0px">
        <section className="mt-12">
          <Label>Supported Platforms</Label>
          <h2 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">
            9 platforms across Solana and Base
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Every major creator fee launchpad. More chains coming in V2.
          </p>

          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {/* Solana */}
            <div className="rounded-xl border border-foreground/[0.06] p-5 transition-shadow duration-200 hover:shadow-[0_2px_20px_-6px_rgba(0,0,0,0.08)]">
              <div className="mb-4 flex items-center justify-between">
                <span className="rounded-md bg-foreground px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-background">Solana</span>
                <span className="text-[10px] font-medium text-muted-foreground">6 platforms</span>
              </div>
              <div className="space-y-0 divide-y divide-foreground/[0.06]">
                {[
                  { name: 'Pump.fun', desc: 'Largest memecoin launchpad' },
                  { name: 'Bags.fm', desc: 'Social token trading' },
                  { name: 'Believe', desc: 'Community token launches' },
                  { name: 'RevShare', desc: 'Revenue sharing' },
                  { name: 'Coinbarrel', desc: 'Fast token launches' },
                  { name: 'Raydium', desc: 'DEX LP fee tracking' },
                ].map((p) => (
                  <div key={p.name} className="flex items-center justify-between py-2.5">
                    <span className="text-[13px] font-semibold">{p.name}</span>
                    <span className="text-[11px] text-muted-foreground">{p.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Base */}
            <div className="rounded-xl border border-foreground/[0.06] p-5 transition-shadow duration-200 hover:shadow-[0_2px_20px_-6px_rgba(0,0,0,0.08)]">
              <div className="mb-4 flex items-center justify-between">
                <span className="rounded-md bg-foreground px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-background">Base</span>
                <span className="text-[10px] font-medium text-muted-foreground">3 platforms</span>
              </div>
              <div className="space-y-0 divide-y divide-foreground/[0.06]">
                {[
                  { name: 'Clanker', desc: 'Farcaster launcher' },
                  { name: 'Zora', desc: 'Protocol rewards' },
                  { name: 'Bankr', desc: 'AI trading fee splits' },
                ].map((p) => (
                  <div key={p.name} className="flex items-center justify-between py-2.5">
                    <span className="text-[13px] font-semibold">{p.name}</span>
                    <span className="text-[11px] text-muted-foreground">{p.desc}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg bg-foreground/[0.03] px-3 py-2 text-[10px] text-muted-foreground">
                + ETH L1 (Zora live) · Arbitrum coming in V2
              </div>
            </div>
          </div>
        </section>
      </LazySection>

      {/* ═══ HOW IT WORKS ═══ */}
      <LazySection>
        <section className="mt-16">
          <Label>How it works</Label>
          <h2 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">
            From @handle to full breakdown in 30 seconds
          </h2>

          <ol className="relative mt-8 ml-3.5 border-l border-foreground/10 pl-0">
            {[
              { step: 'Enter a handle', desc: 'Twitter, Farcaster, GitHub username, or raw wallet address.' },
              { step: 'Identity resolution', desc: 'Social handles mapped to wallet addresses across both chains.' },
              { step: 'Parallel platform scan', desc: 'All 9 platforms queried simultaneously. Results stream in real time as each completes.' },
              { step: 'Fee aggregation', desc: 'Earned, claimed, partially claimed, and unclaimed fees pulled per token. Duplicates filtered.' },
              { step: 'USD conversion', desc: 'Live prices from multiple sources. Continuously refreshed.' },
              { step: 'Live dashboard', desc: 'Platform breakdown, chain breakdown, token-level details. Auto-refreshes in real time.' },
            ].map((s, i) => (
              <li key={i} className="relative mb-8 last:mb-0 pl-7">
                <span className="absolute -left-3.5 top-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-foreground text-[11px] font-bold tabular-nums text-background">
                  {i + 1}
                </span>
                <div className="pt-0.5">
                  <h3 className="text-[13px] font-bold">{s.step}</h3>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-6 rounded-lg border border-foreground/[0.06] bg-foreground/[0.02] px-4 py-3 text-[12px] text-foreground/60">
            All scanning is read-only. No wallet connection required. No signatures. No transaction risk.
          </div>
        </section>
      </LazySection>

      {/* ═══ CLAIMING ═══ */}
      <LazySection>
        <section className="mt-16">
          <Label>Claim Flow</Label>
          <h2 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">
            Claim directly from ClaimScan
          </h2>
          <p className="mt-4 text-[15px] leading-[1.75] text-foreground/70">
            Connect your wallet and claim uncollected fees without leaving the app. Fully zero-custody:
            transactions are built server-side, simulated before signing, and submitted to the chain.
            We never have access to your private keys.
          </p>

          <div className="relative mt-8 glass rounded-xl p-5">
            <div className="absolute left-[29px] top-[30px] bottom-[30px] w-px bg-foreground/10 sm:left-[33px]" />
            <div className="space-y-4">
              {[
                'API fetches your claimable positions from the platform',
                'Transaction built server-side and simulated on-chain',
                'You sign in your wallet (Phantom, Solflare, Backpack, etc.)',
                'Transaction submitted and confirmed in real time',
              ].map((text, i) => (
                <div key={i} className="relative flex items-start gap-3.5 text-[13px]">
                  <span className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-[9px] font-bold text-background">{i + 1}</span>
                  <span className="pt-[3px] text-foreground/80">{text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {['Bags.fm · Live', 'Clanker · Coming', 'Zora · Coming'].map((s) => (
              <span
                key={s}
                className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors duration-150 ${
                  s.includes('Live')
                    ? 'border-foreground/20 bg-foreground text-background'
                    : 'border-foreground/10 text-muted-foreground hover:border-foreground/20'
                }`}
              >
                {s}
              </span>
            ))}
          </div>
        </section>
      </LazySection>

      {/* ═══ ARCHITECTURE ═══ */}
      <LazySection>
        <section className="mt-16">
          <Label>Architecture</Label>
          <h2 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">
            Tech Stack
          </h2>

          <div className="mt-6 overflow-hidden rounded-xl border border-foreground/[0.06]">
            {[
              ['Frontend', 'React + Tailwind CSS'],
              ['Blockchain', 'Solana + EVM (Base)'],
              ['Database', 'SQL database with access controls'],
              ['Price Feeds', 'Multi-source price aggregation'],
              ['Identity', 'Social identity resolution across platforms'],
              ['Monitoring', 'Error tracking + analytics'],
              ['Deployment', 'Serverless infrastructure'],
              ['Typography', 'Exo 2 (headings) + JetBrains Mono'],
            ].map(([cat, tech], i) => (
              <div
                key={cat}
                className={`flex items-center gap-4 px-4 py-2.5 ${
                  i % 2 === 0 ? 'bg-foreground/[0.03]' : ''
                } ${i > 0 ? 'border-t border-foreground/[0.04]' : ''}`}
              >
                <span className="w-24 shrink-0 text-[10px] font-bold uppercase tracking-wider text-foreground/40">
                  {cat}
                </span>
                <span className="font-mono text-[12px] text-foreground/80">{tech}</span>
              </div>
            ))}
          </div>

          {/* ── Key decisions ── */}
          <div className="mt-12 flex items-center gap-3">
            <h3 className="text-sm font-bold">Key Architecture Decisions</h3>
            <div className="h-px flex-1 bg-foreground/[0.06]" />
          </div>

          <div className="mt-6 space-y-4">
            {[
              { area: 'Streaming', items: [
                ['Real-time updates', 'Platform results delivered as they complete. No waiting for all 9 to finish.'],
                ['Clean cancellation', 'Navigate away mid-scan and all in-flight requests cancel instantly.'],
              ]},
              { area: 'Performance', items: [
                ['Optimized routing', 'All routes tuned for fast execution with parallel fetching.'],
                ['Smart timeouts', 'Partial results returned instead of timeouts on slow platforms.'],
              ]},
              { area: 'Caching', items: [
                ['Multi-layer cache', 'Fee data cached across multiple layers. Fresh scans only trigger after expiry.'],
                ['Background indexing', 'Creator tokens pre-indexed so live scans resolve faster.'],
              ]},
              { area: 'Data', items: [
                ['Dynamic dust filter', 'Low-value positions filtered using live token prices.'],
                ['Large portfolios', 'Handles creators with hundreds of tokens without result limits.'],
              ]},
              { area: 'Claim System', items: [
                ['Zero-custody flow', 'Server builds unsigned transactions. You sign in your wallet. No private keys leave the browser.'],
                ['Pre-sign simulation', 'Every transaction simulated before wallet prompt. Catches errors before you sign.'],
                ['Verified requests', 'All claim requests cryptographically verified end-to-end.'],
                ['Wallet auto-discovery', 'Detects all Wallet Standard compatible wallets automatically.'],
                ['Real-time confirmation', 'Transaction status confirmed on-chain. No manual refresh needed.'],
              ]},
              { area: 'Infrastructure', items: [
                ['Rate limiting', 'Multiple layers of abuse prevention across all endpoints.'],
                ['Signal Lock animation', 'Custom loading UX with radar-style scan sequence. Responsive and reduced-motion friendly.'],
                ['Privacy-first', 'No raw PII stored. Searches anonymized before logging.'],
              ]},
            ].map((group) => (
              <div key={group.area} className="rounded-xl border border-foreground/[0.06] border-l-2 border-l-foreground/20 p-5 transition-shadow duration-200 hover:shadow-[0_2px_20px_-6px_rgba(0,0,0,0.06)]">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-foreground/40">
                  {group.area}
                </span>
                <div className="mt-3 space-y-2.5">
                  {group.items.map(([title, desc]) => (
                    <div key={title} className="text-[13px] leading-relaxed">
                      <strong className="font-semibold">{title}</strong>
                      <span className="text-muted-foreground"> · {desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </LazySection>

      {/* ═══ SECURITY ═══ */}
      <LazySection>
        <section className="mt-16">
          <div className="rounded-2xl bg-foreground p-6 sm:p-8">
            <Label><span className="text-background/40">Security &amp; Privacy</span></Label>
            <h2 className="mt-3 text-xl font-bold tracking-tight text-background sm:text-2xl">
              Trust model
            </h2>
            <p className="mt-4 text-[15px] leading-[1.75] text-background/55">
              We don&apos;t touch your wallet. We don&apos;t store your data.
              That&apos;s not a promise. It&apos;s the architecture.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {[
                { t: 'Private searches', d: 'Your search queries are never stored in readable form. Nobody can see who you looked up.' },
                { t: 'Server-side only', d: 'All sensitive operations run server-side. Nothing secret touches the browser.' },
                { t: 'Zero-custody claims', d: 'Transactions built server-side, simulated before signing, submitted by your wallet.' },
                { t: 'Signed requests', d: 'Every claim request is cryptographically verified end-to-end.' },
                { t: 'Tamper-proof claims', d: 'Claim states are immutable once finalized. No rollbacks, no overwrites.' },
                { t: 'On-chain verifiable', d: 'Every fee record and claim transaction independently verifiable on-chain.' },
              ].map((item) => (
                <div key={item.t} className="rounded-lg border border-background/10 bg-background/[0.05] p-4 transition-colors duration-200 hover:bg-background/[0.08]">
                  <h3 className="text-[13px] font-bold text-background">{item.t}</h3>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-background/45">{item.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </LazySection>

      {/* ═══ ROADMAP ═══ */}
      <LazySection>
        <section className="mt-16">
          <Label>Roadmap</Label>
          <h2 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">
            What&apos;s shipped &amp; what&apos;s next
          </h2>

          <div className="relative mt-8">
            {/* Timeline spine */}
            <div className="absolute left-[17px] top-0 bottom-0 w-px bg-foreground/10" />

            <div className="space-y-10">
              {/* V1 */}
              <div className="relative pl-12">
                <div className="absolute left-[9px] top-1 h-[18px] w-[18px] rounded-full border-2 border-background bg-foreground" />
                <div className="rounded-xl border border-foreground/[0.06] p-5">
                  <div className="flex items-center gap-3">
                    <span className="rounded-md bg-foreground px-2.5 py-1 text-[10px] font-bold text-background">V1.5</span>
                    <span className="text-[11px] font-medium text-muted-foreground">Current &middot; March 2026</span>
                  </div>
                  <div className="ml-1 mt-5 columns-1 gap-x-6 space-y-1.5 sm:columns-2">
                    {[
                      '9 platform support (Solana + Base)',
                      'Multi-identity search (Twitter, GitHub, Farcaster, Wallet)',
                      'Real-time streaming scan results',
                      'Signal Lock loading animation',
                      'Optimized serverless architecture',
                      'Smart caching with background indexing',
                      'Large portfolio support (no result limits)',
                      'Real-time fee polling with live updates',
                      'Multi-source USD price aggregation',
                      'Dynamic dust filtering',
                      'Bags.fm direct claim (zero-custody)',
                      'Pre-sign transaction simulation',
                      'Cryptographic claim verification',
                      'Wallet Standard auto-discovery',
                      'Real-time claim confirmation',
                      'Full claim audit trail',
                      'Rate limiting and abuse prevention',
                      'Privacy-preserving analytics',
                    ].map((item) => (
                      <div key={item} className="flex items-start gap-2.5 break-inside-avoid text-[12px] text-foreground/70">
                        <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/30" />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* V2 */}
              <div className="relative pl-12">
                <div className="absolute left-[9px] top-1 h-[18px] w-[18px] rounded-full border-2 border-foreground/20 bg-background" />
                <div className="rounded-xl border border-dashed border-foreground/10 p-5">
                  <div className="flex items-center gap-3">
                    <span className="rounded-md border border-foreground/20 px-2.5 py-1 text-[10px] font-bold">V2</span>
                    <span className="text-[11px] font-medium text-muted-foreground">Coming Soon</span>
                  </div>
                  <div className="ml-1 mt-5 space-y-1.5">
                    {[
                      'Token Fee Scanner (paste any contract address)',
                      'Fee recipient discovery (who gets paid)',
                      'Earnings breakdown (earned, claimed, unclaimed in USD)',
                      'Tri-state claim status (claimed, partial, unclaimed)',
                      'One-click claim expansion (Bags.fm live, Clanker & Zora next)',
                      'Additional chain support (full Ethereum L1, Arbitrum)',
                    ].map((item) => (
                      <div key={item} className="flex items-start gap-2.5 text-[12px] text-muted-foreground">
                        <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/15" />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* V3 */}
              <div className="relative pl-12">
                <div className="absolute left-[9px] top-1 h-[18px] w-[18px] rounded-full border-2 border-foreground/10 bg-background" />
                <div className="rounded-xl border border-dashed border-foreground/[0.06] p-5">
                  <div className="flex items-center gap-3">
                    <span className="rounded-md border border-foreground/10 px-2.5 py-1 text-[10px] font-bold text-muted-foreground">V3</span>
                    <span className="text-[11px] text-foreground/25">2026+</span>
                  </div>
                  <div className="ml-1 mt-5 space-y-1.5">
                    {[
                      'Automated claim scheduling',
                      'Creator analytics & insights dashboard',
                      'Portfolio dashboard for multi-creator agencies',
                      'SDK for platform integrations',
                    ].map((item) => (
                      <div key={item} className="flex items-start gap-2.5 text-[12px] text-foreground/30">
                        <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/10" />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </LazySection>

      {/* ═══ WHITEPAPER ═══ */}
      <LazySection>
        <section className="mt-16 flex items-center justify-between rounded-xl border border-foreground/[0.06] p-5 transition-shadow duration-200 hover:shadow-[0_2px_20px_-6px_rgba(0,0,0,0.06)]">
          <div>
            <Label>Reference</Label>
            <h3 className="mt-1.5 text-sm font-bold">V1.5 Whitepaper</h3>
          </div>
          <a
            href="/ClaimScan-Whitepaper-V1.pdf"
            download
            className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-xs font-bold text-background transition-opacity hover:opacity-80"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download PDF
          </a>
        </section>
      </LazySection>

      {/* ═══ TEAM ═══ */}
      <LazySection>
        <section className="mt-16">
          <Label>Team</Label>
          <h2 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">
            Built by LW
          </h2>
          <p className="mt-4 text-[15px] leading-[1.75] text-foreground/70">
            4-person Web3 studio. 408+ projects shipped. $1.6B+ market cap generated.
            Every build handled by the same team you talk to on Telegram.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { code: '2201', role: 'Brand' },
              { code: '2202', role: 'Frontend' },
              { code: '2203', role: 'Backend' },
              { code: '2204', role: 'Motion' },
            ].map((m) => (
              <div key={m.code} className="flex flex-col items-center rounded-xl border border-foreground/[0.06] py-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.08)]">
                <span className="font-mono text-[10px] font-bold text-muted-foreground">LW-{m.code}</span>
                <span className="mt-1 text-xs font-bold">{m.role}</span>
              </div>
            ))}
          </div>

          <div className="mt-8 flex items-center justify-center gap-8">
            {[
              { label: 'X', href: 'https://x.com/lwartss', text: '@lwartss' },
              { label: 'Telegram', href: 'https://t.me/lwarts', text: 't.me/lwarts' },
              { label: 'Website', href: 'https://lwdesigns.art', text: 'lwdesigns.art' },
            ].map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-center transition-opacity hover:opacity-70"
              >
                <span className="block text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{link.label}</span>
                <span className="mt-0.5 text-xs font-bold">{link.text}</span>
              </a>
            ))}
          </div>
        </section>
      </LazySection>

      {/* ═══ CTA ═══ */}
      <LazySection>
        <section className="mt-20 rounded-2xl bg-foreground py-14 text-center">
          <h2 className="text-xl font-bold tracking-tight text-background sm:text-2xl">
            Ready to find your money?
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-sm text-background/50">
            Enter your handle. See what you&apos;re owed. 30 seconds. Free forever.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-background px-6 py-3 text-sm font-bold text-foreground transition-all duration-200 hover:opacity-90 hover:shadow-[0_4px_20px_-4px_rgba(255,255,255,0.15)]"
          >
            Scan Now <span aria-hidden="true">&rarr;</span>
          </Link>
        </section>
      </LazySection>
    </article>
  );
}
