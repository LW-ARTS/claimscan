-- Add BSC (BNB Chain) support for Clanker multi-chain fee tracking
ALTER TYPE chain_type ADD VALUE IF NOT EXISTS 'bsc';

-- Drop legacy CHECK constraint from watched_tokens (created in 010_bot_tables.sql
-- before the column was migrated to chain_type enum in 019d). The enum now enforces
-- valid values; the CHECK would reject 'bsc' inserts.
ALTER TABLE IF EXISTS watched_tokens DROP CONSTRAINT IF EXISTS watched_tokens_chain_check;
