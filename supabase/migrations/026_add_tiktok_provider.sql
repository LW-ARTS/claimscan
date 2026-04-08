-- TikTok Fee Sharing support (Bags.fm launched TikTok provider on 2026-04-08)
-- Bags API endpoint /token-launch/fee-share/wallet/v2 already accepts provider=tiktok.
-- This migration adds the enum value, the creators column, and the lookup index
-- so ClaimScan can resolve TikTok handles end-to-end via the existing pipeline.

-- ═══════════════════════════════════════════════
-- 1. Extend identity_provider enum
-- ═══════════════════════════════════════════════
-- search_log.provider is NOT NULL of this enum type, so any TikTok search
-- would fail to log without this. ALTER TYPE ADD VALUE is autocommit-safe
-- when not referenced later in the same migration (see 020_add_bsc_chain.sql).
ALTER TYPE identity_provider ADD VALUE IF NOT EXISTS 'tiktok';

-- ═══════════════════════════════════════════════
-- 2. tiktok_handle column on creators
-- ═══════════════════════════════════════════════
-- Mirrors the twitter_handle / github_handle pattern: nullable, unique,
-- partial-indexed for lookups. TikTok usernames are 2-24 chars, lowercase
-- letters/digits/underscores/periods (validated app-side, not in the DB).
ALTER TABLE creators
  ADD COLUMN IF NOT EXISTS tiktok_handle TEXT;

-- Idempotent UNIQUE constraint (matches 002_security_hardening pattern)
DO $$ BEGIN
  ALTER TABLE creators
    ADD CONSTRAINT creators_tiktok_handle_unique UNIQUE (tiktok_handle);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Partial index for handle lookups (matches twitter/github/farcaster pattern)
CREATE INDEX IF NOT EXISTS idx_creators_tiktok
  ON creators(tiktok_handle) WHERE tiktok_handle IS NOT NULL;
