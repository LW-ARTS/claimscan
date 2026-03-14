-- M4: Remove dead creator_id column (never populated by claim flow)
ALTER TABLE claim_attempts DROP COLUMN IF EXISTS creator_id;

-- M5: Auto-update updated_at on any UPDATE (prevents stale timestamps)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER claim_attempts_set_updated_at
  BEFORE UPDATE ON claim_attempts
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
