-- Migration: Remove Heaven platform
-- Date: 2026-03-17
-- Heaven was a stub adapter that never had a real integration.
-- Removing from enum after confirming zero rows reference it.

-- Step 1: Delete any heaven data (should be zero rows, but safe cleanup)
DELETE FROM fee_records WHERE platform = 'heaven';
DELETE FROM creator_tokens WHERE platform = 'heaven';
DELETE FROM wallets WHERE source_platform = 'heaven';
DELETE FROM claim_events WHERE platform = 'heaven';
DELETE FROM claim_attempts WHERE platform = 'heaven';

-- Step 2: Drop dependent view (references fee_records.platform)
DROP VIEW IF EXISTS creator_fee_summary;

-- Step 3: Drop default that references the old enum type
ALTER TABLE claim_attempts ALTER COLUMN platform DROP DEFAULT;

-- Step 4: Rename old enum, create new one without 'heaven'
-- Postgres doesn't support DROP VALUE from enum, so we recreate it.
ALTER TYPE platform_type RENAME TO platform_type_old;

CREATE TYPE platform_type AS ENUM (
  'bags', 'clanker', 'pump', 'zora', 'bankr', 'believe', 'revshare', 'coinbarrel', 'raydium'
);

-- Step 5: Migrate ALL columns that use the enum
-- Note: wallets only has source_platform, not platform
ALTER TABLE wallets ALTER COLUMN source_platform TYPE platform_type USING source_platform::text::platform_type;
ALTER TABLE creator_tokens ALTER COLUMN platform TYPE platform_type USING platform::text::platform_type;
ALTER TABLE fee_records ALTER COLUMN platform TYPE platform_type USING platform::text::platform_type;
ALTER TABLE claim_events ALTER COLUMN platform TYPE platform_type USING platform::text::platform_type;
ALTER TABLE claim_attempts ALTER COLUMN platform TYPE platform_type USING platform::text::platform_type;

DROP TYPE platform_type_old;

-- Step 6: Restore default
ALTER TABLE claim_attempts ALTER COLUMN platform SET DEFAULT 'bags'::platform_type;

-- Step 7: Recreate view with security_invoker (from migration 016)
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
