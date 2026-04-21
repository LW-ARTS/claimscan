# ClaimScan

Cross-chain creator fee scanner + claimer + paid intelligence API for DeFi launchpads on **Solana, Base, Ethereum, and BNB Chain**.

Paste any Twitter handle, GitHub username, Farcaster name, or wallet address — ClaimScan resolves the identity, aggregates earned fees from 10 launchpads (Pump.fun, Bags.fm, Clanker on Base+BSC, Zora on Base+ETH, Bankr, Believe, RevShare, Coinbarrel, Raydium, Flaunch on Base), and lets you claim them directly from the UI.

**Live:** [claimscan.tech](https://claimscan.tech) · **Showcase:** [github.com/LW-ARTS/claimscan](https://github.com/LW-ARTS/claimscan)

> This is the private working repository. For the public-facing showcase (README + screenshots + license), see [LW-ARTS/claimscan](https://github.com/LW-ARTS/claimscan). Architecture, conventions, and operational details for contributors live in [`CLAUDE.md`](./CLAUDE.md).

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2.2 · React 19.2.4 · TypeScript |
| Styling | Tailwind CSS 4 · Radix UI · Motion 12 · Lottie |
| Solana | `@solana/web3.js` 1.98 · wallet-adapter · spl-token |
| EVM | Viem 2.47 (Base / ETH / BSC reads) |
| Database | Supabase (Postgres 17 + Row Level Security) |
| Cache | Upstash Redis (in-memory fallback in dev) |
| Security | Sentry · Cloudflare Turnstile · HMAC request signing · custom security middleware |
| Payments | x402 protocol (USDC on Base Mainnet via Bitrefill facilitator) |
| Intelligence | Allium API · OWS (Open Wallet Standard) |
| Deploy | Vercel (Serverless) |

---

## Getting Started

### Prerequisites

- Node.js **20+** (Vercel runtime: 24.x)
- A Supabase project (Postgres 17 with RLS enabled)
- RPC endpoints for Solana, Base, Ethereum, and BNB Chain (Helius, Alchemy, etc)

### Install

```bash
git clone https://github.com/screwk/claimscan.git
cd claimscan
npm install
```

### Configure

```bash
cp .env.example .env.local
```

Minimum required variables for a local dev setup:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SOLANA_RPC_URL=
NEXT_PUBLIC_SOLANA_RPC_URL=
BASE_RPC_URL=
ETH_RPC_URL=
BSC_RPC_URL=
CRON_SECRET=
CLAIM_HMAC_SECRET=
```

`.env.example` documents every supported variable with comments. `CLAUDE.md` (Env section) explains the production setup, key rotation policy, and the **bug-prone** way Vercel UI introduces trailing newlines on copy-paste — always use `printf '%s' '<value>' | npx vercel env add NAME production` instead.

### Database

```bash
npx supabase db push
```

29 migrations are tracked in `supabase/migrations/`. The schema includes 14 tables, all with explicit RLS policies. See `CLAUDE.md` (DB Schema section) for the data model.

### Run

```bash
npm run dev -- -p 3001     # default project port
```

Open [http://localhost:3001](http://localhost:3001).

---

## Project Structure

```
app/                          # Next.js App Router
├── page.tsx                  # Home (hero + search)
├── [handle]/                 # Creator profile
├── leaderboard/              # Creator ranking by fees
├── docs/                     # API documentation
├── terms/                    # Terms of Service (includes V2 pricing)
├── components/               # Shared client components (LiveFeesProvider, ClaimDialog, ...)
└── api/                      # 27 API routes
    ├── search/               # POST — identity resolution + fees
    ├── resolve/              # POST — wallets for an identity
    ├── prices/               # GET — cached prices (5min revalidate)
    ├── fees/                 # aggregate, live, live-stream, stream
    ├── claim/                # confirm, bags (HMAC + Redis dedup)
    ├── balance/              # Solana wallet balance
    ├── flex/                 # OG image download
    ├── avatar/               # avatar proxy (SSRF-guarded)
    ├── leaderboard/          # creator fee ranking
    ├── stats/                # public stats (ISR 24h)
    ├── og-download/[handle]/ # dynamic OG download
    ├── webhooks/helius/      # Helius DAS webhook receiver
    ├── honeypot/[...path]/   # scraper trap (returns fake data)
    ├── admin/[...path]/      # → honeypot
    ├── export/[...path]/     # → honeypot
    ├── v2/                   # paid API via x402 protocol
    │   ├── fees/             # $0.01/req — full fee report
    │   ├── export/           # $0.05/req — CSV/JSON
    │   ├── intelligence/     # $0.02/req — Allium PnL enrichment
    │   ├── resolve/          # $0.01/req — OWS wallet name resolution
    │   └── [...path]/        # → honeypot
    └── cron/                 # Vercel Cron (CRON_SECRET protected)
        ├── index-fees/       # sync stale creators (also indexes tokens via ?also=tokens)
        ├── index-tokens/     # standalone token discovery
        ├── refresh-prices/   # standalone price refresh
        └── cleanup/          # expire claims, purge logs (also refreshes prices via ?also=prices)

lib/
├── platforms/                # 9 launchpad adapters (bags, pump, clanker, zora, bankr, believe, revshare, coinbarrel, raydium)
├── chains/                   # solana.ts, base.ts, eth.ts, bsc.ts, clanker-reads.ts
├── supabase/                 # client.ts, server.ts, service.ts (service.ts bypasses RLS — only used server-side)
├── resolve/                  # identity resolution (Twitter / GitHub / Farcaster / wallet)
├── prices/                   # waterfall: DexScreener → Jupiter (Solana) → CoinGecko (native)
├── claim/hmac.ts             # claim confirmation tokens (HMAC-SHA256, single-use via Redis)
├── allium/client.ts          # Allium wallet PnL enrichment (V2 intelligence endpoint)
├── ows/resolve.ts            # OWS wallet name resolution
├── x402/server.ts            # x402 payment protocol server (Bitrefill facilitator)
├── services/                 # creator.ts, fee-sync.ts, resolve.ts, stats.ts, leaderboard.ts
├── hooks/use-reduced-motion.ts
├── request-signing.ts        # anti-scraping request signature (NOT a security boundary)
├── constants.ts, constants-evm.ts
└── logger.ts                 # structured logger

proxy.ts                      # Security middleware (~568 lines) — there is NO middleware.ts; this file is named proxy.ts to avoid Next.js auto-discovery conflicts. CSP, HSTS, scraper UA block, anti-enumeration, rate limiting, CRON auth, request signing, tarpit, honeypot routing, x402 routing.
supabase/migrations/          # 29 SQL migration files (8 of which are explicit audit-fix rounds)
patches/bigint-buffer/        # local patch removing native bindings (CVE GHSA-3gc7-fjrx-p6mg)
e2e/                          # Playwright tests
DESIGN-SPEC.md                # Design system source of truth (extracted from Claimscan.pen)
Claimscan.pen                 # Pencil design file — encrypted, edit via Pencil MCP only
design-reference/             # @2x reference PNGs of the design
CLAUDE.md                     # Architecture, conventions, gotchas, env var docs (READ THIS FIRST)
```

---

## Security Posture

ClaimScan handles wallet connections, transaction signing, and cross-chain fee claims. Notable controls:

- **Defense in depth on `/api/claim/confirm`** — HMAC + Redis single-use + Turnstile + DB row lock + on-chain delta verification + status FSM + recovery window
- **Constant-time secret comparison** in `lib/claim/hmac.ts`, `lib/supabase/service.ts:verifyCronSecret`, `proxy.ts:safeCompare`, `app/api/webhooks/helius:verifyWebhookSecret`
- **All 14 Supabase tables have RLS enabled** with explicit per-role policies. **Zero `SECURITY DEFINER` functions.**
- **Per-request CSP nonce + `strict-dynamic`** in script-src (modern best-practice, eliminates `'unsafe-inline'` from JS)
- **CSV injection prevention** in `/api/v2/export`
- **SSRF allowlist** in `/api/flex` (host-restricted to canonical domains + Vercel previews)
- **Webhook replay protection** via Redis SET NX with TTL
- **Request signing** is documented as anti-scraping only (not auth) — `NEXT_PUBLIC_API_SIGN_KEY` is intentionally browser-exposed
- **Honeypot routes** (`/api/admin/*`, `/api/v2/[...path]`, `/api/export/*`) catch scrapers and log sanitized metadata to Sentry

**Vulnerability disclosure:** see the public showcase repo's [SECURITY.md](https://github.com/LW-ARTS/claimscan/blob/main/.github/SECURITY.md). Reports go via Telegram [@lwarts](https://t.me/lwarts) or Twitter [@lwartss](https://x.com/lwartss).

---

## Scripts

```bash
npm run dev -- -p 3001   # Next.js dev (default project port)
npm run build            # Production build
npm run lint             # ESLint
npm run test:unit        # Vitest unit tests
npm run test:e2e         # Playwright E2E tests
npm run test:e2e:ui      # Playwright UI mode
```

---

## Operations

- **Deploy:** Vercel (auto-deploy on push to `main` for `origin` remote)
- **Cron schedule:** see `vercel.json` — currently 2 cron jobs (Vercel Hobby tier limit), each composing multiple sub-tasks via query params
- **Sentry:** `lw-52.sentry.io` (project: `claimscan`, team: `#lw`)
- **Supabase project:** `qjbqsavyfsfanutlediy` (us-east-1)
- **RPC providers:** Helius (Solana) · Alchemy (Base / ETH / BSC)
- **x402 facilitator:** Bitrefill (`https://api.bitrefill.com/x402`)

---

## Built by [LW ARTS](https://lwdesigns.art)

Fullstack Web3 studio · [@lwartss](https://x.com/lwartss) · [t.me/lwarts](https://t.me/lwarts)

License: **Proprietary. All Rights Reserved.** See [`LICENSE.md`](./LICENSE.md). View-only for personal reference. No use, copy, deploy, or derivative works without written permission from LW ARTS.
