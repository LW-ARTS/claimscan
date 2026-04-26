-- Migration 035 rollback - manual one-shot.
-- Date: 2026-04-26
-- Apply via Supabase dashboard or `psql $DATABASE_URL -f 035_add_splitvault_to_check_rollback.sql`
-- ONLY when migration 035 needs full revert. NOT part of automatic deploy sequence.
--
-- WARNING: rolling back BEFORE removing all 'split-vault' rows from flap_tokens
-- and fee_records will FAIL the new CHECK constraint with "row violates check constraint".
-- Pre-clean first (one-shot in same SQL editor session):
--   UPDATE flap_tokens SET vault_type='unknown' WHERE vault_type='split-vault';
--   UPDATE fee_records SET vault_type='unknown' WHERE vault_type='split-vault';

BEGIN;

ALTER TABLE flap_tokens
  DROP CONSTRAINT IF EXISTS flap_tokens_vault_type_check;
ALTER TABLE flap_tokens
  ADD CONSTRAINT flap_tokens_vault_type_check
  CHECK (vault_type IN ('base-v1', 'base-v2', 'unknown'));

ALTER TABLE fee_records
  DROP CONSTRAINT IF EXISTS fee_records_vault_type_check;
ALTER TABLE fee_records
  ADD CONSTRAINT fee_records_vault_type_check
  CHECK (vault_type IS NULL OR vault_type IN ('base-v1', 'base-v2', 'unknown'));

COMMIT;
