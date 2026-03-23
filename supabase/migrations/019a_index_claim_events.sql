-- migrate:no-transaction
-- Migration 019a: Index for claim_events by token_address (2026-03-22)
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block
SET statement_timeout = '5min';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_claim_events_token_address
  ON claim_events (token_address);
RESET statement_timeout;
