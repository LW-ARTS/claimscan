---
phase: 13
plan: 02
subsystem: supabase-migrations
tags: [migration, schema, fund-recipient, blocking-checkpoint]
status: partial-checkpoint-pending
dependency_graph:
  requires:
    - supabase/migrations/035_add_splitvault_to_check.sql (predecessor CHECK ritual pattern)
    - supabase/migrations/034_add_flap_tokens.sql (original flap_tokens schema with vault_type column)
  provides:
    - "STAGING schema readiness for vault_type='fund-recipient' rows"
    - "recipient_address + tax_processor_address columns on flap_tokens"
    - "Partial index idx_flap_tokens_recipient for adapter WHERE-clause D-03"
  affects:
    - flap_tokens (CHECK constraint + 2 new columns + 1 index)
    - fee_records (CHECK constraint only)
tech-stack:
  added: []
  patterns:
    - "DROP/ADD CONSTRAINT idiom for Postgres CHECK extension (mirrors 035)"
    - "Twin-table CHECK update for vault_type (flap_tokens NOT NULL + fee_records nullable)"
    - "Partial index with WHERE predicate to keep index small on 236K-row table"
key-files:
  created:
    - supabase/migrations/036_add_fund_recipient.sql
    - supabase/migrations/036_add_fund_recipient_rollback.sql
  modified: []
decisions:
  - "Included tax_processor_address column per RESEARCH §Migration 036 SQL refined (open question #1) — saves one RPC read per cron tick + adapter call vs re-resolving token.taxProcessor() each time"
  - "Used partial index (WHERE recipient_address IS NOT NULL) — keeps index small relative to 236K row table since only fund-recipient rows populate the column"
  - "Mirrored 035 rollback shape exactly: comments-out column drops with WARNING + CSV backup instructions to prevent casual data loss"
metrics:
  duration: "3m 36s (Tasks 1-2 only; Task 3 STAGING apply pending human action)"
  completed_date: "2026-04-27"
  tasks_completed: 2
  tasks_total: 3
  tasks_pending_checkpoint: 1
requirements: [FR-03]
---

# Phase 13 Plan 02: Migration 036 (Fund Recipient Vault Schema) Summary

**Status: PARTIAL — Tasks 1+2 complete, Task 3 = blocking human-action checkpoint pending.**

Schema-first migration adding `'fund-recipient'` to the `vault_type` CHECK predicate on `flap_tokens` and `fee_records`, plus two cache columns (`recipient_address`, `tax_processor_address`) and a partial index on `flap_tokens(recipient_address)`. SQL files committed in this worktree; STAGING `supabase db push` requires human operator (Task 3).

## What Was Done

**Task 1 — `supabase/migrations/036_add_fund_recipient.sql`** (commit `d14fe29`)
- Extended `flap_tokens.vault_type` CHECK to include `'fund-recipient'` (5-value predicate).
- Extended `fee_records.vault_type` CHECK with the same value, preserving the `IS NULL` clause for non-Flap rows.
- Added `recipient_address TEXT NULL` column.
- Added `tax_processor_address TEXT NULL` column (cache for TaxProcessor clone address per RESEARCH §"Migration 036 SQL refined" recommendation).
- Created partial index `idx_flap_tokens_recipient ON flap_tokens(recipient_address) WHERE recipient_address IS NOT NULL`.
- Included sanity-verify comments (5 SQL queries) plus the D-10 hard verification gate fixture SELECT (`0x5f28b56a...`).

**Task 2 — `supabase/migrations/036_add_fund_recipient_rollback.sql`** (commit `ddb8066`)
- Restores pre-036 CHECK predicates on both tables (`'base-v1', 'base-v2', 'split-vault', 'unknown'`).
- Drops partial index (safe; can be recreated by re-applying 036).
- Pre-clean UPDATE statements documented in WARNING comment (must run if `'fund-recipient'` rows exist before rollback).
- Destructive `DROP COLUMN` statements left commented out with WARNING + CSV backup recipe (`COPY (SELECT ...) TO '/tmp/flap_recipients_backup.csv'`) to prevent casual data loss.

## What Is Pending (Task 3 Checkpoint)

**Task 3 — Apply migration 036 to STAGING Supabase + canary verify** (`type=checkpoint:human-action gate=blocking`).

Operator action required:
1. Confirm `SUPABASE_ACCESS_TOKEN` is set in shell.
2. Confirm STAGING is the linked project (`supabase projects list` + `supabase status`).
3. Run `supabase db push` from repo root.
4. Run 5 sanity-verify queries on STAGING (CHECK predicate inspection, 0-violator count, column metadata, index presence, canary INSERT/DELETE round-trip).

Resume signal: operator types `applied` after all 5 sanity queries pass on STAGING.

The continuation agent does NOT need to re-read this SUMMARY — Task 3 has no follow-up code in plan 13-02. It only unblocks downstream Waves 1-4 to land code against the STAGING schema. The orchestrator will spawn Plan 13-03+ executors after the human applies the migration.

## Deviations from Plan

None — plan executed exactly as written. Both migration files match the byte-level content specified in the plan's `<action>` blocks (verified by Task 1+2 grep predicates).

## Auth Gates

None encountered (this plan is local SQL file authoring; the STAGING push is a planned blocking checkpoint, not an auth gate).

## Known Stubs

None. Both SQL files are complete, runnable migrations.

## Threat Flags

None. Threat model in PLAN already covers:
- T-13-03 (mitigated): fee_records CHECK preserves `IS NULL` clause for non-Flap rows.
- T-13-04 (accepted): metadata-only ALTER, no row-level lock contention.
- T-13-05 (accepted): `recipient_address` is publicly observable on-chain; no new disclosure surface.

## Self-Check: PASSED

**Files exist:**
- `supabase/migrations/036_add_fund_recipient.sql` — FOUND
- `supabase/migrations/036_add_fund_recipient_rollback.sql` — FOUND
- `.planning/phases/13-flap-fund-recipient-vault-support-track-auto-forwarded-fees-/13-02-SUMMARY.md` — FOUND (this file)

**Commits exist:**
- `d14fe29` (Task 1) — verified via `git log`
- `ddb8066` (Task 2) — verified via `git log`
- SUMMARY commit — to be made next with `git add -f` (force-add only this file; `.planning/` is gitignored).
