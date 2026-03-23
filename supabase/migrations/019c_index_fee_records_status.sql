-- Migration 019c: Partial index for unclaimed fee_records (2026-03-22)
-- Must be in its own file (CREATE INDEX CONCURRENTLY requires no transaction wrapper)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fee_records_status_partial
  ON fee_records (claim_status)
  WHERE claim_status IN ('unclaimed', 'partially_claimed');
