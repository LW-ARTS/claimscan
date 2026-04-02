-- 023: Alert rules for Telegram bot threshold notifications

CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  threshold_usd NUMERIC(18,2) NOT NULL CHECK (threshold_usd > 0),
  last_notified_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(chat_id, creator_id)
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_active ON alert_rules(active) WHERE active = true;

-- RLS: service role full access (same as watched_tokens)
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
