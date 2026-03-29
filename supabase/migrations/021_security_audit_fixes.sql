-- Migration 021: Security audit fixes
-- L6: farcaster_fid UNIQUE constraint (prevents split identity records)
-- L10: claim_events explicit UPDATE policy (defense-in-depth)

-- L6: farcaster_fid should be unique — it's the canonical immutable Farcaster identity.
-- Two creators sharing the same FID would cause split identity records.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_creators_farcaster_fid
  ON creators (farcaster_fid)
  WHERE farcaster_fid IS NOT NULL;

-- L10: claim_events has INSERT and DELETE policies for service_role,
-- but no explicit UPDATE policy. While service_role bypasses RLS,
-- adding an explicit policy completes the defense-in-depth pattern
-- consistent with all other tables.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'claim_events' AND policyname = 'claim_events_update_service'
  ) THEN
    CREATE POLICY claim_events_update_service ON claim_events
      FOR UPDATE TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
