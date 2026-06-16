-- ============================================================
-- DnD Companion App — Phase 3: Maps & Tokens
-- Run this AFTER 002_characters.sql
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- STORAGE BUCKET (private) for map images
-- The bucket can alternatively be created via the Supabase dashboard
-- (Storage → New bucket → name "maps", Public = off).
-- ────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('maps', 'maps', false)
ON CONFLICT (id) DO NOTHING;

-- Path convention: maps/{campaign_id}/{uuid}.{ext}
-- The first folder segment is the campaign id, used for access checks.

DROP POLICY IF EXISTS "maps_storage_select" ON storage.objects;
CREATE POLICY "maps_storage_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'maps'
    AND is_campaign_member(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "maps_storage_insert" ON storage.objects;
CREATE POLICY "maps_storage_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'maps'
    AND is_campaign_dm(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "maps_storage_update" ON storage.objects;
CREATE POLICY "maps_storage_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'maps'
    AND is_campaign_dm(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "maps_storage_delete" ON storage.objects;
CREATE POLICY "maps_storage_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'maps'
    AND is_campaign_dm(((storage.foldername(name))[1])::uuid)
  );

-- ────────────────────────────────────────────────────────────
-- MAPS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL,          -- path within the 'maps' bucket
  grid_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  grid_size INTEGER NOT NULL DEFAULT 50,        -- pixels per square
  grid_scale_feet INTEGER NOT NULL DEFAULT 5,   -- feet per square
  width INTEGER NOT NULL DEFAULT 0,             -- natural image width (px)
  height INTEGER NOT NULL DEFAULT 0,            -- natural image height (px)
  is_active BOOLEAN NOT NULL DEFAULT FALSE,     -- the map players currently see
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS maps_campaign_idx ON maps(campaign_id);
ALTER TABLE maps ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER maps_updated_at
  BEFORE UPDATE ON maps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- SELECT: DM sees all maps; players see only the active map
CREATE POLICY "maps_select"
  ON maps FOR SELECT
  TO authenticated
  USING (
    is_campaign_dm(campaign_id)
    OR (is_campaign_member(campaign_id) AND is_active = TRUE)
  );

CREATE POLICY "maps_insert_dm"
  ON maps FOR INSERT
  TO authenticated
  WITH CHECK (is_campaign_dm(campaign_id) AND created_by = auth.uid());

CREATE POLICY "maps_update_dm"
  ON maps FOR UPDATE
  TO authenticated
  USING (is_campaign_dm(campaign_id))
  WITH CHECK (is_campaign_dm(campaign_id));

CREATE POLICY "maps_delete_dm"
  ON maps FOR DELETE
  TO authenticated
  USING (is_campaign_dm(campaign_id));

-- Set one map active and unset the others, atomically (DM only)
CREATE OR REPLACE FUNCTION set_active_map(p_campaign_id UUID, p_map_id UUID)
RETURNS VOID AS $$
BEGIN
  IF NOT is_campaign_dm(p_campaign_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE maps SET is_active = FALSE
    WHERE campaign_id = p_campaign_id AND is_active = TRUE;
  UPDATE maps SET is_active = TRUE
    WHERE id = p_map_id AND campaign_id = p_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- TOKENS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  token_type TEXT NOT NULL DEFAULT 'npc'
    CHECK (token_type IN ('player', 'npc', 'enemy', 'object', 'trap', 'door')),
  name TEXT NOT NULL DEFAULT '',
  x DOUBLE PRECISION NOT NULL DEFAULT 0,   -- center X in image-pixel space
  y DOUBLE PRECISION NOT NULL DEFAULT 0,   -- center Y in image-pixel space
  size DOUBLE PRECISION NOT NULL DEFAULT 1, -- diameter in grid squares
  color TEXT NOT NULL DEFAULT '#6b7280',
  image_url TEXT,                           -- optional custom icon (future)
  visible_to_players BOOLEAN NOT NULL DEFAULT TRUE,
  controlled_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  linked_character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
  notes TEXT,        -- player-visible note
  dm_notes TEXT,     -- DM-only note (never sent to players)
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS tokens_map_idx ON tokens(map_id);
CREATE INDEX IF NOT EXISTS tokens_campaign_idx ON tokens(campaign_id);
ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER tokens_updated_at
  BEFORE UPDATE ON tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- SELECT: DM sees every token; players see only visible tokens.
-- (Players also receive a column-restricted query server-side that omits dm_notes.)
CREATE POLICY "tokens_select"
  ON tokens FOR SELECT
  TO authenticated
  USING (
    is_campaign_dm(campaign_id)
    OR (is_campaign_member(campaign_id) AND visible_to_players = TRUE)
  );

-- Only the DM can create/move/edit/delete tokens in this phase.
CREATE POLICY "tokens_insert_dm"
  ON tokens FOR INSERT
  TO authenticated
  WITH CHECK (is_campaign_dm(campaign_id));

CREATE POLICY "tokens_update_dm"
  ON tokens FOR UPDATE
  TO authenticated
  USING (is_campaign_dm(campaign_id))
  WITH CHECK (is_campaign_dm(campaign_id));

CREATE POLICY "tokens_delete_dm"
  ON tokens FOR DELETE
  TO authenticated
  USING (is_campaign_dm(campaign_id));
