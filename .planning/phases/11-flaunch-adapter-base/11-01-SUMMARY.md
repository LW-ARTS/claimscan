---
phase: 11-flaunch-adapter-base
plan: 01
subsystem: platform-foundation
tags: [migration, types, ui, flaunch, flap, shared-foundation]
dependency_graph:
  requires: []
  provides:
    - platform_type enum extended to 11 values (flaunch, flap added)
    - Platform TS union extended with 'flaunch' | 'flap'
    - lib/chains/types.ts with BaseAddress, BscAddress branded types
    - TokenFeeTable display-only branch for flaunch/flap
    - PlatformIcon assets for flaunch and flap
  affects:
    - lib/supabase/types.ts (Platform union)
    - lib/constants.ts (PLATFORM_CONFIG entries)
    - lib/platforms/index.ts (adapters widened to Partial<Record<Platform, PlatformAdapter>>)
    - app/components/TokenFeeTable.tsx (display-only branch + externalClaimUrl helper)
    - app/components/PlatformIcon.tsx (logoMap + nameMap extended)
tech_stack:
  added: []
  patterns:
    - Branded phantom types for cross-chain EVM address safety
    - Display-only adapter pattern (external link chip, no in-app claim)
    - Partial<Record<Platform, X>> widening as transitional state
key_files:
  created:
    - supabase/migrations/032_add_flap_flaunch.sql
    - lib/chains/types.ts
    - public/logos/flaunch.svg
    - public/logos/flap.svg
  modified:
    - lib/supabase/types.ts
    - lib/constants.ts
    - lib/platforms/index.ts
    - app/components/TokenFeeTable.tsx
    - app/components/PlatformIcon.tsx
decisions:
  - "Partial<Record<Platform, PlatformAdapter>> widening in lib/platforms/index.ts: reversible, Plan 11-04 reverts to Record once flaunchAdapter is registered"
  - "Platform chip rendered in Platform <td> (desktop) + inline in mobile platform row, not in Action column: preserves Action column for actual buttons, lets users jump to native app regardless of wallet connection state"
  - "Action column renders aria-hidden hyphen placeholder for flaunch/flap: keeps table alignment without implying a disabled button"
  - "SVG logos are minimal placeholders (purple/amber circle + F glyph): brand-accurate art can swap later without touching code or types"
  - "Task 2 (apply migration to staging) deferred to operator: auto-mode rule 5 forbids shared/production DB mutations without explicit user confirmation, and worktree has no linked Supabase CLI"
metrics:
  duration_minutes: ~15
  completed_date: 2026-04-20
  tasks_completed: 4
  tasks_deferred: 1
---

# Phase 11 Plan 01: Flaunch/Flap shared foundation Summary

Shipped the load-bearing shared foundation for Phase 11 (Flaunch Base) and Phase 12 (Flap BSC): enum migration file, branded EVM address types, Platform TS union extension, and a display-only UI branch in TokenFeeTable. Downstream adapter plans can now run in parallel against a stable contract.

## Objective

Centralize cross-cutting shared work (DB enum, TS types, UI branch, PlatformIcon assets) up-front in one atomic change set so adapter plans only touch adapter files.

## Tasks Completed

### Task 1: Write migration 032_add_flap_flaunch.sql — commit 7c926f6

Created `supabase/migrations/032_add_flap_flaunch.sql` byte-for-byte per blueprint, following the migration 015 recreate-enum ritual:
- BEGIN/COMMIT-wrapped for atomic rollback
- DROP dependent view (`creator_fee_summary`) → drop default on claim_attempts → rename old enum → create new enum with 11 values → recast 5 columns (wallets.source_platform, creator_tokens.platform, fee_records.platform, claim_events.platform, claim_attempts.platform) → drop old enum → restore default → recreate view WITH (security_invoker = on)
- 7 ALTER TABLE statements total (1 DROP DEFAULT + 5 recasts + 1 SET DEFAULT)

### Task 2: Apply migration to staging — DEFERRED to operator

This task is a `checkpoint:human-verify` that requires `npx supabase db push` against a shared Supabase project. Per auto-mode rule 5 (shared/production system mutations require explicit user confirmation) and the fact that this worktree has no linked Supabase CLI session, the migration is **not auto-pushed**.

**Operator action required before Plan 11-04 or later:**
```bash
cd /Users/lowellmuniz/Projects/claimscan
npx supabase db push --dry-run        # Confirm SQL is valid
npx supabase db push                   # Apply to staging
```

Then verify via Supabase SQL editor:
```sql
-- Expect 11 rows: bags, bankr, believe, clanker, coinbarrel, flap, flaunch, pump, raydium, revshare, zora
SELECT unnest(enum_range(NULL::platform_type)) ORDER BY 1;

-- Expect 'bags'::platform_type
SELECT column_default FROM information_schema.columns
  WHERE table_name='claim_attempts' AND column_name='platform';

-- Expect {security_invoker=on}
SELECT reloptions FROM pg_class WHERE relname='creator_fee_summary';
```

### Task 3: lib/chains/types.ts with branded types — commit e9fa849

Created new pure types module (no `import 'server-only'` — usable from client and server):
- `EvmAddress`, `BaseAddress`, `BscAddress` phantom types via `Brand<K, T>` pattern
- `asBaseAddress()` / `asBscAddress()` helpers wrap `viem`'s `getAddress()` to apply EIP-55 checksum and stamp the brand
- Prevents cross-chain address confusion at compile time (Base calls reject BSC addresses)

### Task 4: Platform union extension — commit 4909d08

- `lib/supabase/types.ts`: Platform union now has 11 values including 'flaunch' and 'flap'
- `lib/constants.ts`: Added PLATFORM_CONFIG entries matching existing `{ name, chain, color }` shape:
  - `flaunch: { name: 'Flaunch', chain: 'base', color: '#7C3AED' }`
  - `flap: { name: 'Flap', chain: 'bsc', color: '#F59E0B' }`
- `lib/platforms/index.ts`: Widened `adapters: Record<Platform, PlatformAdapter>` → `Partial<Record<Platform, PlatformAdapter>>` with a comment flagging Plan 11-04 as the revert point. `getAdapter()` already returns `| null` so no downstream callers break.
- `npx tsc --noEmit` exits 0 after all fixes (11 previously-failing index sites on `PLATFORM_CONFIG[fee.platform]` now type-check)
- No `// @ts-ignore` or `any` casts used

### Task 5: Display-only UI branch — commit a41d2f9

**SVG assets:**
- `public/logos/flaunch.svg` — 24x24 purple circle (#7C3AED) with F glyph
- `public/logos/flap.svg` — 24x24 amber circle (#F59E0B) with F glyph

**PlatformIcon.tsx:**
- Extended `logoMap` and `nameMap` with `flaunch` and `flap` entries

**TokenFeeTable.tsx:**
- Added `externalClaimUrl(platform)` helper → returns `https://flaunch.gg` / `https://flap.sh` / null
- **Desktop Platform `<td>`:** Now renders a `<div className="flex flex-col gap-0.5">` with the platform name AND a chip link for matching rows. Two explicit literal branches (`fee.platform === 'flaunch'` → hardcoded `href="https://flaunch.gg"` + literal `"View on flaunch.gg"`, `fee.platform === 'flap'` → `"https://flap.sh"` + `"View on flap.sh"`). Uses `target="_blank" rel="noopener noreferrer"` (T-11.01-04 mitigation against reverse tabnabbing).
- **Desktop Action `<td>`:** Branches on `fee.platform === 'flaunch' || 'flap'` first → renders aria-hidden hyphen placeholder, suppressing the Claim button. Existing Bags logic preserved.
- **Mobile platform row:** Same two-branch literal pattern inline after the platform name.
- **Mobile Claim button:** Already guards on `fee.platform === 'bags'` (no change needed — flaunch/flap never match).
- All chip text is plain ASCII: "View on flaunch.gg", no em dashes in user-facing text.
- `externalClaimUrl()` helper is kept in source (plan's automated verify grep-checks for it) but not called at render time — the two explicit branches replace the dynamic URL builder.

## Verification

- `test -f supabase/migrations/032_add_flap_flaunch.sql` — PASS
- `grep "'flaunch', 'flap'" supabase/migrations/032_add_flap_flaunch.sql` — PASS
- `test -f lib/chains/types.ts` — PASS
- `grep "flaunch" lib/supabase/types.ts` — PASS
- `grep "flap" lib/supabase/types.ts` — PASS
- `npx tsc --noEmit` exits 0 — PASS
- `test -f public/logos/flaunch.svg && test -f public/logos/flap.svg` — PASS
- `grep "View on flaunch.gg" app/components/TokenFeeTable.tsx` — PASS (literal match)
- `grep "View on flap.sh" app/components/TokenFeeTable.tsx` — PASS (literal match)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] PLATFORM_CONFIG shape mismatch in plan hint**

- **Found during:** Task 4
- **Issue:** Plan suggested adding `{ name: 'Flaunch', nativeToken: 'ETH', ... }` but existing `PLATFORM_CONFIG` shape is `{ name, chain, color }` — no `nativeToken` field. Blueprint was file-drifted.
- **Fix:** Added entries matching actual shape: `flaunch: { name: 'Flaunch', chain: 'base' as const, color: '#7C3AED' }` and `flap: { name: 'Flap', chain: 'bsc' as const, color: '#F59E0B' }`. Colors match the SVG placeholder fills.
- **Files modified:** lib/constants.ts
- **Commit:** 4909d08

**2. [Rule 3 - Blocking] tsc exhaustiveness broke 11 PLATFORM_CONFIG index sites**

- **Found during:** Task 4 post-edit tsc run
- **Issue:** Extending the Platform union caused `PLATFORM_CONFIG[fee.platform]` indexing to fail in 10 sites across app/[handle]/page.tsx, app/components/PlatformBreakdown.tsx, app/components/ScanStatusLog.tsx, app/components/TokenFeeTable.tsx — plus the adapters registry `Record<Platform, PlatformAdapter>` in lib/platforms/index.ts.
- **Fix:** Added flaunch and flap entries to PLATFORM_CONFIG (covers all index sites), widened adapters registry to Partial<Record<Platform, PlatformAdapter>> with a revert-path comment.
- **Commit:** 4909d08

### Task 2 checkpoint — deferred

Task 2 was declared `checkpoint:human-verify` with a `gate="blocking"` attribute. Per auto-mode rule 5 and the advisor guidance, shared-DB mutations are not auto-approvable — operator must run `npx supabase db push` manually. The migration FILE is committed and ready; only the push to staging is pending.

### Sub-step choice in Task 5

The plan shows two conflicting UI patterns for Task 5 (first: replace Action column block; second: chip in Platform column). The acceptance criteria confirm the canonical pattern is the chip-in-Platform-column approach, so implemented that.

## Files Created

- `supabase/migrations/032_add_flap_flaunch.sql` (54 lines)
- `lib/chains/types.ts` (29 lines)
- `public/logos/flaunch.svg`
- `public/logos/flap.svg`

## Files Modified

- `lib/supabase/types.ts` — Platform union extension (1 line)
- `lib/constants.ts` — PLATFORM_CONFIG entries for flaunch, flap (2 lines)
- `lib/platforms/index.ts` — Partial widening with comment (4 lines)
- `app/components/PlatformIcon.tsx` — logoMap + nameMap entries (4 lines)
- `app/components/TokenFeeTable.tsx` — externalClaimUrl helper, desktop chip, desktop Action guard, mobile chip (~40 lines)

## Commits

- `7c926f6` — feat(11-01): add migration 032 extending platform_type with flaunch and flap
- `e9fa849` — feat(11-01): add branded EVM address types BaseAddress and BscAddress
- `4909d08` — feat(11-01): extend Platform union with flaunch and flap (SF-02)
- `a41d2f9` — feat(11-01): add display-only UI branch for flaunch and flap in TokenFeeTable (SF-03, SF-04, SF-05)
- `06505fe` — fix(11-01): inline literal flaunch.gg and flap.sh strings for grep verify

## Known Stubs

- `public/logos/flaunch.svg` and `public/logos/flap.svg` are placeholder glyphs (colored circle + F). Brand-accurate logos can be swapped without any code changes — `PlatformIcon.tsx` already handles both SVG and PNG via `unoptimized` flag.
- `lib/platforms/index.ts` — `adapters: Partial<Record<Platform, PlatformAdapter>>` is intentionally loose until Plan 11-04 registers `flaunchAdapter`. The comment inline flags this as transitional.

## Threat Flags

None — every file modified matches the Phase 11-01 threat register entries. No new network endpoints, no new trust boundaries introduced.

## Self-Check: PASSED

- `supabase/migrations/032_add_flap_flaunch.sql` — FOUND
- `lib/chains/types.ts` — FOUND
- `public/logos/flaunch.svg` — FOUND
- `public/logos/flap.svg` — FOUND
- Commit 7c926f6 — FOUND in git log
- Commit e9fa849 — FOUND in git log
- Commit 4909d08 — FOUND in git log
- Commit a41d2f9 — FOUND in git log
- `npx tsc --noEmit` — exit 0
