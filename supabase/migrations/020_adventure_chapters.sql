-- ============================================================
-- DnD Companion App - Adventure Maker Phase 3 (Chapters)
-- Major sections inside a prepared adventure (e.g. "Session 1",
-- "Dungeon Entrance", "Final Encounter"). DM-only prep data.
-- Run this AFTER 019_adventures.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS adventure_chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adventure_id UUID NOT NULL REFERENCES adventures(id) ON DELETE CASCADE,
  -- Denormalized so RLS can use is_campaign_dm without a join.
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS adventure_chapters_adventure_idx ON adventure_chapters(adventure_id);
CREATE INDEX IF NOT EXISTS adventure_chapters_campaign_idx ON adventure_chapters(campaign_id);

DROP TRIGGER IF EXISTS adventure_chapters_updated_at ON adventure_chapters;
CREATE TRIGGER adventure_chapters_updated_at
  BEFORE UPDATE ON adventure_chapters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE adventure_chapters ENABLE ROW LEVEL SECURITY;

-- DM-only, same reasoning as adventures: chapter prep must never reach players.
DROP POLICY IF EXISTS "adventure_chapters_dm_all" ON adventure_chapters;
CREATE POLICY "adventure_chapters_dm_all"
  ON adventure_chapters FOR ALL
  TO authenticated
  USING (is_campaign_dm(campaign_id))
  WITH CHECK (is_campaign_dm(campaign_id));

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE adventure_chapters
TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'adventure_chapters'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE adventure_chapters';
  END IF;

  EXECUTE 'ALTER TABLE adventure_chapters REPLICA IDENTITY FULL';
END $$;
