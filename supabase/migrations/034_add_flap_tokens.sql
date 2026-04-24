-- Migration: Add flap_tokens + flap_indexer_state for Phase 12 Flap adapter
-- Date: 2026-04-24
-- Idempotent: safe to re-run (IF NOT EXISTS guards on every create).
--
-- Context: Phase 12 ships a display-only Flap.sh adapter for BSC. This migration
-- creates:
--   1. `flap_tokens` per-token metadata cache (written by cron indexer + backfill)
--   2. `flap_indexer_state` cron cursor table
--   3. ADDITIVE nullable column `fee_records.vault_type` (for D-04 badge on cached rows)
--
-- Writes on flap_* tables are service-role only. Anon reads on flap_tokens allowed.
-- The platform_type enum already includes 'flap' since migration 032.

-- ═══════════════════════════════════════════════
-- flap_tokens: per-token metadata indexed from Portal TokenCreated events
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS flap_tokens (
  token_address    TEXT         PRIMARY KEY,                                                 -- lowercase 0x...
  creator          TEXT         NOT NULL,                                                    -- lowercase 0x...
  vault_address    TEXT,                                                                     -- nullable until first probe
  vault_type       TEXT         NOT NULL CHECK (vault_type IN ('base-v1', 'base-v2', 'unknown')),
  decimals         SMALLINT     NOT NULL DEFAULT 18,                                         -- D-10 token decimals cache
  source           TEXT         NOT NULL CHECK (source IN ('bitquery_backfill', 'native_indexer')),  -- D-07 audit trail
  created_block    BIGINT       NOT NULL,
  indexed_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flap_tokens_creator ON flap_tokens(creator);
CREATE INDEX IF NOT EXISTS idx_flap_tokens_vault ON flap_tokens(vault_address) WHERE vault_address IS NOT NULL;

-- ═══════════════════════════════════════════════
-- flap_indexer_state: cron cursor
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS flap_indexer_state (
  contract_address   TEXT    PRIMARY KEY,
  last_scanned_block BIGINT  NOT NULL
);

-- ═══════════════════════════════════════════════
-- RLS: anon read on flap_tokens (matches creator_tokens + fee_records).
-- No policy on flap_indexer_state — writes service-role only; anon reads not required.
-- ═══════════════════════════════════════════════

ALTER TABLE flap_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE flap_indexer_state ENABLE ROW LEVEL SECURITY;

-- Idempotent policy creation. Postgres does not support that syntax on
-- CREATE POLICY, so we wrap in a DO-block that checks pg_policies first.
-- Pattern copied verbatim from migration 022 L22-32.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'flap_tokens' AND policyname = 'Public read flap_tokens'
  ) THEN
    CREATE POLICY "Public read flap_tokens" ON flap_tokens FOR SELECT USING (true);
  END IF;
END $$;

-- ═══════════════════════════════════════════════
-- fee_records: additive nullable column for D-04 badge routing.
--
-- Pattern copied from migration 022 L5-8 (additive fee_type / fee_locked).
-- Nullable because vault_type is meaningful only for Flap rows — all other
-- 10 launchpads leave it NULL. CHECK tolerates NULL via the `IS NULL OR ...`
-- clause so legacy rows don't fail validation.
--
-- After this migration runs, Plan 05 regenerates (or manually edits)
-- lib/supabase/types.ts to include `vault_type: string | null` on
-- fee_records.Row + Insert + Update interfaces so TokenFeeTable.tsx
-- can read `fee.vault_type` with proper typing.
-- ═══════════════════════════════════════════════

ALTER TABLE fee_records ADD COLUMN IF NOT EXISTS vault_type TEXT
  CHECK (vault_type IS NULL OR vault_type IN ('base-v1', 'base-v2', 'unknown'));
