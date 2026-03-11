# API Health Fixes Design

## Context

API health audit identified 4 categories of issues affecting production reliability:
1. Silent Vercel 504s from missing maxDuration + no route-level timeout
2. RevShare batch loop can exceed 30s with many Token-2022 mints
3. All adapters block on slowest (Promise.allSettled semantics) — no partial results
4. Bankr Agent API is a 30s-2min LLM call parsed with fragile regex

## Track 1: Quick Fixes

### 1a. maxDuration on live route
- Add `export const maxDuration = 55` to `app/api/fees/live/route.ts`

### 1b. Route-level wallclock guard
- Wrap `Promise.allSettled` in `fetchLiveUnclaimedFees()` with `Promise.race` (50s budget)
- On timeout, collect results from resolved promises, discard pending

### 1c. RevShare batch wallclock guard
- Check `Date.now() - startTime > 20_000` before each batch iteration
- Break early, return partial results, log skipped mints

### 1d. Push pending commit (bags O(1) + RPC fixes)

## Track 2: SSE Streaming Partial Results

### Current Architecture
- `/api/fees/stream` = SSE notification channel (Helius webhook triggers)
- Frontend `onmessage` → calls `pollLiveFees()` (full JSON fetch to `/api/fees/live`)
- No partial results — all-or-nothing

### New Architecture
- New route `POST /api/fees/live-stream` returns SSE stream
- Each adapter completion pushes `partial-result` event with platform fees
- Final `complete` event signals all adapters finished
- Frontend tries `live-stream` first, falls back to `/api/fees/live` JSON

### SSE Event Format
```
event: partial-result
data: {"platform":"bags","chain":"solana","fees":[...]}

event: partial-result
data: {"platform":"pump","chain":"solana","fees":[...]}

event: complete
data: {"timestamp":"..."}
```

### Frontend Changes
- `ProfileHero.tsx`: New `connectLiveStream()` that merges partial results incrementally
- Fast adapters (Pump, Bags, Zora) appear in <2s
- Slow adapters (Coinbarrel, RevShare) stream in as they complete

## Track 3: Solana Token Indexing Cron

### Problem
GPA calls in Coinbarrel/Believe/RevShare = 20s each, per wallet, every request.

### Solution
Cron job populates `creator_tokens` table (exists in schema but unused).

### New Route: `POST /api/cron/index-tokens`
- Vercel Cron every 10 minutes
- Fetches active creators (synced > 10min ago)
- Runs GPA discovery per wallet, upserts to `creator_tokens`
- `maxDuration = 300` (5 min budget)

### Adapter Changes
- `getLiveUnclaimedFees()` checks `creator_tokens` first
- If tokens indexed < 10min ago → use DB list, skip GPA
- If not indexed → fallback to GPA (existing behavior)

### DB Migration
- Add `indexed_at TIMESTAMPTZ` to `creator_tokens`
- Add index on `(creator_id, platform)` for fast lookups

## Track 4: Deprecate Bankr Agent API

### Current State
- Search API + Doppler API = primary (fast, 2-3s)
- Agent API = fallback (30s-2min, regex-parsed NLP response)
- Agent API almost always times out in live route (5s budget)

### Changes
- Delete `promptBankrAgent()`, `parseAgentFeeResponse()`, all 3 parsing strategies
- Delete `AGENT_SHORT_TIMEOUT_MS`, `AGENT_LONG_TIMEOUT_MS`, `AGENT_POLL_INTERVAL_MS`
- `getFeesByHandle()`: Search API only, return empty on failure
- `getHistoricalFees()`: Search API + Doppler only
- Removes ~200 lines of fragile code

## Files Modified

### Track 1
- `app/api/fees/live/route.ts` — maxDuration
- `lib/resolve/identity.ts` — wallclock guard on allSettled
- `lib/platforms/revshare.ts` — batch loop wallclock guard

### Track 2
- `app/api/fees/live-stream/route.ts` — new SSE streaming route
- `lib/resolve/identity.ts` — callback-based adapter completion
- `app/components/ProfileHero.tsx` — SSE partial result consumer

### Track 3
- `app/api/cron/index-tokens/route.ts` — new cron route
- `vercel.json` — cron schedule
- `lib/platforms/coinbarrel.ts` — DB-first token lookup
- `lib/platforms/believe.ts` — DB-first token lookup
- `lib/platforms/revshare.ts` — DB-first token lookup
- Supabase migration — `creator_tokens` indexed_at column

### Track 4
- `lib/platforms/bankr.ts` — remove Agent API code

## Verification
1. `npx tsc --noEmit` — no type errors
2. Dev server loads without errors
3. Search a creator — fees appear incrementally via SSE
4. Check Vercel logs — no 504s, reduced GPA calls
5. Re-search same creator — tokens from DB cache, sub-2s response
