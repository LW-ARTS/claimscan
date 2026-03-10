-- Add unique constraint on tx_hash for claim_events upsert deduplication.
-- Partial index: only applies when tx_hash is not null.
CREATE UNIQUE INDEX IF NOT EXISTS claim_events_tx_hash_unique
ON claim_events (tx_hash) WHERE tx_hash IS NOT NULL;
