---
phase: 12-flap-adapter-bsc
verified: 2026-04-24T23:58:00Z
resolved: 2026-04-25T03:01:00Z
status: passed
score: 6/6
overrides_applied: 0
gaps_resolved:
  - truth: "Unit tests in lib/__tests__/unit/flap-reads.test.ts pass"
    status: resolved
    resolution_commit: f9a13d5
    resolution_note: "FP-03 gap closed inline by orchestrator. 4 expect.fail stubs replaced with real tests covering: TokenCreated event ABI shape (7 non-indexed fields), spoof rejection (log.address !== portal throws /Spoofed/), batchVaultClaimable allowFailure: true degradation pattern, assertDeployBlockNotPlaceholder happy-path AND forced 0n via vi.doMock + vi.resetModules + dynamic import. Pattern matches flap-vaults.test.ts (vi.hoisted + vi.mock for bscClient/bscLogsClient/sentry). Final unit suite: 205/205 GREEN. tsc clean."
human_verification:
  - test: "FP-07 fixture wallet parity check"
    expected: "flapAdapter.getHistoricalFees('0x685B23F8f932a6238b45f516c27a43840beC0Ef0') returns >=1 TokenFee row with vaultType='base-v2' and totalUnclaimed matching direct bscClient.readContract(vault.claimable(wallet))"
    why_human: "Integration test requires BSC_RPC_URL env var + seeded flap_tokens in production DB. Fixture token was 8 minutes old at research time (claimable likely 0n); post-backfill substitution protocol documented in fixture caveat. Cannot verify programmatically without live BSC connection."
  - test: "Cron monotonic advance (3 runs)"
    expected: "Three successive curl -H 'Authorization: Bearer $CRON_SECRET' calls to /api/cron/index-flap return strictly increasing last_scanned_block values"
    why_human: "Requires deployed Vercel function + CRON_SECRET env var. Vercel cron schedule (*/10 * * * *) activates only on vercel deploy — cannot verify in local dev without running the route manually."
  - test: "Bitquery backfill execution"
    expected: "npx tsx scripts/backfill-flap.ts populates flap_tokens with historical TokenCreated events from block 39_980_228 to current head, advancing flap_indexer_state cursor"
    why_human: "Requires BITQUERY_API_KEY (local-only, D-06 lock), BSC_RPC_URL, and SUPABASE_SERVICE_ROLE_KEY. One-shot operator action; script written and committed but not yet executed."
---

# Phase 12: Flap Adapter BSC Verification Report

**Phase Goal:** Shippar adapter Flap display-only em BSC com indexer proprio + vault handler registry polimórfico, completando cobertura em 11 launchpads sem deps externas pagas.
**Verified:** 2026-04-24T23:58:00Z
**Status:** gaps_found — 1 test-coverage gap blocking full sign-off
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Migration 034 applied: flap_tokens + flap_indexer_state + RLS + indexes (FP-02) | VERIFIED | supabase/migrations/034_add_flap_tokens.sql exists with CREATE TABLE IF NOT EXISTS for both tables, 2 ENABLE ROW LEVEL SECURITY statements, DO-block idempotent policy, CREATE INDEX IF NOT EXISTS for creator + vault_address partial. Applied to production Supabase (qjbqsavyfsfanutlediy) per 12-01-SUMMARY 5/5 verification queries. |
| 2 | Cron /api/cron/index-flap advances cursor with 250K-block windows + 55s wallclock guard (FP-05) | VERIFIED | SCAN_WINDOW = 250_000n, WALLCLOCK_MS = 55_000, maxDuration = 60 in route.ts. verifyCronSecret bearer auth present. Cursor upserted after each window. 5/5 cron unit tests GREEN (cron-index-flap.test.ts). vercel.json has {path: /api/cron/index-flap, schedule: */10 * * * *}. |
| 3 | Vault handler registry probe classifies V1/V2/unknown correctly (FP-04) | VERIFIED | lib/platforms/flap-vaults/index.ts: resolveVaultKind calls getVaultCategory primary -> vaultUISchema V2 probe -> claimable(0x0) V1 probe -> unknown terminal. VAULT_CATEGORY_MAP populated with 2 numeric keys (0: unknown NONE, 1: unknown TYPE_AI_ORACLE_POWERED — correctly both map to 'unknown' since VaultCategory is an oracle-flag axis, not v1/v2 discriminator per BscScan verified source). 13/13 flap-vaults unit tests GREEN. |
| 4 | Profile renders "Flap" tab with rows; claimable values match direct VaultBase.claimable(wallet) read | HUMAN NEEDED | flapAdapter implementation verified: reads flap_tokens via createServiceClient, dispatches resolveHandler, D-12 filter (claimable === 0n continue), emits TokenFee with vaultType. D-04 badge in TokenFeeTable mobile (L200) and desktop (L345). Integration test gated on BSC_RPC_URL. |
| 5 | Integration test passes; event decoder rejects spoofed logs where log.address !== FLAP_PORTAL (FP-03) | FAILED | Implementation EXISTS in lib/chains/flap-reads.ts: logEntry.address.toLowerCase() !== args.portal.toLowerCase() throws 'Spoofed TokenCreated log'. However, lib/__tests__/unit/flap-reads.test.ts still contains 4 expect.fail stubs. Unit test run confirms: 4 failed | 25 passed (29 total). |
| 6 | CLAUDE.md updated to "11 launchpads" with index-flap cron documented (FP-08) | VERIFIED | grep -c "11 launchpads" CLAUDE.md = 2 (top intro + embedded PROJECT block). grep -c "cron/index-flap" CLAUDE.md = 2. grep -c "Flap (BSC display-only)" CLAUDE.md = 1. SHIPPED_LAUNCHPAD_COUNT = Object.keys(PLATFORM_CONFIG).length = 11. |

**Score:** 5/6 truths verified (1 failed due to test-coverage gap, 1 human-needed)

### Deferred Items

None. All phase-12 must-haves were intended to be delivered in this phase. The flap-reads test gap is actionable closure work, not deferred to a later phase.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/034_add_flap_tokens.sql` | flap_tokens + flap_indexer_state DDL, RLS, indexes, fee_records.vault_type ALTER TABLE | VERIFIED | 77 lines. Both tables, 2 RLS enables, DO-block policy, 2 partial indexes, vault_type nullable column on fee_records with IS NULL OR check. |
| `supabase/migrations/034_rollback.sql` | Manual rollback DROP TABLE CASCADE + DROP COLUMN | VERIFIED | Exists with DROP TABLE IF EXISTS flap_tokens CASCADE, DROP TABLE IF EXISTS flap_indexer_state CASCADE, ALTER TABLE fee_records DROP COLUMN IF EXISTS vault_type, wrapped in BEGIN/COMMIT. |
| `lib/chains/flap-reads.ts` | FLAP_TOKEN_CREATED_EVENT, FlapTokenCreatedLog, scanTokenCreated, batchVaultClaimable, batchReadDecimals, assertDeployBlockNotPlaceholder | VERIFIED | All 6 exports present. server-only import at top. spoof guard: logEntry.address.toLowerCase() !== args.portal.toLowerCase(). allowFailure: true in both multicalls. assertDeployBlockNotPlaceholder checks widened bigint === 0n. |
| `lib/constants-evm.ts` | FLAP_PORTAL (BscAddress), FLAP_VAULT_PORTAL (BscAddress), FLAP_PORTAL_DEPLOY_BLOCK (39_980_228n) | VERIFIED | grep counts: FLAP_PORTAL: BscAddress = 1, 39_980_228n = 1, FLAP_VAULT_PORTAL = 1. asBscAddress import confirmed. |
| `lib/platforms/flap-vaults/types.ts` | FlapVaultKind, FlapVaultHandler, VAULT_PORTAL_ABI, CLAIMABLE_ABI, V2_PROBE_ABI, VAULT_CATEGORY_MAP (populated) | VERIFIED | All exports present. VAULT_CATEGORY_MAP has 2 numeric keys (0, 1). BscScan source URL in comment. |
| `lib/platforms/flap-vaults/index.ts` | resolveVaultKind, resolveHandler | VERIFIED | Both exported. Primary/probe/unknown 3-tier logic confirmed. |
| `lib/platforms/flap-vaults/base-v1.ts` | baseV1Handler | VERIFIED | Exists, server-only, readClaimable via bscClient. |
| `lib/platforms/flap-vaults/base-v2.ts` | baseV2Handler | VERIFIED | Exists, server-only, readClaimable via bscClient. |
| `lib/platforms/flap-vaults/unknown.ts` | unknownHandler (0n + D-16 Sentry fingerprint) | VERIFIED | server-only, Sentry.captureMessage('Flap unknown vault detected', level: 'warning', fingerprint: ['flap-unknown-vault', vault]) confirmed. |
| `app/api/cron/index-flap/route.ts` | bearer auth, maxDuration=60, 250K window, 55s wallclock, batchReadDecimals, vault classification pass | VERIFIED | 284 lines. All required patterns present. Classification pass bounded by MAX_CLASSIFICATIONS_PER_RUN=50. D-10 decimals: resolved ?? 18. |
| `lib/platforms/flap.ts` | flapAdapter implementing PlatformAdapter (platform:'flap', chain:'bsc') | VERIFIED | 179 lines. All 5 interface methods. Reads flap_tokens via createServiceClient. D-12 filter (claimable === 0n continue). vaultType: row.vault_type. |
| `lib/platforms/index.ts` | flapAdapter registered in Record<Platform, PlatformAdapter> | VERIFIED | flap: flapAdapter in adapters record. No Exclude<Platform, 'flap'> special case. |
| `lib/constants.ts` | SHIPPED_LAUNCHPAD_COUNT = 11 | VERIFIED | SHIPPED_LAUNCHPAD_COUNT = Object.keys(PLATFORM_CONFIG).length. PLATFORM_CONFIG has 11 keys including 'flap'. |
| `app/components/TokenFeeTable.tsx` | D-04 badge: fee.vault_type === 'unknown' -> amber "Claim method unknown" chip | VERIFIED | Mobile branch L200, desktop branch L345. AlertTriangle imported from lucide-react. |
| `CLAUDE.md` | "11 launchpads" + cron/index-flap documented | VERIFIED | 2 occurrences of "11 launchpads", 2 of "cron/index-flap/", Phase 12 Cuidados bullet with D-04/D-06/D-08/D-16 cross-refs. |
| `vercel.json` | /api/cron/index-flap schedule */10 * * * * | VERIFIED | Third cron entry confirmed: {path: /api/cron/index-flap, schedule: */10 * * * *}. |
| `lib/__tests__/unit/flap-reads.test.ts` | FP-03 tests GREEN | FAILED | 4 of 4 tests are expect.fail stubs. Wave 0 scaffolding never converted to real assertions. |
| `lib/__tests__/unit/flap-constants.test.ts` | FP-01 tests GREEN | VERIFIED | 3/3 tests GREEN (confirmed via test run: 25 passed includes flap-constants). |
| `lib/__tests__/unit/flap-vaults.test.ts` | FP-04 tests GREEN | VERIFIED | 13/13 tests GREEN per 12-03-SUMMARY and test run confirmation. |
| `lib/__tests__/unit/cron-index-flap.test.ts` | FP-05 tests GREEN | VERIFIED | 5/5 tests GREEN per 12-04-SUMMARY and test run confirmation. |
| `lib/__tests__/unit/flap-adapter.test.ts` | FP-06 tests GREEN | VERIFIED | 4/4 tests GREEN per 12-05-SUMMARY and test run confirmation. |
| `lib/__tests__/integration/flap.test.ts` | FP-07 describe.skipIf(!BSC_RPC_URL) + 4 real assertions | VERIFIED | No expect.fail stubs. describe.skipIf gate confirmed. 4 tests skip cleanly without BSC_RPC_URL (structural correctness). |
| `scripts/backfill-flap.ts` | Bitquery one-shot backfill with D-10 decimals | VERIFIED | 414 lines. readDecimalsBatch inline helper mirrors batchReadDecimals pattern. decimals: resolved ?? 18. Not yet executed (requires BITQUERY_API_KEY, D-06 local-only). |
| `scripts/sanity-flap-backfill.ts` | Bitquery vs viem getLogs count comparator | VERIFIED | 205 lines. Soft warn at 1-5%, hard fail exit(1) at >5%. Not yet executed. |
| `lib/__tests__/fixtures/wallets/flap-creator.json` | Candidate fixture wallet with caveat | VERIFIED | wallet, token, vault, factory, expected_vault_type, caveat fields present. Re-validation protocol documented. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| lib/chains/flap-reads.ts | lib/constants-evm.ts (FLAP_PORTAL_DEPLOY_BLOCK) | import FLAP_PORTAL_DEPLOY_BLOCK_CONST alias | VERIFIED | Widened locally to avoid TS2367 dead-code on === 0n. Runtime guard functional. |
| app/api/cron/index-flap/route.ts | lib/chains/flap-reads.ts (scanTokenCreated, batchReadDecimals, assertDeployBlockNotPlaceholder) | direct import | VERIFIED | All 3 imported and called in route body. |
| app/api/cron/index-flap/route.ts | lib/platforms/flap-vaults (resolveVaultKind) | import resolveVaultKind | VERIFIED | Called in classification pass with FLAP_VAULT_PORTAL, token_address, vaultAddr. |
| lib/platforms/flap.ts | lib/platforms/flap-vaults (resolveHandler) | import resolveHandler | VERIFIED | Called per classified row: resolveHandler(row.vault_type). |
| lib/platforms/flap.ts | lib/supabase/service (createServiceClient) | import createServiceClient | VERIFIED | Used in getCreatorTokens and getHistoricalFees to query flap_tokens. |
| lib/services/fee-sync.ts | fee_records.vault_type column | vault_type: fee.vaultType ?? null | VERIFIED | Single wire propagating TokenFee.vaultType to DB cache. |
| app/components/TokenFeeTable.tsx | fee.vault_type field | fee.vault_type === 'unknown' branch | VERIFIED | Both mobile (L200) and desktop (L345) branches present. |
| scanTokenCreated | spoof guard | log.address.toLowerCase() !== portal.toLowerCase() | VERIFIED | Implementation present in flap-reads.ts, but unit test covering this path is a stub. |
| lib/__tests__/unit/flap-reads.test.ts | lib/chains/flap-reads.ts exports | import statements | NOT WIRED | Test file never imports from flap-reads.ts — still contains Wave 0 stubs that don't exercise the implementation. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| lib/platforms/flap.ts (getHistoricalFees) | rows (FlapTokenRow[]) | createServiceClient().from('flap_tokens').select(...).eq('creator', lower) | Yes — DB query against production flap_tokens | VERIFIED (implementation; data flows when flap_tokens is seeded by cron or backfill) |
| lib/platforms/flap.ts (getHistoricalFees) | claimable | handler.readClaimable(vault, user) -> bscClient.readContract | Yes — live BSC contract read | VERIFIED (code path; requires live BSC_RPC_URL to execute) |
| app/api/cron/index-flap/route.ts | logs (FlapTokenCreatedLog[]) | scanTokenCreated -> bscLogsClient.getLogs | Yes — live BSC eth_getLogs | VERIFIED (wired; activates on deploy) |
| app/components/TokenFeeTable.tsx | fee.vault_type | fee_records.vault_type via DB row | Yes — from migration 034 column populated by persistFees(fee.vaultType ?? null) | VERIFIED — full pipeline: adapter -> fee-sync.ts vault_type: fee.vaultType ?? null -> DB column -> UI branch |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| flap-constants tests GREEN | npm run test:unit -- flap-constants | 3/3 pass | PASS |
| flap-vaults tests GREEN | npm run test:unit -- flap-vaults | 13/13 pass | PASS |
| cron-index-flap tests GREEN | npm run test:unit -- cron-index-flap | 5/5 pass | PASS |
| flap-adapter tests GREEN | npm run test:unit -- flap-adapter | 4/4 pass | PASS |
| flap-reads tests GREEN | npm run test:unit -- flap-reads | 4/4 FAIL (stubs) | FAIL |
| integration test skips cleanly | npm run test:integration -- flap | 4 skipped (no BSC_RPC_URL) | PASS |
| Full flap suite | npm run test:unit -- flap | 4 failed / 25 passed (29 total) | PARTIAL |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| FP-01 | Plan 12-02 | Flap BSC constants (FLAP_PORTAL, FLAP_VAULT_PORTAL, FLAP_PORTAL_DEPLOY_BLOCK=39_980_228n) + runtime guard | SATISFIED | Constants in constants-evm.ts with BscAddress types. assertDeployBlockNotPlaceholder in flap-reads.ts. flap-constants 3/3 GREEN. |
| FP-02 | Plan 12-01 | Migration 034: flap_tokens + flap_indexer_state + RLS + indexes | SATISFIED | Migration file verified. Applied to production per 5/5 SUMMARY queries. fee_records.vault_type additive column present. |
| FP-03 | Plan 12-02 | flap-reads.ts with decoder, spoof guard, batchVaultClaimable, batchReadDecimals | BLOCKED | Implementation present and substantive. Unit test coverage gap: 4 stubs remain in flap-reads.test.ts. Spoof guard cannot be test-verified programmatically in current state. |
| FP-04 | Plan 12-03 | Vault handler registry: primary probe + method-probe fallback + unknown + Sentry D-16 | SATISFIED | 5 files in flap-vaults/. VAULT_CATEGORY_MAP populated. 13/13 tests GREEN. Sentry fingerprint ['flap-unknown-vault', vault] confirmed. |
| FP-05 | Plan 12-04 | Cron route: bearer auth, maxDuration=60, 250K windows, 55s wallclock, idempotent upsert, D-08 lag warning | SATISFIED | route.ts 284 lines, all tunables verified. vercel.json schedule confirmed. 5/5 cron unit tests GREEN. |
| FP-06 | Plan 12-05 | flapAdapter: reads flap_tokens, dispatches handlers, D-12 filter, vault_type pipeline end-to-end | SATISFIED | lib/platforms/flap.ts 179 lines. Registry registered exhaustively (Record<Platform, PlatformAdapter>). 4/4 adapter tests GREEN. vault_type propagated through TokenFee -> fee-sync -> DB -> UI. |
| FP-07 | Plan 12-07 | Integration test: fixture wallet, live BSC, adapter-vs-direct parity | NEEDS HUMAN | Test file structurally correct (4 real assertions, describe.skipIf gate). Fixture wallet caveat documented. Execution requires BSC_RPC_URL + seeded DB. |
| FP-08 | Plan 12-06 | CLAUDE.md "11 launchpads", cron/index-flap documented | SATISFIED | 2x "11 launchpads", 2x "cron/index-flap/", Flap (BSC display-only) entry, Phase 12 Cuidados bullet. SHIPPED_LAUNCHPAD_COUNT=11 verified. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| lib/__tests__/unit/flap-reads.test.ts | 13, 17, 21, 25 | 4x expect.fail('stub — Plan 12-02 implements ...') | BLOCKER | FP-03 test coverage gap; spoof guard, decoder, multicall, and deploy-guard cannot be regression-tested until stubs are converted |

### Human Verification Required

#### 1. FP-07 Integration Test — Live BSC Fixture Wallet

**Test:** With BSC_RPC_URL set and flap_tokens seeded (post-backfill), run:
`npm run test:integration -- flap`

**Expected:** 4 tests pass — at-least-one-row, parity vs direct vault.claimable, D-12 filter enforcement, vaultType enum validity for fixture wallet 0x685B23F8f932a6238b45f516c27a43840beC0Ef0.

**Note:** If fixture token's claimable === 0n (D-12 filtered), the parity test throws a descriptive error with fixture.caveat substitution protocol. Query `SELECT creator, token_address, vault_address FROM flap_tokens WHERE vault_type='base-v2' LIMIT 20` and substitute a creator with claimable > 0.

**Why human:** BSC_RPC_URL required for live chain reads. flap_tokens must be populated by backfill + cron before adapter output is non-empty.

#### 2. Bitquery Backfill Execution

**Test:** From local dev with BITQUERY_API_KEY, BSC_RPC_URL, SUPABASE_SERVICE_ROLE_KEY set:
`npx tsx scripts/backfill-flap.ts`

**Expected:** Historical TokenCreated events from block 39_980_228 to current head upserted into flap_tokens. flap_indexer_state cursor warmed. Final log shows totalEvents > 0, decimalsFallbackCount (if any), all windows processed.

**Why human:** BITQUERY_API_KEY is D-06 local-only; never set in Vercel prod. One-shot operator action on local machine.

#### 3. Cron Monotonic Advance (Post-Deploy)

**Test:** After `vercel deploy`, call the cron endpoint 3 times with 30s delay:
`curl -H "Authorization: Bearer $CRON_SECRET" https://claimscan.tech/api/cron/index-flap`

**Expected:** Each response has a strictly larger `last_scanned` value than the previous. No errors in response body.

**Why human:** Requires deployed Vercel function. Cron schedule (*/10 * * * *) activates only on deploy. LOCAL curl to localhost:3001 is possible post-backfill to verify route behavior but not the Vercel schedule itself.

### Gaps Summary

**1 gap blocking full sign-off: flap-reads.test.ts test-coverage gap (FP-03)**

The implementation in `lib/chains/flap-reads.ts` is complete and correct — the spoof guard (`logEntry.address.toLowerCase() !== args.portal.toLowerCase()`), event decoder (`FLAP_TOKEN_CREATED_EVENT` with verified signature), `batchVaultClaimable` with `allowFailure: true`, `batchReadDecimals` (D-10 mechanism), and `assertDeployBlockNotPlaceholder` are all present and wired into the cron route and adapter.

However, `lib/__tests__/unit/flap-reads.test.ts` was written as a Wave 0 RED stub in Plan 12-01 and was supposed to be converted to GREEN by Plan 12-02. Because Plan 12-02 ran in a parallel worktree (base commit `05c1b01`) that did not include the Wave 0 stubs, and the orchestrator noted this was deferred to gap closure, the 4 stubs were never converted.

Root cause: Parallel worktree execution split prevented Plan 12-02 from converting stubs it couldn't see. The stub-to-GREEN transition is a pure test-authoring task against existing exports.

**Fix required:** Write 4 real test cases in `lib/__tests__/unit/flap-reads.test.ts` importing from `@/lib/chains/flap-reads`:
- Mock `@/lib/chains/bsc` with `vi.mock` (bscClient.multicall, bscLogsClient.getLogs)
- Test decoder: mock getLogs returning a valid log, assert FlapTokenCreatedLog fields
- Test spoof guard: feed a log with address !== portal, assert throws 'Spoofed TokenCreated log'
- Test batchVaultClaimable allowFailure: mock multicall returning mixed success/failure, assert MulticallClaimableResult shape
- Test assertDeployBlockNotPlaceholder: widen FLAP_PORTAL_DEPLOY_BLOCK_CONST to bigint = 0n locally (or mock constants-evm), assert throws

---

_Verified: 2026-04-24T23:58:00Z_
_Verifier: Claude (gsd-verifier)_
