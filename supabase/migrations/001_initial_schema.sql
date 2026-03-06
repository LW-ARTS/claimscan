-- ClaimScan Database Schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE platform_type AS ENUM (
  'bags', 'clanker', 'pump', 'zora', 'heaven', 'bankr', 'believe', 'revshare'
);
CREATE TYPE chain_type AS ENUM ('sol', 'base', 'eth');
CREATE TYPE identity_provider AS ENUM ('twitter', 'github', 'farcaster', 'wallet');
CREATE TYPE claim_status AS ENUM ('claimed', 'unclaimed', 'auto_distributed');

-- Creators: central identity
CREATE TABLE creators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  twitter_handle TEXT UNIQUE,
  github_handle TEXT UNIQUE,
  farcaster_handle TEXT,
  farcaster_fid INTEGER,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Wallet addresses linked to a creator
CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  chain chain_type NOT NULL,
  source_platform platform_type NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(address, chain)
);

-- Tokens that a creator deployed/launched
CREATE TABLE creator_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  platform platform_type NOT NULL,
  chain chain_type NOT NULL,
  token_address TEXT NOT NULL,
  token_symbol TEXT,
  token_name TEXT,
  token_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(token_address, chain)
);

-- Fee records: cached fee data per token per platform
CREATE TABLE fee_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  creator_token_id UUID REFERENCES creator_tokens(id) ON DELETE SET NULL,
  platform platform_type NOT NULL,
  chain chain_type NOT NULL,
  token_address TEXT NOT NULL,
  token_symbol TEXT,
  total_earned TEXT NOT NULL DEFAULT '0',
  total_claimed TEXT NOT NULL DEFAULT '0',
  total_unclaimed TEXT NOT NULL DEFAULT '0',
  total_earned_usd NUMERIC(18,2),
  claim_status claim_status NOT NULL DEFAULT 'unclaimed',
  royalty_bps INTEGER,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(creator_id, platform, chain, token_address)
);

-- Individual claim events (historical log)
CREATE TABLE claim_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  platform platform_type NOT NULL,
  chain chain_type NOT NULL,
  token_address TEXT NOT NULL,
  amount TEXT NOT NULL,
  amount_usd NUMERIC(18,2),
  tx_hash TEXT,
  claimed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Token prices cache
CREATE TABLE token_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chain chain_type NOT NULL,
  token_address TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  price_usd NUMERIC(18,8) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(chain, token_address)
);

-- Search log (analytics)
CREATE TABLE search_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  query TEXT NOT NULL,
  provider identity_provider NOT NULL,
  creator_id UUID REFERENCES creators(id),
  ip_hash TEXT,
  searched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_creators_twitter ON creators(twitter_handle) WHERE twitter_handle IS NOT NULL;
CREATE INDEX idx_creators_github ON creators(github_handle) WHERE github_handle IS NOT NULL;
CREATE INDEX idx_wallets_creator ON wallets(creator_id);
CREATE INDEX idx_wallets_address_chain ON wallets(address, chain);
CREATE INDEX idx_creator_tokens_creator ON creator_tokens(creator_id);
CREATE INDEX idx_creator_tokens_platform ON creator_tokens(platform);
CREATE INDEX idx_fee_records_creator ON fee_records(creator_id);
CREATE INDEX idx_fee_records_creator_platform ON fee_records(creator_id, platform);
CREATE INDEX idx_fee_records_last_synced ON fee_records(last_synced_at);
CREATE INDEX idx_claim_events_creator ON claim_events(creator_id);
CREATE INDEX idx_claim_events_claimed_at ON claim_events(claimed_at DESC);
CREATE INDEX idx_token_prices_chain_address ON token_prices(chain, token_address);
CREATE INDEX idx_search_log_searched_at ON search_log(searched_at DESC);

-- Row Level Security (public read)
ALTER TABLE creators ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read creators" ON creators FOR SELECT USING (true);
CREATE POLICY "Public read wallets" ON wallets FOR SELECT USING (true);
CREATE POLICY "Public read creator_tokens" ON creator_tokens FOR SELECT USING (true);
CREATE POLICY "Public read fee_records" ON fee_records FOR SELECT USING (true);
CREATE POLICY "Public read claim_events" ON claim_events FOR SELECT USING (true);
CREATE POLICY "Public read token_prices" ON token_prices FOR SELECT USING (true);
CREATE POLICY "Service write search_log" ON search_log FOR INSERT WITH CHECK (true);

-- Aggregate view for quick profile lookups
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
  SUM(CASE WHEN fr.claim_status = 'unclaimed' THEN 1 ELSE 0 END) > 0 AS has_unclaimed,
  MAX(fr.last_synced_at) AS last_synced_at
FROM creators c
JOIN fee_records fr ON fr.creator_id = c.id
GROUP BY c.id, c.twitter_handle, c.github_handle, c.display_name, fr.platform, fr.chain;
