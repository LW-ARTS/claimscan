-- Migration: Audit fixes
-- Date: 2026-03-17
-- Fixes: claim_attempts race condition, cleanup query perf, fee_records constraint

-- Prevent duplicate active claim attempts for the same wallet+token (atomic locking)
CREATE UNIQUE INDEX IF NOT EXISTS idx_claim_attempts_active_lock
  ON claim_attempts (wallet_address, token_address)
  WHERE status IN ('pending', 'signing', 'submitted');

-- Improve cleanup query performance for stale claim attempts
CREATE INDEX IF NOT EXISTS idx_claim_attempts_status_created
  ON claim_attempts (status, created_at)
  WHERE status IN ('pending', 'signing', 'submitted');

-- Prevent negative USD values in fee records
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_fee_earned_usd_non_negative'
  ) THEN
    ALTER TABLE fee_records ADD CONSTRAINT chk_fee_earned_usd_non_negative
      CHECK (total_earned_usd >= 0);
  END IF;
END $$;

-- Speed up search_log creator_id backfill queries
CREATE INDEX IF NOT EXISTS idx_search_log_backfill
  ON search_log (query, provider, searched_at)
  WHERE creator_id IS NULL;

-- Speed up cleanup cron stale submitted claim queries (filters on updated_at, not created_at)
CREATE INDEX IF NOT EXISTS idx_claim_attempts_status_updated
  ON claim_attempts (status, updated_at)
  WHERE status IN ('pending', 'signing', 'submitted');
