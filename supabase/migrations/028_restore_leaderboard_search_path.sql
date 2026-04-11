-- Migration 028: Restore search_path isolation on leaderboard functions
--
-- Background: Migration 027 (leaderboard_with_tiktok) redefined get_leaderboard
-- and get_leaderboard_count via CREATE OR REPLACE FUNCTION without re-asserting
-- `SET search_path = ''`. Postgres CREATE OR REPLACE resets all attributes not
-- re-specified, so the hardening added in migration 025 (which explicitly fixed
-- the same class of issue as a HIGH-severity audit finding) was silently dropped.
--
-- Confirmed live via Supabase advisor on 2026-04-11 — both functions flagged
-- `function_search_path_mutable` (WARN, SECURITY). Also confirmed via
-- `SELECT proconfig FROM pg_proc` returning NULL for both functions.
--
-- Fix: re-apply the empty search_path via ALTER FUNCTION. This is idempotent,
-- does NOT touch the function body, and is safe to run on live production with
-- zero downtime (the ALTER takes an exclusive lock only for the microseconds it
-- takes to update pg_proc).
--
-- Signatures verified via pg_get_function_identity_arguments on 2026-04-11:
--   get_leaderboard(p_limit integer, p_offset integer, p_platform text, p_chain text)
--   get_leaderboard_count(p_platform text, p_chain text)
--
-- See: security-scan/AUDIT-2026-04-11.md M-3

ALTER FUNCTION public.get_leaderboard(
  integer,  -- p_limit
  integer,  -- p_offset
  text,     -- p_platform
  text      -- p_chain
) SET search_path = '';

ALTER FUNCTION public.get_leaderboard_count(
  text,     -- p_platform
  text      -- p_chain
) SET search_path = '';
