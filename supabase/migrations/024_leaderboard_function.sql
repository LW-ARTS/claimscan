-- M-7: Server-side leaderboard aggregation to avoid 50k row client fetch.
-- Returns pre-ranked creators with USD totals computed in Postgres.

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
AS $$
  WITH prices AS (
    SELECT chain, price_usd
    FROM token_prices
    WHERE token_address IN ('SOL', 'ETH', 'BNB')
  ),
  aggregated AS (
    SELECT
      fr.creator_id,
      SUM(
        CASE
          -- Use pre-computed USD when available
          WHEN fr.total_earned_usd IS NOT NULL AND fr.total_earned_usd > 0
            THEN LEAST(fr.total_earned_usd, 50000000)
          -- Fallback: compute from raw amount * native price
          WHEN fr.total_earned IS NOT NULL AND fr.total_earned != '0'
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
    FROM fee_records fr
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
  JOIN creators c ON c.id = a.creator_id
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
AS $$
  WITH prices AS (
    SELECT chain, price_usd
    FROM token_prices
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
            THEN LEAST(
              (fr.total_earned::NUMERIC / POWER(10, CASE fr.chain WHEN 'sol' THEN 9 ELSE 18 END))
              * COALESCE(p.price_usd, 0),
              50000000
            )
          ELSE 0
        END
      ) AS total_usd
    FROM fee_records fr
    LEFT JOIN prices p ON p.chain::TEXT = fr.chain::TEXT
    WHERE fr.total_earned != '0'
      AND (p_platform IS NULL OR fr.platform::TEXT = p_platform)
      AND (p_chain IS NULL OR fr.chain::TEXT = p_chain)
    GROUP BY fr.creator_id
    HAVING COUNT(DISTINCT fr.token_address) >= 2
  )
  SELECT COUNT(*)
  FROM aggregated a
  JOIN creators c ON c.id = a.creator_id
  WHERE (c.twitter_handle IS NOT NULL OR c.github_handle IS NOT NULL)
    AND a.total_usd >= 1;
$$;
