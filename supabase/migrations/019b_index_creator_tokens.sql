-- migrate:no-transaction
-- Migration 019b: Composite index for creator_tokens lookup (2026-03-22)
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block
SET statement_timeout = '5min';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_tokens_creator_platform_chain
  ON creator_tokens (creator_id, platform, chain);
RESET statement_timeout;
