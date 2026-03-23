# ClaimScan

Track and claim creator fees across 9 DeFi launchpads on Solana and Base.

Paste any Twitter handle, wallet address, GitHub username, or Farcaster handle — ClaimScan resolves your identity, aggregates earned fees from Pump.fun, Bags.fm, Clanker, Zora, Bankr, Believe, RevShare, Coinbarrel, and Raydium, and lets you claim directly from the UI.

**Live:** [claimscan.tech](https://claimscan.tech)

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16.2, React 19, TypeScript |
| Styling | Tailwind CSS 4, Radix UI, Motion 12 |
| Solana | @solana/web3.js, wallet-adapter, spl-token |
| EVM | Viem 2.47 |
| Database | Supabase (PostgreSQL + RLS) |
| Cache | Upstash Redis |
| Security | Sentry, Cloudflare Turnstile, HMAC signing |
| Deploy | Vercel |

---

## Getting Started

### Prerequisites

- Node.js 20+
- A Supabase project
- Solana and Base RPC endpoints

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

Minimum required variables:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SOLANA_RPC_URL=
NEXT_PUBLIC_SOLANA_RPC_URL=
BASE_RPC_URL=
CRON_SECRET=
```

See `.env.example` for the full list.

### Database

```bash
npx supabase db push
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, data flows, key decisions |
| [docs/API.md](docs/API.md) | Full API reference with request/response examples |
| [docs/ONBOARDING.md](docs/ONBOARDING.md) | Developer onboarding guide |
| [docs/RUNBOOK.md](docs/RUNBOOK.md) | Operational runbook (crons, incidents, rollback) |

---

## Project Structure

```
app/                  # Next.js App Router (pages + API routes)
lib/
  platforms/          # 9 launchpad adapters
  chains/             # Solana, Base, ETH RPC
  resolve/            # Identity resolution
  prices/             # Price waterfall (DexScreener → Jupiter, CoinGecko for SOL/ETH)
  claim/              # HMAC claim tokens
  services/           # Creator resolution + persistence
  supabase/           # DB clients
proxy.ts              # Security middleware (~450 lines)
supabase/migrations/  # 12 SQL migration files
e2e/                  # Playwright tests
```

---

## Scripts

```bash
npm run dev           # Dev server
npm run build         # Production build
npm run test:e2e      # Playwright E2E tests
```

---

## Built by [LW ARTS](https://lwdesigns.art)
