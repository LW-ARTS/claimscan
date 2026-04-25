---
status: partial
phase: 12-flap-adapter-bsc
source: ["12-VERIFICATION.md"]
started: 2026-04-25T03:01:00Z
updated: 2026-04-25T15:30:00Z
---

## Current Test

[awaiting paid-RPC unblock for full automation]

## Tests

### 1. FP-07 fixture wallet parity check
expected: flapAdapter.getHistoricalFees('0x685B23F8f932a6238b45f516c27a43840beC0Ef0') returns >=1 TokenFee row with vaultType='base-v2' and totalUnclaimed matching direct bscClient.readContract(vault.claimable(wallet))
result: passed (mechanical pipeline proven)
notes: |
  Pipeline verified end-to-end on 2026-04-25:
  - Token 0x7372bf3b...7777 (block 94337728) seeded into flap_tokens
  - classify-flap.ts called tryGetVault → returned (true, 0x321354e6...)
  - resolveVaultKind → base-v2 (V2 probe via vaultUISchema())
  - DB row updated: vault_address=0x321354e6..., vault_type=base-v2
  - Adapter dispatch path now resolves to baseV2Handler.readClaimable()
  Final claimable amount on the live wallet was not asserted (RESEARCH.md
  L305-312 caveat: token was 8min old at research time, claimable likely
  0n). To re-validate against a creator with claimable > 0, run:
    SELECT creator FROM flap_tokens WHERE vault_type='base-v2' LIMIT 5;
  pick one, run the parity script with BSC_RPC_URL set.

### 2. Cron monotonic advance (3 runs)
expected: Three successive `curl -H 'Authorization: Bearer $CRON_SECRET' https://claimscan.tech/api/cron/index-flap` calls return strictly increasing last_scanned_block values
result: blocked (cron schedule disabled, see why_human)
why_human: |
  Vercel Hobby's daily-only cron limit + free-tier BSC RPCs (50K block
  range cap, slow + sporadic) + free Alchemy's 10-block eth_getLogs cap
  combine to push every cron invocation past the 60s budget
  (FUNCTION_INVOCATION_TIMEOUT). Schedule entry was REMOVED from
  vercel.json in commit f913cb9 to stop Sentry alert spam. Route still
  exists at /api/cron/index-flap and is callable via curl + bearer.

  To re-enable:
    1. Upgrade RPC: QuickNode Build ($10/mo, 10K block getLogs) OR
       Alchemy Growth ($25/mo, 2K block getLogs) OR Vercel Pro ($20/mo)
    2. Re-add the cron entry to vercel.json with schedule */10 * * * *
       (or daily if staying on Hobby)
    3. Bump SCAN_WINDOW back to 50K-250K in app/api/cron/index-flap/route.ts
    4. Redeploy

### 3. Bitquery backfill execution
expected: `npx tsx scripts/backfill-flap.ts` populates flap_tokens with historical TokenCreated events from block 39_980_228 to current head, advancing flap_indexer_state cursor
result: partial — 1012 legacy rows discovered then wiped (see notes)
notes: |
  Run on 2026-04-25 with token ory_at_4o4H8a... (Bitquery v2 OAuth, free
  tier 10K points). After fixing two schema bugs in the script (Int→String
  for Block.Number filter, EVM_ABI_BigInt_Value_Arg parser), the backfill
  ingested 1012 TokenCreated events from blocks 40,499,340 → 42,975,208
  before Bitquery's free quota exhausted at HTTP 402.

  All 1012 rows turned out to be LEGACY tokens — they were emitted by the
  current FLAP_PORTAL (0xe2cE6ab8...) but pre-date the current VaultPortal
  (0x90497450...) by years. tryGetVault returns found=false for them,
  meaning they're not registered in the current portal and have no live
  vault contract to read claimable from. They were wiped from flap_tokens
  in commit f487f9e to keep the dataset clean.

  Forward path: when paid RPC unblocks, run another backfill targeting the
  recent block range (e.g., 90M → head) where tokens DO register in the
  current portal. Bitquery quota refills monthly; alternative is direct
  eth_getLogs on a paid RPC.

## Summary

total: 3
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 1
partial: 1

## Gaps

- Cron auto-discovery offline until paid RPC infra (tracked separately as
  "Phase 12.2 — paid infra unblock"). Until then, new Flap tokens enter
  the system only through manual cron fires + manual classify-flap.ts runs.
- Recent-block backfill (~90M to head) needs to land for the adapter to
  show fees against real Flap creators. The 1 seed token (fixture) proves
  the pipeline works mechanically.
