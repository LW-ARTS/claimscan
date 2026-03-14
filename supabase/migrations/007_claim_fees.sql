-- Fee tracking for ClaimScan service fee (0.85%)
CREATE TABLE claim_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  tx_signature TEXT NOT NULL UNIQUE,
  fee_lamports TEXT NOT NULL CHECK (fee_lamports ~ '^\d+$' AND fee_lamports::numeric > 0 AND fee_lamports::numeric <= 500000000000),
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_claim_fees_wallet ON claim_fees(wallet_address);
CREATE INDEX idx_claim_fees_verified ON claim_fees(verified) WHERE verified = false;

ALTER TABLE claim_fees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service full access" ON claim_fees
  FOR ALL TO service_role USING (true) WITH CHECK (true);
