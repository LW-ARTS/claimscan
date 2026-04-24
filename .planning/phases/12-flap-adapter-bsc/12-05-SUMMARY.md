---
phase: 12-flap-adapter-bsc
plan: 05
subsystem: flap-adapter-bsc
tags: [flap, adapter, vault_type, SSE, persistence, UI-merge, bsc, evm]
requires:
  - 12-01 migration 034 (fee_records.vault_type column, flap_tokens/flap_indexer_state tables)
  - 12-02 lib/chains/flap-reads.ts (batchReadDecimals, scanTokenCreated)
  - 12-03 lib/platforms/flap-vaults registry (resolveHandler, FlapVaultKind)
provides:
  - TokenFee.vaultType optional field (D-04 badge routing)
  - LiveFeeRecord.vaultType optional field + defensive SSE stream thread
  - fee_records.vault_type column type on Database
  - flap_tokens + flap_indexer_state table types on Database
  - persistFees vault_type wire (adapter output -> DB cache)
  - PlatformBreakdown cached-override + virtual-row vault_type merge
  - lib/platforms/flap.ts flapAdapter (first adapter reading primary data from Supabase)
  - flap: flapAdapter registered with Record<Platform, PlatformAdapter> exhaustiveness
  - SHIPPED_LAUNCHPAD_COUNT = 11
affects:
  - Plan 06 (UI badge): can now render `fee.vault_type === 'unknown'` branch without type intersections
  - Plan 07 (integration test): flapAdapter is invokable end-to-end
tech-stack:
  added: []
  patterns:
    - First adapter to read primary data from Supabase via createServiceClient
    - Defensive SSE enum clamp (vaultType untrusted → enum-or-undefined)
    - Serial per-row multicall dispatch under D-15 RPC rate-limit invariant
key-files:
  created:
    - lib/platforms/flap.ts
  modified:
    - lib/platforms/types.ts
    - app/components/LiveFeesProvider.tsx
    - lib/supabase/types.ts
    - lib/services/fee-sync.ts
    - app/components/PlatformBreakdown.tsx
    - lib/platforms/index.ts
    - lib/constants.ts
    - lib/__tests__/unit/flap-adapter.test.ts
decisions:
  - "Added Database.Tables.flap_tokens + flap_indexer_state TS types (Rule 2 deviation) — migration 034 applied them but TS types had not been regenerated"
  - "Serial for-loop over per-row claimable multicalls (not Promise.all) to honour D-15 BSC RPC rate limit; v2 plan can parallelize if latency observed"
  - "Adapter returns [] on DB error (log.warn + swallow) — fail-safe matches Phase 11 Flaunch precedent"
metrics:
  duration: ~40 minutes
  completed-date: 2026-04-24
---

# Phase 12 Plan 05: Flap Adapter + vault_type Pipeline Summary

Closed the vertical slice for the Flap adapter by propagating `vault_type` end-to-end (adapter TokenFee -> DB cache -> SSE LiveFeeRecord -> UI overlay), implementing the `flapAdapter` (reads `flap_tokens`, dispatches to the Plan 03 handler registry, D-12 zero-balance filter, D-04 badge routing via `vaultType`), registering it with full `Record<Platform, PlatformAdapter>` exhaustiveness, and flipping `SHIPPED_LAUNCHPAD_COUNT` from 10 to 11. All 4 FP-06 RED stubs driven to GREEN.

## File Changes

### 1. `lib/platforms/types.ts` (modified)

Added a single optional field to `TokenFee` (line 54, right after `claimRightLost?: boolean`):

```ts
  /** Flap-specific vault classification used for UI badge routing (D-04).
   *  'base-v1' and 'base-v2' = known handler, row renders normally.
   *  'unknown' = vault ABI not recognized, UI renders "Claim method unknown" badge
   *  next to the external link. Absent for non-Flap rows. */
  vaultType?: 'base-v1' | 'base-v2' | 'unknown';
```

Union text locked verbatim to the same literal that appears in `LiveFeeRecord.vaultType`, `FlapVaultKind` (Plan 03), and the migration 034 CHECK constraint.

### 2. `app/components/LiveFeesProvider.tsx` (modified)

**Sub-edit A:** Added `vaultType?: 'base-v1' | 'base-v2' | 'unknown';` to `LiveFeeRecord` (line after `claimRightLost?: boolean`). Union text matches `TokenFee.vaultType` verbatim — confirmed via grep on the exact `vaultType?: 'base-v1' | 'base-v2' | 'unknown'` string (returns 1 in each file).

**Sub-edit B:** Threaded `vaultType` through the SSE `partial-result` reducer at line 158, adopting the defensive parse pattern used by sibling fields (`feeLocked`, `claimRightLost`):

```ts
                    vaultType: f.vaultType === 'base-v1' || f.vaultType === 'base-v2' || f.vaultType === 'unknown' ? f.vaultType : undefined,
```

This clamps the untrusted SSE payload string to the enum-or-undefined (T-12-09 mitigation).

### 3. `lib/supabase/types.ts` (modified)

- Added `vault_type: string | null` to `fee_records` Row (required key, nullable value — mirrors `fee_type`/`fee_locked`)
- Added `vault_type?: string | null` to `fee_records` Insert and Update (optional + nullable)
- **Added `flap_tokens` table types** (Row/Insert/Update) — columns: `token_address`, `creator`, `vault_address`, `vault_type`, `decimals`, `source`, `created_block`, `indexed_at`
- **Added `flap_indexer_state` table types** — columns: `contract_address`, `last_scanned_block`

### 4. `lib/services/fee-sync.ts` (modified)

Added one line inside the `persistFees` `feeRows.map()` return, between `royalty_bps:` and `last_synced_at:`:

```ts
      vault_type: fee.vaultType ?? null,
```

This is the single wire that carries the Flap vault classification from adapter output to `fee_records` row. Non-Flap adapters leave `fee.vaultType` undefined → `null` in the DB (matches the nullable column default).

### 5. `app/components/PlatformBreakdown.tsx` (modified)

**Sub-edit A (cached-row override):** Added `vault_type: live.vaultType ?? fee.vault_type,` to the spread-merge that overlays live data on cached rows.

**Sub-edit B (virtual-row append):** Added `vault_type: live.vaultType ?? null,` to the synthetic row block that creates virtual `id="live:<key>"` rows for live-only tokens.

Both expressions typecheck cleanly because `LiveFeeRecord.vaultType` is now declared (Edit 2) and `FeeRecord.vault_type` is now declared (Edit 3).

### 6. `lib/platforms/flap.ts` (created, 179 LOC)

Implements `flapAdapter: PlatformAdapter`:

| Method | Behavior |
|--------|----------|
| `platform / chain / supports*` | `'flap' / 'bsc' / historicalCoversLive: true, supportsLiveFees: true, supportsIdentityResolution: false, supportsHandleBasedFees: false` |
| `resolveIdentity` | Returns `[]` (Flap has no handle resolution) |
| `getFeesByHandle` | Returns `[]` (Flap has no handle-based fees) |
| `getCreatorTokens(wallet)` | Reads `flap_tokens WHERE creator = wallet.toLowerCase()` via `createServiceClient()`, returns `CreatorToken[]`. Fail-safe on DB error → `[]` |
| `getHistoricalFees(wallet, signal?)` | Reads full `flap_tokens` row set, filters `vault_address IS NULL` (pending classification), dispatches each to `resolveHandler(row.vault_type)`, calls `handler.readClaimable(vault, user, signal)`, filters `claimable === 0n` (D-12), emits TokenFee with `vaultType: row.vault_type` (D-04), `totalEarnedUsd: null` (D-11), `totalClaimed: '0'` (v1 scope). Signal abort propagates to for-loop `break`. |
| `getLiveUnclaimedFees` | Delegates to `getHistoricalFees` + `> 0n` filter (flaunch.ts L190-194 pattern) |

Notes:
- First adapter in the codebase to read primary data from Supabase (via `createServiceClient`).
- Serial for-loop over per-row multicalls (not `Promise.all`) preserves D-15 RPC rate-limit invariant.
- `sanitizeTokenSymbol` / `sanitizeTokenName` imports pre-wired + `void`-referenced for T-12-02 future activation (adapter emits `tokenSymbol: null` in v1).

### 7. `lib/platforms/index.ts` (modified)

Registry transition:
- **Before:** `const adapters: Record<Exclude<Platform, 'flap'>, PlatformAdapter> = { ... }` + `if (platform === 'flap') return null;` special case
- **After:** `const adapters: Record<Platform, PlatformAdapter> = { ..., flap: flapAdapter };` + plain `adapters[platform] ?? null` in `getAdapter`

TypeScript now enforces: deleting `flap: flapAdapter,` from the Record fails tsc (compile-time safety net).

### 8. `lib/constants.ts` (modified)

Deleted `PRE_SHIPPED_LAUNCHPADS` set + filter. Replaced with direct count:

```ts
// All platforms in PLATFORM_CONFIG are shipped as of Phase 12 (flapAdapter landed).
export const SHIPPED_LAUNCHPAD_COUNT = Object.keys(PLATFORM_CONFIG).length;
```

**Value transition:** `SHIPPED_LAUNCHPAD_COUNT: 10 -> 11` (PLATFORM_CONFIG keys: bags, clanker, pump, zora, bankr, believe, revshare, coinbarrel, raydium, flaunch, flap).

### 9. `lib/__tests__/unit/flap-adapter.test.ts` (modified)

Drove 4 FP-06 RED stubs to GREEN:

| Test | Drives |
|------|--------|
| reads flap_tokens filtered by creator (lowercase) | `from('flap_tokens').select(...).eq('creator', lower)` |
| dispatches to resolveHandler(row.vault_type) per token | one `handler.readClaimable` call per classified row |
| filters rows where claimable === 0n (D-12) | Zero-balance filter |
| emits TokenFee with vaultType matching flap_tokens.vault_type | `vaultType: row.vault_type` field propagated |

Pattern: mocks `@/lib/supabase/service` (canned `flap_tokens` rows) + `@/lib/platforms/flap-vaults` (mock handler with canned `readClaimable` returns) + `@/lib/chains/types` (identity `asBscAddress`) + `@/lib/logger` (silent). Follows `flaunch-client.test.ts` `vi.mock('server-only')` + `vi.stubGlobal` conventions.

**RED -> GREEN count:** 4 stubs -> 4 passing tests.

## Type System Confirmation (for Plan 06 unblock)

- `fee.vault_type` is now typed on `FeeRecord` (via `Database['public']['Tables']['fee_records']['Row']`) — Plan 06's `TokenFeeTable` can access `fee.vault_type === 'unknown'` directly, no type intersection needed.
- `live.vaultType` is now typed on `LiveFeeRecord` — Plan 06's `PlatformBreakdown` merge already references this (Edit 5) and typechecks cleanly.

## Deviations from Plan

### Auto-added Critical Functionality

**1. [Rule 2 - Missing Types] Added `flap_tokens` + `flap_indexer_state` to Database type**

- **Found during:** Task 2 (adapter creation)
- **Issue:** Migration 034 (Plan 01) applied `flap_tokens` and `flap_indexer_state` tables to the production DB schema, but `lib/supabase/types.ts` was not regenerated to include them. Without these TS types, `supabase.from('flap_tokens')` in the adapter fails tsc — the generic `PostgrestQueryBuilder` overload rejects any table name not in the `Tables` union.
- **Fix:** Added both tables to `Database['public']['Tables']` alongside existing tables. Column shapes mirror migration 034 DDL exactly.
- **Files modified:** `lib/supabase/types.ts` (also included in the Task 2 commit)
- **Commit:** `3f93aed`

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASSES (exit 0) |
| `npm run lint` on Task files | 0 errors (pre-existing warnings in unrelated files) |
| `npx vitest run lib/__tests__/unit/flap-adapter.test.ts` | 4/4 PASS |
| Full `npm run test:unit` | 196 pass / 8 fail — 8 failures are pre-existing stubs from Plan 12-02 (flap-reads) and Plan 12-04 (cron-index-flap), NOT regressions |
| `grep -c "vaultType?: 'base-v1' \| 'base-v2' \| 'unknown'"` in types.ts / LiveFeesProvider.tsx | 1 / 1 (union text matches verbatim) |
| `grep -c "vaultType: f.vaultType"` in LiveFeesProvider.tsx | 1 (SSE reducer thread) |
| `grep -c "vault_type"` in supabase/types.ts | 6 (Row + Insert + Update on fee_records + flap_tokens Row/Insert/Update refs) |
| `grep -c "vault_type: fee.vaultType ?? null"` in fee-sync.ts | 1 |
| `grep -c "vault_type: live.vaultType"` in PlatformBreakdown.tsx | 2 (cached + virtual) |
| `grep -c "resolveHandler"` in flap.ts | 2 (import + call) |
| `grep -c "if (claimable === 0n) continue"` in flap.ts | 1 (D-12 filter) |
| `grep -c "vaultType: row.vault_type"` in flap.ts | 1 (D-04 routing) |
| `grep -c "Exclude<Platform, 'flap'>"` in index.ts | 0 (filter removed) |
| `grep -c "PRE_SHIPPED_LAUNCHPADS"` in constants.ts | 0 (dead code removed) |
| `grep -c "SHIPPED_LAUNCHPAD_COUNT = Object.keys(PLATFORM_CONFIG).length"` in constants.ts | 1 |

## Commits

| Task | Hash | Title |
|------|------|-------|
| 1 | `c906fa8` | feat(12-05): propagate vault_type through types, DB, SSE, and UI merge |
| 2 | `3f93aed` | feat(12-05): create flapAdapter reading flap_tokens + dispatching handlers |
| 3 | `5ee93d4` | feat(12-05): register flapAdapter + SHIPPED_LAUNCHPAD_COUNT 10 -> 11 |

## Success Criteria Status

- [x] `TokenFee.vaultType` optional field added (16 fields total)
- [x] `LiveFeeRecord.vaultType` field added with EXACT same union — grep confirmed verbatim match
- [x] SSE reducer threads `vaultType` defensively
- [x] `fee_records` Row/Insert/Update all include `vault_type: string | null`
- [x] `persistFees` row mapping includes `vault_type: fee.vaultType ?? null`
- [x] `PlatformBreakdown` cached override and virtual row propagate `vault_type`
- [x] `flapAdapter` implemented with all 8 `PlatformAdapter` members
- [x] Adapter reads `flap_tokens` via service client, dispatches handlers, filters zero, emits TokenFee with vaultType
- [x] `getAdapter('flap')` returns `flapAdapter` (no longer null)
- [x] `Record<Platform, PlatformAdapter>` exhaustiveness enforced
- [x] `SHIPPED_LAUNCHPAD_COUNT = 11`
- [x] 4 FP-06 test stubs GREEN
- [x] `npx tsc --noEmit` passes
- [x] No regressions in full test suite

## Self-Check: PASSED

All created files exist on disk:
- FOUND: `lib/platforms/flap.ts`
- FOUND: `.planning/phases/12-flap-adapter-bsc/12-05-SUMMARY.md`

All modified files exist on disk:
- FOUND: `lib/platforms/types.ts`, `app/components/LiveFeesProvider.tsx`, `lib/supabase/types.ts`, `lib/services/fee-sync.ts`, `app/components/PlatformBreakdown.tsx`, `lib/platforms/index.ts`, `lib/constants.ts`, `lib/__tests__/unit/flap-adapter.test.ts`

All task commits present in `git log`:
- FOUND: `c906fa8` (Task 1)
- FOUND: `3f93aed` (Task 2)
- FOUND: `5ee93d4` (Task 3)
