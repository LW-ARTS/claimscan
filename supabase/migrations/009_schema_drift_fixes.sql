-- Fix schema drift: add last_token_sync_at column (exists in prod but missing from migrations)
ALTER TABLE creators ADD COLUMN IF NOT EXISTS last_token_sync_at TIMESTAMPTZ;

-- Fix creator_fee_summary view to include 'partially_claimed' in has_unclaimed check
CREATE OR REPLACE VIEW creator_fee_summary AS
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

-- Add CHECK constraints on financial TEXT columns for data integrity
ALTER TABLE fee_records ADD CONSTRAINT chk_total_earned CHECK (total_earned ~ '^\d+$');
ALTER TABLE fee_records ADD CONSTRAINT chk_total_claimed CHECK (total_claimed ~ '^\d+$');
ALTER TABLE fee_records ADD CONSTRAINT chk_total_unclaimed CHECK (total_unclaimed ~ '^\d+$');
