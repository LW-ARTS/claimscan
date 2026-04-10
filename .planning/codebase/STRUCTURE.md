# ClaimScan Directory Structure

## Root Layout

```
/Users/lowellmuniz/Projects/claimscan/
├── app/                              # Next.js App Router
├── lib/                              # Core business logic & utilities
├── components/                       # Shared UI components (at root for Shadcn)
├── public/                           # Static assets
├── supabase/                         # Database migrations & RLS policies
├── e2e/                              # Playwright end-to-end tests
├── scripts/                          # Utility scripts (deployment, setup)
├── docs/                             # Documentation & guides
├── .planning/                        # Architecture & planning docs
├── .github/                          # GitHub Actions CI/CD
├── .vercel/                          # Vercel deployment config
├── package.json                      # Dependencies (Next.js 16, React 19, Viem, Solana)
├── tsconfig.json                     # TypeScript config
├── next.config.ts                    # Next.js config (Turbopack, instrumentation)
├── tailwind.config.ts                # Tailwind CSS 4 config
├── proxy.ts                          # Security middleware (~528 lines)
├── instrumentation.ts                # Sentry initialization
├── playwright.config.ts              # E2E test config
├── DESIGN-SPEC.md                    # Design tokens (source of truth)
└── Claimscan.pen                     # Pencil design file (encrypted)
```

## App Router (`app/`)

### Pages (Routes)

```
app/
├── page.tsx                          # Home/hero landing (search interface)
├── [handle]/
│   ├── page.tsx                      # Creator profile (10s timeout, 30min ISR)
│   ├── opengraph-image.tsx           # Dynamic OG image per creator (server component)
│   ├── loading.tsx                   # Skeleton: signal radar scanning animation
│   └── error.tsx                     # Error boundary fallback
├── leaderboard/
│   ├── page.tsx                      # Ranking by unclaimed fees (top 1000)
│   ├── opengraph-image.tsx           # Dynamic OG for leaderboard (server component)
│   └── loading.tsx                   # Skeleton: header + filter chips + 10 rows
├── terms/
│   ├── page.tsx                      # ToS (includes v2 pricing)
│   ├── loading.tsx                   # Skeleton: numbered legal sections
│   └── layout.tsx                    # Sidebar nav layout
├── docs/
│   ├── page.tsx                      # API documentation
│   ├── loading.tsx                   # Skeleton: header + sidebar + 3 sections
│   └── layout.tsx                    # Sidebar nav layout
├── api/
│   ├── search/route.ts               # POST - resolve identity + fetch fees
│   ├── resolve/route.ts              # GET - wallet addresses for identity
│   ├── prices/route.ts               # GET - cached prices (5min revalidate)
│   ├── fees/
│   │   ├── aggregate/route.ts        # GET - aggregated fees by creator_id
│   │   ├── live/route.ts             # GET - real-time unclaimed fees
│   │   ├── live-stream/route.ts      # SSE - fee stream updates
│   │   └── stream/route.ts           # Legacy fee stream
│   ├── balance/route.ts              # GET - wallet balance lookup
│   ├── flex/route.ts                 # GET - creator flex stats (dashboard-like)
│   ├── stats/route.ts                # GET - platform stats (24h ISR)
│   ├── leaderboard/route.ts          # GET - creator ranking (paginated)
│   ├── claim/
│   │   ├── bags/route.ts             # POST - Bags.fm claim flow (token transfer)
│   │   └── confirm/route.ts          # POST - confirm + verify on-chain claim
│   ├── avatar/route.ts               # GET - avatar proxy (fetch + serve external)
│   ├── export/[...path]/route.ts     # GET - export creator data (CSV/JSON)
│   ├── honeypot/[...path]/route.ts   # GET - anti-scraper honeypot (returns fake data)
│   ├── og-download/[handle]/route.ts # GET - download OG image dynamically
│   ├── admin/[...path]/route.ts      # Protected admin endpoints
│   ├── webhooks/
│   │   └── helius/route.ts           # POST - Helius DAS webhook for token discovery
│   └── v2/ (Paid API x402)
│       ├── fees/route.ts             # GET - fees ($0.01/req x402)
│       ├── export/route.ts           # GET - export ($0.05/req x402)
│       ├── intelligence/route.ts     # GET - Allium wallet PnL ($0.02/req x402)
│       ├── resolve/route.ts          # GET - OWS wallet resolution
│       └── [...path]/route.ts        # Catch-all x402 router
├── cron/ (Vercel Cron)
│   ├── index-fees/route.ts           # Sync fees from adapters → Supabase (2h interval)
│   ├── index-tokens/route.ts         # Discover tokens per creator (daily)
│   ├── refresh-prices/route.ts       # Update price cache (30min)
│   └── cleanup/route.ts              # Expire claim attempts (hourly)
├── components/
│   ├── anim/
│   │   ├── CountUp.tsx               # Animated number counter
│   │   ├── CountUpLazy.tsx           # CountUp with IntersectionObserver
│   │   ├── RevealOnScroll.tsx        # Trigger animation on scroll visibility
│   │   ├── RevealMount.tsx           # Trigger on mount
│   │   └── tokens.ts                 # DURATION, EASE constants (motion 12)
│   ├── SearchBar.tsx                 # Input field + search handler
│   ├── ProfileHero.tsx               # Creator header (USD totals, claim status)
│   ├── ProfileJsonLd.tsx             # JSON-LD schema for OG
│   ├── PlatformBreakdown.tsx         # Fee table (platform × chain × token)
│   ├── ClaimDialog.tsx               # Modal for claim confirmation
│   ├── ClaimHistory.tsx              # Claim transaction timeline
│   ├── ScanStatusLog.tsx             # Fee sync status log
│   ├── LiveFeesProvider.tsx          # Context (SSE polling, live fee updates)
│   ├── EmptyFeesCallout.tsx          # No fees found message
│   ├── ErrorBoundary.tsx             # Error boundary wrapper
│   ├── SiteFooter.tsx                # Global footer
│   ├── WalletButton.tsx              # Solana wallet connection button
│   ├── HeroReveal.tsx                # Hero section animation
│   ├── GrainientBackground.tsx       # Animated gradient background
│   ├── MoneyFaceEmoji.tsx            # Money face emoji animation
│   ├── DocsSidebar.tsx               # Sidebar navigation for /docs
│   ├── TermsSidebar.tsx              # Sidebar navigation for /terms
│   ├── LazySection.tsx               # Suspense boundary for dynamic sections
│   └── JsonLd.tsx                    # JSON-LD schema generator
├── layout.tsx                        # Root layout (Sentry, Suspense fallbacks)
├── loading.tsx                       # Global loading skeleton (skeleton blocks pulse)
└── globals.css                       # Tailwind base, components, utilities

```

## Lib (`lib/`)

### Core Services

```
lib/
├── services/
│   ├── creator.ts                    # resolveAndPersistCreator, enrichCreatorProfile
│   ├── fee-sync.ts                   # aggregateFees, persistFees, AggregatedFees interface
│   ├── resolve.ts                    # resolveIdentity (dispatch to Twitter/GitHub/Farcaster)
│   ├── stats.ts                      # Compute platform statistics
│   └── leaderboard.ts                # Query + rank creators
```

### Platform Adapters

```
lib/platforms/
├── types.ts                          # PlatformAdapter interface, TokenFee, CreatorToken types
├── index.ts                          # Registry (getIdentityResolvers, getAllAdapters, etc.)
├── bags.ts                           # Bags.fm adapter (Solana)
├── bags-api.ts                       # Bags API client
├── bags-claim.ts                     # Bags claim flow helpers
├── pump.ts                           # Pump.fun adapter (Solana, synthetic IDs)
├── bankr.ts                          # Bankr adapter (multi-chain: Base, ETH, BSC)
├── clanker.ts                        # Clanker adapter (Base, BSC)
├── zora.ts                           # Zora adapter (Base)
├── raydium.ts                        # Raydium adapter (Solana, NFT fee key)
├── believe.ts                        # Believe adapter
├── revshare.ts                       # RevShare adapter
├── coinbarrel.ts                     # Coinbarrel adapter
├── solana-metadata.ts                # Solana token metadata enrichment
└── cached-tokens.ts                  # Token cache helpers
```

### Chain Support

```
lib/chains/
├── solana.ts                         # Solana utilities (isValidSolanaAddress, Helius RPC)
├── base.ts                           # Base/Ethereum utilities (EVM validation, Alchemy RPC)
├── eth.ts                            # Ethereum-specific logic
├── bsc.ts                            # BSC-specific logic
└── clanker-reads.ts                  # Specialized EVM reads for Clanker
```

### Identity Resolution

```
lib/resolve/
├── identity.ts                       # parseSearchQuery, resolveIdentity orchestrator
├── twitter.ts                        # Twitter API lookup
├── github.ts                         # GitHub API lookup
├── farcaster.ts                      # Farcaster Neynar API lookup
└── validators.ts                     # Address/handle validation helpers
```

### Database

```
lib/supabase/
├── client.ts                         # Anon-key client (browser + edge)
├── server.ts                         # Server-side client (service role)
├── service.ts                        # Service role client with cron auth
├── types.ts                          # Supabase TypeScript types (auto-generated)
└── queries.ts                        # Common RLS-safe query helpers

supabase/
├── migrations/
│   ├── 001_creators.sql              # Create creators table
│   ├── 002_wallets.sql               # Create wallets table
│   ├── 003_creator_tokens.sql        # Create creator_tokens table
│   ├── 004_fee_records.sql           # Create fee_records table
│   ├── 005_claim_events.sql          # Create claim_events table
│   ├── 006_claim_attempts.sql        # Create claim_attempts table
│   ├── 007_token_prices.sql          # Create token_prices table
│   ├── 008_search_log.sql            # Create search_log analytics table
│   ├── 009_rls_policies.sql          # Enable RLS + policies
│   └── ... (29 files total)
├── schema.sql                        # Current schema snapshot
└── seed.sql                          # Development seed data (optional)
```

### Prices

```
lib/prices/
├── index.ts                          # Main export (getNativeTokenPrices)
├── dexscreener.ts                    # DexScreener API client
├── jupiter.ts                        # Jupiter swap API (Solana)
└── coingecko.ts                      # CoinGecko API (fallback)
```

### Specialized Integrations

```
lib/helius/
├── client.ts                         # Helius RPC wrapper (Solana)
├── transactions.ts                   # Transaction parsing (fee extraction)
├── discovery.ts                      # DAS token discovery by address
└── webhooks.ts                       # Webhook signature verification

lib/allium/
└── client.ts                         # Allium API (wallet PnL enrichment)

lib/ows/
└── resolve.ts                        # OWS wallet name resolution

lib/x402/
└── server.ts                         # x402 payment protocol (paid API v2)

lib/claim/
└── hmac.ts                           # HMAC-SHA256 confirmation tokens
```

### Utilities

```
lib/
├── utils.ts                          # safeBigInt, computeFeeUsd, formatters, helpers
├── constants.ts                      # Platform config, chain RPC URLs, env defaults
├── constants-evm.ts                  # EVM-specific constants
├── logger.ts                         # Structured logging with context
├── monitoring.ts                     # Sentry integration + instrumentation
├── turnstile.ts                      # Cloudflare Turnstile CAPTCHA verification
├── rate-limit.ts                     # Rate limiting utilities (Upstash)
├── request-signing.ts                # Request HMAC signing for API v2
├── signed-fetch.ts                   # Signed HTTP requests
└── distributed-lock.ts               # Distributed locking (claim atomicity)

lib/hooks/
└── use-reduced-motion.ts             # Accessibility hook (prefers-reduced-motion)
```

## Component Patterns

### Shared Components (root `components/`)
```
components/
└── ui/                               # Radix UI primitives (auto-imported)
    ├── button.tsx
    ├── dialog.tsx
    ├── dropdown-menu.tsx
    ├── ...
```

### App Components (in `app/components/`)
- All page-level + layout components live here
- Lazy-loaded via `dynamic()` for code splitting
- Live providers (LiveFeesProvider) manage client state
- Error boundaries + suspense boundaries for streaming

## Configuration Files

```
next.config.ts                        # Turbopack, instrumentation, Next config
tailwind.config.ts                    # Tailwind CSS 4 config (fonts, colors, extend)
tsconfig.json                         # Strict TS, path aliases (@/lib, @/app)
components.json                       # Shadcn component config
vitest.config.ts                      # Unit test runner
playwright.config.ts                  # E2E test setup
.env.example                          # All env vars (template for .env.local)
.env.local                            # Actual secrets (git-ignored)
package.json                          # Dependencies, scripts
```

## Security & Middleware

```
proxy.ts                              # ~528 lines - entry point for ALL requests
                                      # Enforces: CSP, rate limiting, request signing,
                                      # honeypot, CORS, x402 routing, CRON_SECRET checks

sentry.client.config.ts               # Sentry client-side configuration
sentry.server.config.ts               # Sentry server-side configuration
sentry.edge.config.ts                 # Sentry edge runtime configuration
```

## Testing

```
e2e/                                  # Playwright E2E tests
├── profile.spec.ts                   # Profile page tests
├── search.spec.ts                    # Search tests
└── leaderboard.spec.ts               # Leaderboard tests

lib/__tests__/                        # Unit tests (Vitest)
├── utils.spec.ts
├── resolve.spec.ts
└── ...
```

## Static Assets & Design

```
public/                               # Static files
├── og-image.png                      # Default OG image
├── logo.svg                          # Logo SVG
├── fonts/                            # Custom fonts
└── ...

design-reference/                     # 54 DESIGN.md PNG exports (@2x)
                                      # (Reference visuals for UI components)

DESIGN-SPEC.md                        # Design token source of truth
                                      # (Extracted from Claimscan.pen)

Claimscan.pen                         # Encrypted Pencil design file
                                      # (Read/write via Pencil MCP only)
```

## Key Files by Responsibility

| Concern | Files |
|---------|-------|
| **Fee Aggregation** | `lib/services/fee-sync.ts`, `lib/platforms/*.ts` |
| **Identity Resolution** | `lib/resolve/identity.ts`, `lib/resolve/*.ts` |
| **Blockchain Data** | `lib/chains/*.ts`, `lib/helius/*.ts` |
| **Database** | `lib/supabase/*.ts`, `supabase/migrations/` |
| **API Routes** | `app/api/*/route.ts` |
| **Frontend Pages** | `app/[handle]/page.tsx`, `app/leaderboard/page.tsx` |
| **Real-time Updates** | `app/components/LiveFeesProvider.tsx`, `app/api/fees/live-stream/route.ts` |
| **Security** | `proxy.ts`, `lib/request-signing.ts`, `lib/turnstile.ts` |
| **Caching & Prices** | `lib/prices/*.ts`, `lib/services/fee-sync.ts` |
| **Monitoring** | `lib/logger.ts`, `lib/monitoring.ts`, `sentry.*.config.ts` |

## Naming Conventions

- **API routes:** Kebab-case directories (`fees/aggregate`, `live-stream`)
- **Services:** Filename matches export (e.g., `fee-sync.ts` exports `aggregateFees`)
- **Adapters:** Platform name is filename (e.g., `bags.ts` implements Bags adapter)
- **Types:** Defined in `types.ts` per module (e.g., `lib/platforms/types.ts`)
- **Components:** PascalCase, match functionality (e.g., `PlatformBreakdown.tsx`)
- **Utilities:** camelCase (e.g., `safeBigInt`, `computeFeeUsd`)
- **Constants:** UPPER_SNAKE_CASE (e.g., `PLATFORM_CONFIG`)

## Critical Files Reference

**Entry Points:**
- `proxy.ts` - Request security & routing
- `app/layout.tsx` - Root layout + Sentry init
- `next.config.ts` - Build config

**Core Logic:**
- `lib/services/fee-sync.ts` - Fee orchestration
- `lib/platforms/types.ts` - Adapter interface
- `lib/resolve/identity.ts` - Identity resolution

**Database:**
- `lib/supabase/service.ts` - Service role operations
- `supabase/migrations/` - Schema evolution

**API v2 (Paid):**
- `lib/x402/server.ts` - x402 payment processor
- `app/api/v2/[...path]/route.ts` - Monetized routing
