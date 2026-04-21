# ClaimScan — Developer Onboarding Guide

> Cross-chain fee tracking and claiming platform for token creators.
> Supports 10 launchpads across Solana, Base, and Ethereum.

---

## Quick Start (< 5 minutes)

### Prerequisites

- Node.js 20+
- npm 10+
- Supabase CLI (`npx supabase`)
- A Supabase project (free tier works)
- At least one RPC endpoint (Solana or Base)

### 1. Clone & Install

```bash
git clone https://github.com/screwk/claimscan.git
cd claimscan
npm install
```

### 2. Environment Setup

```bash
cp .env.example .env.local
```

Edit `.env.local` with minimum required values:

```env
# Required
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SOLANA_RPC_URL=https://your-solana-rpc/KEY
NEXT_PUBLIC_SOLANA_RPC_URL=https://your-solana-rpc/KEY
BASE_RPC_URL=https://your-base-rpc/KEY
CRON_SECRET=any-random-string-for-dev
```

Optional but recommended:
```env
BAGS_API_KEY=             # Bags.fm fees
HELIUS_API_KEY=           # DAS API, token discovery
CLAIM_HMAC_SECRET=        # Dedicated claim auth (falls back to CRON_SECRET)
UPSTASH_REDIS_REST_URL=   # Persistent rate limiting
UPSTASH_REDIS_REST_TOKEN=
```

### 3. Database Setup

```bash
# Apply migrations to your Supabase project
npx supabase db push
```

12 migration files in `supabase/migrations/` create all tables, indexes, RLS policies, and the `creator_fee_summary` materialized view.

### 4. Run

```bash
npm run dev
```

Open `http://localhost:3000`. Search for a Twitter handle or wallet address.

---

## Project Structure

```
claimscan/
├── app/                        # Next.js App Router
│   ├── page.tsx                # Home — hero + search
│   ├── [handle]/page.tsx       # Creator profile (fee dashboard)
│   ├── docs/page.tsx           # Public API docs
│   └── api/                    # API routes (see docs/API.md)
│       ├── search/             # POST — identity resolve + fees
│       ├── resolve/            # POST — handle→wallets
│       ├── fees/               # aggregate, live, stream
│       ├── claim/              # bags, confirm
│       ├── cron/               # cleanup, index-fees, index-tokens, refresh-prices
│       ├── prices/             # GET — token prices (5min ISR)
│       ├── webhooks/helius/    # Helius DAS webhooks
│       └── honeypot/           # Fake data trap for scrapers
├── lib/                        # Shared business logic
│   ├── platforms/              # 9 launchpad adapters
│   ├── chains/                 # Solana, Base, ETH RPC configs
│   ├── resolve/                # Identity resolution (Twitter/GitHub/Farcaster/wallet)
│   ├── prices/                 # Price waterfall (DexScreener→Jupiter→CoinGecko)
│   ├── claim/                  # HMAC tokens for claim confirmation
│   ├── supabase/               # DB clients (browser, server, service-role)
│   ├── services/               # Creator resolution + persistence
│   ├── helius/                 # Helius DAS client + SSE registry
│   ├── constants.ts            # Program IDs, endpoints, fee config
│   ├── utils.ts                # BigInt helpers, validation
│   ├── rate-limit.ts           # Upstash + in-memory fallback
│   ├── turnstile.ts            # Cloudflare CAPTCHA
│   └── request-signing.ts      # HMAC request signatures
├── components/                 # React UI components
├── proxy.ts               # ~450 lines — security, rate limiting, CORS
├── supabase/migrations/        # 12 SQL migration files
├── e2e/                        # Playwright tests
├── scripts/                    # Utility scripts
├── public/                     # Static assets + Lottie animations
└── docs/                       # This documentation
```

---

## How the System Works

### Search Flow

1. User enters a handle/wallet on the homepage
2. `POST /api/search` calls `parseSearchQuery()` to detect the identity provider (twitter, wallet, farcaster, github)
3. `resolveAndPersistCreator()` checks Supabase cache, runs platform resolvers in parallel if stale
4. Platform adapters resolve handle→wallets (Bags, Clanker support identity resolution natively)
5. Fee records are fetched from DB (populated by cron) and returned to the frontend
6. Creator profile page (`/[handle]`) displays aggregated fees by platform/chain/token

### Claim Flow (Bags.fm only)

1. User connects Solana wallet via wallet-adapter
2. `POST /api/claim/bags` generates versioned transactions + HMAC confirmToken
3. Client signs TXs with wallet, updates status via `POST /api/claim/confirm`
4. Separate fee TX sent to treasury wallet, verified on-chain
5. Status flow: pending → signing → submitted → confirmed → finalized

### Cron Indexing

Two Vercel Cron jobs maintain data freshness:
- **Cleanup** (5 AM UTC): Prune old data, expire stuck claims
- **Index** (6 AM UTC): Fetch fees from all platforms, discover new tokens via GPA

---

## Key Conventions

| Convention | Rule |
|-----------|------|
| Token amounts | Always `string` (BigInt precision). Never `Number`. |
| Decimals | Solana = 9, EVM = 18 |
| Chain types | `'sol' \| 'base' \| 'eth'` |
| Claim status | `'claimed' \| 'unclaimed' \| 'partially_claimed' \| 'auto_distributed'` |
| Cache TTL | 40min normal, 2h for 500+ records |
| Price source | DexScreener (min $1k liq) → Jupiter → CoinGecko |
| Rate limits | 30/min general, 10/min search, 20 handles/5min anti-enum |

---

## Common Development Tasks

### Add a New Platform Adapter

1. Create `lib/platforms/newplatform.ts`
2. Implement the `PlatformAdapter` interface:

```typescript
export const newplatformAdapter: PlatformAdapter = {
  platform: 'newplatform',
  chain: 'sol', // or 'base', 'eth'
  supportsIdentityResolution: false,
  supportsLiveFees: false,
  supportsHandleBasedFees: false,
  historicalCoversLive: true,

  async resolveIdentity(handle, provider) { return []; },
  async getFeesByHandle(handle, provider) { return []; },
  async getCreatorTokens(wallet) { return []; },
  async getHistoricalFees(wallet) { /* your logic */ },
  async getLiveUnclaimedFees(wallet, signal?) { return []; },
  async getClaimHistory(wallet) { return []; },
};
```

3. Register in `lib/platforms/index.ts`
4. Add platform to the `Platform` type in `lib/platforms/types.ts`

### Add a New API Route

```typescript
// app/api/myroute/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60; // Vercel Hobby max
export const runtime = 'nodejs'; // default, or 'edge'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // ... logic
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[myroute] error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

Middleware automatically applies security headers, CORS, rate limiting.

### Run E2E Tests

```bash
npm run test:e2e          # headless
npm run test:e2e:ui       # with Playwright UI
```

Config: `playwright.config.ts`

---

## Database Schema Reference

See `supabase/migrations/` for full DDL. Key tables:

- **`creators`** — Central identity record (twitter/github/farcaster handles)
- **`wallets`** — Addresses linked to creators (chain + platform source)
- **`fee_records`** — Cached fees (unique on creator×platform×chain×token)
- **`claim_attempts`** — Claim lifecycle tracking (state machine)
- **`claim_fees`** — Fee TX log (on-chain verified)
- **`token_prices`** — Price cache (5min revalidate)
- **`creator_tokens`** — Discovered tokens via GPA
- **`search_log`** — Search analytics (IP hashed)

---

## Middleware Gotchas

The `proxy.ts` (~450 lines) handles ALL security. Things to know:

- Any POST to `/api/*` requires `Content-Length` header and max 4096 bytes
- Scraper UAs are blocked (python-requests, curl, wget, selenium, etc.)
- Requests without browser-like headers get tarpitted (0-5s delay)
- Anti-enumeration tracks unique handles per IP (20/5min window)
- Rate limiting uses Upstash Redis if configured, else in-memory (per-instance only)
- Cron endpoints require `Authorization: Bearer {CRON_SECRET}` (constant-time comparison)

**If developing locally:** Rate limits are relaxed in dev mode (10-30 req/min vs 5-15 in prod for in-memory fallback).

---

## Git Workflow

```
origin:  https://github.com/screwk/claimscan.git        # main repo
moinho:  https://github.com/LW-ARTS/ClaimScan-Moinho.git # fork
```

---

## Further Reading

- [Architecture Documentation](./ARCHITECTURE.md)
- [API Reference](./API.md)
- [Operational Runbook](./RUNBOOK.md)
- [Launch Playbook](../LAUNCH-PLAYBOOK.md)
