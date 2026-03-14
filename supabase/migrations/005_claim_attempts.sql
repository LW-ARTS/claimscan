-- Claim attempts tracking for direct claim functionality
CREATE TABLE claim_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES creators(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  platform platform_type NOT NULL DEFAULT 'bags',
  chain chain_type NOT NULL DEFAULT 'sol',
  token_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','signing','submitted','confirmed','finalized','failed','expired')),
  tx_signature TEXT,
  amount_lamports TEXT,
  error_reason TEXT CHECK (length(error_reason) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lock otimista: only 1 active claim per wallet+token
CREATE UNIQUE INDEX idx_claim_attempts_active
  ON claim_attempts (wallet_address, token_address)
  WHERE status IN ('pending', 'signing', 'submitted');

CREATE INDEX idx_claim_attempts_wallet ON claim_attempts(wallet_address);
CREATE INDEX idx_claim_attempts_status ON claim_attempts(status)
  WHERE status IN ('pending', 'signing', 'submitted');

ALTER TABLE claim_attempts ENABLE ROW LEVEL SECURITY;

-- No public read — claim_attempts contain wallet addresses and should not be
-- enumerable by anonymous users via the Supabase anon key.
-- All access goes through the service role (which bypasses RLS entirely).
-- Explicit TO service_role ensures anon/authenticated roles have zero access.
CREATE POLICY "Service full access" ON claim_attempts
  FOR ALL TO service_role USING (true) WITH CHECK (true);
