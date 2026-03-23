-- !! Run with --no-transaction flag (CREATE INDEX CONCURRENTLY cannot run inside a transaction)
-- Migration 019: Indexes and type fixes from audit (2026-03-22)
-- Addresses: missing indexes on hot query paths, enum type inconsistency on bot tables

-- 1. Index for claim_events by token_address (used by bot + fee-sync queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_claim_events_token_address
  ON claim_events (token_address);

-- 2. Composite index for creator_tokens lookup pattern (creator_id + platform + chain)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_tokens_creator_platform_chain
  ON creator_tokens (creator_id, platform, chain);

-- 3. Partial index for unclaimed fee_records (used by creator_fee_summary view)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fee_records_status_partial
  ON fee_records (claim_status)
  WHERE claim_status IN ('unclaimed', 'partially_claimed');

-- 4. Fix watched_tokens to use proper enum types (currently TEXT, inconsistent with rest of schema)
ALTER TABLE watched_tokens
  ALTER COLUMN chain TYPE chain_type USING chain::chain_type;
ALTER TABLE watched_tokens
  ALTER COLUMN platform TYPE platform_type USING platform::platform_type;
