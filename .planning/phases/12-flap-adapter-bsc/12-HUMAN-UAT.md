---
status: partial
phase: 12-flap-adapter-bsc
source: ["12-VERIFICATION.md"]
started: 2026-04-25T03:01:00Z
updated: 2026-04-25T03:01:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. FP-07 fixture wallet parity check
expected: flapAdapter.getHistoricalFees('0x685B23F8f932a6238b45f516c27a43840beC0Ef0') returns >=1 TokenFee row with vaultType='base-v2' and totalUnclaimed matching direct bscClient.readContract(vault.claimable(wallet))
result: [pending]
why_human: Integration test requires BSC_RPC_URL env var + seeded flap_tokens in production DB. Fixture token was 8 minutes old at research time (claimable likely 0n); post-backfill substitution protocol documented in fixture caveat. Cannot verify programmatically without live BSC connection.

### 2. Cron monotonic advance (3 runs)
expected: Three successive `curl -H 'Authorization: Bearer $CRON_SECRET' https://claimscan.tech/api/cron/index-flap` calls return strictly increasing last_scanned_block values
result: [pending]
why_human: Requires deployed Vercel function + CRON_SECRET env var. Vercel cron schedule (*/10 * * * *) activates only on vercel deploy — cannot verify in local dev without running the route manually.

### 3. Bitquery backfill execution
expected: `npx tsx scripts/backfill-flap.ts` populates flap_tokens with historical TokenCreated events from block 39_980_228 to current head, advancing flap_indexer_state cursor
result: [pending]
why_human: Requires BITQUERY_API_KEY (local-only, D-06 lock), BSC_RPC_URL, and SUPABASE_SERVICE_ROLE_KEY. One-shot operator action; script written and committed but not yet executed.

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
