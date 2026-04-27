---
phase: 13-flap-fund-recipient-vault-support-track-auto-forwarded-fees-
plan: 01
subsystem: testing

tags: [vitest, flap, fund-recipient, bsc, tdd, red-stubs, fixture]

# Dependency graph
requires:
  - phase: 12-flap-adapter-bsc
    provides: flap-vaults registry pattern (resolveVaultKind, resolveHandler, FlapVaultHandler interface)
  - phase: 12.1-splitvault-handler-implement-third-flap-vault-type-3979-inst
    provides: Wave 0 RED-stub workflow blueprint (5 stubs across 3 files BEFORE handler code)
provides:
  - Hardcoded fund-recipient fixture (token 0x5f28b56a..., recipient 0xe4cC6a..., taxProcessor 0xf9113d16...)
  - 3 RED integration test stubs for fund-recipient handler + detectFundRecipient
  - 4 RED integration test stubs for adapter routing parity (recipient sees row, deployer does not)
  - 5 RED unit test stubs for detectFundRecipient probe-ladder (vault-having branch, taxProcessor revert, marketAddress revert, contract recipient, EOA recipient)
  - Extended vi.hoisted bsc mock with getCode + call for fund-recipient probe testing
affects:
  - 13-02 (fund-recipient handler implementation — must satisfy readCumulative contract)
  - 13-03 (detectFundRecipient probe-ladder — must satisfy 5 unit cases + 1 integration case)
  - 13-04 (flap adapter routing — must satisfy 4 integration cases for recipient/deployer parity)

# Tech tracking
tech-stack:
  added: []  # No new deps; vitest mock-extension only
  patterns:
    - "Wave-0 RED-only TDD pattern (Phase 12.1 reproduction): write failing stubs first, implementation lands in subsequent waves"
    - "Hardcoded fixture JSON with conservative threshold (>=70 BNB vs measured 72.65 BNB) on monotonic accumulator — false-pass risk only, never false-fail"
    - "Mocked probe-ladder unit tests with vi.hoisted callMock (eth_call) + getCodeMock (bytecode check)"

key-files:
  created:
    - lib/__tests__/fixtures/wallets/flap-fund-recipient-creator.json
    - lib/__tests__/integration/fund-recipient.test.ts
  modified:
    - lib/__tests__/integration/flap.test.ts (4 new it() blocks for adapter routing)
    - lib/__tests__/unit/flap-vaults.test.ts (extended vi.hoisted + bsc mock; new FR-01 describe with 5 it() blocks)

key-decisions:
  - "Fixture token cased lowercase per CLAUDE.md tokenAddress invariant; recipient + taxProcessor keep checksum casing"
  - "Conservative >=70 BNB threshold (vs measured 72.65 BNB) makes test resilient to monotonic-only growth"
  - "Deployer wallet looked up at runtime via flap_tokens.creator (NOT hardcoded) — matches Phase 12.1 SplitVault parity pattern"
  - "Pre-W5 deployer tests skip with descriptive console.warn if fixture token not yet in DB (graceful degradation)"
  - "Mutual exclusion test reuses Phase 12 base-v2 fixture token (proves vault-having tokens reject fund-recipient classification)"

patterns-established:
  - "Wave-0 TDD RED-stub atomic commit pattern: 1 commit per stub-file via worktree --no-verify"
  - "vi.hoisted mock extension pattern: add new mock fns inline without breaking existing tests"

requirements-completed: [FR-01, FR-02, FR-04, FR-08]

# Metrics
duration: 8min
completed: 2026-04-27
---

# Phase 13 Plan 01: Fund-Recipient Wave 0 RED Stubs Summary

**4 files added/extended with 12 RED test stubs (1 fixture + 3 integration handler + 4 integration adapter + 5 unit probe-ladder) locking the contract Phase 13 must satisfy**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-27T04:39:00Z (approx)
- **Completed:** 2026-04-27T04:47:53Z
- **Tasks:** 3
- **Files modified:** 4 (1 created fixture, 1 created test, 2 extended tests)

## Accomplishments
- Hardcoded fund-recipient fixture verified on-chain (block 94565815, ~72.65 BNB cumulative on TaxProcessor 0xf9113d16...)
- New `lib/__tests__/integration/fund-recipient.test.ts` with 3 live-RPC tests gated by BSC_RPC_URL
- Extended `lib/__tests__/integration/flap.test.ts` with 4 adapter-routing tests (recipient/deployer parity, getHistoricalFees + getCreatorTokens)
- Extended `lib/__tests__/unit/flap-vaults.test.ts` with 5 probe-ladder mocked tests (vault-having, taxProcessor revert, marketAddress revert, contract recipient, EOA recipient)
- Extended vi.hoisted mock block (added getCodeMock + callMock) and bscClient mock (added getCode + call methods)
- All RED stubs fail with the EXACT expected errors: `TypeError: detectFundRecipient is not a function` (unit), `Cannot find package '@/lib/platforms/flap-vaults/fund-recipient'` (integration), 9 skipped tests in flap.test.ts when BSC_RPC_URL absent (file parses, runtime-skipped pre-W4)

## Task Commits

Each task was committed atomically with `--no-verify` (worktree, parallel execution):

1. **Task 1: Create fund-recipient fixture JSON** — `66985b6` (test)
2. **Task 2: Create lib/__tests__/integration/fund-recipient.test.ts** — `b49efe7` (test)
3. **Task 3: Extend flap.test.ts + flap-vaults.test.ts with RED stubs** — `21f5cfa` (test)

## Files Created/Modified
- `lib/__tests__/fixtures/wallets/flap-fund-recipient-creator.json` — Hardcoded fixture with token + recipient EOA + taxProcessor + threshold (70 BNB) + caveat for reclassification protocol
- `lib/__tests__/integration/fund-recipient.test.ts` — 3 RED tests for fundRecipientHandler.readCumulative (>=70 BNB), detectFundRecipient classification, base-v2 mutual exclusion
- `lib/__tests__/integration/flap.test.ts` — 4 new it() blocks for getHistoricalFees(recipient/deployer) and getCreatorTokens(recipient/deployer) — D-03/D-04 contract
- `lib/__tests__/unit/flap-vaults.test.ts` — vi.hoisted block extended with getCodeMock + callMock; bsc mock extended with getCode + call; new "FR-01: detectFundRecipient" describe block with 5 mocked-probe it() bodies

## Decisions Made
- Fixture `token` field stored lowercase per CLAUDE.md invariant; `wallet` and `tax_processor` keep checksum casing
- Conservative threshold (>=70 BNB) on monotonic accumulator — won't false-fail if accumulator grows; will catch a regression where adapter returns 0
- Deployer wallet for parity tests resolved at runtime via `SELECT creator FROM flap_tokens WHERE token_address = fixture.token` (not hardcoded — pre-W5 graceful skip if creator NULL)
- Mutual-exclusion test uses Phase 12 base-v2 fixture token (already-verified contract recipient → getCode non-empty → matched=false)

## Deviations from Plan

### Documentation Note (no auto-fix needed)

**1. [Rule N/A — verify command annotation] Plan verify uses `npm run test:unit -- fund-recipient` for an integration-project file**

- **Found during:** Task 2 (running verify command)
- **Issue:** Plan's verify command for `lib/__tests__/integration/fund-recipient.test.ts` says `npm run test:unit -- fund-recipient`, but vitest unit project explicitly excludes `lib/__tests__/integration/**`. Unit project returns "No test files found, exiting with code 1" (which IS a non-zero exit but not for the right reason).
- **Resolution:** Used `npm run test:integration -- fund-recipient` instead, which produced the expected RED state: `Cannot find package '@/lib/platforms/flap-vaults/fund-recipient'`. The spirit of the plan's verify command (RED state proves new symbols don't exist) is satisfied.
- **No code change required.** Plan author may want to update Wave 2/3/4 plans to use `test:integration` for files under `lib/__tests__/integration/` going forward.

---

**Total deviations:** 0 auto-fixed (1 documentation observation about plan verify command — no code action taken)
**Impact on plan:** None. RED state achieved exactly as designed; commit pattern atomic per task.

## TDD Gate Compliance

This is a Wave-0 RED-only plan (`type: execute` with `tdd="true"` per task). Per the plan-level TDD note in the executor rules:
- Plan emitted only `test()` commits (3 of them) — by design
- No `feat()` commit expected at this wave (Wave 2/3/4 will land implementation)
- All 5 unit tests in the new "FR-01: detectFundRecipient" describe block fail RED with `TypeError: detectFundRecipient is not a function`
- Integration tests fail RED with `Cannot find package '@/lib/platforms/flap-vaults/fund-recipient'`
- 9 tests in flap.test.ts skip cleanly when BSC_RPC_URL absent (file parses, runtime-gated)

Plan-level TDD gate: GREEN expected in subsequent waves (13-02 handler, 13-03 detection, 13-04 adapter routing).

## Issues Encountered
None.

## Threat Flags
None — no new attack surface introduced (test files only).

## Next Phase Readiness
- All 4 files in place; Wave 2 can now create `lib/platforms/flap-vaults/fund-recipient.ts` with `fundRecipientHandler.readCumulative` and have the 3 integration tests turn GREEN
- Wave 3 can add `detectFundRecipient` export to `lib/platforms/flap-vaults/index.ts` and have the 5 unit tests + 1 integration test turn GREEN
- Wave 4 can wire fund-recipient routing into `lib/platforms/flap.ts` adapter and have the 4 adapter-routing tests turn GREEN
- No blockers identified

## Self-Check: PASSED

- [x] `lib/__tests__/fixtures/wallets/flap-fund-recipient-creator.json` exists (verified by `node -e require()` returning OK)
- [x] `lib/__tests__/integration/fund-recipient.test.ts` exists (file Read confirmed; 25 lines)
- [x] `lib/__tests__/integration/flap.test.ts` modified with 4 new it() blocks (git diff shows +66 lines)
- [x] `lib/__tests__/unit/flap-vaults.test.ts` modified with extended hoist + new FR-01 describe (git diff shows +75 lines)
- [x] Commit `66985b6` exists (test: fund-recipient fixture JSON)
- [x] Commit `b49efe7` exists (test: integration RED stubs)
- [x] Commit `21f5cfa` exists (test: flap + flap-vaults extensions)
- [x] `npm run test:unit -- flap-vaults` shows 5 NEW failing tests with `TypeError: detectFundRecipient is not a function` (RED state confirmed)
- [x] `npm run test:integration -- fund-recipient` fails with `Cannot find package '@/lib/platforms/flap-vaults/fund-recipient'` (RED state confirmed)
- [x] `npm run test:integration -- flap.test` shows 9 skipped tests cleanly (file parses; 5 original + 4 new RED-pending stubs gated by BSC_RPC_URL)
- [x] `npx tsc --noEmit` shows ONLY the 3 expected RED-state errors (`fund-recipient` module + `detectFundRecipient` member missing) — no unrelated regressions

---
*Phase: 13-flap-fund-recipient-vault-support-track-auto-forwarded-fees-*
*Completed: 2026-04-27*
