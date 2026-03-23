-- Migration 019d: Fix watched_tokens to use proper enum types (2026-03-22)
-- Safe to run in default transaction mode
ALTER TABLE watched_tokens
  ALTER COLUMN chain TYPE chain_type USING chain::chain_type;
ALTER TABLE watched_tokens
  ALTER COLUMN platform TYPE platform_type USING platform::platform_type;
