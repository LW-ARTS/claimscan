-- Prevent duplicate active claims for the same wallet+token pair.
-- Without this, two concurrent POST /api/claim/bags requests can insert
-- duplicate claim_attempts rows, leading to double-claim attempts.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_claim_attempts_active
  ON claim_attempts (wallet_address, token_address)
  WHERE status IN ('pending', 'signing', 'submitted');
