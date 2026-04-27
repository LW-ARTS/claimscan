---
phase: 13
plan: 08
subsystem: scripts
tags: [scripts, backfill, classify-flap, fund-recipient, bsc]
status: complete
dependency_graph:
  requires:
    - scripts/backfill-flap.ts (pattern to mirror)
    - lib/platforms/flap-vaults/fund-recipient.ts (detectFundRecipient — Wave 2)
    - supabase/migrations/036_add_fund_recipient.sql (recipient_address + tax_processor_address columns — Plan 13-02)
  provides:
    - One-shot backfill script for historical fund-recipient detection
    - Extended classify-flap.ts with --token flag + fund-recipient probe
  affects:
    - scripts/backfill-flap-fund-recipient.ts (new)
    - scripts/classify-flap.ts (extended)
tech-stack:
  added: []
  patterns:
    - "Missing-env guard at script entry point (exits cleanly with readable error list)"
    - "RECLASSIFY_TOKEN escape hatch for single-token re-probe"
    - "Dry-run smoke test: scripts exit with env-guard error before any DB writes"
key-files:
  created:
    - scripts/backfill-flap-fund-recipient.ts
  modified:
    - scripts/classify-flap.ts
decisions:
  - "Backfill script uses Bitquery API (BITQUERY_API_KEY, LOCAL-ONLY, not Vercel prod) to enumerate tokens — same pattern as backfill-flap.ts"
  - "classify-flap.ts widened row selection to include vault_type='unknown' AND NULL for re-probe; fund-recipient rows are re-checked via detectFundRecipient in no-vault branch"
  - "RECLASSIFY_TOKEN env var allows single-token targeted re-probe (escape hatch for recipient mutability via TaxProcessor.setReceivers)"
metrics:
  completed_date: "2026-04-27"
  tasks_completed: 3
  tasks_total: 3
requirements: []
---

# Phase 13 Plan 08: Scripts — Backfill + Classify-Flap Extension

**Status: COMPLETE**

Offline classification tooling for fund-recipient tokens. Backfill script enumerates historical tokens via Bitquery; classify-flap extended to detect fund-recipient in the no-vault branch and supports single-token re-probe via `RECLASSIFY_TOKEN`.

## What Was Done

**Task 1 — `scripts/backfill-flap-fund-recipient.ts`** (commit `0e75f91`)
- One-shot Bitquery enumeration of historical Flap tokens missing fund-recipient classification
- Guards entry with readable env-var checklist (BITQUERY_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
- Mirrors backfill-flap.ts shape exactly — same Bitquery query pattern, same upsert flow

**Task 2 — `scripts/classify-flap.ts` extended** (commit `747f9e8`)
- Added `fundRecipientCount` counter to summary output
- Widened row selection to include `vault_type='unknown'` AND NULL rows for re-probe
- Added `detectFundRecipient` probe in the no-vault branch — resolves `unknown` rows to `fund-recipient` when applicable
- Added `RECLASSIFY_TOKEN` escape hatch for targeted single-token re-probe (recipient is mutable via TaxProcessor.setReceivers)
- Added inline ABIs for taxProcessor + marketAddress calls (no import from lib — script is standalone)
- Added structured `classify_complete` JSON log at end of run

**Task 3 — Smoke verify** (inline, no commit needed)
- `npx tsc --noEmit` — zero errors
- `env -u BITQUERY_API_KEY npx tsx scripts/backfill-flap-fund-recipient.ts` → exits with "Missing env vars" (no DB writes)
- `RECLASSIFY_TOKEN=invalid npx tsx scripts/classify-flap.ts` → exits with "MISSING env var: BSC_RPC_URL" (no DB writes)
- Both scripts parse cleanly and guard all side effects behind env checks

## Deviations from Plan

None.

## Self-Check: PASSED

- `scripts/backfill-flap-fund-recipient.ts` — FOUND
- `scripts/classify-flap.ts` — FOUND, extended with fund-recipient probe
- `npx tsc --noEmit` — zero errors
- Both scripts exit cleanly with env-guard errors (no DB writes on smoke test)
