---
phase: 13
plan: 05
subsystem: app/api/cron/index-flap
tags: [cron, fund-recipient, classification, wave-3, integration]
requirements: [FR-01, FR-02, FR-03]
dependency_graph:
  requires:
    - "Plan 13-02 migration 036 applied (flap_tokens.recipient_address + tax_processor_address columns + 'fund-recipient' in vault_type CHECK)"
    - "Plan 13-03 type extensions (FlapVaultKind 'fund-recipient', flap_tokens Row/Insert/Update widened with new columns + literal-union 'fund-recipient' value)"
    - "Plan 13-04 detectFundRecipient + fundRecipientHandler + FundRecipientResult exports from @/lib/platforms/flap-vaults"
  provides:
    - "Cron classification loop probes detectFundRecipient when lookupVaultAddress returns null, BEFORE the unknown-sentinel write"
    - "Persisted vault_type='fund-recipient' rows with recipient_address + tax_processor_address columns populated for matched tokens"
    - "fund_recipient_matched counter exposed in cron JSON response for prod observability"
    - "Structured classify.fund_recipient_matched log event with truncated addresses (token/recipient/taxProcessor)"
  affects:
    - "Wave 4 (Plan 13-06): adapter (lib/platforms/flap.ts) can now read recipient_address + tax_processor_address columns and dispatch fund-recipient rows for the recipient EOA axis (D-03/D-04)"
    - "Future scripts/classify-flap.ts (Phase 13 W5 sequence): re-probe loop will mirror this same insert-then-detect-fund-recipient flow for 229,259 historical 'unknown' rows"
tech-stack:
  added: []
  patterns:
    - "Probe-ladder before sentinel: detectFundRecipient runs as a SECOND chance in the null-vault branch, gating the unknown-sentinel write so fund-recipient tokens never accidentally land in the unknown bucket"
    - "Vault_address stays null on fund-recipient match (no sentinel) — row exits the pending-classify query naturally because vault_type leaves 'unknown'"
    - "Telemetry parity: fundRecipientMatched is a side-counter incremented in addition to classifiedCount, so the JSON response surfaces both totals without breaking existing callers"
key-files:
  created: []
  modified:
    - "app/api/cron/index-flap/route.ts"
decisions:
  - "Detect at cron orchestrator layer per RESEARCH §'Critical Architectural Deviation' — resolveVaultKind requires a vault address as input and fund-recipient tokens have none. The null-vault branch is the natural insertion point."
  - "Did NOT refactor detectFundRecipient to skip its internal lookupVaultAddress call. The cron now pays for that lookup twice per still-unknown row (once in the cron, once inside detect). Acceptable at MAX_CLASSIFICATIONS_PER_RUN=5 (~5 × 4 reads = 20 reads/run, fits Alchemy free tier). Future optimization: thread a vaultAddr=null hint into detectFundRecipient to skip Step 1. Tracked as TODO in code comment."
  - "Vault_address stays null on fund-recipient match. The 0x0 sentinel is RESERVED for the truly-unknown branch — fund-recipient rows do not need it because they exit the pending-classify query the moment vault_type flips off 'unknown'."
  - "Bumped classifiedCount in addition to the new fundRecipientMatched counter. Both totals are exposed in the JSON response; classifiedCount preserves backward compatibility for any prior dashboard / log scrape, and fundRecipientMatched gives prod observability without coupling parsers to inferred subtraction."
  - "Cron pending-query filter is `vault_type='unknown' AND vault_address IS NULL` — this catches NEW tokens minted from now on, plus any historical row that has not yet been sentinel'd. Rows ALREADY marked with the 0x0000...0000 sentinel (most of the 229,259 historical 'unknown' rows from Phase 12.1's bitquery_backfill) are EXCLUDED from this cron path. Backfilling those rows is the responsibility of Phase 13 W5's `scripts/classify-flap.ts` re-probe (which queries on `vault_type='unknown'` regardless of vault_address sentinel) plus the optional Bitquery one-shot. This Wave 3 change deliberately scopes itself to the cron's role; it is NOT a production backfill mechanism for the 229K historical universe."
metrics:
  duration_min: 3
  completed: "2026-04-27T05:30:00Z"
  tasks_total: 2
  tasks_completed: 2
  files_modified: 1
  files_created: 0
---

# Phase 13 Plan 05: Wave 3 — Cron Integration for Fund-Recipient Detection Summary

Wired the Phase 13 `detectFundRecipient` probe into the existing cron classification loop in `app/api/cron/index-flap/route.ts`. When the per-token vault lookup (`lookupVaultAddress`) returns null, the cron now runs the 4-step EOA-discriminator probe BEFORE writing the unknown sentinel. Matched rows persist with `vault_type='fund-recipient'`, `recipient_address` (the auto-forward EOA), and `tax_processor_address` (the per-token TaxProcessor clone). Unmatched rows fall through to the existing sentinel-write path unchanged.

## Tasks Executed

| # | Task                                                                                                          | File(s)                                | Commit    | Status |
| - | ------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------- | ------ |
| 1 | Import `detectFundRecipient` + add probe before sentinel in null-vault branch + persist new columns + log     | `app/api/cron/index-flap/route.ts`     | `bc3f523` | DONE   |
| 2 | Verification — `tsc --noEmit` clean, `flap-vaults` tests 20/20 GREEN, `cron-index-flap` tests 5/5 GREEN, full unit suite 226/226 GREEN | (verification only)                    | n/a       | DONE   |

## Verification Results

### TypeScript (`npx tsc --noEmit`)

Zero errors across the repo. The earlier RED stub errors from Plan 13-01 were resolved by Plan 13-04 (Wave 2). No new errors introduced by this plan.

### Unit Tests — `npm run test:unit -- flap-vaults`

```
Test Files  1 passed (1)
     Tests  20 passed (20)
```

The Wave 2 fund-recipient unit suite (FR-01 mocked probe-ladder, 5 cases) continues to pass; existing 15 tests (FP-04 resolveHandler, resolveVaultKind, baseV1/baseV2/SplitVault handlers) remain GREEN. No regressions.

### Unit Tests — `npm run test:unit -- cron-index-flap`

```
Test Files  1 passed (1)
     Tests  5 passed (5)
```

The pre-existing cron-index-flap suite (FP-05) continues to pass. The integration of `detectFundRecipient` did not break the existing classification or scan-loop assertions (which exercise the vault-having and unknown branches via mocks that return non-null vault addresses, so the new probe path is not hit by these mocks — yet the code-path widening compiled and runs cleanly).

### Unit Tests — full suite (`npm run test:unit`)

```
Test Files  15 passed (15)
     Tests  226 passed (226)
```

All 226 tests across 15 files pass. No regressions anywhere in the codebase from this change.

## Deviations from Plan

None. Implementation matches RESEARCH §"Recommended Phase 13 cron flow" (lines 333-352) and the advisor-confirmed integration point (the `if (!vaultAddr) { ... }` branch at the original cron lines 246-256). All advisor constraints honored:

- **Vault state on match**: `vault_address` stays null on fund-recipient match; sentinel write reserved for the truly-unknown path.
- **Redundant lookupVaultAddress acknowledged**: Code comment flags the double-lookup as a future RPC-budget optimization. Not refactored — fits free-tier RPC budget at MAX=5.
- **No touched-tunables**: `MAX_CLASSIFICATIONS_PER_RUN`, `WALLCLOCK_MS`, `SCAN_WINDOW`, the initial-scan path — all left unchanged per Wave 3 scope.
- **Telemetry**: Added `fundRecipientMatched` counter to JSON response; structured `classify.fund_recipient_matched` log event with token/recipient/taxProcessor truncated to 10 chars per CLAUDE.md Phase 11 logging audit (D-17).

## Authentication Gates

None. Cron route already implements bearer-secret auth via `verifyCronSecret` (unchanged).

## Known Stubs

None — every new code path is exercised by the existing flap-vaults Wave 2 unit tests (mocked probe-ladder) and is wired to the production schema columns added in Plan 13-02. The Wave 4 adapter-routing integration tests (in `lib/__tests__/integration/flap.test.ts`, gated by `BSC_RPC_URL`) will exercise this end-to-end once Plan 13-06 lands.

## TDD Gate Compliance

This plan does NOT carry the `tdd="true"` discipline of Plans 13-01 through 13-04. The Wave 0 RED stubs (Plan 13-01) covered the handler + detection layers, not the cron orchestrator's null-vault branch. The cron-routing integration tests (FR-04 family) are owned by Wave 4 (Plan 13-06) where the adapter is wired and the fixture wallet round-trip becomes observable. Plain Rule 2/3 implementation here:

- **Rule 2 (auto-add critical functionality)**: Without this wiring, the FR-01/FR-02 detection logic from Wave 2 would never be invoked in production — the cron would continue burying fund-recipient tokens under the unknown sentinel forever. The cron integration is a correctness requirement for Phase 13 to deliver any value.
- **Rule 3 (auto-fix blocking)**: N/A — no blockers encountered.

## Threat Flags

None. No new attack surface introduced. The detect probe is a read-only RPC call; failures return matched=false (defensive); the sentinel-write fallback preserves the prior unknown-bucket behavior.

## Self-Check: PASSED

**Files exist:**

- `app/api/cron/index-flap/route.ts` — FOUND (modified in commit `bc3f523`; verified import + probe block + counter present via subsequent diff inspection)
- `.planning/phases/13-flap-fund-recipient-vault-support-track-auto-forwarded-fees-/13-05-SUMMARY.md` — FOUND (this file)

**Symbol-presence checks:**

- `import { ..., detectFundRecipient } from '@/lib/platforms/flap-vaults'` — PRESENT in route.ts
- `await detectFundRecipient(row.token_address as `0x${string}`)` call — PRESENT in route.ts (inside `if (!vaultAddr)` branch)
- `vault_type: 'fund-recipient'` UPDATE — PRESENT in route.ts (matched-row branch)
- `recipient_address: fr.marketAddress.toLowerCase()` — PRESENT in route.ts
- `tax_processor_address: fr.taxProcessor.toLowerCase()` — PRESENT in route.ts
- `fund_recipient_matched: fundRecipientMatched` in JSON response — PRESENT in route.ts
- `childLog.info('classify.fund_recipient_matched', ...)` — PRESENT in route.ts

**Commit-hash checks:**

- `bc3f523` — FOUND in `git log` (Task 1: cron integration commit)

**Test-status checks:**

- `npx tsc --noEmit` — zero errors (confirmed)
- `npm run test:unit -- flap-vaults` — 20/20 GREEN (confirmed)
- `npm run test:unit -- cron-index-flap` — 5/5 GREEN (confirmed)
- `npm run test:unit` (full suite) — 226/226 GREEN (confirmed)

---
*Phase: 13-flap-fund-recipient-vault-support-track-auto-forwarded-fees-*
*Plan: 05*
*Completed: 2026-04-27*
