-- Composite index for bot's CA fast-path lookup (replaces single-column index)
DROP INDEX IF EXISTS idx_fee_records_token_address;
CREATE INDEX IF NOT EXISTS idx_fee_records_token_address_chain
  ON fee_records(token_address, chain);

-- Index for /stats command and group-level queries
CREATE INDEX IF NOT EXISTS idx_group_watches_group_id
  ON group_watches(group_id);
