-- Migration 036 - Add 'fund-recipient' vault type + recipient_address + tax_processor_address columns
-- Date: 2026-04-26
-- Phase: 13 - Flap fund-recipient vault support (auto-forwarded fees per recipient EOA)
--
-- Idempotent: DROP CONSTRAINT IF EXISTS + ADD COLUMN IF NOT EXISTS guards re-runs.
--
-- TWO tables get the new CHECK value (mirrors 035 pattern):
--   flap_tokens.vault_type (NOT NULL) and fee_records.vault_type (nullable).
-- They must be updated together: failing to update fee_records would silently
-- break persistFees() at the next index-fees cron when it writes a fund-recipient row.
--
-- Postgres CHECK constraints cannot be ALTERed in place - must DROP + ADD.
-- The constraint names are Postgres-auto-generated from migration 034's inline
-- CHECK clauses (pattern: <table>_<column>_check).
--
-- New columns (Phase 13):
--   recipient_address TEXT NULL    -- only fund-recipient rows populate; recipient EOA from TaxProcessor.marketAddress()
--   tax_processor_address TEXT NULL -- only fund-recipient rows populate; cached per-token TaxProcessor clone address
--                                      (avoids re-resolving token.taxProcessor() on every cron tick + adapter call)
-- Partial index supports the adapter WHERE-clause D-03:
--   .or('and(creator.eq.<wallet>,vault_type.neq.fund-recipient),and(vault_type.eq.fund-recipient,recipient_address.eq.<wallet>)')

BEGIN;

-- 1. Extend flap_tokens.vault_type CHECK
ALTER TABLE flap_tokens
  DROP CONSTRAINT IF EXISTS flap_tokens_vault_type_check;
ALTER TABLE flap_tokens
  ADD CONSTRAINT flap_tokens_vault_type_check
  CHECK (vault_type IN ('base-v1', 'base-v2', 'split-vault', 'fund-recipient', 'unknown'));

-- 2. Extend fee_records.vault_type CHECK
--    Preserve IS NULL clause so non-Flap rows (where vault_type is NULL) remain valid.
ALTER TABLE fee_records
  DROP CONSTRAINT IF EXISTS fee_records_vault_type_check;
ALTER TABLE fee_records
  ADD CONSTRAINT fee_records_vault_type_check
  CHECK (vault_type IS NULL OR vault_type IN ('base-v1', 'base-v2', 'split-vault', 'fund-recipient', 'unknown'));

-- 3. Add recipient_address column (nullable; only fund-recipient rows populate it).
ALTER TABLE flap_tokens
  ADD COLUMN IF NOT EXISTS recipient_address TEXT;

-- 4. Add tax_processor_address column (nullable; only fund-recipient rows populate it).
--    Cache for the per-token TaxProcessor clone address. Saves one RPC read per cron tick
--    AND per adapter call. RESEARCH §"Migration 036 SQL (refined)" + Open Question #1
--    recommends inclusion (matches Phase 12 vault_address caching pattern).
ALTER TABLE flap_tokens
  ADD COLUMN IF NOT EXISTS tax_processor_address TEXT;

-- 5. Partial index on recipient_address for adapter WHERE-clause D-03.
--    Indexes only the rows where recipient_address IS NOT NULL (fund-recipient rows),
--    keeping the index small relative to the 236K-row flap_tokens table.
CREATE INDEX IF NOT EXISTS idx_flap_tokens_recipient
  ON flap_tokens(recipient_address)
  WHERE recipient_address IS NOT NULL;

COMMIT;

-- Sanity verify queries (run manually post-apply)
-- 1. Confirm new constraints contain 'fund-recipient' in predicate:
--    SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname IN ('flap_tokens_vault_type_check', 'fee_records_vault_type_check');
-- 2. Confirm no rows violate the new predicate (should be 0):
--    SELECT COUNT(*) FROM flap_tokens WHERE vault_type NOT IN ('base-v1','base-v2','split-vault','fund-recipient','unknown');
--    SELECT COUNT(*) FROM fee_records WHERE vault_type IS NOT NULL AND vault_type NOT IN ('base-v1','base-v2','split-vault','fund-recipient','unknown');
-- 3. Canary INSERT/DELETE (must succeed post-migration):
--    INSERT INTO flap_tokens (token_address, creator, vault_type, source, created_block, recipient_address, tax_processor_address)
--    VALUES ('0xtest_fr', '0xtest_deployer', 'fund-recipient', 'native_indexer', 0, '0xtest_recipient', '0xtest_taxprocessor');
--    DELETE FROM flap_tokens WHERE token_address = '0xtest_fr';
-- 4. Confirm partial index present:
--    SELECT indexname FROM pg_indexes WHERE tablename = 'flap_tokens' AND indexname = 'idx_flap_tokens_recipient';
-- 5. D-10 hard verification gate (after W5 classify-flap.ts run + cron tick):
--    SELECT vault_type, recipient_address, tax_processor_address, source
--    FROM flap_tokens
--    WHERE token_address = LOWER('0x5f28b56a2f6e396a69fc912aec8d42d8afa17777');
--    expect: vault_type='fund-recipient', recipient_address='0xe4cc6a1fa41e48bb968e0dd29df09092b25a4457' (lowercase per CLAUDE.md invariant)
