-- 031: Group settings for Telegram bot — per-group digest opt-in
-- Unlocks /digest on [HH] command, posted by worker at the chosen UTC hour

CREATE TABLE IF NOT EXISTS group_settings (
  group_id BIGINT PRIMARY KEY,
  digest_enabled BOOLEAN NOT NULL DEFAULT false,
  digest_hour_utc SMALLINT NOT NULL DEFAULT 12 CHECK (digest_hour_utc >= 0 AND digest_hour_utc <= 23),
  last_digest_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_settings_digest
  ON group_settings(digest_hour_utc)
  WHERE digest_enabled = true;

ALTER TABLE group_settings ENABLE ROW LEVEL SECURITY;
