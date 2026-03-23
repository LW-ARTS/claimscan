-- Composite indexes for query performance
-- fee_records: checkCache freshness check (max(last_synced_at) per creator)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fee_records_creator_synced
  ON fee_records (creator_id, last_synced_at DESC);

-- claim_events: per-creator claim history sorted by date
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_claim_events_creator_claimed
  ON claim_events (creator_id, claimed_at DESC);

-- search_log: stale log linking (query + provider + creator_id IS NULL + searched_at)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_search_log_linking
  ON search_log (query, provider, searched_at DESC)
  WHERE creator_id IS NULL;
