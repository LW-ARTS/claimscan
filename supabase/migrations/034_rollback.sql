-- Migration 034 rollback — manual one-shot.
-- Date: 2026-04-24
-- Apply via Supabase dashboard or `psql $DATABASE_URL -f 034_rollback.sql`
-- ONLY when migration 034 needs full revert. NOT part of automatic deploy sequence.

BEGIN;

DROP TABLE IF EXISTS flap_tokens CASCADE;
DROP TABLE IF EXISTS flap_indexer_state CASCADE;

-- Drop the additive column on fee_records (all vault_type data lost).
-- IF EXISTS so rollback is idempotent even if migration 034 didn't complete.
ALTER TABLE fee_records DROP COLUMN IF EXISTS vault_type;

COMMIT;
