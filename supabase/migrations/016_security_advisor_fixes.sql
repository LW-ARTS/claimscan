-- Migration: Fix Supabase Security Advisor findings
-- Date: 2026-03-18

-- ═══════════════════════════════════════════════
-- ERROR: set_updated_at() missing search_path
-- Fix: Recreate function with explicit search_path to prevent search path injection
-- ═══════════════════════════════════════════════

-- Fix BOTH trigger functions: set_updated_at (migration 008) and update_updated_at_column (migration 003)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════
-- WARNINGS: Bot tables have redundant RLS policies
-- service_role bypasses RLS entirely, so "FOR ALL USING (auth.role() = 'service_role')"
-- is a no-op that the linter flags as "always true".
-- Fix: Drop the redundant policies. RLS stays enabled (blocks anon/authenticated by default).
-- service_role continues to have full access (bypasses RLS regardless of policies).
-- ═══════════════════════════════════════════════

DROP POLICY IF EXISTS "Service role full access" ON watched_tokens;
DROP POLICY IF EXISTS "Service role full access" ON group_watches;
DROP POLICY IF EXISTS "Service role full access" ON notification_log;

-- NOTE: creator_fee_summary SECURITY DEFINER fix is handled in migration 015
-- (view is dropped and recreated WITH (security_invoker = on) during enum migration)
