-- Security hardening migration
-- Adds missing constraints, RLS write policies, and restricts search_log reads.

-- ═══════════════════════════════════════════════
-- 1. Farcaster handle unique constraint
-- ═══════════════════════════════════════════════
-- Without this, the app-level upsert on farcaster_handle doesn't deduplicate
-- and can create duplicate creators for the same Farcaster user.
ALTER TABLE creators
  ADD CONSTRAINT creators_farcaster_handle_unique UNIQUE (farcaster_handle);

-- Partial index for farcaster handle lookups (matches twitter/github pattern)
CREATE INDEX IF NOT EXISTS idx_creators_farcaster
  ON creators(farcaster_handle) WHERE farcaster_handle IS NOT NULL;

-- ═══════════════════════════════════════════════
-- 2. RLS write policies for service role
-- ═══════════════════════════════════════════════
-- The initial schema only defined SELECT (read) policies.
-- Without explicit INSERT/UPDATE/DELETE policies, the service_role key
-- still bypasses RLS, but the anon key cannot write — which is correct.
-- These policies ensure that if RLS is enforced for service_role in the
-- future (e.g. via ALTER ROLE), writes still work for authenticated service calls.

-- creators
CREATE POLICY "Service write creators"
  ON creators FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service update creators"
  ON creators FOR UPDATE
  USING (auth.role() = 'service_role');

-- wallets
CREATE POLICY "Service write wallets"
  ON wallets FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service update wallets"
  ON wallets FOR UPDATE
  USING (auth.role() = 'service_role');

-- creator_tokens
CREATE POLICY "Service write creator_tokens"
  ON creator_tokens FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service update creator_tokens"
  ON creator_tokens FOR UPDATE
  USING (auth.role() = 'service_role');

-- fee_records
CREATE POLICY "Service write fee_records"
  ON fee_records FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service update fee_records"
  ON fee_records FOR UPDATE
  USING (auth.role() = 'service_role');

-- claim_events
CREATE POLICY "Service write claim_events"
  ON claim_events FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- token_prices
CREATE POLICY "Service write token_prices"
  ON token_prices FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service update token_prices"
  ON token_prices FOR UPDATE
  USING (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════
-- 3. Restrict search_log reads
-- ═══════════════════════════════════════════════
-- search_log contains IP hashes and search queries — it should not be
-- readable via the anon key. Only service_role should read analytics data.
CREATE POLICY "Service read search_log"
  ON search_log FOR SELECT
  USING (auth.role() = 'service_role');
