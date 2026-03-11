# Doppler Token Fee Cache

## Problem

`getTokenFees(tokenAddress)` makes 1 HTTP request to Bankr's public Doppler API per token. `fetchFeesForTokens` fires up to 30 in parallel per scan. When multiple users scan creators who share tokens, or the same creator is re-scanned within minutes, these calls repeat unnecessarily. The Doppler API is rate-limited by IP (no auth), making it the primary throughput bottleneck at ~120-200 unique scans/hr.

## Solution

In-memory `Map` cache wrapping `getTokenFees` in `bankr.ts`. TTL of 10 minutes. No DB changes, no migrations.

## Design

```
const dopplerCache = new Map<string, { data: BankrTokenFeeResponse; ts: number }>();
const DOPPLER_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const DOPPLER_CACHE_MAX = 500; // prevent unbounded growth
```

Before fetching from Doppler, check the cache. On hit (within TTL), return cached data. On miss, fetch from Doppler, store result, return. Evict entries older than TTL on write (lazy cleanup). Cap at 500 entries — if exceeded, clear the oldest half.

## Scope

- **Modified file:** `lib/platforms/bankr.ts`
- **No new files, no DB migrations, no new dependencies**

## Expected Impact

- Concurrent scans of overlapping creators: ~50-80% fewer Doppler calls
- Re-scan of same creator within 10 min: 0 Doppler calls (100% cache hit)
- Effective throughput increase: ~2-3x for typical workloads
