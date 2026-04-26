-- Migration 035 - Add 'split-vault' value to vault_type CHECK constraints
-- Date: 2026-04-26
-- Phase: 12.1 - SplitVault handler (third Flap vault type, ~3979/6792 = 58.6% of vault tokens)
--
-- Idempotent: DROP CONSTRAINT IF EXISTS guards re-runs.
--
-- TWO tables get the new CHECK value because migration 034 added vault_type to BOTH
-- flap_tokens (NOT NULL) and fee_records (nullable). They must be updated together:
-- failing to update fee_records would silently break persistFees() at the next
-- index-fees cron when it writes a SplitVault row.
--
-- Postgres CHECK constraints cannot be ALTERed in place - must DROP + ADD.
-- The constraint names are Postgres-auto-generated from migration 034's inline
-- CHECK clauses (pattern: <table>_<column>_check).

BEGIN;

-- flap_tokens.vault_type
ALTER TABLE flap_tokens
  DROP CONSTRAINT IF EXISTS flap_tokens_vault_type_check;
ALTER TABLE flap_tokens
  ADD CONSTRAINT flap_tokens_vault_type_check
  CHECK (vault_type IN ('base-v1', 'base-v2', 'split-vault', 'unknown'));

-- fee_records.vault_type
-- Preserve IS NULL clause so non-Flap rows (where vault_type is NULL) remain valid.
ALTER TABLE fee_records
  DROP CONSTRAINT IF EXISTS fee_records_vault_type_check;
ALTER TABLE fee_records
  ADD CONSTRAINT fee_records_vault_type_check
  CHECK (vault_type IS NULL OR vault_type IN ('base-v1', 'base-v2', 'split-vault', 'unknown'));

COMMIT;

-- Sanity verify queries (run manually post-apply)
-- 1. Confirm new constraints exist with split-vault in predicate:
--    SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname IN ('flap_tokens_vault_type_check', 'fee_records_vault_type_check');
-- 2. Confirm no rows violate (should be 0):
--    SELECT COUNT(*) FROM flap_tokens WHERE vault_type NOT IN ('base-v1', 'base-v2', 'split-vault', 'unknown');
-- 3. Canary INSERT (must succeed post-migration):
--    INSERT INTO flap_tokens (token_address, creator, vault_type, source, created_block)
--    VALUES ('0xtest', '0xtest', 'split-vault', 'native_indexer', 0);
--    DELETE FROM flap_tokens WHERE token_address = '0xtest';  -- cleanup
