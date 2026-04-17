-- 030: Watch rules for Telegram bot — notify chat on ANY claim by a specific creator
-- Sibling of alert_rules (threshold-based); watch_rules fires on every claim, no threshold

CREATE TABLE IF NOT EXISTS watch_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  last_notified_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(chat_id, creator_id)
);

CREATE INDEX IF NOT EXISTS idx_watch_rules_active ON watch_rules(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_watch_rules_creator ON watch_rules(creator_id) WHERE active = true;

ALTER TABLE watch_rules ENABLE ROW LEVEL SECURITY;
