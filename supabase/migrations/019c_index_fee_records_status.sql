-- migrate:no-transaction
-- Migration 019c: Partial index for unclaimed fee_records (2026-03-22)
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block
SET statement_timeout = '5min';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fee_records_status_partial
  ON fee_records (claim_status)
  WHERE claim_status IN ('unclaimed', 'partially_claimed');
RESET statement_timeout;
