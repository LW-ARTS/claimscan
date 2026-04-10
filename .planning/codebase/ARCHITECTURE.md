# ClaimScan Architecture

## Overview
ClaimScan is a Next.js 16 App Router application that tracks and aggregates fee data across 9 crypto launchpads and 4 blockchains (Solana, Base, Ethereum, BSC). The architecture follows a clean layered design: **Next.js routes → services → platform adapters → chain modules**.

## Core Architecture Pattern

### 1. Entry Points (HTTP Handlers)

**Main Routes:**
- `app/page.tsx` - Hero landing page with search interface
- `app/[handle]/page.tsx` - Creator profile (identity resolution + fee display, 10s timeout, 30min ISR)
- `app/leaderboard/page.tsx` - Creator ranking by unclaimed fees
- `app/terms/page.tsx` - Terms of Service (includes v2 pricing)
- `app/docs/page.tsx` - API documentation

**API Routes (Next.js):**
- `app/api/search/route.ts` - POST resolve identity + fetch fees (primary search)
- `app/api/resolve/route.ts` - GET wallet addresses for an identity
- `app/api/fees/aggregate/route.ts` - GET aggregated fees for a creator_id
- `app/api/fees/live/route.ts` - GET real-time unclaimed fees (onchain query)
- `app/api/fees/live-stream/route.ts` - SSE stream for live fee updates
- `app/api/prices/route.ts` - GET cached token prices (5min revalidate)
- `app/api/stats/route.ts` - GET platform statistics (24h ISR)
- `app/api/leaderboard/route.ts` - GET creator ranking data
- `app/api/claim/bags/route.ts` - POST claim flow for Bags.fm
- `app/api/claim/confirm/route.ts` - POST claim confirmation (updates DB)

**Cron Jobs (Vercel):**
- `app/api/cron/index-fees/route.ts` - Sync fees from all adapters → Supabase
- `app/api/cron/index-tokens/route.ts` - Discover new tokens per creator
- `app/api/cron/refresh-prices/route.ts` - Update token price cache
- `app/api/cron/cleanup/route.ts` - Expire old claim attempt records

**Monetized API v2 (x402):**
- `app/api/v2/fees/route.ts` - GET fees ($0.01/req via x402)
- `app/api/v2/export/route.ts` - GET export data ($0.05/req)
- `app/api/v2/intelligence/route.ts` - GET Allium wallet PnL ($0.02/req)
- `app/api/v2/resolve/route.ts` - GET OWS wallet resolution
- `app/api/v2/[...path]/route.ts` - Catch-all x402 payment routing

All routes protected by `proxy.ts` middleware (~528 lines) which enforces security headers, rate limiting, request signing, CSP, CORS, and honeypot traps.

### 2. Services Layer

**File:** `lib/services/`

**Creator Service** (`creator.ts`):
- `resolveAndPersistCreator(handle, provider)` - lookup + insert/update in `creators` table
- `enrichCreatorProfile()` - join wallets + tokens

**Fee Sync Service** (`fee-sync.ts`):
- `aggregateFees(handle, provider, wallets, log)` - fetch from all adapters, merge by key, return `AggregatedFees`
- `persistFees(creator_id, fees, syncedPlatforms)` - upsert `fee_records`, prune stale rows for non-failed platforms
- Orchestrates handle-based + wallet-based fee queries in parallel

**Resolve Service** (`resolve.ts`):
- `resolveIdentity(handle, provider)` - route to Twitter/GitHub/Farcaster/OWS resolver
- Returns `ResolvedWallet[]` (chain + address pairs)

**Stats Service** (`stats.ts`):
- Compute aggregates (total unclaimed USD, token counts, claim status distribution)

**Leaderboard Service** (`leaderboard.ts`):
- Query + rank creators by unclaimed fees, pagination

### 3. Platform Adapter Layer

**File:** `lib/platforms/`

**Interface** (`types.ts` - the contract):
```typescript
export interface PlatformAdapter {
  platform: Platform;  // 'pump' | 'bags' | 'clanker' | 'zora' | 'bankr' | 'believe' | 'revshare' | 'coinbarrel' | 'raydium'
  chain: Chain;        // 'sol' | 'base' | 'eth' | 'bsc'

  // Capabilities flags
  supportsIdentityResolution: boolean;
  supportsLiveFees: boolean;
  supportsHandleBasedFees: boolean;
  historicalCoversLive: boolean;

  // Core methods
  resolveIdentity(handle: string, provider: IdentityProvider): Promise<ResolvedWallet[]>;
  getFeesByHandle(handle: string, provider: IdentityProvider): Promise<TokenFee[]>;
  getCreatorTokens(wallet: string): Promise<CreatorToken[]>;
  getHistoricalFees(wallet: string): Promise<TokenFee[]>;
  getLiveUnclaimedFees(wallet: string, signal?: AbortSignal): Promise<TokenFee[]>;
  getClaimHistory?(wallet: string): Promise<ClaimEvent[]>;
}
```

**Key Adapters:**
- `bags.ts` (Bags.fm) - Solana, supports identity resolution + handle fees + live unclaimed
- `pump.ts` (Pump.fun) - Solana, synthetic token IDs for vault aggregation
- `bankr.ts` (Bankr) - Base/ETH/BSC, full multi-chain support
- `clanker.ts` (Clanker) - Base/BSC, Twitter handle fee allocation
- `zora.ts` (Zora) - Base, NFT/creator fees
- `raydium.ts` (Raydium) - Solana, AMM fee key NFT ownership
- `believe.ts`, `revshare.ts`, `coinbarrel.ts` - various platforms and chains

**Registry** (`index.ts`):
- `getIdentityResolvers()` - adapters with `supportsIdentityResolution = true`
- `getAllAdapters()` - all 9 adapters
- `getLiveFeeAdapters()` - adapters with live onchain support
- `getHandleFeeAdapters()` - adapters with handle-based fees

### 4. Chain Modules

**File:** `lib/chains/`

- `solana.ts` - validation, address utilities, Helius RPC integration
- `base.ts` - EVM utilities, Alchemy RPC integration
- `eth.ts` - Ethereum-specific logic
- `bsc.ts` - BSC-specific logic
- `clanker-reads.ts` - Specialized EVM read functions for Clanker

### 5. Data Flow Examples

#### Search + Profile Load (User clicks "VitalikButerin")
```
[Request] /vitalikbuterin
  ↓
[parseSearchQuery] detect provider (twitter)
  ↓
[resolveIdentity] Bags adapter → Twitter API → wallet address
  ↓
[aggregateFees]
  ├─ [getFeesByHandle] "vitalikbuterin" → all platforms → [handleFees]
  └─ [getHistoricalFees] wallets → Pump/Bags/Bankr → [walletFees]
  ↓
[mergeFees] dedup by platform:chain:tokenAddress (wallet > handle precedence)
  ↓
[persistFees] INSERT/UPDATE fee_records → Supabase
  ↓
[ProfileHero] display aggregated USD + claim status
  ↓
[PlatformBreakdown] live SSE polling via LiveFeesProvider context
  ├─ [LiveFeesProvider] fetch /fees/live-stream → SSE
  └─ merge live overlay + cached fees → display table
```

#### Cron Fee Sync (index-fees runs every 2h)
```
[Cron] GET /api/cron/index-fees?secret=CRON_SECRET
  ↓
[getAllAdapters] load all 9 adapters
  ↓
[For each creator in DB]
  ├─ [aggregateFees] wallet + handle queries
  ├─ [persistFees] upsert fee_records
  └─ [log metrics] record sync duration + counts
  ↓
[Pruning] delete stale rows only for syncedPlatforms (avoid deleting if adapter failed)
```

#### Live Fees Real-Time (client polls /fees/live-stream)
```
[Request] GET /api/fees/live-stream?creator_id=uuid
  ↓
[getLiveFeeAdapters] Bags, Pump, Bankr, Raydium
  ↓
[For each adapter]
  ├─ [getLiveUnclaimedFees] onchain RPC query (with AbortSignal timeout)
  └─ yield TokenFee immediately
  ↓
[SSE stream] send chunks as JSON events
  ↓
[LiveFeesProvider] parse stream → update Map<string, TokenFee[]>
  ↓
[Components] useLiveFees() → re-render with fresh unclaimed amounts
```

### 6. Database Persistence

**Supabase Schema** (`supabase/migrations/`):
- `creators` - identity hub (twitter_handle, github_handle, farcaster_id, wallet_address)
- `wallets` - linked addresses (creator_id, chain, address, resolved_at)
- `creator_tokens` - tokens launched (creator_id, platform, chain, token_address)
- `fee_records` - cached fees (creator_id, platform, chain, token_address, total_earned, total_claimed, total_unclaimed, total_earned_usd, claim_status, last_synced_at)
- `claim_events` - individual claims (creator_id, platform, tx_hash, amount_usd, claimed_at)
- `claim_attempts` - pending claims (creator_id, status: pending|signing|submitted|confirmed|failed|expired, expires_at)
- `token_prices` - price cache (token_address, chain, price_usd, source, updated_at)

**RLS Policies:** Anon key can read public fees; service role can write cron updates.

### 7. Caching Strategy

- **DB Caching:** `fee_records` table indexed by (creator_id, last_synced_at)
- **Redis (Upstash):** Token prices (5min TTL), rate limit counters
- **Next.js ISR:** `/api/stats` (24h revalidate), `/[handle]` pages (30min)
- **Live Overlay:** SSE stream merges cached rows + real-time unclaimed amounts

### 8. Cross-Cutting Concerns

**Security** (`proxy.ts`):
- CSP headers + allowlist (fonts.googleapis.com for DM Sans from wallet-adapter)
- Rate limiting (30 req/min general, 10 req/min search)
- Request signing (HMAC-SHA256 for API v2)
- Honeypot endpoint returns synthetic data to trap scrapers

**Logging** (`lib/logger.ts`):
- Structured logger with context (handle, wallet, fee counts)
- Timed operations tracked for performance monitoring

**Monitoring** (`lib/monitoring.ts`):
- Sentry integration (error tracking)
- Custom instrumentation for fee aggregation latency

**Identity Resolution** (`lib/resolve/`):
- Twitter/GitHub/Farcaster/OWS wallet name resolvers
- Composite query parser (wallet addresses, @handles, URLs)
- Enumeration protection (20 handles/5min anti-abuse)

**Claim Management** (`lib/claim/`):
- HMAC confirmation tokens for claim flow
- Claim attempt state machine (pending → signed → confirmed → finalized)

## Key Invariants

1. **Token amounts as strings** - preserved BigInt precision (no Number > 2^53 loss)
2. **Composite fee key** - `${platform}:${chain}:${tokenAddress}` uniquely identifies a fee record
3. **Wallet > Handle precedence** - if same token appears in both sources, wallet fees win (higher earned or claimed)
4. **Live covers cached** - live unclaimed overlays cached fees; never double-counts
5. **Claim status invariant** - claimed + unclaimed = total earned (enforced in adapters)

## Files by Concern

**API Routes:** `app/api/*/route.ts`  
**Services:** `lib/services/*.ts`  
**Platform Adapters:** `lib/platforms/*.ts`  
**Chain Support:** `lib/chains/*.ts`  
**Database:** `lib/supabase/`, `supabase/migrations/`  
**Utilities:** `lib/utils.ts`, `lib/logger.ts`, `lib/monitoring.ts`  
**Security:** `proxy.ts`, `lib/request-signing.ts`  
