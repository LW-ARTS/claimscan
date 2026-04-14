-- Migration 029: Restore public. schema qualification on leaderboard functions
--
-- Background: Migration 027 (leaderboard_with_tiktok) redefined both functions
-- via CREATE OR REPLACE FUNCTION but dropped the `public.` schema prefixes that
-- migration 025 had added on the table references. Migration 028 then re-applied
-- `SET search_path = ''` via ALTER FUNCTION, but ALTER only touches the function
-- attributes — it does NOT rewrite the body.
--
-- Result on production (verified 2026-04-14 via Supabase MCP):
--   SELECT * FROM public.get_leaderboard(5, 0, NULL, NULL);
--   → ERROR: 42P01: relation "token_prices" does not exist
--
-- Leaderboard has been silently broken since 2026-04-11 (migration 028 deploy).
-- The /leaderboard page catches the error and renders the empty state,
-- so there was no Sentry alert.
--
-- Fix: CREATE OR REPLACE combining the TikTok logic from 027 with the
-- qualified refs from 025, while keeping SET search_path = '' from 028.
-- Safe to re-run (idempotent), zero downtime — CREATE OR REPLACE takes only
-- the microseconds needed to update pg_proc.

CREATE OR REPLACE FUNCTION public.get_leaderboard(
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
          WHEN fr.total_earned_usd IS NOT NULL AND fr.total_earned_usd > 0
            THEN LEAST(fr.total_earned_usd, 50000000)
          WHEN fr.total_earned IS NOT NULL AND fr.total_earned != '0'
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
    COALESCE(c.twitter_handle, 'tt:' || c.tiktok_handle, 'gh:' || c.github_handle) AS handle,
    CASE
      WHEN c.twitter_handle IS NOT NULL THEN 'twitter'
      WHEN c.tiktok_handle IS NOT NULL THEN 'tiktok'
      ELSE 'github'
    END AS handle_type,
    c.display_name,
    ROUND(a.total_usd::NUMERIC, 2) AS total_earned_usd,
    a.platform_count,
    a.token_count
  FROM aggregated a
  JOIN public.creators c ON c.id = a.creator_id
  WHERE (c.twitter_handle IS NOT NULL OR c.tiktok_handle IS NOT NULL OR c.github_handle IS NOT NULL)
    AND a.total_usd >= 1
  ORDER BY a.total_usd DESC
  OFFSET p_offset
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.get_leaderboard_count(
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
          WHEN fr.total_earned_usd IS NOT NULL AND fr.total_earned_usd > 0
            THEN LEAST(fr.total_earned_usd, 50000000)
          WHEN fr.total_earned IS NOT NULL AND fr.total_earned != '0'
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
  WHERE (c.twitter_handle IS NOT NULL OR c.tiktok_handle IS NOT NULL OR c.github_handle IS NOT NULL)
    AND a.total_usd >= 1;
$$;
