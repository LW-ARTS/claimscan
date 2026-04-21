-- Migration: Cleanup synthetic Flaunch fee_records before per-coin adapter
-- Date: 2026-04-21
-- Phase 11 shipped with a single synthetic row per wallet
-- (token_address='BASE:flaunch-revenue') aggregating all Takeover.fun coins.
-- The next adapter release emits one row per coin keyed by the real 0x token
-- address, so the synthetic key becomes orphaned and never re-upserted.
-- PRUNE_EXEMPT_PLATFORMS includes 'flaunch' (lib/services/fee-sync.ts) so the
-- cron will not auto-delete these stale rows. This one-shot DELETE removes
-- them deterministically before the per-coin adapter PR lands.
--
-- Safe to run before adapter deploy: until the new adapter ships, the cron
-- re-inserts a single synthetic row on the next sync (~15 min). After the
-- adapter ships, the new per-coin rows take over and the synthetic row
-- never returns.

BEGIN;

DELETE FROM fee_records
WHERE platform = 'flaunch'
  AND chain = 'base'
  AND token_address = 'BASE:flaunch-revenue';

COMMIT;
