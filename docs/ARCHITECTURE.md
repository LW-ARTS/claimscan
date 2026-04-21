# ClaimScan — Architecture Documentation

> Cross-chain token fee tracking and claiming platform.
> Aggregates creator earnings from 10 launchpads across Solana, Base, and Ethereum.

---

## 1. System Context

ClaimScan enables token creators to discover unclaimed fees from launchpad deployments across multiple chains and claim them through a unified interface.

**Actors:**

- **Creator** — Token deployer searching for unclaimed fees via web UI
- **Cron Scheduler** — Vercel Cron triggers background indexing and cleanup
- **Platform APIs** — Bags.fm, Clanker, Raydium REST APIs
- **On-chain Programs** — Pump.fun, Zora, Believe, RevShare, Coinbarrel program accounts
- **Identity Providers** — Twitter/X, GitHub, Farcaster, Neynar for handle→wallet resolution

**High-Level Flow:**

```
Creator → Search (handle/wallet) → Identity Resolution → Wallet Discovery
  → Fee Aggregation (cached + live on-chain) → Display
  → Claim Flow (Bags.fm) → TX Generation → User Signs → Confirm → Finalize
```

---

## 2. Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16.2, React 19, TypeScript 5 |
| Styling | Tailwind CSS 4, Radix UI, Motion 12, Lottie |
| Solana | @solana/web3.js 1.98, wallet-adapter, spl-token |
| EVM | Viem 2.47 |
| Database | Supabase (PostgreSQL + RLS) |
| Cache | Upstash Redis (fallback: in-memory LRU) |
| Security | Sentry, Cloudflare Turnstile, HMAC signing |
| Deploy | Vercel (Hobby, 60s maxDuration) |

---

## 3. Architecture Layers

### 3.1 Presentation Layer (`app/`)

Next.js App Router with two main pages:

- **`/`** — Hero + search bar. Submits to `/api/search`, redirects to `/{handle}`.
- **`/[handle]`** — Creator profile. Fetches `/api/fees/aggregate`, optional SSE via `/api/fees/stream`. Wallet-connect for claiming.

Client-side wallet connection uses the Wallet Standard (auto-discovery, no explicit imports). Solana wallet-adapter handles signing of claim transactions.

### 3.2 API Layer (`app/api/`)

All API routes run on Vercel Serverless Functions with `maxDuration=60s`. Wallclock guards enforce 55s hard stop on long-running operations.

**Public Endpoints:**

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/search` | POST | Identity resolution + fee aggregation |
| `/api/resolve` | POST | Handle→wallet resolution (no fees) |
| `/api/fees/aggregate` | GET | Cached fee records by creator_id |
| `/api/fees/live` | POST | Real-time on-chain fee queries |
| `/api/fees/stream` | GET | SSE stream (request-signed) |
| `/api/prices` | GET | Token prices (5min ISR) |

**Claim Endpoints:**

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/claim/bags` | POST | Generate batch claim TXs (Bags.fm) |
| `/api/claim/confirm` | POST | Update claim status + verify fee TX |

**Cron Endpoints (Bearer auth):**

| Route | Schedule | Purpose |
|-------|----------|---------|
| `/api/cron/cleanup` | Daily 5 AM UTC | Expire claims, prune old data |
| `/api/cron/index-fees` | Daily 6 AM UTC | Sync fees from all platforms |
| `/api/cron/index-tokens` | Standalone | GPA-based token discovery |
| `/api/cron/refresh-prices` | Standalone | Batch price updates |

**Utility Endpoints:**

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/avatar` | GET | Proxy avatar images |
| `/api/balance` | GET | Wallet balance check |
| `/api/export/[...path]` | GET | Data export |
| `/api/flex` | GET | Flex endpoint |
| `/api/v2/[...path]` | * | V2 API namespace |

**Security Endpoints:**

| Route | Purpose |
|-------|---------|
| `/api/honeypot/[...path]` | Returns fake data to scrapers |
| `/api/admin/[...path]` | Redirect (no admin panel) |

### 3.3 Service Layer (`lib/`)

**Platform Adapters (`lib/platforms/`)** — 9 adapters implementing `PlatformAdapter`:

```
bags.ts      → REST API (Solana)     — Identity, Historical, Live, Claim
pump.ts      → On-chain GPA (Solana) — Historical
clanker.ts   → REST API (Base)       — Identity, Historical
zora.ts      → Contract reads (Base) — Historical
bankr.ts     → REST API (Base)
believe.ts   → GPA (Solana)          — Token Discovery
revshare.ts  → GPA (Solana)          — Token Discovery
coinbarrel.ts→ GPA + API (Solana)    — Historical, Token Discovery
raydium.ts   → REST API (Solana)     — Creator Tokens
```

**Identity Resolution (`lib/resolve/`)** — Parses search queries (Twitter URLs, wallet addresses, Farcaster handles, GitHub profiles) and resolves to wallet addresses via platform APIs + Neynar.

**Price Resolution (`lib/prices/`)** — Waterfall: DexScreener (min $1k liquidity) → Jupiter (SOL only) → CoinGecko → 0. Stale-while-revalidate for native prices.

**Claim Engine (`lib/claim/`)** — HMAC-SHA256 token generation for claim confirmation. 15min expiry, constant-time verification.

### 3.4 Data Layer (Supabase)

**Core Tables:**

```
creators          — Central identity (handles, avatar, timestamps)
wallets           — Linked addresses (chain, platform, verified)
fee_records       — Cached fees (6-tuple unique: creator×platform×chain×token)
claim_attempts    — Claim lifecycle (pending→signing→submitted→confirmed→finalized)
claim_fees        — Fee TX log (verified on-chain)
claim_events      — Claim history
token_prices      — Price cache
creator_tokens    — Discovered tokens (GPA)
search_log        — Analytics
```

**Materialized View:** `creator_fee_summary` — Pre-aggregated stats for dashboard queries.

**RLS Policies:** fee_records public read, claim_attempts wallet-scoped, service-role for crons.

### 3.5 Proxy (~450 lines)

Single `proxy.ts` handling all cross-cutting concerns:

1. **Security Headers** — CSP, HSTS, X-Frame-Options, Permissions-Policy
2. **CORS** — Origin allowlist (claimscan.tech variants)
3. **Scraper Blocking** — UA detection (python, curl, selenium, bots)
4. **Tarpit** — 0-5s delay for suspicious requests (missing browser headers)
5. **Anti-Enumeration** — Max 20 unique handles per IP per 5min window
6. **Rate Limiting** — 30 req/min general, 10 req/min search (Upstash or in-memory)
7. **Body Size** — 4096 byte max, Content-Length required on POST
8. **Cron Auth** — Bearer token constant-time comparison
9. **Request Signing** — Optional HMAC on SSE stream

---

## 4. Data Flow Diagrams

### 4.1 Search Flow

```
User Input (handle/wallet)
  │
  ▼
POST /api/search
  ├─ Turnstile CAPTCHA verification (optional)
  ├─ parseSearchQuery() → detect provider (twitter/wallet/farcaster/github)
  ├─ resolveAndPersistCreator()
  │   ├─ Check Supabase cache (creator + wallets)
  │   ├─ If stale: run platform resolvers in parallel (Promise.allSettled)
  │   ├─ Deduplicate wallets by chain:address
  │   └─ Upsert creator + wallets to DB
  ├─ Fetch fee_records from DB
  └─ Return { creator, wallets, fees, cached }
```

### 4.2 Claim Flow (Bags.fm)

```
User clicks "Claim" on token
  │
  ▼
POST /api/claim/bags { wallet, tokenMints[] }
  ├─ Inline cleanup (expire stale claims)
  ├─ Rate limit check (max 30 active per wallet)
  ├─ Optimistic lock: INSERT pending claim_attempts
  ├─ generateBatchClaimTransactions(wallet, mints)
  ├─ Calculate fee: (unclaimed × 85bps) / 10000
  └─ Return { transactions[], feeLamports, confirmToken }
       │
       ▼
  Client signs TX with wallet adapter
       │
       ▼
POST /api/claim/confirm { claimAttemptId, status: "signing" }
       │
       ▼
  Client submits TX to Solana RPC
       │
       ▼
POST /api/claim/confirm { status: "submitted", txSignature }
       │
       ▼
POST /api/claim/confirm { feeTx: true, txSignature: feeSig }
  ├─ Verify on-chain: treasury received funds
  └─ Store actual transferred amount
       │
       ▼
POST /api/claim/confirm { status: "confirmed" }
  └─ Invalidate Bags API cache
```

### 4.3 Cron Indexing Flow

```
Vercel Cron (6 AM UTC)
  │
  ▼
GET /api/cron/index-fees?also=tokens
  ├─ Auth: Bearer CRON_SECRET
  ├─ Phase 1: Fee Indexing
  │   ├─ Query stale creators (updated >1h ago), max 5
  │   ├─ For each creator:
  │   │   ├─ Fetch all platform adapters (Promise.allSettled)
  │   │   ├─ Preserve highest claimed values (no regression)
  │   │   ├─ Recompute: totalEarned = totalClaimed + totalUnclaimed
  │   │   └─ Upsert fee_records
  │   └─ Wallclock guard: stop at 55s
  └─ Phase 2: Token Discovery
      ├─ Query stale token_sync (>10min), max 1
      ├─ GPA discovery (Coinbarrel, Believe, RevShare)
      └─ Upsert creator_tokens
```

---

## 5. Key Design Decisions

### 5.1 BigInt as String
All token amounts stored as `VARCHAR` to avoid JavaScript `Number` precision loss. Calculations use `BigInt` arithmetic, never floating-point. Decimals: Solana=9, EVM=18.

### 5.2 Optimistic Concurrency on Claims
Claims use optimistic locking instead of pessimistic DB locks. Read current status, verify it hasn't changed, then update. Race conditions handled by unique constraints + retry logic. Self-healing cleanup expires stuck claims after 5min (pending/signing) or 2min (submitted).

### 5.3 Price Waterfall with Stale-While-Revalidate
DexScreener → Jupiter → CoinGecko. If all fail, return cached price. Minimum $1k liquidity filter on DexScreener prevents manipulation via low-liq pools.

### 5.4 Adapter Fault Isolation
All platform adapters run via `Promise.allSettled`. One adapter failing (rate limit, API down) doesn't block the entire search/indexing flow.

### 5.5 Middleware-First Security
All security enforcement happens in middleware (rate limiting, CORS, anti-scraping, tarpit) before any route handler executes. No per-route security boilerplate.

### 5.6 Cron Self-Healing
Claim cleanup runs inline (on every `/api/claim/bags` request) and in the dedicated cleanup cron. Dual approach ensures stuck claims don't permanently block users even if cron fails.

---

## 6. Security Architecture

### Layers

1. **Edge (Middleware)** — UA blocking, tarpit, rate limiting, CORS, headers
2. **Transport** — HTTPS only, HSTS 2yr, request signing (optional HMAC)
3. **Application** — Turnstile CAPTCHA, HMAC claim tokens, body size limits
4. **Data** — RLS policies, service-role isolation, IP hashing in search_log
5. **Monitoring** — Sentry error tracking, honeypot detection

### Threat Mitigations

| Threat | Mitigation |
|--------|-----------|
| API scraping | UA blocking + tarpit + rate limiting + request signing |
| Handle enumeration | 20 handles/5min/IP window |
| Claim replay | HMAC tokens with 15min expiry + constant-time comparison |
| Fee inflation | On-chain verification of actual transferred amounts |
| DoS | 4KB body limit + rate limiting + Vercel edge |
| Data leakage | IP hashing, RLS, no PII in logs |

---

## 7. Performance Constraints

- **Vercel Hobby:** 60s max function duration, 2 cron jobs max
- **Wallclock Guards:** 55s hard stop (5s safety margin)
- **Large Creators:** 500+ fee_records → cron-indexed only (no on-demand)
- **Fee Records Cap:** 500 records max per aggregate query (truncated flag)
- **Batch Limits:** 10 wallets/SSE, 10 mints/claim, 30 active claims/wallet
- **Cache TTLs:** 40min normal, 2h for large creators, 5min prices
