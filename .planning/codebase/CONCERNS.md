# ClaimScan — Technical Debt & Areas of Concern

## Critical Issues (P0 — Production Risk)

### C1: Fail-Open Request Signing in Edge Context
**File:** `proxy.ts:34-46`  
**Issue:** `verifyRequestSignature()` catches import errors and returns `true` in production, bypassing all request validation if the `request-signing` module fails to load.
```typescript
catch (err) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[middleware] CRITICAL: request-signing module failed to load', err);
    return false; // Fixed in latest code
  }
  return true; // Fail-open if dev
}
```
**Risk:** API key validation can be silently bypassed. Status: Fixed (now returns `false` in prod).

### C2: SSE Stream Capped at 10s on Hobby Plan
**File:** `app/api/fees/stream` (route.ts, maxDuration=10)  
**Issue:** Vercel Hobby Plan limits serverless functions to 10 seconds. SSE heartbeat configured for 30s never fires.
**Impact:** Real-time fee updates via `/api/fees/stream` are non-functional for free tier users.
**Solution:** Migrate to Pro Plan (300s max) or replace SSE with client-side polling every 30s via `/api/fees/live`.

### C3: In-Memory Rate Limiter Resets on Cold Starts
**File:** `proxy.ts:54, lib/rate-limit.ts` (fallback in-memory map)  
**Issue:** Per-instance in-memory rate limit map (`rateLimitMap`) on Vercel serverless resets with each cold start. Attackers can bypass rate limits by triggering new instances.
**Mitigation:** Upstash Redis fallback exists but must be configured in production.
**Action:** Add health check in build step: fail hard if `UPSTASH_REDIS_REST_URL` missing in `NODE_ENV=production`.

---

## High-Priority Technical Debt (P1 — Maintainability & Reliability)

### H1: God Module — Creator.ts (556 lines)
**File:** `lib/services/creator.ts`  
**Issue:** Orchestrates 9 concerns in single file: parse → cache → identity resolution → fee aggregation → upsert → claim preservation → token disappearance detection → claim history → search logs.
**Impact:** Hard to test, difficult to debug, coupled concerns.
**Recommendation:** Extract into 3 modules: `resolve.ts` (identity), `fee-sync.ts` (aggregation), orchestrator (thin wrapper).

### H2: Missing Circuit Breaker on Platform Adapters
**Files:** `lib/platforms/bags.ts`, `lib/platforms/zora.ts`, etc. (9 adapters)  
**Issue:** No circuit breaker pattern. If Bags API is slow (but not timeout), all requests wait full timeout duration. With 9 adapters × N wallets, single slow adapter cascades.
**Recommendation:** Implement per-adapter circuit breaker (closed → open → half-open states) backed by Upstash Redis to persist state across instances.

### H3: Lack of Structured Logging & Trace IDs
**Files:** All service files (console.warn/error with string prefixes)  
**Issue:** Logs are unstructured with manual `[fees]` / `[creator]` prefixes. No trace ID correlation across middleware → route → adapter calls.
**Impact:** Hard to correlate failures across distributed serverless instances.
**Solution:** Integrate Sentry spans (already in deps) with `Sentry.startSpan()` in critical paths. Use logger module consistently.

### H4: Bot & Web Share No Type Contract
**Files:** `bot/src` (separate package.json), `lib/` (web types)  
**Issue:** Bot fetches from web API via HTTP (`lookup.ts` → `/api/search`). Type duplicated between `bot/` and web. Schema changes break bot silently.
**Recommendation:** Extract shared types to `packages/shared/` or generate `api-types.ts` and version it separately.

---

## Medium-Priority Concerns (P2 — Data Integrity & Reliability)

### M1: EVM RPC Reliability — Aggressive Log Scanning
**Files:** `lib/chains/eth.ts:90-98`, `lib/chains/base.ts` (similar pattern)  
**Issues:**
1. **Chunk Size Mismatch:** Base scans 500K blocks in 10K chunks = 50 concurrent `getLogs` requests to public RPCs.
2. **Rate Limit:** Public RPCs (ankr.com, publicnode.com) return 429 Too Many Requests under burst load.
3. **Timeout Conflict:** `CLAIM_LOGS_TIMEOUT_MS = 12000` (12 sec) conflicts with 3-second retry backoff. First retry failure leaves <9s for remaining chunks.
4. **Fallback Weakness:** No configured `ETH_RPC_URL` / `BASE_RPC_URL` defaults to free public RPCs which are rate-limited and unstable.

**Impact:** Claimed balance appears 0 for Base/ETH users during high load or RPC outages.  
**Mitigations:**
- Reduce chunk size or parallel concurrency  
- Increase timeout to 30-45 seconds  
- Add circuit breaker per RPC endpoint  
- Use Helius Enhanced Transactions API (already supported, not adopted)

### M2: Price Cache Stale-While-Revalidate is Per-Instance
**File:** `lib/prices/index.ts` (lastKnownNativePrices module-level)  
**Issue:** In-memory price cache on serverless resets with cold start. New instance has no fallback if CoinGecko is down.
**Recommendation:** Layer caching: Memory → Supabase `token_prices` (L2) → API. Cron `refresh-prices` already populates table.

### M3: Cross-Chain EVM Hardcoded & Duplicated
**Files:** `lib/services/fee-sync.ts`, `lib/platforms/zora.ts` (both define `CROSS_CHAIN_EVM`)  
**Issue:** Zora is cross-chain on Base/ETH/BSC. Hardcoded as `new Set(['zora'])`. Adding next cross-chain platform requires edits in 2+ places.
**Recommendation:** Move `supportedChains: Chain[]` to `PlatformAdapter` interface.

### M4: Farcaster Handle Has No Unique Constraint
**File:** `lib/services/creator.ts` (comment: `// For farcaster (no unique constraint yet)`)  
**Issue:** Workaround catches PostgreSQL error code 23505 (unique violation). Fragile error handling.
**Recommendation:** Add migration: `ALTER TABLE creators ADD CONSTRAINT creators_farcaster_handle_key UNIQUE (farcaster_handle)`.

### M5: Column Naming Inconsistency
**File:** `lib/supabase/schema.sql` (claim_attempts table)  
**Issue:** Column `amount_lamports` is misleading. ClaimScan operates on Solana (lamports), Base (wei), ETH (wei), BSC (wei). Name should be `amount_raw` or `amount_native_units`.
**Impact:** Confusion during code review; potential wei-to-lamports conversion bugs.

---

## Known Issues (Documented Concerns)

### K1: Synthetic Token IDs in Pump.fun
**File:** `lib/platforms/pump.ts`  
**Behavior:** Returns synthetic address `'SOL:pump'` and `'SOL:pumpswap'` (not real token addresses). These are vault aggregates.
**Impact:** Cache and live stream both use synthetic IDs. Be cautious in migrations that assume `tokenAddress` is always on-chain.

### K2: Wallet Adapter Discovery is Implicit
**File:** `app/components/WalletButton.tsx` (uses Wallet Standard auto-discovery)  
**Behavior:** Wallets are auto-discovered via `@solana/wallet-adapter` without explicit imports. Modal appears magically.
**Risk:** Hidden dependency. Removing wallet-adapter-react-ui package would silently break wallet connections.

### K3: Memory Leaks in Enum Tracking
**File:** `proxy.ts:62-86` (enumMap cleanup)  
**Issue:** `enumMap` is cleared only if size > 5000 or on interval cleanup. No strict eviction policy per IP.
**Impact:** Memory can grow unbounded if cleaning interval doesn't fire (e.g., cold server in low-traffic period).

---

## Security Concerns (Non-Critical But Notable)

### S1: Constant-Time Comparison Accuracy
**File:** `proxy.ts:140-150` (safeCompare implementation)  
**Issue:** Custom timing-safe string comparison. Timing attacks are hard to exploit in practice (network noise dominates), but custom crypto is risky.
**Recommendation:** Use Node's built-in `crypto.timingSafeEqual()` for Buffer comparison.

### S2: Request Signing Secret Exposure Risk
**File:** `lib/request-signing.ts`  
**Issue:** `NEXT_PUBLIC_API_SIGN_KEY` is intentionally public (anti-scraping only, not security boundary). Code comments clarify this, but easy to misunderstand.
**Risk:** Developer might accidentally use this for real authentication.

### S3: CSP Header Allows GoogleFonts & Wallet Adapter Styles
**File:** `proxy.ts:268` (CSP header build)  
**Issue:** `style-src` allowlists `fonts.googleapis.com` (DM Sans from `@solana/wallet-adapter-react-ui`). Also allows `'unsafe-inline'` for Reown AppKit modal.
**Impact:** Reduces CSP protection. Temporary until Reown supports CSP-compliant Shadow DOM.

---

## Performance Issues & Bottlenecks

### P1: Fee Merging Logic Complexity
**File:** `lib/services/fee-sync.ts` (mergeAndDedup function)  
**Issue:** Deduplication by `platform:chain:tokenAddress` composite key requires O(N) lookups. With 500+ fees across 9 platforms, merging can be expensive.
**Mitigation:** Already using Map for O(1) lookups. Fine for current scale. Monitor if platform count grows.

### P2: Cron Job Scaling Concern
**File:** `app/api/cron/index-fees` (Vercel Cron)  
**Issue:** Single cron indexes all creators. As creator count grows (1000+), index time might exceed 55-second timeout (Hobby Plan max).
**Recommendation:** Implement pagination or sharding. Use Vercel Cron with 60s timeout once on Pro.

### P3: Helius DAS Webhook Lag
**File:** `app/api/webhooks/helius` (processes token discovery async)  
**Issue:** Webhook fires async without waiting for DB write. If webhook fires twice rapidly, race condition possible.
**Impact:** Duplicate token entries if race detected (DB constraint prevents duplicates, but logs fill with errors).

---

## Fragile Areas (Likely to Break Under Load or Change)

### F1: Cross-Chain Wallet Resolution Brittleness
**File:** `lib/resolve/identity.ts` (resolveWallets function)  
**Issue:** Tries to map handle → wallet via multiple sources (Twitter → Farcaster → OWS). If any source times out, fallback logic becomes complex.
**Risk:** Performance degrades under load; timeout cascade.

### F2: Bankr Agent API Timeouts
**File:** `lib/platforms/bankr.ts` (fetch with 15s timeout)  
**Issue:** Bankr API calls have hardcoded 15-second timeout. Under high load on their servers, requests fail silently (caught and logged, but UX sees 0 fees).
**Recommendation:** Implement exponential backoff or queue retries for next cron cycle.

### F3: Claim Status Monotonicity Assumption
**File:** `lib/services/fee-sync.ts` (claimed preservation logic)  
**Issue:** Code assumes `totalClaimed` never decreases (monotonic). If platform reindexes and reports fewer claims, code doesn't update.
**Impact:** Stale claimed balances; user thinks they've claimed more than they have.
**Mitigation:** Add schema migration to track reindex events; update claimed only if timestamp newer.

---

## Deployment & Operations Concerns

### D1: Environment Variable Copy-Paste Vulnerability
**CLAUDE.md note:** Vercel UI copy-paste of env vars appends literal `\n` to values.
**Files Affected:** Any var with trailing newline: `NEXT_PUBLIC_SOLANA_RPC_URL`, `ETH_RPC_URL`, etc.
**Workaround:** Use `printf '%s' '<value>' | npx vercel env add <NAME> production` instead of UI.
**Recommendation:** Document in setup guide; consider adding build-time validation.

### D2: Missing Health Check Endpoint
**File:** None (not implemented)  
**Issue:** No `/api/health` endpoint for external monitoring (UptimeRobot, Betterstack). Can't detect Supabase/RPC outages before users report.
**Effort:** 30 min. High ROI for ops visibility.

### D3: No API Versioning Strategy
**File:** `app/api/v2/[...path]` (exists but not used for primary API)  
**Issue:** Primary API has no `/v1/` prefix. Future breaking changes will cause hard breaks.
**Recommendation:** Adopt `v1` prefix for all public endpoints; reserve `/v2` for paid x402 routes.

---

## Summary Table

| Priority | Category | Item | File(s) | Effort | Impact |
|----------|----------|------|---------|--------|--------|
| P0 | Security | Fail-open request signing | proxy.ts | Fixed | Validation bypass |
| P0 | Reliability | SSE 10s cap on Hobby | api/fees/stream | 2h | Real-time broken |
| P0 | Security | In-memory rate limit reset | proxy.ts | 15m | Rate limit bypass |
| P1 | Debt | Creator.ts (556 lines) | lib/services/creator.ts | 2h | Testability |
| P1 | Reliability | No circuit breaker (adapters) | lib/platforms/* | 4h | Cascading failures |
| P1 | Observability | Unstructured logging | All services | 3h | Debug difficulty |
| P2 | Reliability | EVM RPC aggressive chunking | lib/chains/eth.ts, base.ts | 2h | Rate limit errors |
| P2 | Reliability | Price cache per-instance | lib/prices/index.ts | 1h | Cache miss on cold start |
| P2 | Consistency | Farcaster no unique constraint | lib/services/creator.ts | 15m | Data fragility |
| P3 | Operations | Missing health check | N/A | 30m | Blind spots |

---

**Document Updated:** 2026-04-10  
**Status:** Production MVP (v2.5) — Solid architecture, known scaling gaps, medium technical debt.
