---
phase: 13
plan: 04
subsystem: lib/platforms/flap-vaults
tags: [fund-recipient, handler, detection, wave-2, tdd-green]
requirements: [FR-01, FR-02]
dependency_graph:
  requires:
    - "Plan 13-03 type extensions (FlapVaultKind 'fund-recipient', FLAP_TAX_TOKEN_V3_ABI, TAX_PROCESSOR_ABI)"
    - "Plan 13-01 RED test stubs (FR-01 describe in flap-vaults.test.ts + fund-recipient.test.ts integration)"
  provides:
    - "lookupVaultAddress + TRY_GET_VAULT_SELECTOR extracted into lib/platforms/flap-vaults/vault-portal.ts (acyclic-DAG enabler)"
    - "fundRecipientHandler.readCumulative(taxProcessor): bigint reads TaxProcessor.totalQuoteSentToMarketing()"
    - "detectFundRecipient(taxToken): FundRecipientResult runs the 4-step probe (lookupVaultAddress null + taxProcessor + marketAddress + getCode EOA)"
    - "Re-exports of detectFundRecipient + fundRecipientHandler + FundRecipientResult from @/lib/platforms/flap-vaults"
  affects:
    - "Wave 3 (Plan 13-05): cron orchestrator can import detectFundRecipient and persist taxProcessor / recipient_address columns"
    - "Wave 4 (Plan 13-06): adapter (lib/platforms/flap.ts) can import fundRecipientHandler directly and dispatch fund-recipient rows outside the HANDLERS registry"
tech-stack:
  added: []
  patterns:
    - "Module-extraction refactor to break a prospective circular import (precedent: Phase 12.1 split-vault.ts isolation)"
    - "Defensive try/catch returning matched=false / 0n on every external call (mirrors split-vault.ts handler shape)"
    - "Logger .slice(0,10) truncation on every address field per CLAUDE.md Phase 11 logging audit (D-17)"
key-files:
  created:
    - "lib/platforms/flap-vaults/vault-portal.ts"
    - "lib/platforms/flap-vaults/fund-recipient.ts"
  modified:
    - "lib/platforms/flap-vaults/index.ts"
decisions:
  - "Widened readCumulative + detectFundRecipient parameter types from BscAddress to 0x${string} (Rule 3 fix — see deviations) so both branded BscAddress (unit tests) and raw fixture-string addresses (integration test, future cron callers) typecheck without forcing every caller to pre-checksum via asBscAddress()."
  - "lookupVaultAddress is called from fund-recipient.ts via './vault-portal' import path NOT './index' to keep the dependency DAG acyclic; index.ts re-exports the symbol so external public API is unchanged."
  - "fundRecipientHandler is exported as an inline-typed const literal (kind: 'fund-recipient' as const + readCumulative method) — intentionally NOT typed as FlapVaultHandler because its signature diverges (readCumulative(taxProcessor) vs readClaimable(vault, user)). The HANDLERS registry safety stub (Plan 13-03) remains the path for any accidental routing through resolveHandler()."
metrics:
  duration_min: 4
  completed: "2026-04-27T05:18:00Z"
  tasks_total: 4
  tasks_completed: 4
  files_modified: 1
  files_created: 2
  red_tests_turned_green: 5
---

# Phase 13 Plan 04: Wave 2 — Fund-Recipient Handler + Detection Summary

Implemented the on-chain reading primitives for the fund-recipient vault classification: a per-token `detectFundRecipient` probe (4-step EOA discriminator) plus a `fundRecipientHandler` that reads the lifetime monotonic accumulator from each TaxProcessor clone. Wave 0 RED test stubs (FR-01 describe block, 5 cases) turn GREEN. The `lookupVaultAddress` / `TRY_GET_VAULT_SELECTOR` symbols were extracted into a new `vault-portal.ts` module to break a prospective circular import between `index.ts` and `fund-recipient.ts`.

## Tasks Executed

| # | Task | File(s) | Commit | Status |
|---|------|---------|--------|--------|
| 1 | Extract `lookupVaultAddress` + `TRY_GET_VAULT_SELECTOR` into `vault-portal.ts`; re-export from index.ts | `lib/platforms/flap-vaults/vault-portal.ts` (new), `lib/platforms/flap-vaults/index.ts` | `8bb24e0` | DONE |
| 2 | Create `fund-recipient.ts` with `fundRecipientHandler.readCumulative` + `detectFundRecipient` | `lib/platforms/flap-vaults/fund-recipient.ts` (new) | `7a09311` | DONE |
| 3 | Re-export `detectFundRecipient` + `fundRecipientHandler` + `FundRecipientResult` from index.ts | `lib/platforms/flap-vaults/index.ts` | `80ce396` | DONE |
| 4 | Verification — confirm RED→GREEN transition (no file edits) | (verification only) | n/a | DONE |

## Verification Results

### TypeScript (`npx tsc --noEmit`)

After Plan 13-04 lands: **zero errors across the repo**. Pre-plan baseline had 3 expected RED test-stub errors (`Cannot find module '@/lib/platforms/flap-vaults/fund-recipient'` × 1 and `Module ... has no exported member 'detectFundRecipient'` × 2). All three resolved by this plan.

### Unit Tests — `npm run test:unit -- flap-vaults`

```
Test Files  1 passed (1)
     Tests  20 passed (20)
```

The previously-RED FR-01 describe block (5 mocked cases covering vault-having branch, taxProcessor revert, marketAddress revert, getCode contract, getCode EOA) is now fully GREEN. Existing 15 tests (FP-04 resolveHandler, resolveVaultKind, unknownHandler, baseV1/baseV2 handlers) continue to pass — no regressions.

### Unit Tests — `npm run test:unit -- flap.test`

```
Test Files  1 passed (1)
     Tests  5 passed (5)
```

Existing flap adapter tests pass; no fund-recipient adapter routing tests are present in `flap.test` at this point — those will be added by Wave 4 (Plan 13-06) when the adapter is extended. Plan 13-04 task 4 expected "4 RED routing tests" but inspection shows the adapter routing tests were not landed by Wave 0; their absence is benign (Wave 4 owns them).

### Integration Tests — `lib/__tests__/integration/fund-recipient.test.ts`

The integration suite is excluded from the `unit` Vitest project (`exclude: lib/__tests__/integration/**`), so the 3 tests (`readCumulative >= 70 BNB`, `detectFundRecipient classifies fixture`, `detectFundRecipient base-v2 negative`) do not run under `test:unit`. They compile cleanly (tsc passes), and import paths resolve correctly:

- `import { fundRecipientHandler } from '@/lib/platforms/flap-vaults/fund-recipient'` — module exists with the named export
- `import { detectFundRecipient } from '@/lib/platforms/flap-vaults'` — re-export wired in Task 3

Live-RPC verification will run when the integration suite is invoked separately (or wired into a phase-end gate via `BSC_RPC_URL` injection).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking type compatibility] Widened `readCumulative` + `detectFundRecipient` parameter types from `BscAddress` to `` `0x${string}` ``**

- **Found during:** Pre-Task-2 type analysis (advisor flagged the friction; integration test passes `fixture.tax_processor as `0x${string}``, which is a SUPERTYPE of BscAddress so it cannot be assigned where the brand is required).
- **Issue:** The plan's `<action>` block specified `readCumulative(taxProcessor: BscAddress, ...)`. With strict TS, the integration test (`lib/__tests__/integration/fund-recipient.test.ts:8`) cannot pass `fixture.tax_processor as `0x${string}`` to a `BscAddress` parameter — the brand fields would be missing. The plan explicitly says "do NOT modify tests".
- **Fix:** Both `fundRecipientHandler.readCumulative` and `detectFundRecipient` now accept `` `0x${string}` `` (the viem-native shape). Branded `BscAddress` is structurally a SUBTYPE of `` `0x${string}` `` (`type BscAddress = EvmAddress & { __chainBrand: 'bsc' }` where `EvmAddress = `0x${string}` & { __evmBrand: true }`), so unit tests passing `asBscAddress(...)` values still typecheck. Result fields `taxProcessor` and `marketAddress` retain the branded `BscAddress` type because `asBscAddress(raw)` is called inside the function — callers downstream (cron, adapter) get the type safety guarantee on the way out.
- **Files modified:** `lib/platforms/flap-vaults/fund-recipient.ts` only.
- **Why this is Rule 3:** Without the widening, the integration test would not typecheck, blocking the verification gate Plan 13-04 declares (`fund-recipient.test.ts handler test goes GREEN`). The fix preserves type safety for every internal caller via the branded result fields, while removing the friction the plan's verbatim spec would have introduced.

### Architectural Decisions

**`fundRecipientHandler` is NOT typed as `FlapVaultHandler`.** The plan recognizes this divergence explicitly (`readCumulative(taxProcessor)` vs `readClaimable(vault, user)`). The handler is exported as an inline literal const (`{ kind: 'fund-recipient' as const, async readCumulative(...) {} }`). The HANDLERS map in index.ts (Plan 13-03 safety stub) maps `'fund-recipient'` to `unknownHandler` so `Record<FlapVaultKind, FlapVaultHandler>` exhaustiveness still holds for any caller that accidentally routes through `resolveHandler()`.

**Module-extraction refactor (Task 1) preserved verbatim function body.** `lookupVaultAddress` was moved to `vault-portal.ts` byte-identical (same `tokenPadded` slice, same `decodeAbiParameters` call, same zero-address guard, same structured warn log). The `TRY_GET_VAULT_SELECTOR` constant moved with it. The `index.ts` re-export uses the standard `export ... from './vault-portal'` syntax so the public API surface at `@/lib/platforms/flap-vaults` is byte-identical from the consumer's perspective. No downstream import statement needed updating (verified via `grep -rn 'lookupVaultAddress'`).

## Authentication Gates
None.

## Known Stubs
None — every new symbol is referenced by both the FR-01 unit tests (mocked, GREEN) and the integration tests (live-RPC, conditional on `BSC_RPC_URL`). The `'fund-recipient'` HANDLERS entry remains the documented `unknownHandler` safety stub from Plan 13-03 — that is intentional defense-in-depth, not a stub awaiting work.

## TDD Gate Compliance

The plan declared `tdd="true"` on all 4 tasks but did not introduce new test files in this plan — Wave 0 (Plan 13-01) had already laid the RED stubs. The TDD cycle resolves at the plan level:

- **RED gate (Plan 13-01 / Wave 0):** `test(...)` commits introducing FR-01 unit stubs + fund-recipient integration stubs. Verified via baseline pre-plan tsc output (3 errors, all stub-related) and `npm run test:unit -- flap-vaults` showing 5 RED FR-01 cases before Plan 13-04.
- **GREEN gate (Plan 13-04 / Wave 2 — this plan):** `feat(...)` + `refactor(...)` commits 8bb24e0 / 7a09311 / 80ce396 land the production logic; `npm run test:unit -- flap-vaults` reports 20/20 GREEN; tsc clean.
- **REFACTOR gate:** Not needed — the production logic is the verbatim research-verified body; no follow-up cleanup commit required.

## Self-Check: PASSED

File-existence checks:
- `lib/platforms/flap-vaults/vault-portal.ts` — FOUND (created in commit 8bb24e0)
- `lib/platforms/flap-vaults/fund-recipient.ts` — FOUND (created in commit 7a09311)
- `lib/platforms/flap-vaults/index.ts` — FOUND (modified in commits 8bb24e0 + 80ce396)

Symbol-presence checks:
- `vault-portal.ts` exports `TRY_GET_VAULT_SELECTOR` and `lookupVaultAddress` (verified via grep)
- `fund-recipient.ts` exports `fundRecipientHandler`, `detectFundRecipient`, `FundRecipientResult` (verified via grep)
- `index.ts` re-exports `lookupVaultAddress` + `TRY_GET_VAULT_SELECTOR` from `./vault-portal` AND `detectFundRecipient` + `fundRecipientHandler` + `FundRecipientResult` from `./fund-recipient` (both re-export blocks verified present)
- `fund-recipient.ts` imports `lookupVaultAddress` from `./vault-portal` NOT `./index` (verified via grep — DAG acyclic)

Commit-hash checks:
- 8bb24e0 — FOUND in `git log` (Task 1 vault-portal extraction)
- 7a09311 — FOUND in `git log` (Task 2 fund-recipient module)
- 80ce396 — FOUND in `git log` (Task 3 index.ts re-exports)

Test-status checks:
- `npm run test:unit -- flap-vaults` reports 20/20 GREEN (FR-01 5/5 + existing 15/15) — confirmed
- `npx tsc --noEmit` reports zero errors — confirmed
