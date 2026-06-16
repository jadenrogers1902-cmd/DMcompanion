-- ============================================================
-- DnD Companion App - Adventure Maker Phase 2 (Adventure shell)
-- Prepared adventures the DM authors before a session. DM-only:
-- prep content is hidden data and must never reach players.
-- Run this AFTER 018_action_intent_selected_tool.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS adventures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS adventures_campaign_idx ON adventures(campaign_id);

DROP TRIGGER IF EXISTS adventures_updated_at ON adventures;
CREATE TRIGGER adventures_updated_at
  BEFORE UPDATE ON adventures
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE adventures ENABLE ROW LEVEL SECURITY;

-- DM-only in every direction: adventures are session prep (notes, planned
-- encounters, unrevealed maps) — players must not read or write them.
DROP POLICY IF EXISTS "adventures_dm_all" ON adventures;
CREATE POLICY "adventures_dm_all"
  ON adventures FOR ALL
  TO authenticated
  USING (is_campaign_dm(campaign_id))
  WITH CHECK (is_campaign_dm(campaign_id));

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE adventures
TO authenticated;

-- Realtime so a DM's other open tabs/devices refresh without manual reload
-- (RLS keeps players from receiving any rows).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'adventures'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE adventures';
  END IF;

  EXECUTE 'ALTER TABLE adventures REPLICA IDENTITY FULL';
END $$;
