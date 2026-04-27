---
phase: 13-flap-fund-recipient-vault-support-track-auto-forwarded-fees-
plan: 06
subsystem: api
tags: [flap, bsc, supabase, postgrest, viem, fund-recipient, adapter]

# Dependency graph
requires:
  - phase: 13-05
    provides: "cron classification loop writing vault_type=fund-recipient + recipient_address + tax_processor_address into flap_tokens"
  - phase: 13-04
    provides: "fundRecipientHandler.readCumulative + detectFundRecipient in flap-vaults/fund-recipient.ts"
  - phase: 13-03
    provides: "FlapVaultKind union extended with 'fund-recipient'"
  - phase: 13-02
    provides: "migration 036 — recipient_address + tax_processor_address columns on flap_tokens"
provides:
  - "Extended getHistoricalFees: dual-axis PostgREST OR clause + fund-recipient per-row dispatch via fundRecipientHandler.readCumulative"
  - "Extended getCreatorTokens: same OR clause so recipient wallet appears on leaderboard (D-04)"
  - "FlapTokenRow interface extended with recipient_address + tax_processor_address fields"
  - "Two-stage pre-filter: fundRecipientRows (bypass vault_address filter) + vaultHavingRows (existing null filter)"
  - "fund-recipient TokenFee shape: totalUnclaimed='0', totalEarned=totalClaimed=cumulative, vaultType='fund-recipient'"
  - "Updated unit tests: mockOr replacing mockEq, vi.hoisted() pattern, fundRecipientHandler mock"
affects: [13-07, 13-08, 13-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-axis PostgREST OR clause: and(creator.eq.X,vault_type.neq.fund-recipient),and(vault_type.eq.fund-recipient,recipient_address.eq.X)"
    - "Two-stage pre-filter splits rows by axis before dispatch loop (fundRecipientRows / vaultHavingRows)"
    - "Direct handler bypass: fund-recipient rows skip HANDLERS registry, call fundRecipientHandler.readCumulative directly"
    - "totalUnclaimed='0' for fund-recipient rows preserves CLAUDE.md stat-card vs filter invariant"
    - "vi.hoisted() pattern for Vitest mocks that reference outer variables from vi.mock() factories"

key-files:
  created: []
  modified:
    - lib/platforms/flap.ts
    - lib/__tests__/unit/flap-adapter.test.ts

key-decisions:
  - "fund-recipient dispatch bypasses HANDLERS registry because readCumulative(taxProcessor) has different signature from readClaimable(vault, user)"
  - "totalUnclaimed='0' for fund-recipient rows: fees already in recipient wallet, no claim action exists — preserves Unclaimed filter invariant"
  - "Two-stage pre-filter (fundRecipientRows/vaultHavingRows) replaces single classified[] filter to handle fund-recipient rows with null vault_address"
  - "vi.hoisted() used in unit tests to safely reference mocks inside vi.mock() factory functions"

requirements-completed: [FR-02, FR-04]

# Metrics
duration: 30min
completed: 2026-04-27
---

# Phase 13 Plan 06: Flap Adapter Fund-Recipient Extension Summary

**Flap adapter extended with dual-axis PostgREST OR clause and direct fundRecipientHandler.readCumulative dispatch, enabling recipient wallet profiles to surface auto-forwarded fee rows with totalUnclaimed='0'**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-04-27T14:00:00Z
- **Completed:** 2026-04-27T14:33:37Z
- **Tasks:** 3 (Tasks 1+2 implemented together, Task 3 verification + test fix)
- **Files modified:** 2

## Accomplishments

- `lib/platforms/flap.ts` fully extended: FlapTokenRow interface, getCreatorTokens OR clause, getHistoricalFees OR clause + two-stage dispatch
- fund-recipient rows now surface on recipient wallet profiles with correct TokenFee shape (totalUnclaimed='0', vaultType='fund-recipient')
- CLAUDE.md stat-card vs filter invariant preserved: Unclaimed filter correctly drops fund-recipient rows
- Unit tests updated to mock `.or()` query chain with vi.hoisted() pattern; all 226 tests pass
- `npx tsc --noEmit` clean throughout

## Task Commits

1. **Tasks 1+2: FlapTokenRow extension + OR clause + fund-recipient dispatch** - `b17df89` (feat)
2. **Task 3: Update unit tests for Phase 13 OR clause** - `305dff6` (fix)

## Files Created/Modified

- `lib/platforms/flap.ts` - FlapTokenRow extended with recipient_address + tax_processor_address; getCreatorTokens uses OR clause; getHistoricalFees uses OR clause + two-stage pre-filter + fund-recipient dispatch loop via fundRecipientHandler.readCumulative
- `lib/__tests__/unit/flap-adapter.test.ts` - Mock chain updated from .eq() to .or(); vi.hoisted() pattern; fundRecipientHandler mock added; all 4 existing tests updated with new column fixtures

## Decisions Made

- Tasks 1 and 2 implemented in a single edit session (one file, sequential changes) rather than separate commits; combined into one feat commit with full description
- Log key used `getHistoricalFees.fund_recipient_dispatch_failed` (consistent with existing module convention) rather than `flap.fund_recipient_dispatch_failed` from plan template
- vi.hoisted() used to fix Vitest hoisting ReferenceError when referencing mockReadCumulative inside vi.mock() factory

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Unit tests broke after OR clause migration**
- **Found during:** Task 3 (test suite verification)
- **Issue:** `lib/__tests__/unit/flap-adapter.test.ts` mocked `.eq()` on the Supabase query chain but the adapter now calls `.or()`. All 4 existing tests failed with 0 calls on mockEq / empty fees arrays. Additionally, `vi.mock('@/lib/platforms/flap-vaults')` factory referenced `mockReadCumulative` declared after the hoist point, causing `ReferenceError: Cannot access 'mockReadCumulative' before initialization`.
- **Fix:** Rewrote mock setup using `vi.hoisted()` to declare all mock functions before hoist; added `mockOr` to the Supabase query chain mock; added `fundRecipientHandler` mock with `readCumulative`; updated all 4 existing tests to use `mockOr.mockResolvedValueOnce` with `recipient_address`/`tax_processor_address` fields in fixture rows; rewrote first test to assert OR clause contents.
- **Files modified:** `lib/__tests__/unit/flap-adapter.test.ts`
- **Verification:** `npm run test:unit` — 226/226 tests pass
- **Committed in:** `305dff6`

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Test infrastructure fix required by the adapter query change. No scope creep.

## Issues Encountered

- Worktree HEAD was at `22e2951` (Phase 12.1), not at `531a3a8` (Phase 13-05 base). The `<worktree_branch_check>` protocol required `git reset --hard 531a3a8f79d1ee975950104817f53f2024906116` before any work could begin. After reset, fund-recipient.ts and the updated index.ts were present as expected.

## Test Suite State

- **Total:** 226 tests, 15 test files — all GREEN
- **Phase 12 + 12.1 tests:** Unaffected (base-v1, base-v2, split-vault adapter routing)
- **Plan 13-04 tests:** Unaffected (fund-recipient handler + FR-01 unit suite)
- **4 fund-recipient adapter routing tests referenced in plan:** Not present in `lib/__tests__/integration/flap.test.ts` — the plan's Wave 0 tests were not landed by prior plans. This plan ships the adapter code that would satisfy those tests. They will turn GREEN when the fixture row exists as 'fund-recipient' in flap_tokens (guaranteed by Plan 13-09 W5 classify-flap.ts run).

## Known Stubs

None. The adapter wires real data (PostgREST OR clause + on-chain readCumulative). No hardcoded empty values or placeholder text.

## Threat Flags

No new threat surface beyond what the plan's threat model documents (T-13-16 through T-13-19). Wallet parameter is regex-validated by isEvmAddress (lines 18-20) before use in OR clause template literal.

## Self-Check: PASSED

- `lib/platforms/flap.ts`: FOUND
- `lib/__tests__/unit/flap-adapter.test.ts`: FOUND
- `13-06-SUMMARY.md`: FOUND
- Commit `b17df89`: FOUND
- Commit `305dff6`: FOUND

## Next Phase Readiness

- Plan 13-07 (UI: fund-recipient badge + display) can proceed — adapter now emits `vaultType='fund-recipient'` rows with correct shape
- Plan 13-09 W5 (classify-flap.ts run) will cause the 4 adapter integration tests in flap.test.ts to turn GREEN
- `getCreatorTokens(recipient)` now returns fund-recipient tokens, enabling leaderboard ranking (D-04) once rows exist in DB

---
*Phase: 13-flap-fund-recipient-vault-support-track-auto-forwarded-fees-*
*Completed: 2026-04-27*
