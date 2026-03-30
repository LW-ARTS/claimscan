-- ============================================================
-- Migration 022: Security audit fixes (2026-03-30)
-- H2: RLS policies for bot tables (group_watches, notification_log, watched_tokens)
-- M2: Drop 13 unused indexes
-- M3: Add missing FK index on watched_tokens.creator_id
-- ============================================================

-- ────────────────────────────────────────────────
-- H2: RLS policies for bot tables
-- These tables had RLS enabled but zero policies,
-- causing 100% 401 on every bot request (~864/day).
-- service_role bypasses RLS, but adding explicit policies
-- satisfies the Supabase Security Advisor and allows
-- future use of authenticated roles if needed.
-- ────────────────────────────────────────────────

-- group_watches: bot-managed watch groups
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_group_watches') THEN
    CREATE POLICY service_role_all_group_watches ON public.group_watches
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- notification_log: bot notification history
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_notification_log') THEN
    CREATE POLICY service_role_all_notification_log ON public.notification_log
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- watched_tokens: bot token watch list
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_watched_tokens') THEN
    CREATE POLICY service_role_all_watched_tokens ON public.watched_tokens
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ────────────────────────────────────────────────
-- M2: Drop 13 unused indexes
-- Identified by Supabase Performance Advisor.
-- Reduces write overhead and storage waste.
-- ────────────────────────────────────────────────

DROP INDEX IF EXISTS public.idx_token_prices_chain_address;
DROP INDEX IF EXISTS public.idx_search_log_searched_at;
DROP INDEX IF EXISTS public.idx_creators_farcaster;
DROP INDEX IF EXISTS public.idx_creator_tokens_platform;
DROP INDEX IF EXISTS public.idx_group_watches_token;
DROP INDEX IF EXISTS public.idx_group_watches_group_id;
DROP INDEX IF EXISTS public.idx_notification_log_group_token;
DROP INDEX IF EXISTS public.idx_watched_tokens_unclaimed;
DROP INDEX IF EXISTS public.idx_claim_attempts_wallet;
DROP INDEX IF EXISTS public.idx_claim_fees_wallet;
DROP INDEX IF EXISTS public.idx_claim_fees_verified;
DROP INDEX IF EXISTS public.idx_claim_events_claimed_at;

-- ────────────────────────────────────────────────
-- M3: Add missing FK index on watched_tokens.creator_id
-- Foreign key without covering index degrades JOIN
-- and CASCADE DELETE performance.
-- ────────────────────────────────────────────────

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_watched_tokens_creator_id
  ON public.watched_tokens (creator_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_group_watches_token_id
  ON public.group_watches (token_id);
