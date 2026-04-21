-- Migration: Add 'flap' and 'flaunch' to platform_type
-- Date: 2026-04-20
-- Flap.sh (BSC bonding curve) and Flaunch.gg (Base fair launch).
-- Postgres does not support ADD VALUE mid-transaction with column dependencies,
-- so we follow the same recreate-enum ceremony as 015_remove_heaven.sql.

BEGIN;

-- Step 1: Drop dependent view
DROP VIEW IF EXISTS creator_fee_summary;

-- Step 2: Drop default that references the old enum
ALTER TABLE claim_attempts ALTER COLUMN platform DROP DEFAULT;

-- Step 3: Rename old enum, create new one
ALTER TYPE platform_type RENAME TO platform_type_old;

CREATE TYPE platform_type AS ENUM (
  'bags', 'clanker', 'pump', 'zora', 'bankr',
  'believe', 'revshare', 'coinbarrel', 'raydium',
  'flaunch', 'flap'
);

-- Step 4: Recast all columns
ALTER TABLE wallets        ALTER COLUMN source_platform TYPE platform_type USING source_platform::text::platform_type;
ALTER TABLE creator_tokens ALTER COLUMN platform        TYPE platform_type USING platform::text::platform_type;
ALTER TABLE fee_records    ALTER COLUMN platform        TYPE platform_type USING platform::text::platform_type;
ALTER TABLE claim_events   ALTER COLUMN platform        TYPE platform_type USING platform::text::platform_type;
ALTER TABLE claim_attempts ALTER COLUMN platform        TYPE platform_type USING platform::text::platform_type;

DROP TYPE platform_type_old;

-- Step 5: Restore default
ALTER TABLE claim_attempts ALTER COLUMN platform SET DEFAULT 'bags'::platform_type;

-- Step 6: Recreate view with security_invoker (from migration 016)
CREATE OR REPLACE VIEW creator_fee_summary
WITH (security_invoker = on) AS
SELECT
  c.id AS creator_id,
  c.twitter_handle,
  c.github_handle,
  c.display_name,
  fr.platform,
  fr.chain,
  COUNT(DISTINCT fr.token_address) AS token_count,
  SUM(fr.total_earned_usd) AS total_earned_usd,
  SUM(CASE WHEN fr.claim_status IN ('unclaimed', 'partially_claimed') THEN 1 ELSE 0 END) > 0 AS has_unclaimed,
  MAX(fr.last_synced_at) AS last_synced_at
FROM creators c
JOIN fee_records fr ON fr.creator_id = c.id
GROUP BY c.id, c.twitter_handle, c.github_handle, c.display_name, fr.platform, fr.chain;

COMMIT;
