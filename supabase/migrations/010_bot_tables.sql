-- ClaimScan Telegram Bot — watched tokens, group watches, notification log

-- Tokens being monitored for claim updates
CREATE TABLE IF NOT EXISTS watched_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address text NOT NULL,
  chain text NOT NULL CHECK (chain IN ('sol', 'base', 'eth')),
  platform text NOT NULL,
  creator_id uuid REFERENCES creators(id),
  fee_recipient_address text,
  snapshot_earned text NOT NULL DEFAULT '0' CHECK (snapshot_earned ~ '^\d+$'),
  snapshot_claimed text NOT NULL DEFAULT '0' CHECK (snapshot_claimed ~ '^\d+$'),
  snapshot_unclaimed text NOT NULL DEFAULT '0' CHECK (snapshot_unclaimed ~ '^\d+$'),
  snapshot_earned_usd NUMERIC(18,2),
  last_checked_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(token_address, chain)
);

-- Which groups are watching which tokens
CREATE TABLE IF NOT EXISTS group_watches (
  group_id bigint NOT NULL,
  token_id uuid NOT NULL REFERENCES watched_tokens(id) ON DELETE CASCADE,
  message_id bigint,
  added_at timestamptz DEFAULT now(),
  PRIMARY KEY (group_id, token_id)
);

-- Notification history
CREATE TABLE IF NOT EXISTS notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id bigint NOT NULL,
  token_address text NOT NULL,
  notification_type text NOT NULL CHECK (notification_type IN ('scan_result', 'claim_detected')),
  sent_at timestamptz DEFAULT now()
);

-- Indexes for watched_tokens
CREATE INDEX IF NOT EXISTS idx_watched_tokens_unclaimed
  ON watched_tokens(snapshot_unclaimed) WHERE snapshot_unclaimed != '0';

-- Indexes for group_watches
CREATE INDEX IF NOT EXISTS idx_group_watches_token ON group_watches(token_id);

-- Indexes for notification_log
CREATE INDEX IF NOT EXISTS idx_notification_log_group_token
  ON notification_log(group_id, token_address);
CREATE INDEX IF NOT EXISTS idx_notification_log_sent_at
  ON notification_log(sent_at DESC);

-- Index on existing fee_records table for CA fast-path lookup
CREATE INDEX IF NOT EXISTS idx_fee_records_token_address
  ON fee_records(token_address);

-- RLS: service role has full access (bot uses service role key)
ALTER TABLE watched_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_watches ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON watched_tokens
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON group_watches
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Service role full access" ON notification_log
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
