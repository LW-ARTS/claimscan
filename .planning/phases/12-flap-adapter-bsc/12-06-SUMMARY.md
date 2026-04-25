---
phase: 12-flap-adapter-bsc
plan: 06
subsystem: ui
tags: [react, tailwind, lucide-react, docs, env-config, ui-badge, flap]

requires:
  - phase: 12-flap-adapter-bsc
    provides: vault_type column on fee_records (Plan 12-05 typed Database row), flapAdapter registered in lib/platforms/index (Plan 12-05)
  - phase: 11-flaunch-adapter-base
    provides: existing fee.platform === 'flap' branch in TokenFeeTable.tsx (mobile L197-207, desktop L330-340) — Phase 12 extends, does not rewrite
provides:
  - D-04 user-visible badge "Claim method unknown" in TokenFeeTable when fee.vault_type === 'unknown' (mobile + desktop)
  - CLAUDE.md doc bump 10 -> 11 launchpads, Flap (BSC display-only) entry, /api/cron/index-flap in api/cron list, Cuidados note for Phase 12 indexer convention
  - .env.example commented BITQUERY_API_KEY line documenting D-06 local-only constraint
affects: [12-07-backfill-flap, future-flap-vault-handlers]

tech-stack:
  added: [lucide-react AlertTriangle (existing dep, new import in TokenFeeTable)]
  patterns:
    - "TokenFeeTable extension pattern: wrap existing flap branch in fragment, insert conditional badge before external link, preserve anchor verbatim"
    - "Doc-first env-var convention: commented BITQUERY_API_KEY=  + inline rationale comment to make local-only constraint visible at clone time"

key-files:
  created: []
  modified:
    - app/components/TokenFeeTable.tsx
    - CLAUDE.md
    - .env.example

key-decisions:
  - "Badge color: bg-amber-500/10 + text-amber-400 (warning amber on dark mode, mirroring existing emerald-500/10 cashback badge opacity convention at L153)"
  - "Badge shape: inline-flex items-center gap-1 rounded-full (mirrors existing cashback badge from L153 verbatim, only color differs)"
  - "Badge title attr: 'Vault ABI not recognized by ClaimScan. Go to flap.sh to claim' (technical hover tooltip; period instead of em-dash per global user preference)"
  - "BITQUERY_API_KEY appended at end of .env.example with section header (Phase 12 backfill section) instead of inline near similar env vars — keeps temporal context clear (one-shot, descartável após primeiro run)"
  - "CLAUDE.md Cuidados entry placed AFTER Flaunch per-coin entry (chronological convention: Phase 11 then Phase 12)"

patterns-established:
  - "TokenFeeTable display-only badge pattern: conditional render INSIDE existing platform branch, wrap-in-fragment + insert-before-link, no other changes"
  - "Phase doc bump pattern: dual location update (top intro + GSD:project-start embedded block) + cron list + Cuidados convention bullet — single grep produces all touch points"

requirements-completed: [FP-06, FP-08]

duration: 18min
completed: 2026-04-24
---

# Phase 12 Plan 06: User-visible Badge + Doc Bump Summary

**D-04 amber "Claim method unknown" badge wired into both mobile and desktop Flap branches of TokenFeeTable, plus CLAUDE.md bumped to 11 launchpads and .env.example documented BITQUERY_API_KEY local-only convention.**

## Performance

- **Duration:** ~18 min (RETRY after prior quota-killed attempt)
- **Started:** 2026-04-24T23:14:00Z
- **Completed:** 2026-04-24T23:32:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- D-04 user-visible badge: when `fee.platform === 'flap' && fee.vault_type === 'unknown'`, TokenFeeTable now renders an amber `Claim method unknown` chip with `AlertTriangle` icon (12px) immediately before the existing `View on flap.sh →` external link. Mobile (L197-220) + desktop (L341-365) symmetric.
- CLAUDE.md updated: `10 launchpads` zeroed out (count 0), `11 launchpads` count=2 (top intro + embedded PROJECT block), `Flap (BSC display-only)` added to comma-separated launchpad list, new `cron/index-flap/` line in Estrutura under api/cron block, new Cuidados bullet documenting Phase 12 indexer pattern + D-04 + D-06/D-08/D-16 cross-references.
- .env.example: appended new section `Phase 12 (Flap adapter) - one-shot backfill` with single commented line `# BITQUERY_API_KEY=  # one-shot backfill only (scripts/backfill-flap.ts), not needed in prod` — reinforces D-06 lock.

## Task Commits

Each task committed atomically on `worktree-agent-a8409ea9`:

1. **Task 1: TokenFeeTable badge** - `d4f22b8` (feat)
2. **Task 2: CLAUDE.md doc bump** - `7eff1e0` (docs)
3. **Task 3: .env.example BITQUERY_API_KEY** - `5646088` (chore)

## Files Created/Modified

- `app/components/TokenFeeTable.tsx` — added `AlertTriangle` import (L5), wrapped mobile flap branch in fragment + amber `Claim method unknown` badge before existing link (L198-220), same for desktop branch (L343-365). Existing flap link preserved verbatim. Flaunch branch and cashback badge precedent untouched.
- `CLAUDE.md` — 4 surgical edits: (1) top intro launchpad count + Flap entry (L4), (2) cron/index-flap added (L50), (3) Phase 12 Cuidados convention bullet appended after Flaunch entry (L201), (4) embedded PROJECT block launchpad count + Flap entry (L211).
- `.env.example` — appended Phase 12 section + commented BITQUERY_API_KEY line (5 new lines at end).

## Decisions Made

- **Badge palette:** amber (`bg-amber-500/10` + `text-amber-400`) chosen over yellow because amber maps to Tailwind's semantic warning convention and reads cleanly on dark mode with the same opacity as existing `bg-emerald-500/10` cashback badge. Plan blueprint suggested both options; the amber pick matches pre-existing dark-theme badges (cashback emerald, flap-locked muted).
- **Badge structure:** mirrors existing cashback badge (`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider`) verbatim except for color, ensuring visual rhythm is consistent. AlertTriangle icon at `h-3 w-3` (12px) matches the visual weight of cashback's text-only badge.
- **Tooltip text:** "Vault ABI not recognized by ClaimScan. Go to flap.sh to claim" — period not em-dash per user global preference. Provides technical context to power users without bloating the badge label.
- **CLAUDE.md cuidados placement:** After Flaunch per-coin bullet, before mobile micro-interactions bullet, preserving chronological/topical grouping.
- **.env.example placement:** End-of-file section with header banner instead of inline-near-similar-vars, because the variable is one-shot (descartável após backfill) and the section header makes the temporal context unambiguous to future maintainers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree-routing recovery via cherry-pick**

- **Found during:** Task 1 (TokenFeeTable badge)
- **Issue:** Initial git operations targeted parent repo `/Users/lowellmuniz/Projects/claimscan` via absolute paths, accidentally committing the badge change to `main` instead of the executor worktree branch `worktree-agent-a8409ea9`.
- **Fix:** Cherry-picked the stray commit (originally `c39c4fa`) onto the worktree branch (where it became `d4f22b8`), then `git reset --hard a90b4ce` on parent main to restore the pre-task state. Worktree branch ended at `a90b4ce..HEAD` containing exactly the 3 task commits. Verified worktree TokenFeeTable.tsx grep counts post-recovery (`fee.vault_type === 'unknown'` = 2 ✓).
- **Files modified:** none beyond plan scope — fix was purely a git-routing recovery
- **Verification:** `git -C ...worktree log --oneline a90b4ce..HEAD` shows 3 expected commits; parent main back at `a90b4ce`; both repos clean.
- **Committed in:** N/A (recovery operation, not a content change)

**2. [Documentation Precision] Plan acceptance criteria slightly diverge from observed grep counts (informational, NOT a fix)**

- **Found during:** Task 1 verification grep
- **Issue:** Plan stated `grep -c "Claim method unknown"` should equal 2, but actual count is 4 (one `aria-label` + one inner-text per branch × 2 branches). Plan stated `grep -c "fee.platform === 'flap'"` should equal 2, but actual is 3 (2 render branches + 1 pre-existing claim-button hide condition at L401). Plan stated `grep -c "LW-52"` ≥ 2 in CLAUDE.md, but actual is 1 because the existing reference is `lw-52.sentry.io` lowercase with `.sentry.io` suffix, not the literal token `LW-52`.
- **Fix:** No code change required — the functional behavior matches the plan's `<behavior>` spec exactly: badge renders only when `fee.platform === 'flap' && fee.vault_type === 'unknown'`, mobile + desktop, with the exact JSX shape the plan specified. The grep-count discrepancies are an artifact of acceptance-criteria precision, not a bug in the implementation.
- **Files modified:** none
- **Verification:** Verbatim diff of TokenFeeTable.tsx confirms exactly the JSX wrap-in-fragment + badge-insertion shape from the plan's action block; CLAUDE.md grep checks for `Flap indexer (Phase 12)`, `cron/index-flap`, `BITQUERY_API_KEY`, `flap_tokens`, `flap_indexer_state`, `Flap (BSC display-only)` all return ≥ 1 as expected.
- **Committed in:** N/A (no fix needed)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking git routing) + 1 informational (documentation precision)
**Impact on plan:** No scope creep. Recovery was operational. Functional behavior matches plan spec.

## Deferred Issues

- **Pre-existing eslint warning** in `app/components/TokenFeeTable.tsx` L55: `'externalClaimUrl' is defined but never used`. NOT introduced by Plan 12-06 (already existed pre-Plan 12-06). Out of scope per deviation Rule SCOPE BOUNDARY. Recommend cleanup in a future maintenance pass or when claim flow goes from display-only to in-app (Reown AppKit migration). Logged here, not auto-fixed.
- **Untracked file in PARENT repo** (NOT worktree): `scripts/backfill-flap.ts` exists in `/Users/lowellmuniz/Projects/claimscan` from a prior killed run with a `tsc --noEmit` error at L109. NOT in this worktree. NOT in plan 12-06 scope (it's plan 12-07 territory). Untouched by this execution. Cleanup or finalization is plan 12-07's responsibility.

## Issues Encountered

- Initial git operations were routed to the parent repo via absolute paths instead of the executor worktree. Recovered via cherry-pick + parent reset. Documented above as Rule 3 deviation. No work lost.

## User Setup Required

None — Plan 12-06 modifies only UI display + project docs + env-template comment. No external services, no env vars in production, no DB migrations.

## Next Phase Readiness

- Plan 12-07 (Bitquery one-shot backfill script) is unblocked: `.env.example` now documents the BITQUERY_API_KEY local-only convention; CLAUDE.md Cuidados entry calls out the local-only requirement.
- D-04 is shippable end-to-end: Plan 01 (migration 034 vault_type column) → Plan 05 (vault_type pipeline through adapter + Database type extension) → Plan 06 (this plan, UI render). When a Flap token with `vault_type='unknown'` lands in `fee_records`, the badge will render automatically.
- No blockers introduced. Wave 3 parallel runs can integrate cleanly.

## Self-Check: PASSED

**Files verified to exist:**
- `app/components/TokenFeeTable.tsx` (modified, badge JSX present)
- `CLAUDE.md` (modified, 11 launchpads + cron + Cuidados bullet)
- `.env.example` (modified, BITQUERY_API_KEY commented)
- `.planning/phases/12-flap-adapter-bsc/12-06-SUMMARY.md` (this file)

**Commits verified to exist on worktree-agent-a8409ea9:**
- `d4f22b8` (Task 1) ✓
- `7eff1e0` (Task 2) ✓
- `5646088` (Task 3) ✓

**Verification commands run:**
- `npx tsc --noEmit` — exits clean (0 errors) ✓
- `npx eslint app/components/TokenFeeTable.tsx` — 0 errors, 1 pre-existing unrelated warning ✓
- All grep checks for vault_type, AlertTriangle, badge classes, doc references — pass ✓

---
*Phase: 12-flap-adapter-bsc*
*Completed: 2026-04-24*
