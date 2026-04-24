---
phase: 12-flap-adapter-bsc
plan: 03
subsystem: platform-adapter
tags: [viem, bsc, sentry, polymorphism, handler-registry]

# Dependency graph
requires:
  - phase: 11-flaunch-adapter-base
    provides: BscAddress branded type, asBscAddress helper, bscClient, Sentry captureMessage precedent
provides:
  - FlapVaultKind union and FlapVaultHandler interface
  - Polymorphic vault handler registry at lib/platforms/flap-vaults/
  - resolveHandler(vaultType) dispatcher for cached vault_type strings
  - resolveVaultKind(vaultPortal, taxToken, vault) classifier (primary + probe fallback)
  - Sentry D-16 unknown-vault warning with per-vault fingerprint dedup
  - Extracted VaultCategory enum (NONE, TYPE_AI_ORACLE_POWERED) in VAULT_CATEGORY_MAP
affects: [12-04-cron-index-flap, 12-05-flap-adapter, 12-06-ui-vault-type-badge, 12-07-integration-test]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Handler-with-probe-fallback polymorphic registry (first in-repo instance, per PATTERNS.md 'No Analog Found')"
    - "VAULT_CATEGORY_MAP extraction pattern: enum transcribed verbatim from verified BscScan impl source, NatSpec comments preserved as drift detectors"
    - "Sentry fingerprint-based per-vault dedup (not per-token) for D-16 alerts"
    - "Constants-decoupled classifier: vaultPortal passed as parameter so module ships independently of Plan 12-02 (FLAP_VAULT_PORTAL constant)"

key-files:
  created:
    - lib/platforms/flap-vaults/types.ts
    - lib/platforms/flap-vaults/base-v1.ts
    - lib/platforms/flap-vaults/base-v2.ts
    - lib/platforms/flap-vaults/unknown.ts
    - lib/platforms/flap-vaults/index.ts
    - lib/__tests__/unit/flap-vaults.test.ts
  modified: []

key-decisions:
  - "Extracted VaultCategory enum directly from BscScan verified source (File 8 of 28, IVaultPortal.sol line 4745). Only 2 variants: NONE (0), TYPE_AI_ORACLE_POWERED (1). This is an orthogonal oracle-flag axis, NOT the v1/v2 interface-generation discriminator RESEARCH.md assumed."
  - "Mapped both current variants to 'unknown' in VAULT_CATEGORY_MAP, which routes v1/v2 resolution through the method-probe fallback (vaultUISchema → base-v2, claimable(0x0) → base-v1). Primary-signal contract preserved (getVaultCategory still called first on every classification), probe discriminates interface."
  - "Omitted FLAP_VAULT_PORTAL import from index.ts. Plan text (line 638) already notes it is unused — resolveVaultKind takes vaultPortal as a parameter. Removing the import decouples this plan from Plan 12-02 (parallel wave) and avoids a lint warning."
  - "Created lib/__tests__/unit/flap-vaults.test.ts directly with GREEN tests (13 passing) rather than RED stubs. Plan 12-01 Wave 0 stubs don't exist in this worktree base (Phase 11 final = 05c1b01); no sense in RED→GREEN dance within a single plan when we're the ones implementing both."

patterns-established:
  - "Handler registry file layout: shared types.ts + one file per kind + index.ts dispatcher (lib/platforms/flap-vaults/*)"
  - "Enum extraction code comment with BscScan URL + extraction date + enum source verbatim inline, so drift detection (source rehash) is grep-able"
  - "vi.hoisted for test mock initialization when mock factories reference the same fn objects assertion code uses"

requirements-completed: [FP-04]

# Metrics
duration: 9min
completed: 2026-04-24
---

# Phase 12 Plan 03: Flap Vault Handler Registry Summary

**Polymorphic vault handler registry for Flap.sh (lib/platforms/flap-vaults/) with extracted VaultCategory enum, factory-category primary + method-probe fallback classifier, and Sentry-fingerprinted unknown-vault warnings.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-24T21:03:18Z
- **Completed:** 2026-04-24T21:12:12Z
- **Tasks:** 3 (Task 2 checkpoint silent-passed on extraction success)
- **Files modified:** 6 (all new)

## Accomplishments

- 5 files under `lib/platforms/flap-vaults/` wire a polymorphic handler registry: `types.ts`, `base-v1.ts`, `base-v2.ts`, `unknown.ts`, `index.ts` (~250 LOC total, not counting the test)
- `resolveVaultKind(vaultPortal, taxToken, vaultAddress)` implements the full 3-tier classification strategy: `getVaultCategory` primary → `vaultUISchema` V2 probe → `claimable(0x0)` V1 probe → `unknown` terminal
- `resolveHandler(vaultType)` dispatches cached `vault_type` strings to the right handler, defaulting to `unknownHandler` for any unrecognized value
- `unknownHandler.readClaimable()` returns `0n` and fires `Sentry.captureMessage('Flap unknown vault detected', { level: 'warning', fingerprint: ['flap-unknown-vault', vaultAddress], extra: { vault } })` — per-vault dedup so one alert per new unsupported vault implementation, not thousands per cron run
- `VAULT_CATEGORY_MAP` populated from the verified VaultPortal implementation source (2 numeric keys — see below), satisfying the Task 2 checkpoint gate (`awk ... | grep -cE '^\s+[0-9]+:' >= 1` = 2)
- `lib/__tests__/unit/flap-vaults.test.ts`: 13/13 tests pass GREEN covering dispatch, classification, fingerprint shape, and graceful RPC-error fallback

## Task Commits

Each task was committed atomically:

1. **Task 1: Write types.ts with ABIs + extracted VaultCategory enum** — `9e3d50b` (feat)
2. **Task 2: [BLOCKING] Confirm VAULT_CATEGORY_MAP populated** — SILENT PASS (extraction succeeded in Task 1; map has 2 numeric keys ≥ 1 gate)
3. **Task 3: Write 4 handler files + dispatch registry + tests** — `1a00f04` (feat)

## VaultCategory Enum Extraction (Task 1)

### Source

- URL: `https://bscscan.com/address/0x5f54c5ea7bf1c63e765e8406253fb02473d115a1#code`
- File: `File 8 of 28 : IVaultPortal.sol`
- Line: 4745
- Extracted: 2026-04-24

### Enum (verbatim)

```solidity
/// @notice Category classification for vaults (8 bits)
/// @dev Used to categorize vaults by their type or functionality
enum VaultCategory {
    NONE,                   // 0 - Not in any category (default)
    TYPE_AI_ORACLE_POWERED  // 1 - AI Oracle powered vaults
}
```

### Populated `VAULT_CATEGORY_MAP`

```ts
export const VAULT_CATEGORY_MAP: Record<number, FlapVaultKind> = {
  0: 'unknown', // NONE — default factory category; probe resolves v1 vs v2
  1: 'unknown', // TYPE_AI_ORACLE_POWERED — orthogonal oracle flag, probe still
                // resolves the interface generation; if probe also fails, the
                // unknown handler + D-16 Sentry warning is the correct outcome
                // for an unsupported vault shape.
};
```

### Numeric-keyed entries

```
$ grep -c "^  [0-9]\+:" lib/platforms/flap-vaults/types.ts
2
```

Task 2 checkpoint gate (`>= 1` entry) is satisfied with 2 entries.

## Critical Research Correction (Deviation — see below)

RESEARCH.md §"Vault Classification" L192-250 assumed `VaultCategory` was a V1/V2/V3 discriminator. The verified source reveals a completely different semantic: `VaultCategory` is an orthogonal flag classifying vaults by **oracle-powered status**, not interface generation. The v1/v2 distinction that this registry dispatches on is an interface-generation axis captured at runtime by the method-probe fallback:

- `vaultUISchema()` responds → `base-v2`
- `claimable(0x0)` responds → `base-v1`
- both revert → `unknown`

This does NOT break the architecture — it occupies a branch the plan's own `resolveVaultKind` implementation already wrote (line 583-587 of PLAN: "Fall through to method-probe for 'unknown' / unmapped values"). The primary-signal contract is preserved: `getVaultCategory` is called first on every classification, we always consume its result, but today all current variants map to `'unknown'` which triggers the probe. If Flap later ships a V3 interface under a NEW `VaultCategory` variant (e.g., `2: TYPE_V3_BOUNTY`), add that mapping here and — if appropriate — add a `'base-v3'` member to `FlapVaultKind`.

## Sentry Fingerprint Scheme (D-16)

Confirmed shape in `unknown.ts`:

```ts
Sentry.captureMessage('Flap unknown vault detected', {
  level: 'warning',
  fingerprint: ['flap-unknown-vault', vault],
  extra: { vault },
});
```

Dedup axis: vault address (NOT token address). Rationale: multiple tokens can be deployed to the same vault implementation (e.g., two Flap v3 tokens sharing `TraitorBountyV3Vault` impl). Deduping by vault means one alert per vault implementation kind, not one per token. Dashboard: LW-52.

## Test Transition (Wave 0 → GREEN)

```
$ npm run test:unit -- flap-vaults
Test Files  1 passed (1)
     Tests  13 passed (13)
```

Coverage:

| Requirement | Test | Status |
|-------------|------|--------|
| FP-04 dispatch | resolveHandler returns right handler per string | GREEN (4 cases incl. default fallback) |
| FP-04 primary → probe | getVaultCategory reverts, vaultUISchema hits → base-v2 | GREEN |
| FP-04 primary → v1 probe | getVaultCategory reverts, vaultUISchema reverts, claimable hits → base-v1 | GREEN |
| FP-04 mapped unknown → probe | category=0, probes revert → unknown | GREEN |
| FP-04 all fail terminal | everything reverts → unknown | GREEN |
| FP-04 Sentry D-16 | unknown handler fires captureMessage with correct fingerprint shape | GREEN |
| FP-04 v1/v2 read | Handler returns uint256 from bscClient.readContract | GREEN (both v1 + v2) |
| FP-04 v1/v2 graceful fail | Handler returns 0n on RPC error (doesn't throw) | GREEN (both v1 + v2) |

**Full suite:** 189 / 189 pass.

## Files Created/Modified

- `lib/platforms/flap-vaults/types.ts` — FlapVaultKind, FlapVaultHandler, VAULT_PORTAL_ABI, CLAIMABLE_ABI, V2_PROBE_ABI, VAULT_CATEGORY_MAP (populated)
- `lib/platforms/flap-vaults/base-v1.ts` — baseV1Handler reading CLAIMABLE_ABI via bscClient, graceful 0n on RPC error
- `lib/platforms/flap-vaults/base-v2.ts` — baseV2Handler (same shape today; reserved for V2-specific future methods)
- `lib/platforms/flap-vaults/unknown.ts` — unknownHandler returning 0n + Sentry D-16 fingerprint warning
- `lib/platforms/flap-vaults/index.ts` — resolveHandler + resolveVaultKind (primary + 2 probe fallbacks)
- `lib/__tests__/unit/flap-vaults.test.ts` — 13 GREEN unit tests

## Decisions Made

See `key-decisions` frontmatter above — 4 key decisions logged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created flap-vaults.test.ts directly (skipped Plan 12-01 RED stub phase)**
- **Found during:** Pre-execution context load
- **Issue:** Worktree base is `05c1b01` (Phase 11 final commit). Plan 12-01 Wave 0 stubs live on a sibling worktree branch that has not merged into this base. Plan 12-03 success criterion requires `lib/__tests__/unit/flap-vaults.test.ts` to transition RED → GREEN, but the file doesn't exist.
- **Fix:** Wrote the test file directly with 13 GREEN tests against the handlers shipped in this same plan. Plan 12-01 will land its own stub set for the OTHER Wave 0 files (flap-constants, flap-reads, cron-index-flap, flap-adapter, integration/flap). At merge time, Plan 12-01's `flap-vaults.test.ts` stub (if written) will hard-conflict with this file; the conflict resolution is to keep this file (real tests) and drop the stub — which is the correct outcome (a GREEN test is strictly better than a RED stub for the same behavior).
- **Files modified:** lib/__tests__/unit/flap-vaults.test.ts (created)
- **Verification:** `npm run test:unit -- flap-vaults` → 13/13 pass; `npx tsc --noEmit` → EXIT 0
- **Committed in:** 1a00f04 (Task 3 commit)

**2. [Rule 3 - Blocking] Omitted FLAP_VAULT_PORTAL import from index.ts**
- **Found during:** Task 3 (writing index.ts)
- **Issue:** Plan PLAN.md line 530 shows `import { FLAP_VAULT_PORTAL } from '@/lib/constants-evm';`, but Plan 12-02 hasn't added FLAP_VAULT_PORTAL to constants-evm.ts yet in this worktree (it lands in a parallel plan). Importing a missing symbol breaks tsc. Plan text line 638 ALSO explicitly notes the import is unused — `resolveVaultKind` takes `vaultPortal` as a parameter, not from a module-level default.
- **Fix:** Omitted the import. Added an inline code comment to `resolveVaultKind` explaining the parameter-over-constant choice (keeps the module decoupled from Plan 12-02, simplifies testing, matches how Plans 04 and 05 will call it with FLAP_VAULT_PORTAL explicitly).
- **Files modified:** lib/platforms/flap-vaults/index.ts
- **Verification:** `npx tsc --noEmit` → EXIT 0; `grep "FLAP_VAULT_PORTAL" lib/platforms/flap-vaults/index.ts` → 0 matches
- **Committed in:** 1a00f04 (Task 3 commit)

**3. [Rule 1 - Bug] VAULT_CATEGORY_MAP values corrected after source extraction**
- **Found during:** Task 1 (extracting enum from verified source)
- **Issue:** Plan PLAN.md lines 275-278 show an example mapping assuming source order `[UNKNOWN, BASE_V1, BASE_V2]`. Research documented the mapping as `[ASSUMED]`. Actual verified source shows `[NONE, TYPE_AI_ORACLE_POWERED]` — different semantic axis (oracle flag, not v1/v2). If the suggested example values had been used, the primary path would have claimed false `base-v1`/`base-v2` dispositions for brand-new TraitorBounty vaults.
- **Fix:** Mapped both current variants to `'unknown'` so the method-probe fallback discriminates interface generations. Added a 15-line code comment explaining the semantic mismatch, the probe strategy, and how to extend when a V3 category ships.
- **Files modified:** lib/platforms/flap-vaults/types.ts
- **Verification:** Test "primary returns mapped unknown, all probes revert → unknown" confirms the map + fallback flow
- **Committed in:** 9e3d50b (Task 1 commit)

**4. [Rule 3 - Blocking] Added `addBreadcrumb` + `captureException` to Sentry mock**
- **Found during:** Task 3 (running flap-vaults unit tests)
- **Issue:** The test initially mocked only `Sentry.captureMessage`. But the handlers call `createLogger(...).warn(...)`, which internally uses `Sentry.addBreadcrumb` (logger.ts L64). Missing mock export crashed the test run.
- **Fix:** Expanded the Sentry mock with `addBreadcrumb: vi.fn()` and `captureException: vi.fn()` to match the full surface the logger uses.
- **Files modified:** lib/__tests__/unit/flap-vaults.test.ts
- **Verification:** Re-ran `npm run test:unit -- flap-vaults` → 13/13 pass
- **Committed in:** 1a00f04 (Task 3 commit — single commit because the fix was during initial test run)

**5. [Rule 3 - Blocking] Used vi.hoisted for mock function refs**
- **Found during:** Task 3 (running flap-vaults unit tests)
- **Issue:** Initial test used top-level `const readContractMock = vi.fn()` before `vi.mock(...)` factories. Vitest hoists `vi.mock(...)` to top-of-file; the referenced const is uninitialized at hoist time, crashing with "Cannot access 'readContractMock' before initialization".
- **Fix:** Wrapped both mock fn refs in a single `vi.hoisted(() => ({ readContractMock: vi.fn(), captureMessageMock: vi.fn() }))` block.
- **Files modified:** lib/__tests__/unit/flap-vaults.test.ts
- **Verification:** Test file loads successfully, tests execute
- **Committed in:** 1a00f04 (Task 3 commit)

---

**Total deviations:** 5 auto-fixed (2 blocking-cross-plan deps, 1 bug from research assumption, 2 test-infra blocking issues)
**Impact on plan:** All auto-fixes necessary for correctness. Decision #1 required because Plan 12-01 runs on a parallel wave; Decision #2 required because Plan 12-02 runs on a parallel wave; Decision #3 corrects a [ASSUMED] research entry; Decisions #4-5 are standard vitest mock plumbing. No scope creep.

## Issues Encountered

- Initial Write attempt to `lib/platforms/flap-vaults/types.ts` (relative path) appeared to succeed per tool output but file was not created on disk — possibly a worktree CWD mismatch with the tool. Retrying with absolute path `/Users/lowellmuniz/Projects/claimscan/.claude/worktrees/agent-a20896b1/lib/platforms/flap-vaults/types.ts` succeeded. No code impact, but logged here as infrastructure note.

## Next Phase Readiness

- **Plan 12-04 (cron-index-flap)** can `import { resolveVaultKind } from '@/lib/platforms/flap-vaults'` to classify each new TokenCreated event's vault before persisting to `flap_tokens.vault_type`.
- **Plan 12-05 (flap adapter)** can `import { resolveHandler } from '@/lib/platforms/flap-vaults'` to dispatch `handler.readClaimable(vault, user, signal)` per cached row without re-classifying.
- **Plan 12-06 (UI)** reads `fee.vault_type === 'unknown'` to render the D-04 "Claim method unknown" badge — this plan only writes the classifier; the column/field propagation is Plan 05's responsibility.
- **`FlapVaultHandler.readClaimable` signature includes `signal?: AbortSignal`** per the interface. baseV1/baseV2 accept it but don't currently propagate it to `bscClient.readContract` (viem 2.47 supports signal on readContract, but not strictly required for display-only use; Plan 05 can wire it when it adds wallclock budget sharing with live SSE).
- **Unverified vault impl** (TraitorBountyVault `0xd5051e83...`) — the `CLAIMABLE_ABI` signature is still `[ASSUMED]` standard-pattern. Integration test (Plan 12-07) validates against live BSC and catches any divergence loudly.

## Self-Check: PASSED

File existence verified:
- `lib/platforms/flap-vaults/types.ts` — FOUND
- `lib/platforms/flap-vaults/base-v1.ts` — FOUND
- `lib/platforms/flap-vaults/base-v2.ts` — FOUND
- `lib/platforms/flap-vaults/unknown.ts` — FOUND
- `lib/platforms/flap-vaults/index.ts` — FOUND
- `lib/__tests__/unit/flap-vaults.test.ts` — FOUND

Commit hashes verified via `git log --oneline`:
- `9e3d50b` — FOUND (Task 1)
- `1a00f04` — FOUND (Task 3)

Verification commands:
- `npx tsc --noEmit` — EXIT 0
- `npm run test:unit -- flap-vaults` — 13/13 pass
- `npm run test:unit` (full suite) — 189/189 pass
- `npm run lint` — 0 errors (only pre-existing warnings in unrelated files)

---
*Phase: 12-flap-adapter-bsc*
*Plan: 03*
*Completed: 2026-04-24*
