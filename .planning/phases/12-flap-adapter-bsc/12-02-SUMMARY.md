---
phase: 12-flap-adapter-bsc
plan: 02
subsystem: api
tags: [viem, bsc, multicall, event-indexer, branded-types, erc20-decimals]

# Dependency graph
requires:
  - phase: 11-flaunch-adapter-base
    provides: "BscAddress branded type + asBscAddress helper + bscClient/bscLogsClient already in place"
  - phase: 12-flap-adapter-bsc (plan 01)
    provides: "Wave 0 test stubs (not present in parallel worktree base, see Deviations)"
provides:
  - "FLAP_PORTAL, FLAP_VAULT_PORTAL, FLAP_PORTAL_DEPLOY_BLOCK constants (BscAddress branded)"
  - "FLAP_TOKEN_CREATED_EVENT parsed ABI (7 non-indexed fields)"
  - "FlapTokenCreatedLog decoded shape"
  - "scanTokenCreated with belt-and-suspenders log.address spoof guard (FP-03 primary defense)"
  - "batchVaultClaimable multicall primitive (allowFailure true, chunk 200) for Plan 03 handlers"
  - "batchReadDecimals multicall primitive (D-10 locked mechanism) for Plan 04 cron + Plan 07 backfill"
  - "assertDeployBlockNotPlaceholder runtime guard for cron startup"
affects: [12-03, 12-04, 12-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Branded BscAddress in constants-evm.ts (mirrors Phase 11 BaseAddress pattern)"
    - "parseAbiItem from verified BscScan impl source (not from blueprint speculation)"
    - "Belt-and-suspenders log.address spoof guard for zero-indexed-param events"
    - "Multicall chunk-at-200 convention (matches flaunch-reads.ts MULTICALL_BATCH_SIZE)"
    - "Per-call ABI injection for batchVaultClaimable (caller-supplied via VaultClaimablePair)"

key-files:
  created:
    - "lib/chains/flap-reads.ts"
  modified:
    - "lib/constants-evm.ts"

key-decisions:
  - "Alias FLAP_PORTAL_DEPLOY_BLOCK to a widened local bigint to preserve the runtime guard (TS narrows the literal to 39_980_228n otherwise and flags === 0n as dead code)"
  - "Dropped unused Log import and unused FLAP_PORTAL import (ESLint no-unused-vars cleanup, no behaviour change)"
  - "Re-typed multicall result via `as Array<RawMulticallResult<T>>` after `contracts: ... as never` cast (matches flaunch-reads.ts L63-65 convention)"

patterns-established:
  - "Shared RawMulticallResult<T> type inside flap-reads for both batchVaultClaimable and batchReadDecimals"
  - "ERC20_DECIMALS_ABI defined inline (no cross-module import) because every ERC20 shares the same EIP-20 signature"

requirements-completed: [FP-01, FP-03]

# Metrics
duration: ~20 min
completed: 2026-04-24
---

# Phase 12 Plan 02: Flap BSC Constants + On-chain Reader Summary

**Flap BSC verified constants (Portal, VaultPortal, deploy block 39_980_228n) + flap-reads.ts primitives (TokenCreated decoder with spoof guard, batchVaultClaimable, batchReadDecimals, runtime guard) ready for Plan 03/04/07 consumption.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-24 (worktree-agent-a8b9efc9)
- **Completed:** 2026-04-24
- **Tasks:** 2 of 2 complete
- **Files modified:** 2 (1 new, 1 extended)

## Accomplishments

- Three verified Flap BSC constants landed in `lib/constants-evm.ts` with BscScan-verified provenance in the comment block. Deploy block is `39_980_228n` (NOT placeholder 0n).
- New 251-line `lib/chains/flap-reads.ts` with server-only import, structured logger, and six exports: `FLAP_TOKEN_CREATED_EVENT`, `FlapTokenCreatedLog`, `scanTokenCreated`, `batchVaultClaimable`, `batchReadDecimals`, `assertDeployBlockNotPlaceholder`.
- Belt-and-suspenders spoof protection in `scanTokenCreated`: throws on any `log.address !== portal` mismatch, which is the ONLY spoof defense because TokenCreated emits zero indexed parameters (topic0 alone is insufficient).
- `batchReadDecimals` wires the D-10 locked decimals mechanism for downstream consumers (Plan 04 cron and Plan 07 backfill). Null fallback signals caller to default to 18 per D-15.
- Repo-wide `npx tsc --noEmit` clean after the changes.
- Scoped `npx eslint lib/chains/flap-reads.ts lib/constants-evm.ts` clean (no new warnings or errors introduced).

## Task Commits

Each task was committed atomically via `git commit --no-verify` (parallel executor requirement to avoid pre-commit hook contention):

1. **Task 1: Append Flap BSC constants to lib/constants-evm.ts** — `c8dfd70` (feat)
2. **Task 2: Create lib/chains/flap-reads.ts with event decoder + spoof guard + multicalls + deploy-block guard** — `bdfcd47` (feat)

## Files Created/Modified

- `lib/constants-evm.ts` (modified): extended the existing `asBaseAddress`/`BaseAddress` import line to also pull `asBscAddress`/`BscAddress`, appended a new 13-line Flap block after the Flaunch section. Existing Flaunch/Clanker/Zora constants untouched.
- `lib/chains/flap-reads.ts` (created): 251 lines. Orders exports as: event ABI, decoded log interface, runtime guard, scanTokenCreated, batchVaultClaimable (VaultClaimablePair + MulticallClaimableResult + function), batchReadDecimals (ERC20 inline ABI + function). Comment blocks cite exact BscScan impl addresses and CONTEXT.md decisions (D-10, D-15) for downstream archaeology.

### Diff preview — lib/constants-evm.ts

```diff
-import { asBaseAddress, type BaseAddress } from '@/lib/chains/types';
+import { asBaseAddress, asBscAddress, type BaseAddress, type BscAddress } from '@/lib/chains/types';

 export const FLAUNCH_FEE_ESCROW: BaseAddress = asBaseAddress('0x72e6f7948b1B1A343B477F39aAbd2E35E6D27dde');
 export const FLETH: BaseAddress = asBaseAddress('0x000000000D564D5be76f7f0d28fE52605afC7Cf8');
+
+// Flap.sh BSC mainnet block (verified 2026-04-24 via BscScan impls + creation txn)
+export const FLAP_PORTAL: BscAddress = asBscAddress('0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0');
+export const FLAP_VAULT_PORTAL: BscAddress = asBscAddress('0x90497450f2a706f1951b5bdda52B4E5d16f34C06');
+export const FLAP_PORTAL_DEPLOY_BLOCK = 39_980_228n;
```

### Structure of lib/chains/flap-reads.ts

| Block | Lines | Purpose |
|-------|-------|---------|
| Imports + logger | 1-8 | server-only, parseAbiItem, bscClient/bscLogsClient, BscAddress type, FLAP_PORTAL_DEPLOY_BLOCK aliased, createLogger('flap-reads') |
| FLAP_TOKEN_CREATED_EVENT | 20-24 | parseAbiItem with verified signature (ZERO indexed params) |
| FlapTokenCreatedLog interface | 30-40 | Decoded shape with BscAddress brands on creator/tokenAddress |
| assertDeployBlockNotPlaceholder | 50-62 | Runtime guard; widens FLAP_PORTAL_DEPLOY_BLOCK to bigint locally so `=== 0n` is live |
| scanTokenCreated | 82-114 | getLogs + belt-and-suspenders log.address equality throw + map to FlapTokenCreatedLog[] |
| MULTICALL_BATCH_SIZE + shared types | 127-150 | Matches flaunch-reads.ts convention; RawMulticallResult<T> recovered via cast after `as never` contracts |
| batchVaultClaimable | 151-182 | bscClient.multicall + allowFailure true + chunked at 200, caller supplies ABI per vault |
| ERC20_DECIMALS_ABI inline | 215-223 | EIP-20 standard `decimals() view returns (uint8)` |
| batchReadDecimals | 225-249 | D-10 locked mechanism, returns (number or null)[] parallel to input |

## Decisions Made

- **Widened `FLAP_PORTAL_DEPLOY_BLOCK` locally to `bigint`.** The imported literal narrows to `39_980_228n` at compile time, so TypeScript flags `=== 0n` as a dead-code comparison and refuses to compile. Fix: alias the import as `FLAP_PORTAL_DEPLOY_BLOCK_CONST` and inside the guard re-bind a local `const FLAP_PORTAL_DEPLOY_BLOCK: bigint = FLAP_PORTAL_DEPLOY_BLOCK_CONST;` so the runtime check stays live AND the plan's required literal `FLAP_PORTAL_DEPLOY_BLOCK === 0n` grep pattern still matches. Runtime semantics unchanged.
- **Removed unused `Log` and `FLAP_PORTAL` imports.** ESLint no-unused-vars flagged both. `Log` was speculatively imported for future spoof-test scaffolding but never referenced (the function parameter types come from viem's getLogs return). `FLAP_PORTAL` is not needed inside the module because `scanTokenCreated` takes `portal` as an argument, keeping the helper chain-safe and mock-friendly.
- **Reused flaunch-reads.ts multicall cast convention.** `contracts: ... as never` + `chunkRaw as Array<RawMulticallResult<T>>` re-recovery, exactly matching the L63-65 precedent, so future maintainers recognise the pattern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TS2367 dead-code comparison on FLAP_PORTAL_DEPLOY_BLOCK === 0n**

- **Found during:** Task 2 verify (`npx tsc --noEmit` after writing flap-reads.ts)
- **Issue:** `if (FLAP_PORTAL_DEPLOY_BLOCK === 0n)` raises TS2367 because the imported literal narrows to `39980228n`, and the two literal types `39980228n` and `0n` have no overlap. TypeScript refuses to compile.
- **Fix:** Imported the const as `FLAP_PORTAL_DEPLOY_BLOCK_CONST`, bound a widened `const FLAP_PORTAL_DEPLOY_BLOCK: bigint` inside the function, and checked against that. The plan-required grep pattern `FLAP_PORTAL_DEPLOY_BLOCK === 0n` still matches because the local variable has the same name. Runtime semantics identical.
- **Files modified:** `lib/chains/flap-reads.ts`
- **Verification:** `npx tsc --noEmit` passes, `grep -c "FLAP_PORTAL_DEPLOY_BLOCK === 0n" lib/chains/flap-reads.ts` returns 1.
- **Committed in:** `bdfcd47` (Task 2 commit).

**2. [Rule 3 - Blocking] TS2488 chunk iteration produces `never` type after multicall cast**

- **Found during:** Task 2 verify (same tsc pass)
- **Issue:** `slice.map(...) as never` propagates into the multicall result so `for (const result of chunk)` errors with "Type 'never' must have a Symbol.iterator method" and `chunk.indexOf(result)` errors with "Property 'indexOf' does not exist on type 'never'" (x2, once per multicall).
- **Fix:** Introduced shared internal types `MulticallSuccess<T>`, `MulticallFailure`, `RawMulticallResult<T>` (matching flaunch-reads.ts L63-65 exact convention). After each `bscClient.multicall({...})` call assign result to `chunkRaw` then re-type as `const chunk = chunkRaw as Array<RawMulticallResult<T>>`. Restores typed iteration + `.indexOf()`.
- **Files modified:** `lib/chains/flap-reads.ts`
- **Verification:** `npx tsc --noEmit` passes, `grep -c "allowFailure: true" lib/chains/flap-reads.ts` returns 5 (2 in code, 3 in comments), all Task 2 grep patterns pass.
- **Committed in:** `bdfcd47` (Task 2 commit).

**3. [Rule 2 - Missing Critical] ESLint no-unused-vars on speculative imports**

- **Found during:** Task 2 verify (`npx eslint` scoped)
- **Issue:** `type Log` from viem and `FLAP_PORTAL` from constants-evm were imported but never referenced. Repo rule `@typescript-eslint/no-unused-vars` flagged both. Not a correctness bug but the plan requires `npm run lint` exits 0 for touched files.
- **Fix:** Removed both from the import list. `scanTokenCreated` takes `portal` as an arg (keeps the helper testable with mock addresses); Log type isn't needed because viem infers the return type of `getLogs`.
- **Files modified:** `lib/chains/flap-reads.ts`
- **Verification:** `npx eslint lib/chains/flap-reads.ts lib/constants-evm.ts` reports zero warnings for this file.
- **Committed in:** `bdfcd47` (Task 2 commit).

---

**Total deviations:** 3 auto-fixed (2 blocking TypeScript errors, 1 ESLint cleanup).
**Impact on plan:** All three deviations necessary to make the plan's own verification targets (`npx tsc --noEmit` and scoped lint) pass. Zero behavioural change from the written plan. Downstream consumers (Plan 03, 04, 07) see the same exports with identical signatures. No scope creep.

## Issues Encountered

### Wave 0 stub RED to GREEN transition deferred

The plan's orchestrator success criterion "Wave 0 test stubs in lib/__tests__/unit/flap-constants.test.ts and flap-reads.test.ts transition from RED to GREEN" could not be validated inside this worktree because the parallel-wave execution model spawned this agent at commit `05c1b01` (pre-Phase-12). Plan 01 (Wave 0 stubs + migration 034) runs as a separate parallel worktree and lands in the same merge window. `npm run test:unit -- flap` in this worktree reports "No test files found, exiting with code 1" (not a failure, just absence).

**Resolution:** document the expected merge-time behaviour here. After the orchestrator merges both worktrees:
- `npm run test:unit -- flap-constants` should pass 3 tests (FLAP_PORTAL non-placeholder, FLAP_VAULT_PORTAL non-placeholder, FLAP_PORTAL_DEPLOY_BLOCK === 39_980_228n).
- `npm run test:unit -- flap-reads` should pass 5 tests (decoder shape, spoof rejection, batchVaultClaimable allowFailure, assertDeployBlockNotPlaceholder runtime guard, batchReadDecimals `[18, null]` shape). The stub scaffolding in Plan 01's file uses `expect.fail('stub ...')` calls; they convert to real assertions against the exports this plan now provides.

This is an expected orchestration artefact of the GSD parallel worktree pattern. Post-merge verification lives in Plan 01's SUMMARY and/or the Phase 12 verifier pass.

### Minor: lint repo-wide pre-existing warnings

Repo-wide `npm run lint` shows 6194 errors and 54681 warnings that predate this plan (pre-existing in other files: `proxy.ts`, `internal-fetch.ts`, `utils.ts`, etc.). These are out of scope per the executor scope boundary rule. Only files touched by this plan were scoped-linted: zero new warnings or errors introduced.

## User Setup Required

None. Both files are pure TypeScript library changes with no env vars, migrations, or dashboard config required. Runtime guard `assertDeployBlockNotPlaceholder` is callable from Plan 04's cron route but not yet wired.

## Next Phase Readiness

- **Plan 03 (vault handler registry):** can now import `batchVaultClaimable`, `VaultClaimablePair`, `MulticallClaimableResult` from `lib/chains/flap-reads.ts` and wire its `base-v1` / `base-v2` / `unknown` handlers to pass their own `claimable(address)` ABI per-vault.
- **Plan 04 (cron index-flap):** can call `assertDeployBlockNotPlaceholder()` at route entry, `scanTokenCreated({portal: FLAP_PORTAL, fromBlock, toBlock})` inside the windowing loop, and `batchReadDecimals(tokens)` before upserting `flap_tokens` rows (D-10 wiring).
- **Plan 07 (backfill script):** can reuse `FLAP_TOKEN_CREATED_EVENT` to cross-validate Bitquery-decoded args against viem's canonical `topic0`, and call `batchReadDecimals` inline at the Bitquery-upsert site.
- **Blockers:** none for downstream plans. `FLAP_PORTAL_DEPLOY_BLOCK` is non-zero so the runtime guard passes. Spoof defense is active. Decimals mechanism is ready for its first upsert consumers.

## Self-Check: PASSED

Verified after writing SUMMARY.md:

- `test -f lib/chains/flap-reads.ts` returned 0 (file present in worktree).
- `test -f lib/constants-evm.ts` returned 0 (file present, still extended).
- `test -f .planning/phases/12-flap-adapter-bsc/12-02-SUMMARY.md` returned 0 (self).
- `git log --all --oneline` shows `c8dfd70` (Task 1) and `bdfcd47` (Task 2) in history.
- All grep patterns from the plan's `<verification>` block pass: `FLAP_PORTAL: BscAddress` x1, `39_980_228n` x1, `log.address.toLowerCase() !== args.portal.toLowerCase()` x1, `allowFailure: true` x5 (>= 2 required), `FLAP_PORTAL_DEPLOY_BLOCK === 0n` x1, `export async function batchReadDecimals` x1.
- `npx tsc --noEmit` exits 0 (last verified pre-commit of Task 2).
- `npx eslint lib/chains/flap-reads.ts lib/constants-evm.ts` exits 0 with zero new warnings.

---
*Phase: 12-flap-adapter-bsc*
*Plan: 02*
*Completed: 2026-04-24*
