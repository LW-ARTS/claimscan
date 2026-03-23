-- Migration 019a: Index for claim_events by token_address (2026-03-22)
-- Must be in its own file (CREATE INDEX CONCURRENTLY requires no transaction wrapper)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_claim_events_token_address
  ON claim_events (token_address);
