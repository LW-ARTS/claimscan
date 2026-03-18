-- Migration: Audit round 2
-- Date: 2026-03-17
-- Fixes: claim_events CHECK, claim_fees FK, duplicate index cleanup,
--        idempotent wrappers for 009 constraints

-- ============================================================
-- 1) CHECK constraint on claim_events.amount (digits only)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_claim_events_amount'
  ) THEN
    ALTER TABLE claim_events ADD CONSTRAINT chk_claim_events_amount
      CHECK (amount ~ '^\d+$');
  END IF;
END $$;

-- ============================================================
-- 2) Partial unique index for TOCTOU race on claim_attempts
--    005 already created idx_claim_attempts_active with the
--    exact same definition. 013 added idx_claim_attempts_active_lock
--    as a duplicate. We keep the original and drop the duplicate.
-- ============================================================
-- idx_claim_attempts_active from 005 already covers:
--   UNIQUE (wallet_address, token_address) WHERE status IN ('pending','signing','submitted')
-- No new index needed. Drop the duplicate from 013:
DROP INDEX IF EXISTS idx_claim_attempts_active_lock;

-- ============================================================
-- 3) Add claim_attempt_id FK on claim_fees
-- ============================================================
ALTER TABLE claim_fees ADD COLUMN IF NOT EXISTS claim_attempt_id UUID REFERENCES claim_attempts(id);

-- ============================================================
-- 3b) Relax claim_fees.fee_lamports CHECK to allow '0' for
--     unverified records (RPC failure → insert with amount=0,
--     reconciled later by cron). Original: > 0, new: >= 0.
-- ============================================================
ALTER TABLE claim_fees DROP CONSTRAINT IF EXISTS claim_fees_fee_lamports_check;
ALTER TABLE claim_fees ADD CONSTRAINT claim_fees_fee_lamports_check
  CHECK (fee_lamports ~ '^\d+$' AND fee_lamports::numeric >= 0 AND fee_lamports::numeric <= 500000000000);

-- ============================================================
-- 4) Idempotent wrappers for 009 constraints
--    009 used bare ALTER TABLE ADD CONSTRAINT which fails on re-run.
--    Wrap them so the migration set can be replayed safely.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_total_earned'
  ) THEN
    ALTER TABLE fee_records ADD CONSTRAINT chk_total_earned
      CHECK (total_earned ~ '^\d+$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_total_claimed'
  ) THEN
    ALTER TABLE fee_records ADD CONSTRAINT chk_total_claimed
      CHECK (total_claimed ~ '^\d+$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_total_unclaimed'
  ) THEN
    ALTER TABLE fee_records ADD CONSTRAINT chk_total_unclaimed
      CHECK (total_unclaimed ~ '^\d+$');
  END IF;
END $$;
