-- Migration 019b: Composite index for creator_tokens lookup (2026-03-22)
-- Must be in its own file (CREATE INDEX CONCURRENTLY requires no transaction wrapper)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_tokens_creator_platform_chain
  ON creator_tokens (creator_id, platform, chain);
