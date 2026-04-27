-- Migration 036 rollback - manual one-shot.
-- Date: 2026-04-26
-- Apply via Supabase dashboard or `psql $DATABASE_URL -f 036_add_fund_recipient_rollback.sql`
-- ONLY when migration 036 needs full revert. NOT part of automatic deploy sequence.
--
-- WARNING: rolling back BEFORE removing all 'fund-recipient' rows from flap_tokens
-- and fee_records will FAIL the new CHECK constraint with "row violates check constraint".
-- Pre-clean first (one-shot in same SQL editor session):
--   UPDATE flap_tokens SET vault_type='unknown' WHERE vault_type='fund-recipient';
--   UPDATE fee_records SET vault_type='unknown' WHERE vault_type='fund-recipient';
--
-- WARNING 2: dropping recipient_address and tax_processor_address columns DESTROYS DATA.
-- If you need rollback but want to preserve recipient mappings for re-application later,
-- DUMP first: `COPY (SELECT token_address, recipient_address, tax_processor_address FROM flap_tokens
-- WHERE recipient_address IS NOT NULL) TO '/tmp/flap_recipients_backup.csv' WITH CSV;`
-- The column drops are commented out below so a casual rollback does NOT destroy data.
-- Uncomment ONLY after explicit confirmation.

BEGIN;

-- Restore CHECK predicates to the pre-036 (post-035) shape:
ALTER TABLE flap_tokens
  DROP CONSTRAINT IF EXISTS flap_tokens_vault_type_check;
ALTER TABLE flap_tokens
  ADD CONSTRAINT flap_tokens_vault_type_check
  CHECK (vault_type IN ('base-v1', 'base-v2', 'split-vault', 'unknown'));

ALTER TABLE fee_records
  DROP CONSTRAINT IF EXISTS fee_records_vault_type_check;
ALTER TABLE fee_records
  ADD CONSTRAINT fee_records_vault_type_check
  CHECK (vault_type IS NULL OR vault_type IN ('base-v1', 'base-v2', 'split-vault', 'unknown'));

-- Drop partial index (safe — non-destructive, can be recreated by re-applying 036).
DROP INDEX IF EXISTS idx_flap_tokens_recipient;

-- DESTRUCTIVE COLUMN DROPS — commented out by default. Uncomment ONLY after explicit
-- review + backup of recipient_address / tax_processor_address values.
-- ALTER TABLE flap_tokens DROP COLUMN IF EXISTS recipient_address;
-- ALTER TABLE flap_tokens DROP COLUMN IF EXISTS tax_processor_address;

COMMIT;
