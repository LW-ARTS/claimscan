---
phase: 11-flaunch-adapter-base
plan: 04
subsystem: flaunch-adapter
tags: [adapter, flaunch, base, registry, synthetic-token-id, wave-2]

requires:
  - phase: 11-flaunch-adapter-base
    provides: "BaseAddress, asBaseAddress (from Plan 11-01 / lib/chains/types.ts)"
  - phase: 11-flaunch-adapter-base
    provides: "fetchCoinsByCreator + FlaunchApiError discriminated union (from Plan 11-02 / lib/flaunch/client.ts)"
  - phase: 11-flaunch-adapter-base
    provides: "readFlaunchBalances + FLAUNCH_REVENUE_MANAGER (from Plan 11-03 / lib/chains/flaunch-reads.ts, lib/constants-evm.ts)"
provides:
  - "flaunchAdapter: PlatformAdapter (server-only) in lib/platforms/flaunch.ts"
  - "Registry entry flaunch: flaunchAdapter in lib/platforms/index.ts"
  - "Synthetic TokenFee pattern BASE:flaunch-revenue (mirrors SOL:pump)"
  - "Record<Exclude<Platform, 'flap'>, PlatformAdapter> registry type"
affects: [12-flap-adapter]

tech-stack:
  added: []
  patterns:
    - "Synthetic token ID for aggregated platforms (BASE:flaunch-revenue)"
    - "Two-step discovery + balance guard (skip RPC when wallet holds zero coins)"
    - "historicalCoversLive=true to skip duplicate live-call RPC"
    - "Discriminated error union consumption via 'kind' in resp narrowing"
    - "Record<Exclude<Platform, 'flap'>, ...> registry type: compile-time completeness for implemented adapters while deferring 'flap' to Phase 12"

key-files:
  created:
    - "lib/platforms/flaunch.ts (111 lines)"
  modified:
    - "lib/platforms/index.ts (Partial widening reverted; flaunch registered)"

key-decisions:
  - "Registry type: Record<Exclude<Platform, 'flap'>, PlatformAdapter>. Stricter than the plan's Option A Partial<Record<Platform, ...>> while satisfying the orchestrator's 'equivalent full coverage' directive. Plan 12 drops the Exclude once flapAdapter ships."
  - "getLiveUnclaimedFees uses flaunchAdapter.getHistoricalFees(wallet) (not this.getHistoricalFees) to survive hypothetical method destructuring. Orchestrator calls via adapter.getLiveUnclaimedFees today so this is a safety net."
  - "totalClaimed: '0' in v1. RevenueManager.balances() returns cumulative-unclaimed-since-last-claim, so totalEarned === totalUnclaimed in v1. Per-wallet Claimed event scan deferred to v2 per PROJECT.md Out of Scope."
  - "getCreatorTokens lowercases tokenAddress per CLAUDE.md EVM convention (also matches the existing Clanker adapter pattern)."
  - "getHistoricalFees normalizes wallet via normalizeEvmAddress before asBaseAddress (defense in depth; asBaseAddress/getAddress already checksums but normalizeEvmAddress is the repo's canonical boundary helper)."

patterns-established:
  - "Flaunch adapter acts as pure composition over lib/flaunch/client.ts (REST) and lib/chains/flaunch-reads.ts (on-chain). No new types, no new tests — template for Flap in Phase 12."
  - "Record<Exclude<Platform, 'flap'>, PlatformAdapter>: reusable pattern for 'union widened but adapter not yet implemented' intermediate states."

requirements-completed: [FL-05, FL-06]

metrics:
  duration_minutes: 5
  completed_date: 2026-04-20
  tasks_completed: 2
---

# Phase 11 Plan 04: Flaunch Adapter + Registry Registration Summary

Shipped the `flaunchAdapter` composition layer and registered it in the platform registry. The Wave-1 foundations (BaseAddress type, fetchCoinsByCreator HTTP client, readFlaunchBalances on-chain helper, FLAUNCH_REVENUE_MANAGER constant) are consumed but not extended. Zero new types, zero new tests — pure glue. Cron `/api/cron/index-fees` and `/api/fees/live-stream` auto-detect the new adapter via `getAllAdapters()`.

## What Was Built

### Task 1: lib/platforms/flaunch.ts (commit bb233f3)

New file implementing the `PlatformAdapter` interface end-to-end:

| Property / Method | Value / Behavior |
|---|---|
| `platform` | `'flaunch'` |
| `chain` | `'base'` |
| `supportsIdentityResolution` | `false` |
| `supportsLiveFees` | `true` |
| `supportsHandleBasedFees` | `false` |
| `historicalCoversLive` | `true` (orchestrator skips redundant live call) |
| `resolveIdentity` | returns `[]` (no social resolution; Flaunch exposes holders via REST, not handles) |
| `getFeesByHandle` | returns `[]` |
| `getCreatorTokens` | `fetchCoinsByCreator(owner)` mapped to `CreatorToken[]` with `tokenAddress.toLowerCase()` |
| `getHistoricalFees` | two-step: REST discovery first, on-chain `balances()` only if coins > 0 and balance > 0; emits at most ONE TokenFee |
| `getLiveUnclaimedFees` | defers to `getHistoricalFees` + filter `BigInt(totalUnclaimed) > 0n`; honors `signal.aborted` |

Synthetic TokenFee shape:
```ts
{
  tokenAddress: 'BASE:flaunch-revenue',
  tokenSymbol: 'ETH',
  chain: 'base',
  platform: 'flaunch',
  totalEarned: claimable.toString(),   // = totalUnclaimed in v1
  totalClaimed: '0',                    // v1 not tracked
  totalUnclaimed: claimable.toString(),
  totalEarnedUsd: null,                 // price waterfall resolves ETH/USD downstream
  royaltyBps: null,
}
```

Error handling: `'kind' in resp` narrows the discriminated union from `FlaunchApiError` (`rate_limited | not_found | schema_drift | network_error`) and degrades to `[]` with `log.warn({ kind, wallet: wallet.slice(0, 10) })`. Truncated wallet logging mitigates T-11.04-03.

### Task 2: lib/platforms/index.ts (commit fe4015b)

- Added `import { flaunchAdapter } from './flaunch';`
- Added `flaunch: flaunchAdapter` entry to the `adapters` record
- Tightened registry type: `Partial<Record<Platform, PlatformAdapter>>` (transitional Plan 11-01 widening) narrowed to `Record<Exclude<Platform, 'flap'>, PlatformAdapter>`. This is stricter than Partial (TypeScript errors if any of the 10 implemented platforms is missing) while still allowing `'flap'` to be declared in the Platform union without a concrete adapter.
- `getAdapter()` short-circuits `'flap' -> null` to match the pre-Phase-12 runtime contract.
- `getAllAdapters()` returns `Object.values(adapters)` directly (no type-guard dance needed — `Record<Exclude<...>>` narrows cleanly).
- `getIdentityResolvers / getLiveFeeAdapters / getHandleFeeAdapters` now read through `getAllAdapters()` for type consistency.

## Verification

| Check | Result |
|---|---|
| `test -f lib/platforms/flaunch.ts` | PASS |
| `grep -q "import 'server-only'" lib/platforms/flaunch.ts` | PASS |
| `grep -q "export const flaunchAdapter: PlatformAdapter" lib/platforms/flaunch.ts` | PASS |
| `grep -q "platform: 'flaunch'"` + all interface flags | PASS |
| `grep -q "BASE:flaunch-revenue"` | PASS |
| `grep -q "tokenSymbol: 'ETH'"` | PASS |
| `grep -q "readFlaunchBalances"` | PASS |
| `grep -q "fetchCoinsByCreator"` | PASS |
| em-dash count in flaunch.ts | 0 |
| em-dash count in index.ts | 0 |
| `grep -q "import { flaunchAdapter } from './flaunch'" lib/platforms/index.ts` | PASS |
| `grep -q "flaunch: flaunchAdapter" lib/platforms/index.ts` | PASS |
| `grep -q "Record<Exclude<Platform, 'flap'>, PlatformAdapter>"` | PASS |
| `npx tsc --noEmit` | exit 0 |
| `npm run test:unit` | 161/161 passed (7 test files, 6.33s) |
| `npx eslint lib/platforms/flaunch.ts lib/platforms/index.ts` | clean (no errors, no warnings) |
| `grep -c "Adapter\b" lib/platforms/index.ts` | 31 (well over the 10 threshold) |

Runtime smoke test (`npx tsx -e "import('./lib/platforms/index.ts').then(m => console.log(m.getAllAdapters().length))"`) fails because the module imports `'server-only'` which throws outside a Next.js request context. Unit tests (161/161) exercise the registry indirectly through other modules. Expected count is 10 adapters: bags, clanker, pump, zora, bankr, believe, revshare, coinbarrel, raydium, flaunch.

## Files Created

- `lib/platforms/flaunch.ts` (111 lines)

## Files Modified

- `lib/platforms/index.ts` (+13/-8 lines)

## Commits

| Commit | Message |
|---|---|
| `bb233f3` | feat(11-04): add flaunchAdapter implementing PlatformAdapter (FL-05) |
| `fe4015b` | feat(11-04): register flaunchAdapter in platform registry (FL-06) |

## Deviations from Plan

### Registry type: stricter than Option A

**What the plan said:** Plan 04 Task 2 explicitly chose `Option A` — keep `Partial<Record<Platform, PlatformAdapter>>` until Phase 12 ships `flapAdapter`, because `'flap'` is already in the Platform union from Plan 11-01.

**What the orchestrator directive said:** Revert the registry type from `Partial<Record<Platform, PlatformAdapter>>` back to `Record<Platform, PlatformAdapter>`.

**Why this is a constraint conflict:** A literal `Record<Platform, PlatformAdapter>` requires a `flap: flapAdapter` entry that does not exist. Shipping literal `Record<Platform, ...>` would fail `npx tsc --noEmit`, which is a hard acceptance criterion.

**Resolution (also permitted by success_criteria: 'Record<Platform, PlatformAdapter> (or equivalent full coverage)'):** Use `Record<Exclude<Platform, 'flap'>, PlatformAdapter>`. This is stricter than Partial (compile-time enforcement that all 10 implemented platforms are present) while still allowing 'flap' to be deferred. Plan 12 drops the `Exclude<..., 'flap'>` once `flapAdapter` lands.

**Side benefit:** `Object.values(adapters)` now returns `PlatformAdapter[]` directly, so `getAllAdapters` no longer needs the type-guard `filter((a): a is PlatformAdapter => a !== undefined)` dance shown in the plan's Task 2 final-state block.

**Classification:** Rule 3 blocking fix (literal directive can't compile; chose the equivalent-or-stricter variant allowed by the success criteria).

### Minor: this vs flaunchAdapter in getLiveUnclaimedFees

The plan's Task 1 skeleton uses `this.getHistoricalFees(wallet)` inside `getLiveUnclaimedFees`. Changed to `flaunchAdapter.getHistoricalFees(wallet)` — survives hypothetical method destructuring (e.g., `const { getLiveUnclaimedFees } = flaunchAdapter`). Orchestrator calls via `adapter.getLiveUnclaimedFees(...)` today so `this` would bind correctly, but the explicit reference is strictly safer with zero runtime cost.

**Classification:** Rule 1 defensive fix. No behavior change under current call sites.

## Auth Gates

None. Pure code change, no external APIs touched beyond what Plans 11-02 and 11-03 already handle.

## Known Stubs

None. Every method returns a real implementation.

## Threat Flags

None beyond the plan's existing `<threat_model>`. All registered threats are addressed:

- T-11.04-01 (schema drift): handled via `'kind' in resp` narrowing. Unvalidated data never reaches the DB.
- T-11.04-02 (spoofed token list): accepted; fees come from on-chain `balances()`, not REST `data[]`.
- T-11.04-03 (wallet PII in logs): mitigated with `wallet: wallet.slice(0, 10)`.
- T-11.04-04 (double-hit DoS): mitigated by short-circuiting when coins = 0 or balance = 0n.
- T-11.04-05 (client-side bundling): mitigated by `import 'server-only'`.
- T-11.04-06 (exhaustive switch on Platform): `Record<Exclude<Platform, 'flap'>>` is strictly tighter than Partial, still compiles.
- T-11.04-07 (audit trail): `log.warn` on all error kinds; Sentry picks them up.

## Next Phase Readiness

- `/api/cron/index-fees` iterates `getAllAdapters()` — Flaunch enters the loop on the next invocation without any cron-side code change.
- `/api/fees/live-stream` filters by `supportsLiveFees` — Flaunch included automatically.
- Plan 12 (Flap adapter, Phase 12) has a template pattern: mirror `flaunch.ts` structure, register in `index.ts`, drop the `Exclude<Platform, 'flap'>` from the registry type.

## Self-Check: PASSED

Files:
- FOUND: lib/platforms/flaunch.ts
- FOUND: lib/platforms/index.ts (modified)

Commits:
- FOUND: bb233f3
- FOUND: fe4015b

Verification:
- npx tsc --noEmit: exit 0
- npm run test:unit: 161/161 passed

---
*Phase: 11-flaunch-adapter-base*
*Completed: 2026-04-20*
