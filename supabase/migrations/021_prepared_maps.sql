-- ============================================================
-- DnD Companion App - Adventure Maker Phase 4 (Prepared Maps)
-- Premade encounter scenes inside chapters: background image,
-- grid settings, pre-placed token layout, DM notes, and links.
-- Token/note/link collections are JSONB on the row — prep data
-- is DM-only and single-editor, so it needs no realtime
-- per-token sync or per-row RLS like the live tables.
-- Images reuse the private 'maps' storage bucket and its
-- {campaign_id}/... path convention (DM-only writes).
-- Run this AFTER 020_adventure_chapters.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS prepared_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adventure_id UUID NOT NULL REFERENCES adventures(id) ON DELETE CASCADE,
  chapter_id UUID NOT NULL REFERENCES adventure_chapters(id) ON DELETE CASCADE,
  -- Denormalized so RLS can use is_campaign_dm without a join.
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  storage_path TEXT,                       -- path within the 'maps' bucket; NULL until an image is added
  width INTEGER NOT NULL DEFAULT 0,        -- natural image width (px)
  height INTEGER NOT NULL DEFAULT 0,       -- natural image height (px)
  grid_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  grid_size INTEGER NOT NULL DEFAULT 50,   -- pixels per square
  tokens JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  links JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prepared_maps_adventure_idx ON prepared_maps(adventure_id);
CREATE INDEX IF NOT EXISTS prepared_maps_chapter_idx ON prepared_maps(chapter_id);
CREATE INDEX IF NOT EXISTS prepared_maps_campaign_idx ON prepared_maps(campaign_id);

DROP TRIGGER IF EXISTS prepared_maps_updated_at ON prepared_maps;
CREATE TRIGGER prepared_maps_updated_at
  BEFORE UPDATE ON prepared_maps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE prepared_maps ENABLE ROW LEVEL SECURITY;

-- DM-only: prepared scenes hold unrevealed encounters and DM notes.
DROP POLICY IF EXISTS "prepared_maps_dm_all" ON prepared_maps;
CREATE POLICY "prepared_maps_dm_all"
  ON prepared_maps FOR ALL
  TO authenticated
  USING (is_campaign_dm(campaign_id))
  WITH CHECK (is_campaign_dm(campaign_id));

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE prepared_maps
TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'prepared_maps'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE prepared_maps';
  END IF;

  EXECUTE 'ALTER TABLE prepared_maps REPLICA IDENTITY FULL';
END $$;
