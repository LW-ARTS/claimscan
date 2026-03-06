-- Audit fixes migration
-- Addresses: missing DELETE policies, search_log INSERT policy, updated_at trigger

-- ═══════════════════════════════════════════════
-- 1. Fix search_log INSERT policy — restrict to service_role only
-- ═══════════════════════════════════════════════
-- The original policy "Service write search_log" uses WITH CHECK (true),
-- which allows ANY role (including anon) to insert. Since search_log
-- contains analytics data, only the service_role should write to it.
DROP POLICY IF EXISTS "Service write search_log" ON search_log;
CREATE POLICY "Service write search_log"
  ON search_log FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════
-- 2. Add DELETE policies for cron cleanup operations
-- ═══════════════════════════════════════════════
-- The cleanup cron (api/cron/cleanup) deletes from search_log, creators,
-- and token_prices using the service_role key. Without explicit DELETE
-- policies, this only works because service_role bypasses RLS by default.
-- Adding explicit policies ensures correctness if RLS enforcement changes.

CREATE POLICY "Service delete search_log"
  ON search_log FOR DELETE
  USING (auth.role() = 'service_role');

CREATE POLICY "Service delete creators"
  ON creators FOR DELETE
  USING (auth.role() = 'service_role');

CREATE POLICY "Service delete token_prices"
  ON token_prices FOR DELETE
  USING (auth.role() = 'service_role');

-- Also add DELETE policies for tables with CASCADE that might need explicit cleanup
CREATE POLICY "Service delete wallets"
  ON wallets FOR DELETE
  USING (auth.role() = 'service_role');

CREATE POLICY "Service delete fee_records"
  ON fee_records FOR DELETE
  USING (auth.role() = 'service_role');

CREATE POLICY "Service delete creator_tokens"
  ON creator_tokens FOR DELETE
  USING (auth.role() = 'service_role');

CREATE POLICY "Service delete claim_events"
  ON claim_events FOR DELETE
  USING (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════
-- 3. Auto-update updated_at on creators table
-- ═══════════════════════════════════════════════
-- Without this trigger, creators.updated_at only updates when explicitly set
-- in application code. This ensures it auto-updates on any row modification.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_creators_updated_at
  BEFORE UPDATE ON creators
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════
-- 4. Add index for creators.updated_at (used by index-fees cron)
-- ═══════════════════════════════════════════════
-- The cron queries `WHERE updated_at < ? ORDER BY updated_at ASC LIMIT 20`.
-- Without an index, this requires a full table scan.
CREATE INDEX IF NOT EXISTS idx_creators_updated_at
  ON creators(updated_at ASC);

-- ═══════════════════════════════════════════════
-- 5. Add index for search_log cleanup
-- ═══════════════════════════════════════════════
-- The cleanup cron deletes search_log entries older than 30 days using
-- `WHERE searched_at < ?`. The existing DESC index is suboptimal for this.
CREATE INDEX IF NOT EXISTS idx_search_log_searched_at_asc
  ON search_log(searched_at ASC);
