-- Migration: Audit fixes batch 2
-- Date: 2026-04-04
-- Fixes: leaderboard search_path, alert_rules RLS policy, fee_records constraint
--        idempotency, leaderboard NUMERIC cast safety

-- ═══════════════════════════════════════════════
-- 1) Fix get_leaderboard search_path (HIGH)
--    Migration 024 defined get_leaderboard() and get_leaderboard_count()
--    without SET search_path = ''. Migration 016 added this to trigger
--    functions; apply the same pattern here.
-- ═══════════════════════════════════════════════

-- Also fixes: NUMERIC cast safety (1e) — wrap total_earned and
-- total_earned_usd casts with regex validation to prevent runtime errors
-- on malformed data.

CREATE OR REPLACE FUNCTION get_leaderboard(
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0,
  p_platform TEXT DEFAULT NULL,
  p_chain TEXT DEFAULT NULL
)
RETURNS TABLE (
  handle TEXT,
  handle_type TEXT,
  display_name TEXT,
  total_earned_usd NUMERIC,
  platform_count BIGINT,
  token_count BIGINT
)
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  WITH prices AS (
    SELECT chain, price_usd
    FROM public.token_prices
    WHERE token_address IN ('SOL', 'ETH', 'BNB')
  ),
  aggregated AS (
    SELECT
      fr.creator_id,
      SUM(
        CASE
          -- Use pre-computed USD when available (with regex safety)
          WHEN fr.total_earned_usd IS NOT NULL
            AND fr.total_earned_usd > 0
            THEN LEAST(fr.total_earned_usd, 50000000)
          -- Fallback: compute from raw amount * native price (with regex safety)
          WHEN fr.total_earned IS NOT NULL
            AND fr.total_earned != '0'
            AND fr.total_earned ~ '^\d+$'
            THEN LEAST(
              (fr.total_earned::NUMERIC / POWER(10, CASE fr.chain WHEN 'sol' THEN 9 ELSE 18 END))
              * COALESCE(p.price_usd, 0),
              50000000
            )
          ELSE 0
        END
      ) AS total_usd,
      COUNT(DISTINCT fr.platform) AS platform_count,
      COUNT(DISTINCT fr.token_address) AS token_count
    FROM public.fee_records fr
    LEFT JOIN prices p ON p.chain::TEXT = fr.chain::TEXT
    WHERE fr.total_earned != '0'
      AND (p_platform IS NULL OR fr.platform::TEXT = p_platform)
      AND (p_chain IS NULL OR fr.chain::TEXT = p_chain)
    GROUP BY fr.creator_id
    HAVING COUNT(DISTINCT fr.token_address) >= 2
  )
  SELECT
    COALESCE(c.twitter_handle, 'gh:' || c.github_handle) AS handle,
    CASE WHEN c.twitter_handle IS NOT NULL THEN 'twitter' ELSE 'github' END AS handle_type,
    c.display_name,
    ROUND(a.total_usd::NUMERIC, 2) AS total_earned_usd,
    a.platform_count,
    a.token_count
  FROM aggregated a
  JOIN public.creators c ON c.id = a.creator_id
  WHERE (c.twitter_handle IS NOT NULL OR c.github_handle IS NOT NULL)
    AND a.total_usd >= 1
  ORDER BY a.total_usd DESC
  OFFSET p_offset
  LIMIT p_limit;
$$;

-- Count function for pagination
CREATE OR REPLACE FUNCTION get_leaderboard_count(
  p_platform TEXT DEFAULT NULL,
  p_chain TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  WITH prices AS (
    SELECT chain, price_usd
    FROM public.token_prices
    WHERE token_address IN ('SOL', 'ETH', 'BNB')
  ),
  aggregated AS (
    SELECT
      fr.creator_id,
      SUM(
        CASE
          WHEN fr.total_earned_usd IS NOT NULL
            AND fr.total_earned_usd > 0
            THEN LEAST(fr.total_earned_usd, 50000000)
          WHEN fr.total_earned IS NOT NULL
            AND fr.total_earned != '0'
            AND fr.total_earned ~ '^\d+$'
            THEN LEAST(
              (fr.total_earned::NUMERIC / POWER(10, CASE fr.chain WHEN 'sol' THEN 9 ELSE 18 END))
              * COALESCE(p.price_usd, 0),
              50000000
            )
          ELSE 0
        END
      ) AS total_usd
    FROM public.fee_records fr
    LEFT JOIN prices p ON p.chain::TEXT = fr.chain::TEXT
    WHERE fr.total_earned != '0'
      AND (p_platform IS NULL OR fr.platform::TEXT = p_platform)
      AND (p_chain IS NULL OR fr.chain::TEXT = p_chain)
    GROUP BY fr.creator_id
    HAVING COUNT(DISTINCT fr.token_address) >= 2
  )
  SELECT COUNT(*)
  FROM aggregated a
  JOIN public.creators c ON c.id = a.creator_id
  WHERE (c.twitter_handle IS NOT NULL OR c.github_handle IS NOT NULL)
    AND a.total_usd >= 1;
$$;

-- ═══════════════════════════════════════════════
-- 2) Fix alert_rules RLS — missing policy (HIGH)
--    Migration 023 enables RLS but creates zero policies.
--    Without a policy, even service_role queries that don't bypass
--    RLS would get empty results.
-- ═══════════════════════════════════════════════

CREATE POLICY "Service role full access" ON alert_rules
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════
-- 3) Fix migration 009 idempotency (LOW)
--    Migration 009 uses bare ADD CONSTRAINT which fails on re-run.
--    Migration 014 added DO $$ wrappers, but the original 009 still
--    breaks replay. Use DROP IF EXISTS + ADD for a clean slate.
-- ═══════════════════════════════════════════════

ALTER TABLE fee_records DROP CONSTRAINT IF EXISTS chk_total_earned;
ALTER TABLE fee_records ADD CONSTRAINT chk_total_earned CHECK (total_earned ~ '^\d+$');

ALTER TABLE fee_records DROP CONSTRAINT IF EXISTS chk_total_claimed;
ALTER TABLE fee_records ADD CONSTRAINT chk_total_claimed CHECK (total_claimed ~ '^\d+$');

ALTER TABLE fee_records DROP CONSTRAINT IF EXISTS chk_total_unclaimed;
ALTER TABLE fee_records ADD CONSTRAINT chk_total_unclaimed CHECK (total_unclaimed ~ '^\d+$');

-- ═══════════════════════════════════════════════
-- 4) claim_fees RLS — already has policy (NO-OP)
--    Migration 007 already defines:
--      ALTER TABLE claim_fees ENABLE ROW LEVEL SECURITY;
--      CREATE POLICY "Service full access" ON claim_fees
--        FOR ALL TO service_role USING (true) WITH CHECK (true);
--    No fix needed.
-- ═══════════════════════════════════════════════
