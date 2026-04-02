-- 022: Pump.fun Fee Model (cashback coins, fee sharing, lock status)
-- Additive-only migration. Zero risk to existing data.

-- Add fee type and lock status to fee_records
ALTER TABLE fee_records ADD COLUMN IF NOT EXISTS fee_type TEXT DEFAULT 'creator'
  CHECK (fee_type IN ('creator', 'cashback'));
ALTER TABLE fee_records ADD COLUMN IF NOT EXISTS fee_locked BOOLEAN DEFAULT false;

-- Fee recipients table (Pump.fun fee splits up to 10 wallets)
CREATE TABLE IF NOT EXISTS fee_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_record_id UUID NOT NULL REFERENCES fee_records(id) ON DELETE CASCADE,
  recipient_address TEXT NOT NULL,
  share_bps INTEGER NOT NULL CHECK (share_bps > 0 AND share_bps <= 10000),
  unclaimed TEXT DEFAULT '0',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(fee_record_id, recipient_address)
);

CREATE INDEX IF NOT EXISTS idx_fee_recipients_record ON fee_recipients(fee_record_id);

-- RLS: public read (matches fee_records policy)
ALTER TABLE fee_recipients ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'fee_recipients' AND policyname = 'Public read fee_recipients'
  ) THEN
    CREATE POLICY "Public read fee_recipients" ON fee_recipients FOR SELECT USING (true);
  END IF;
END $$;
