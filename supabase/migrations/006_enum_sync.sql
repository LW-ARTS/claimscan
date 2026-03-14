-- Sync enums with TypeScript types and application code

-- Add 'partially_claimed' to claim_status (used by creator.ts and index-fees cron)
ALTER TYPE claim_status ADD VALUE IF NOT EXISTS 'partially_claimed';

-- Add 'coinbarrel' and 'raydium' to platform_type (added after initial launch)
ALTER TYPE platform_type ADD VALUE IF NOT EXISTS 'coinbarrel';
ALTER TYPE platform_type ADD VALUE IF NOT EXISTS 'raydium';
