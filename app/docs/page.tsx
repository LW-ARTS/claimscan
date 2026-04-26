import type { Metadata } from 'next';
import Link from 'next/link';
import { DocsSidebar } from '../components/DocsSidebar';
import { RevealMount } from '../components/anim/RevealMount';

export const metadata: Metadata = {
  title: 'API Reference & Guides | ClaimScan',
  description:
    'Complete API reference for ClaimScan. Track creator fees across 11 launchpads on Solana, Base, Ethereum, and BNB Chain.',
  openGraph: {
    title: 'API Reference & Guides | ClaimScan',
    description:
      'Complete API reference for ClaimScan. Track creator fees across 11 launchpads on Solana, Base, Ethereum, and BNB Chain.',
    images: [
      {
        url: 'https://claimscan.tech/og-docs.png',
        width: 1200,
        height: 630,
        alt: 'ClaimScan API Reference & Guides',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image' as const,
    title: 'API Reference & Guides | ClaimScan',
    description:
      'Complete API reference for ClaimScan. Track creator fees across 11 launchpads on Solana, Base, Ethereum, and BNB Chain.',
    images: [
      {
        url: 'https://claimscan.tech/og-docs.png',
        alt: 'ClaimScan API Reference & Guides',
      },
    ],
  },
  alternates: {
    canonical: 'https://claimscan.tech/docs',
  },
};

export default function DocsPage() {
  const faqData = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FAQPage',
        '@id': 'https://claimscan.tech/docs#faq',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'How does ClaimScan work?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Paste a social handle or wallet address. ClaimScan resolves it to wallets and scans 11 platforms across Solana, Base, Ethereum, and BNB Chain in parallel, showing earned, claimed, and unclaimed fees in real time.',
            },
          },
          {
            '@type': 'Question',
            name: 'What platforms does ClaimScan support?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'ClaimScan supports 11 platforms: Pump.fun, Bags.fm, Believe, RevShare, Coinbarrel, and Raydium on Solana, plus Clanker, Zora, Bankr, and Flaunch on Base/ETH, and Flap on BSC.',
            },
          },
          {
            '@type': 'Question',
            name: 'Is ClaimScan free?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Yes. Scanning, viewing fee data, and the leaderboard are completely free. No API key needed. V2 paid endpoints for developers and agents use pay-per-query pricing via the x402 protocol.',
            },
          },
          {
            '@type': 'Question',
            name: 'How do I claim fees?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Connect your wallet on a profile page and click Claim on eligible unclaimed fees. ClaimScan builds the transaction server-side, simulates it, and you sign in your wallet. Currently live for Bags.fm with others coming soon.',
            },
          },
          {
            '@type': 'Question',
            name: 'Is ClaimScan safe?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Yes. Scanning is fully read-only. Claims are zero-custody. Transactions are built server-side with pre-sign simulation. ClaimScan never has access to your private keys.',
            },
          },
        ],
      },
      {
        '@type': 'HowTo',
        '@id': 'https://claimscan.tech/docs#howto',
        name: 'How to check unclaimed crypto creator fees',
        description: 'Use ClaimScan to find and claim uncollected creator fees across 11 DeFi launchpads on Solana, Base, and BNB Chain in under 30 seconds.',
        totalTime: 'PT30S',
        tool: { '@type': 'HowToTool', name: 'ClaimScan' },
        step: [
          { '@type': 'HowToStep', position: 1, name: 'Enter a handle', text: 'Enter a Twitter, Farcaster, or GitHub username, or a raw wallet address into ClaimScan.' },
          { '@type': 'HowToStep', position: 2, name: 'Identity resolution', text: 'ClaimScan maps social handles to wallet addresses across all supported chains.' },
          { '@type': 'HowToStep', position: 3, name: 'Parallel platform scan', text: 'All 11 platforms are queried simultaneously. Results stream in real time as each completes.' },
          { '@type': 'HowToStep', position: 4, name: 'Fee aggregation', text: 'Earned, claimed, partially claimed, and unclaimed fees are pulled per token. Duplicates filtered.' },
          { '@type': 'HowToStep', position: 5, name: 'USD conversion', text: 'Live prices fetched from DexScreener and Jupiter. Continuously refreshed.' },
          { '@type': 'HowToStep', position: 6, name: 'Review your dashboard', text: 'View platform breakdown, chain breakdown, and token-level details. Claim uncollected fees directly.' },
        ],
      },
      {
        '@type': 'BreadcrumbList',
        '@id': 'https://claimscan.tech/docs#breadcrumb',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'ClaimScan',
            item: 'https://claimscan.tech',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Docs',
            item: 'https://claimscan.tech/docs',
          },
        ],
      },
    ],
  });

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background: `
          radial-gradient(ellipse at 85% 55%, #FFFFFF05 0%, transparent 100%),
          radial-gradient(ellipse at 15% 30%, #FFFFFF07 0%, transparent 100%),
          radial-gradient(ellipse at 45% 6%, #FFFFFF0C 0%, transparent 60%),
          linear-gradient(180deg, #16161A 0%, #09090B 100%)
        `,
      }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: faqData.replace(/[<>&\u2028\u2029]/g, c => ({ '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029' })[c]!) }}
      />

      {/* ═══ HEADER ═══ */}
      <header className="mx-auto flex max-w-[1200px] flex-col items-center gap-4 px-5 pt-20 pb-12 text-center sm:px-12">
        <span className="text-[11px] font-semibold tracking-[2px] text-white uppercase">
          DOCUMENTATION
        </span>
        <h1 className="text-[28px] font-bold leading-tight text-[var(--text-primary)] sm:text-[40px]">
          API REFERENCE &amp; GUIDES
        </h1>
        <p className="max-w-lg text-base text-[var(--text-secondary)]">
          Integrate ClaimScan into your app. Scan fees, claim tokens, export data.
        </p>
      </header>

      {/* ═══ 2-COLUMN LAYOUT ═══ */}
      <div className="mx-auto flex w-full max-w-[1200px] px-5 pb-24 sm:px-12">
        {/* ── Sidebar (client component with scroll spy) ── */}
        <DocsSidebar />

        {/* ── Main content ── */}
        <main className="min-w-0 flex-1 lg:pl-12">
          <RevealMount />

          {/* ═══ INTRODUCTION ═══ */}
          <section id="introduction" data-reveal className="reveal scroll-mt-24">
            <h2 className="text-[24px] font-bold text-[var(--text-primary)]">
              Introduction
            </h2>
            <p className="mt-4 text-[15px] leading-[1.75] text-[var(--text-secondary)]">
              ClaimScan scans 11 launchpads across 4 chains and shows what creators earned, claimed, and left uncollected.
              Paste a handle or wallet. Get a full fee breakdown in seconds.
            </p>

            <div className="mt-6 space-y-4">
              <div className="rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-input)] overflow-hidden">
                <div className="flex justify-between px-4 py-2.5 bg-[#FFFFFF08]">
                  <span className="font-mono text-[12px] text-[var(--text-tertiary)]">Base URL</span>
                </div>
                <div className="p-4">
                  <code className="font-mono text-[13px] text-[var(--text-secondary)]">https://claimscan.tech</code>
                </div>
              </div>
            </div>

            <h3 className="mt-8 text-[14px] font-semibold text-[var(--text-primary)]">Supported Chains</h3>
            <div className="mt-3 overflow-x-auto rounded-[10px] border border-[var(--border-default)]">
              <table className="w-full min-w-[600px] text-left">
                <thead>
                  <tr className="bg-[#FFFFFF08]">
                    <th className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">Chain</th>
                    <th className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">Chain ID</th>
                    <th className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">Decimals</th>
                    <th className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">Platforms</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { chain: 'Solana', id: 'N/A', decimals: '9', platforms: 'Pump.fun, Bags.fm, Believe, RevShare, Coinbarrel, Raydium' },
                    { chain: 'Base', id: '8453', decimals: '18', platforms: 'Clanker, Zora, Bankr, Flaunch' },
                    { chain: 'Ethereum', id: '1', decimals: '18', platforms: 'Zora' },
                    { chain: 'BSC', id: '56', decimals: '18', platforms: 'Clanker, Flap' },
                  ].map((row, i) => (
                    <tr key={row.chain} className={i % 2 === 0 ? 'bg-[var(--bg-input)]' : 'bg-[#FFFFFF04]'}>
                      <td className="px-4 py-3 font-mono text-[13px] font-semibold text-white">{row.chain}</td>
                      <td className="px-4 py-3 font-mono text-[13px] text-[var(--text-secondary)]">{row.id}</td>
                      <td className="px-4 py-3 font-mono text-[13px] text-[var(--text-secondary)]">{row.decimals}</td>
                      <td className="px-4 py-3 text-[13px] text-[var(--text-secondary)]">{row.platforms}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-[13px] leading-[1.75] text-[var(--text-tertiary)]">
              Token amounts are BigInt strings. Do not convert to <code className="font-mono text-[13px] bg-[#FFFFFF08] px-1.5 py-0.5 rounded">Number</code>. Precision loss will corrupt balances.
            </p>
          </section>

          {/* ═══ SUPPORTED PLATFORMS ═══ */}
          <section id="platforms" data-reveal className="reveal scroll-mt-24 border-t border-[var(--border-subtle)] pt-10 mt-10">
            <h2 className="text-[24px] font-bold text-[var(--text-primary)]">Supported Platforms</h2>
            <p className="mt-3 text-[15px] text-[var(--text-secondary)]">11 platforms across Solana, Base, and BNB Chain.</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5">
                <div className="flex items-center justify-between mb-4">
                  <span className="rounded-[6px] bg-white px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[var(--text-inverse)]">Solana</span>
                  <span className="text-[11px] text-[var(--text-tertiary)]">6 platforms</span>
                </div>
                <div className="space-y-0 divide-y divide-[var(--border-subtle)]">
                  {[['Pump.fun','Largest memecoin launchpad'],['Bags.fm','Social token trading'],['Believe','Community token launches'],['RevShare','Revenue sharing'],['Coinbarrel','Fast token launches'],['Raydium','DEX LP fee tracking']].map(([n,d])=>(
                    <div key={n} className="flex items-center justify-between py-2.5">
                      <span className="text-[13px] font-semibold text-[var(--text-primary)]">{n}</span>
                      <span className="text-[11px] text-[var(--text-tertiary)]">{d}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5">
                <div className="flex items-center justify-between mb-4">
                  <span className="rounded-[6px] bg-white px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[var(--text-inverse)]">Base / ETH / BSC</span>
                  <span className="text-[11px] text-[var(--text-tertiary)]">5 platforms</span>
                </div>
                <div className="space-y-0 divide-y divide-[var(--border-subtle)]">
                  {[['Clanker','Farcaster launcher (Base + BSC)'],['Zora','Protocol rewards (Base + ETH)'],['Bankr','AI trading fee splits (Base)'],['Flaunch','Takeover.fun coins (Base)'],['Flap','Memecoin Portal (BSC)']].map(([n,d])=>(
                    <div key={n} className="flex items-center justify-between py-2.5">
                      <span className="text-[13px] font-semibold text-[var(--text-primary)]">{n}</span>
                      <span className="text-[11px] text-[var(--text-tertiary)]">{d}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ═══ HOW IT WORKS ═══ */}
          <section id="how-it-works" data-reveal className="reveal scroll-mt-24 border-t border-[var(--border-subtle)] pt-10 mt-10">
            <h2 className="text-[24px] font-bold text-[var(--text-primary)]">How It Works</h2>
            <p className="mt-3 text-[15px] text-[var(--text-secondary)]">Scan any creator in under 30 seconds. No wallet connection required.</p>
            <ol className="mt-6 space-y-4">
              {[['Enter a handle','Twitter, Farcaster, GitHub username, or raw wallet address.'],['Identity resolution','Social handles resolved to wallet addresses across all supported chains.'],['Parallel platform scan','All 11 platforms queried simultaneously. Results stream in real time.'],['Fee aggregation','Earned, claimed, and unclaimed fees pulled per token. Duplicates filtered.'],['USD conversion','Live prices via DexScreener, Jupiter, and CoinGecko. Auto-refreshed.'],['Live dashboard','Platform breakdown, chain breakdown, token-level details. Auto-refreshes.']].map(([title,desc],i)=>(
                <li key={i} className="flex gap-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold text-[var(--text-inverse)]">{i+1}</span>
                  <div>
                    <h3 className="text-[13px] font-bold text-[var(--text-primary)]">{title}</h3>
                    <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">{desc}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-6 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 py-3 text-[12px] text-[var(--text-tertiary)]">
              All scanning is read-only. No wallet connection required. No signatures. No transaction risk.
            </div>
          </section>

          {/* ═══ CLAIM FLOW ═══ */}
          <section id="claim-flow" data-reveal className="reveal scroll-mt-24 border-t border-[var(--border-subtle)] pt-10 mt-10">
            <h2 className="text-[24px] font-bold text-[var(--text-primary)]">Claim Flow</h2>
            <p className="mt-3 text-[15px] text-[var(--text-secondary)]">
              Claim uncollected fees without leaving ClaimScan. Zero-custody flow: transactions built server-side, simulated before you sign, submitted on-chain. Your private keys never leave your wallet.
            </p>
            <div className="mt-6 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 space-y-3">
              {['Claimable positions fetched from the platform','Transaction built and simulated server-side','You sign in your wallet (Phantom, Solflare, Backpack, etc.)','Transaction submitted and confirmed on-chain'].map((text,i)=>(
                <div key={i} className="flex items-start gap-3 text-[13px]">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold text-[var(--text-inverse)]">{i+1}</span>
                  <span className="pt-[3px] text-[var(--text-secondary)]">{text}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {['Bags.fm · Live','Clanker · Coming','Zora · Coming'].map((s)=>(
                <span key={s} className={`rounded-[6px] border px-2.5 py-1 text-[11px] font-semibold ${s.includes('Live') ? 'border-[var(--border-accent)] bg-white text-[var(--text-inverse)]' : 'border-[var(--border-subtle)] text-[var(--text-tertiary)]'}`}>{s}</span>
              ))}
            </div>
          </section>

          {/* ═══ AUTHENTICATION ═══ */}
          <section id="authentication" data-reveal className="reveal scroll-mt-24 border-t border-[var(--border-subtle)] pt-10 mt-10">
            <h2 className="text-[24px] font-bold text-[var(--text-primary)]">
              Authentication
            </h2>
            <p className="mt-4 text-[15px] leading-[1.75] text-[var(--text-secondary)]">
              Free endpoints (search, leaderboard, prices) need no authentication.
              Cloudflare Turnstile is required for <code className="font-mono text-[13px] bg-[#FFFFFF08] px-1.5 py-0.5 rounded">/api/search</code> and <code className="font-mono text-[13px] bg-[#FFFFFF08] px-1.5 py-0.5 rounded">/api/resolve</code>.
            </p>

            <h3 className="mt-6 text-[14px] font-semibold text-[var(--text-primary)]">Request Signing</h3>
            <p className="mt-2 text-[14px] leading-[1.75] text-[var(--text-secondary)]">
              HMAC-SHA256 via <code className="font-mono text-[13px] bg-[#FFFFFF08] px-1.5 py-0.5 rounded">X-Request-Sig</code> header. 30-second validity window. Recommended for server-to-server calls.
            </p>

            <h3 className="mt-6 text-[14px] font-semibold text-[var(--text-primary)]">V2 Paid Endpoints</h3>
            <p className="mt-2 text-[14px] leading-[1.75] text-[var(--text-secondary)]">
              V2 endpoints use the{' '}
              <a href="https://x402.org" target="_blank" rel="noopener noreferrer" className="text-link hover:text-[var(--text-primary)]">
                x402 protocol
              </a>
              . Pay per query in USDC on Base. No API keys, no subscriptions.
            </p>

            <div className="rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-input)] overflow-hidden mt-4">
              <div className="flex justify-between items-center px-4 py-2 bg-[#FFFFFF08] border-b border-[var(--border-subtle)]">
                <span className="font-mono text-[12px] text-[var(--text-tertiary)]">bash</span>
              </div>
              <div className="p-4 overflow-x-auto">
                <pre className="font-mono text-[13px] text-[var(--text-secondary)] whitespace-pre">{`# Free endpoint
curl -X POST https://claimscan.tech/api/search \\
  -H "Content-Type: application/json" \\
  -d '{"query": "finnbags"}'

# V2 paid endpoint (x402)
curl https://claimscan.tech/api/v2/fees?wallet=0x... \\
  -H "Authorization: Bearer {x402_token}"`}</pre>
              </div>
            </div>
          </section>

          {/* ═══ RATE LIMITS ═══ */}
          <section id="rate-limits" data-reveal className="reveal scroll-mt-24 border-t border-[var(--border-subtle)] pt-10 mt-10">
            <h2 className="text-[24px] font-bold text-[var(--text-primary)]">
              Rate Limits
            </h2>
            <p className="mt-4 text-[15px] leading-[1.75] text-[var(--text-secondary)]">
              All limits are per IP. Exceeding them returns <code className="font-mono text-[13px] bg-[#FFFFFF08] px-1.5 py-0.5 rounded">429 Too Many Requests</code>.
            </p>

            <div className="mt-6 overflow-x-auto rounded-[10px] border border-[var(--border-default)]">
              <table className="w-full min-w-[600px] text-left">
                <thead>
                  <tr className="bg-[#FFFFFF08]">
                    <th className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">Endpoint</th>
                    <th className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">Limit</th>
                    <th className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[1px] text-[var(--text-tertiary)]">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { endpoint: '/api/search', limit: '10 req/min', notes: 'Turnstile required' },
                    { endpoint: '/api/resolve', limit: '10 req/min', notes: 'Turnstile required' },
                    { endpoint: '/api/fees/live', limit: '5 req/min', notes: 'Onchain reads' },
                    { endpoint: 'Other /api/*', limit: '30 req/min', notes: 'General' },
                    { endpoint: 'Handle enum', limit: '20 handles/5min', notes: 'Anti-enumeration' },
                  ].map((row, i) => (
                    <tr key={row.endpoint} className={i % 2 === 0 ? 'bg-[var(--bg-input)]' : 'bg-[#FFFFFF04]'}>
                      <td className="px-4 py-3 font-mono text-[13px] font-semibold text-white">{row.endpoint}</td>
                      <td className="px-4 py-3 font-mono text-[13px] text-[var(--text-secondary)]">{row.limit}</td>
                      <td className="px-4 py-3 text-[13px] text-[var(--text-secondary)]">{row.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-[13px] leading-[1.75] text-[var(--text-tertiary)]">
              Max POST body: 4KB. <code className="font-mono text-[13px] bg-[#FFFFFF08] px-1.5 py-0.5 rounded">User-Agent</code> header required on all requests. Known scraper agents are blocked.
            </p>
          </section>

          {/* ═══ SEARCH BY HANDLE ═══ */}
          <section id="search" data-reveal className="reveal scroll-mt-24 border-t border-[var(--border-subtle)] pt-10 mt-10">
            <h2 className="text-[24px] font-bold text-[var(--text-primary)]">
              Search by Handle
            </h2>

            <div className="flex items-center gap-3 mt-6 mb-3">
              <span className="font-mono text-[12px] font-bold text-white bg-[#FFFFFF14] px-2.5 py-1 rounded-[6px]">POST</span>
              <code className="font-mono text-[16px] font-semibold text-[var(--text-primary)]">/api/search</code>
            </div>
            <p className="text-[15px] leading-[1.75] text-[var(--text-secondary)]">
              Resolves a social handle (Twitter, GitHub, Farcaster) or wallet address to a creator identity. Returns the creator profile, all linked wallets, and aggregated fee records across all 11 platforms and 4 chains.
            </p>

            <h3 className="mt-6 text-[14px] font-semibold text-[var(--text-primary)]">Parameters</h3>
            <div className="mt-3 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-[8px] px-4 py-3 mt-2">
                <div className="flex items-center gap-2 sm:w-40 shrink-0">
                  <code className="font-mono text-[13px] text-white">query</code>
                  <span className="text-[11px] bg-[#FBBF2418] text-[var(--warning)] px-2 py-0.5 rounded-[4px]">required</span>
                </div>
                <span className="text-[13px] text-[var(--text-secondary)]">Social handle or wallet address. 2-256 characters.</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-[8px] px-4 py-3 mt-2">
                <div className="flex items-center gap-2 sm:w-40 shrink-0">
                  <code className="font-mono text-[13px] text-white">cfTurnstileToken</code>
                  <span className="text-[11px] bg-[#FFFFFF10] text-[var(--text-tertiary)] px-2 py-0.5 rounded-[4px]">optional</span>
                </div>
                <span className="text-[13px] text-[var(--text-secondary)]">Cloudflare Turnstile verification token. Required from browsers.</span>
              </div>
            </div>

            <h3 className="mt-6 text-[14px] font-semibold text-[var(--text-primary)]">Response</h3>
            <div className="rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-input)] overflow-hidden mt-4">
              <div className="flex justify-between items-center px-4 py-2 bg-[#FFFFFF08] border-b border-[var(--border-subtle)]">
                <span className="font-mono text-[12px] text-[var(--text-tertiary)]">json</span>
              </div>
              <div className="p-4 overflow-x-auto">
                <pre className="font-mono text-[13px] text-[var(--text-secondary)] whitespace-pre">{`{
  "creator": {
    "handle": "finnbags",
    "platform": "twitter",
    "avatar": "https://pbs.twimg.com/..."
  },
  "wallets": [
    "So1anaWa11etAddress...",
    "0xEvmWalletAddress..."
  ],
  "fees": [
    {
      "platform": "bags",
      "chain": "sol",
      "token_mint": "TokenMintAddress...",
      "token_name": "BAGS",
      "total_earned": "1500000000",
      "claimed": "500000000",
      "unclaimed": "1000000000",
      "usd_value": 142.50
    }
  ],
  "cached": true,
  "refreshing": false
}`}</pre>
              </div>
            </div>
          </section>

          {/* ═══ GET FEES V2 ═══ */}
          <section id="fees" data-reveal className="reveal scroll-mt-24 border-t border-[var(--border-subtle)] pt-10 mt-10">
            <h2 className="text-[24px] font-bold text-[var(--text-primary)]">
              Get Fees (V2)
            </h2>

            <div className="flex items-center gap-3 mt-6 mb-3">
              <span className="font-mono text-[12px] font-bold text-white bg-[#FFFFFF14] px-2.5 py-1 rounded-[6px]">GET</span>
              <code className="font-mono text-[16px] font-semibold text-[var(--text-primary)]">/api/v2/fees</code>
            </div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-[6px] bg-[#FFFFFF08] px-3 py-1.5">
              <span className="text-[12px] font-semibold text-[var(--text-tertiary)]">Price:</span>
              <span className="font-mono text-[13px] font-bold text-white">$0.01/query</span>
              <span className="text-[11px] text-[var(--text-tertiary)]">via x402</span>
            </div>
            <p className="text-[15px] leading-[1.75] text-[var(--text-secondary)]">
              Returns every fee record for a wallet across all 11 platforms and 4 chains. Each record includes earned, claimed, unclaimed amounts (BigInt) and current USD value.
            </p>

            <h3 className="mt-6 text-[14px] font-semibold text-[var(--text-primary)]">Parameters</h3>
            <div className="mt-3 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-[8px] px-4 py-3 mt-2">
                <div className="flex items-center gap-2 sm:w-40 shrink-0">
                  <code className="font-mono text-[13px] text-white">wallet</code>
                  <span className="text-[11px] bg-[#FBBF2418] text-[var(--warning)] px-2 py-0.5 rounded-[4px]">required</span>
                </div>
                <span className="text-[13px] text-[var(--text-secondary)]">Solana base58 or EVM 0x address</span>
              </div>
            </div>

            <h3 className="mt-6 text-[14px] font-semibold text-[var(--text-primary)]">Response</h3>
            <div className="rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-input)] overflow-hidden mt-4">
              <div className="flex justify-between items-center px-4 py-2 bg-[#FFFFFF08] border-b border-[var(--border-subtle)]">
                <span className="font-mono text-[12px] text-[var(--text-tertiary)]">json</span>
              </div>
              <div className="p-4 overflow-x-auto">
                <pre className="font-mono text-[13px] text-[var(--text-secondary)] whitespace-pre">{`{
  "wallet": "So1anaWa11etAddress...",
  "fees": [
    {
      "platform": "pump",
      "chain": "sol",
      "token_mint": "TokenMintAddress...",
      "token_name": "PUMP",
      "total_earned": "2500000000",
      "claimed": "1000000000",
      "unclaimed": "1500000000",
      "usd_value": 312.75
    }
  ],
  "summary": {
    "totalEarnedUsd": 4820.50,
    "totalUnclaimedUsd": 1930.25,
    "totalRecords": 24,
    "platforms": 5,
    "chains": 2
  },
  "paidVia": "x402"
}`}</pre>
              </div>
            </div>

            <div className="rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-input)] overflow-hidden mt-4">
              <div className="flex justify-between items-center px-4 py-2 bg-[#FFFFFF08] border-b border-[var(--border-subtle)]">
                <span className="font-mono text-[12px] text-[var(--text-tertiary)]">bash</span>
              </div>
              <div className="p-4 overflow-x-auto">
                <pre className="font-mono text-[13px] text-[var(--text-secondary)] whitespace-pre">{`curl https://claimscan.tech/api/v2/fees?wallet=So1anaWa11etAddress...`}</pre>
              </div>
            </div>
          </section>

          {/* ═══ EXPORT DATA ═══ */}
          <section id="export" data-reveal className="reveal scroll-mt-24 border-t border-[var(--border-subtle)] pt-10 mt-10">
            <h2 className="text-[24px] font-bold text-[var(--text-primary)]">
              Export Data
            </h2>

            <div className="flex items-center gap-3 mt-6 mb-3">
              <span className="font-mono text-[12px] font-bold text-white bg-[#FFFFFF14] px-2.5 py-1 rounded-[6px]">GET</span>
              <code className="font-mono text-[16px] font-semibold text-[var(--text-primary)]">/api/v2/export</code>
            </div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-[6px] bg-[#FFFFFF08] px-3 py-1.5">
              <span className="text-[12px] font-semibold text-[var(--text-tertiary)]">Price:</span>
              <span className="font-mono text-[13px] font-bold text-white">$0.05/query</span>
              <span className="text-[11px] text-[var(--text-tertiary)]">via x402</span>
            </div>
            <p className="text-[15px] leading-[1.75] text-[var(--text-secondary)]">
              Download fee data as CSV or JSON. CSV response includes a <code className="font-mono text-[13px] bg-[#FFFFFF08] px-1.5 py-0.5 rounded">Content-Disposition</code> header for direct file save. Limit: 1,000 records per request.
            </p>

            <h3 className="mt-6 text-[14px] font-semibold text-[var(--text-primary)]">Parameters</h3>
            <div className="mt-3 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-[8px] px-4 py-3 mt-2">
                <div className="flex items-center gap-2 sm:w-40 shrink-0">
                  <code className="font-mono text-[13px] text-white">wallet</code>
                  <span className="text-[11px] bg-[#FBBF2418] text-[var(--warning)] px-2 py-0.5 rounded-[4px]">required</span>
                </div>
                <span className="text-[13px] text-[var(--text-secondary)]">Solana base58 or EVM 0x address</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-[8px] px-4 py-3 mt-2">
                <div className="flex items-center gap-2 sm:w-40 shrink-0">
                  <code className="font-mono text-[13px] text-white">format</code>
                  <span className="text-[11px] bg-[#FFFFFF10] text-[var(--text-tertiary)] px-2 py-0.5 rounded-[4px]">optional</span>
                </div>
                <span className="text-[13px] text-[var(--text-secondary)]"><code className="font-mono text-[13px] bg-[#FFFFFF08] px-1.5 py-0.5 rounded">csv</code> or <code className="font-mono text-[13px] bg-[#FFFFFF08] px-1.5 py-0.5 rounded">json</code>. Defaults to <code className="font-mono text-[13px] bg-[#FFFFFF08] px-1.5 py-0.5 rounded">csv</code>.</span>
              </div>
            </div>

            <div className="rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-input)] overflow-hidden mt-4">
              <div className="flex justify-between items-center px-4 py-2 bg-[#FFFFFF08] border-b border-[var(--border-subtle)]">
                <span className="font-mono text-[12px] text-[var(--text-tertiary)]">bash</span>
              </div>
              <div className="p-4 overflow-x-auto">
                <pre className="font-mono text-[13px] text-[var(--text-secondary)] whitespace-pre">{`# Export as CSV (default)
curl https://claimscan.tech/api/v2/export?wallet=0xEvmAddress... \\
  -o fees.csv

# Export as JSON
curl https://claimscan.tech/api/v2/export?wallet=0xEvmAddress...&format=json`}</pre>
              </div>
            </div>
          </section>

          {/* ═══ LEADERBOARD ═══ */}
          <section id="leaderboard-api" data-reveal className="reveal scroll-mt-24 border-t border-[var(--border-subtle)] pt-10 mt-10">
            <h2 className="text-[24px] font-bold text-[var(--text-primary)]">
              Leaderboard
            </h2>

            <div className="flex items-center gap-3 mt-6 mb-3">
              <span className="font-mono text-[12px] font-bold text-white bg-[#FFFFFF14] px-2.5 py-1 rounded-[6px]">GET</span>
              <code className="font-mono text-[16px] font-semibold text-[var(--text-primary)]">/api/leaderboard</code>
            </div>
            <p className="text-[15px] leading-[1.75] text-[var(--text-secondary)]">
              Top creators ranked by total fees earned (USD). Free endpoint, no auth. Filter by platform or chain. Paginated, max 100 results per page.
            </p>

            <h3 className="mt-6 text-[14px] font-semibold text-[var(--text-primary)]">Parameters</h3>
            <div className="mt-3 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-[8px] px-4 py-3 mt-2">
                <div className="flex items-center gap-2 sm:w-40 shrink-0">
                  <code className="font-mono text-[13px] text-white">limit</code>
                  <span className="text-[11px] bg-[#FFFFFF10] text-[var(--text-tertiary)] px-2 py-0.5 rounded-[4px]">optional</span>
                </div>
                <span className="text-[13px] text-[var(--text-secondary)]">Results per page. Default 50, max 100.</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-[8px] px-4 py-3 mt-2">
                <div className="flex items-center gap-2 sm:w-40 shrink-0">
                  <code className="font-mono text-[13px] text-white">offset</code>
                  <span className="text-[11px] bg-[#FFFFFF10] text-[var(--text-tertiary)] px-2 py-0.5 rounded-[4px]">optional</span>
                </div>
                <span className="text-[13px] text-[var(--text-secondary)]">Number of results to skip for pagination. Default 0.</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-[8px] px-4 py-3 mt-2">
                <div className="flex items-center gap-2 sm:w-40 shrink-0">
                  <code className="font-mono text-[13px] text-white">platform</code>
                  <span className="text-[11px] bg-[#FFFFFF10] text-[var(--text-tertiary)] px-2 py-0.5 rounded-[4px]">optional</span>
                </div>
                <span className="text-[13px] text-[var(--text-secondary)]">Filter by platform (e.g. <code className="font-mono text-[13px] bg-[#FFFFFF08] px-1.5 py-0.5 rounded">bags</code>, <code className="font-mono text-[13px] bg-[#FFFFFF08] px-1.5 py-0.5 rounded">pump</code>, <code className="font-mono text-[13px] bg-[#FFFFFF08] px-1.5 py-0.5 rounded">clanker</code>)</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-[8px] px-4 py-3 mt-2">
                <div className="flex items-center gap-2 sm:w-40 shrink-0">
                  <code className="font-mono text-[13px] text-white">chain</code>
                  <span className="text-[11px] bg-[#FFFFFF10] text-[var(--text-tertiary)] px-2 py-0.5 rounded-[4px]">optional</span>
                </div>
                <span className="text-[13px] text-[var(--text-secondary)]">Filter by chain (<code className="font-mono text-[13px] bg-[#FFFFFF08] px-1.5 py-0.5 rounded">sol</code>, <code className="font-mono text-[13px] bg-[#FFFFFF08] px-1.5 py-0.5 rounded">base</code>, <code className="font-mono text-[13px] bg-[#FFFFFF08] px-1.5 py-0.5 rounded">eth</code>, <code className="font-mono text-[13px] bg-[#FFFFFF08] px-1.5 py-0.5 rounded">bsc</code>)</span>
              </div>
            </div>

            <div className="rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-input)] overflow-hidden mt-4">
              <div className="flex justify-between items-center px-4 py-2 bg-[#FFFFFF08] border-b border-[var(--border-subtle)]">
                <span className="font-mono text-[12px] text-[var(--text-tertiary)]">bash</span>
              </div>
              <div className="p-4 overflow-x-auto">
                <pre className="font-mono text-[13px] text-[var(--text-secondary)] whitespace-pre">{`curl "https://claimscan.tech/api/leaderboard?limit=50&offset=0&platform=bags&chain=sol"`}</pre>
              </div>
            </div>

            <h3 className="mt-6 text-[14px] font-semibold text-[var(--text-primary)]">Response</h3>
            <div className="rounded-[10px] border border-[var(--border-default)] bg-[var(--bg-input)] overflow-hidden mt-4">
              <div className="flex justify-between items-center px-4 py-2 bg-[#FFFFFF08] border-b border-[var(--border-subtle)]">
                <span className="font-mono text-[12px] text-[var(--text-tertiary)]">json</span>
              </div>
              <div className="p-4 overflow-x-auto">
                <pre className="font-mono text-[13px] text-[var(--text-secondary)] whitespace-pre">{`{
  "creators": [
    {
      "handle": "finnbags",
      "total_earned_usd": 52340.12,
      "unclaimed_usd": 12500.00,
      "platforms": 5,
      "tokens": 38
    }
  ],
  "total": 1240,
  "limit": 50,
  "offset": 0
}`}</pre>
              </div>
            </div>
          </section>

          {/* ═══ SECURITY & PRIVACY ═══ */}
          <section id="security" data-reveal className="reveal scroll-mt-24 border-t border-[var(--border-subtle)] pt-10 mt-10">
            <h2 className="text-[24px] font-bold text-[var(--text-primary)]">Security &amp; Privacy</h2>
            <p className="mt-3 text-[15px] text-[var(--text-secondary)]">
              ClaimScan never touches your wallet or stores your data. That&apos;s the architecture, not a promise.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[{t:'Private searches',d:'Search queries are never stored in readable form.'},{t:'Server-side only',d:'All sensitive operations run server-side. No secrets reach the browser.'},{t:'Zero-custody claims',d:'Transactions built and simulated server-side. You sign and submit from your wallet.'},{t:'Signed requests',d:'Every claim request is cryptographically verified end-to-end.'},{t:'Tamper-proof claims',d:'Claim states are immutable once finalized. Cannot be rolled back.'},{t:'On-chain verifiable',d:'Every fee record and claim transaction is independently verifiable on-chain.'}].map((item)=>(
                <div key={item.t} className="rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
                  <h3 className="text-[13px] font-bold text-[var(--text-primary)]">{item.t}</h3>
                  <p className="mt-1.5 text-[12px] text-[var(--text-tertiary)]">{item.d}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ═══ ARCHITECTURE ═══ */}
          <section id="architecture" data-reveal className="reveal scroll-mt-24 border-t border-[var(--border-subtle)] pt-10 mt-10">
            <h2 className="text-[24px] font-bold text-[var(--text-primary)]">Architecture</h2>
            <div className="mt-6 rounded-[10px] border border-[var(--border-subtle)] overflow-hidden">
              {[['Frontend','Next.js, React, Tailwind CSS'],['Blockchain','Solana + EVM (Base, Ethereum, BSC)'],['Database','Supabase (PostgreSQL + RLS)'],['Cache','Upstash Redis + in-memory fallback'],['Price Feeds','DexScreener, Jupiter, CoinGecko'],['Identity','Twitter, GitHub, Farcaster, OWS wallet resolution'],['Payments','x402 protocol (USDC on Base)'],['Security','Sentry, Cloudflare Turnstile, request signing'],['Deployment','Vercel (serverless)']].map(([cat,tech],i)=>(
                <div key={cat} className={`flex items-center gap-4 px-4 py-2.5 ${i%2===0?'bg-[#FFFFFF04]':''} ${i>0?'border-t border-[var(--border-subtle)]':''}`}>
                  <span className="w-28 shrink-0 text-[11px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">{cat}</span>
                  <span className="font-mono text-[12px] text-[var(--text-secondary)]">{tech}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ═══ FAQ ═══ */}
          <section id="faq" data-reveal className="reveal scroll-mt-24 border-t border-[var(--border-subtle)] pt-10 mt-10">
            <h2 className="text-[24px] font-bold text-[var(--text-primary)]">
              Frequently Asked Questions
            </h2>

            <div className="mt-6 space-y-6">
              {[
                {
                  q: 'How does ClaimScan work?',
                  a: 'Paste a social handle or wallet address. ClaimScan resolves it to wallets and scans 11 platforms across Solana, Base, Ethereum, and BNB Chain in parallel, showing earned, claimed, and unclaimed fees in real time.',
                },
                {
                  q: 'What platforms are supported?',
                  a: '11 platforms: Pump.fun, Bags.fm, Believe, RevShare, Coinbarrel, and Raydium on Solana, plus Clanker, Zora, Bankr, and Flaunch on Base/ETH, and Flap on BSC.',
                },
                {
                  q: 'Is ClaimScan free?',
                  a: 'Yes. Scanning, viewing fee data, and the leaderboard are completely free. No API key needed. V2 paid endpoints for developers and agents use pay-per-query pricing via the x402 protocol.',
                },
                {
                  q: 'How do I claim fees?',
                  a: 'Connect your wallet on a profile page and click Claim on eligible unclaimed fees. ClaimScan builds the transaction server-side, simulates it, and you sign in your wallet. Currently live for Bags.fm with others coming soon.',
                },
                {
                  q: 'Is ClaimScan safe?',
                  a: 'Yes. Scanning is fully read-only. Claims are zero-custody. Transactions are built server-side with pre-sign simulation. ClaimScan never has access to your private keys.',
                },
              ].map((item) => (
                <div key={item.q}>
                  <h3 className="text-[16px] font-semibold text-[var(--text-primary)]">{item.q}</h3>
                  <p className="mt-2 text-[14px] leading-[1.75] text-[var(--text-secondary)]">{item.a}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ═══ PRICING ═══ */}
          <section id="pricing" data-reveal className="reveal scroll-mt-24 border-t border-[var(--border-subtle)] pt-10 mt-10">
            <h2 className="text-[24px] font-bold text-[var(--text-primary)]">
              API Pricing
            </h2>
            <p className="mt-4 text-[15px] leading-[1.75] text-[var(--text-secondary)]">
              Free for scanning. Pay-per-query for programmatic access via x402.
            </p>

            <div className="mt-8 grid gap-5 sm:grid-cols-3">
              {/* Free tier */}
              <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6">
                <span className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--text-tertiary)]">Free</span>
                <div className="mt-2 text-[28px] font-bold text-[var(--text-primary)]">$0</div>
                <p className="mt-3 text-[13px] text-[var(--text-secondary)] leading-relaxed">
                  Scanning, leaderboard, and price feeds. No auth required.
                </p>
                <div className="mt-5 space-y-2">
                  {['Fee scanning', 'Leaderboard access', 'Price feeds', 'No auth needed'].map((f) => (
                    <div key={f} className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-tertiary)]" />
                      {f}
                    </div>
                  ))}
                </div>
              </div>

              {/* Pay-per-query */}
              <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6">
                <span className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--text-tertiary)]">Pay-per-query</span>
                <div className="mt-2 text-[28px] font-bold text-[var(--text-primary)]">x402</div>
                <p className="mt-3 text-[13px] text-[var(--text-secondary)] leading-relaxed">
                  V2 endpoints. USDC on Base. No API keys or subscriptions.
                </p>
                <div className="mt-5 space-y-2">
                  {[
                    '/v2/resolve: $0.01/query',
                    '/v2/fees: $0.01/query',
                    '/v2/export: $0.05/query',
                    '/v2/intelligence: $0.02/query',
                    'USDC on Base',
                  ].map((f) => (
                    <div key={f} className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-tertiary)]" />
                      {f}
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-[11px] text-[var(--text-tertiary)] leading-relaxed">
                  Privacy: all creator data exposed via the V2 API is already public. Paying unlocks fast lookup, not access to private data.
                </p>
              </div>

              {/* Enterprise */}
              <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6">
                <span className="text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--text-tertiary)]">Enterprise</span>
                <div className="mt-2 text-[28px] font-bold text-[var(--text-primary)]">Custom</div>
                <p className="mt-3 text-[13px] text-[var(--text-secondary)] leading-relaxed">
                  Custom rate limits, volume pricing, and dedicated support.
                </p>
                <div className="mt-5 space-y-2">
                  {['Custom rate limits', 'Volume discounts', 'Dedicated support', 'Contact @lwarts on Telegram'].map((f) => (
                    <div key={f} className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-tertiary)]" />
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ═══ ROADMAP ═══ */}
          <section id="roadmap" data-reveal className="reveal scroll-mt-24 border-t border-[var(--border-subtle)] pt-10 mt-10">
            <h2 className="text-[24px] font-bold text-[var(--text-primary)]">Roadmap</h2>
            <div className="mt-6 space-y-6">
              <div className="rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5">
                <div className="flex items-center gap-3 mb-4">
                  <span className="rounded-[6px] bg-white px-2.5 py-1 text-[11px] font-bold text-[var(--text-inverse)]">V1.5</span>
                  <span className="text-[11px] text-[var(--text-tertiary)]">Current · Live</span>
                </div>
                <div className="columns-1 sm:columns-2 gap-x-6 space-y-1.5">
                  {['11 platform support (Solana + Base + Ethereum + BSC)','Multi-identity search (Twitter, GitHub, Farcaster, Wallet)','Real-time streaming scan results','Bags.fm direct claim (zero-custody)','Pre-sign transaction simulation','Smart caching with background indexing','Multi-source USD price aggregation','V2 paid API via x402 protocol','Rate limiting and abuse prevention','Privacy-preserving analytics'].map((item)=>(
                    <div key={item} className="flex items-start gap-2 break-inside-avoid text-[12px] text-[var(--text-secondary)]">
                      <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-white" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-[10px] border border-dashed border-[var(--border-subtle)] p-5">
                <div className="flex items-center gap-3 mb-4">
                  <span className="rounded-[6px] border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] font-bold text-[var(--text-secondary)]">V2</span>
                  <span className="text-[11px] text-[var(--text-tertiary)]">Coming Soon</span>
                </div>
                <div className="space-y-1.5">
                  {['Token Fee Scanner (paste any contract address)','Fee recipient discovery','One-click claim expansion (Clanker & Zora)','Additional chain support (Arbitrum)','SDK for platform integrations'].map((item)=>(
                    <div key={item} className="flex items-start gap-2 text-[12px] text-[var(--text-tertiary)]">
                      <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--text-tertiary)]" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

        </main>
      </div>
    </div>
  );
}
