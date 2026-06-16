-- ============================================================
-- DnD Companion App — Phase 9: Live Map Visibility & Interactable Objects
-- Run this AFTER 007_story_tools.sql
--
-- Adds:
--   - Expanded token_type vocabulary (interactable object types)
--   - tokens.interactable / object_state / public_description
--   - map_revealed_areas (DM-controlled fog/reveal layer: full map,
--     rectangles, circles)
-- Reuses the existing tokens + action_intents infrastructure for
-- interactable objects and interaction requests (they already carry
-- visibility, available_actions, interaction_range_feet, dm notes,
-- and a full request/response/status workflow).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- TOKENS: widen the type vocabulary to cover interactable objects
-- ────────────────────────────────────────────────────────────
ALTER TABLE tokens DROP CONSTRAINT IF EXISTS tokens_token_type_check;
ALTER TABLE tokens ADD CONSTRAINT tokens_token_type_check
  CHECK (token_type IN (
    'player', 'npc', 'enemy', 'object', 'trap', 'door',
    'chest', 'book', 'note', 'loot', 'lever', 'switch',
    'portal', 'key', 'container', 'custom'
  ));

ALTER TABLE tokens
  -- Whether players are allowed to submit interaction requests for this
  -- token at all (independent from visibility — a visible decoration can
  -- be non-interactable; a hidden trap is never interactable by players
  -- because it's never returned to them in the first place).
  ADD COLUMN IF NOT EXISTS interactable BOOLEAN NOT NULL DEFAULT FALSE,
  -- Free-form DM-controlled state label, e.g. locked / unlocked / open /
  -- closed / trapped / disarmed / activated / disabled / looted / broken.
  ADD COLUMN IF NOT EXISTS object_state TEXT,
  -- Player-visible flavor text shown alongside the token (separate from
  -- the DM-only `dm_notes`, which lives in token_dm_notes).
  ADD COLUMN IF NOT EXISTS public_description TEXT;

-- Player tokens are interactable (Talk/Inspect/Help) by convention; objects
-- default to not-interactable until the DM opts in. Keep existing rows sane:
UPDATE tokens SET interactable = TRUE
  WHERE token_type IN ('player', 'npc', 'enemy', 'door', 'trap')
    AND interactable = FALSE;

-- ────────────────────────────────────────────────────────────
-- MAP REVEALED AREAS — first-version fog/reveal layer.
-- A map with zero rows is treated as "fully hidden" for players unless
-- the DM adds a full-map reveal row. DM rows are always visible to the DM
-- (so they can see and manage hidden regions); players only ever receive
-- rows with visible_to_players = TRUE.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS map_revealed_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  shape_type TEXT NOT NULL DEFAULT 'rectangle'
    CHECK (shape_type IN ('full', 'rectangle', 'circle')),
  x DOUBLE PRECISION NOT NULL DEFAULT 0,
  y DOUBLE PRECISION NOT NULL DEFAULT 0,
  width DOUBLE PRECISION,
  height DOUBLE PRECISION,
  radius DOUBLE PRECISION,
  visible_to_players BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS map_revealed_areas_map_idx ON map_revealed_areas(map_id);
CREATE INDEX IF NOT EXISTS map_revealed_areas_campaign_idx ON map_revealed_areas(campaign_id);
ALTER TABLE map_revealed_areas ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER map_revealed_areas_updated_at
  BEFORE UPDATE ON map_revealed_areas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- SELECT: DM sees every area (including hidden/"clear" markers so they can
-- manage them); players see only areas marked visible to players, and only
-- on the campaign's currently-active map.
CREATE POLICY "map_revealed_areas_select"
  ON map_revealed_areas FOR SELECT
  TO authenticated
  USING (
    is_campaign_dm(campaign_id)
    OR (
      is_campaign_member(campaign_id)
      AND visible_to_players = TRUE
      AND EXISTS (
        SELECT 1 FROM maps m
        WHERE m.id = map_revealed_areas.map_id AND m.is_active = TRUE
      )
    )
  );

CREATE POLICY "map_revealed_areas_insert_dm"
  ON map_revealed_areas FOR INSERT
  TO authenticated
  WITH CHECK (is_campaign_dm(campaign_id) AND created_by = auth.uid());

CREATE POLICY "map_revealed_areas_update_dm"
  ON map_revealed_areas FOR UPDATE
  TO authenticated
  USING (is_campaign_dm(campaign_id))
  WITH CHECK (is_campaign_dm(campaign_id));

CREATE POLICY "map_revealed_areas_delete_dm"
  ON map_revealed_areas FOR DELETE
  TO authenticated
  USING (is_campaign_dm(campaign_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE map_revealed_areas TO authenticated;

-- ────────────────────────────────────────────────────────────
-- REALTIME: publish map_revealed_areas so player views update live when
-- the DM reveals/hides/clears regions. No DM-only columns on this table.
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'map_revealed_areas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE map_revealed_areas;
  END IF;
END $$;

ALTER TABLE map_revealed_areas REPLICA IDENTITY FULL;

-- ────────────────────────────────────────────────────────────
-- Players may cancel their own pending action intents (spec: "DM views
-- update live when a player ... cancels an interaction if allowed").
-- DM-only update policy already exists; add a narrow actor policy that
-- only permits moving a row from 'pending' to 'cancelled', and only the
-- actor's own row, never resolving/approving/denying it themselves.
-- ────────────────────────────────────────────────────────────
ALTER TABLE action_intents DROP CONSTRAINT IF EXISTS action_intents_status_check;
ALTER TABLE action_intents ADD CONSTRAINT action_intents_status_check
  CHECK (status IN ('pending', 'approved', 'denied', 'needs_roll', 'resolved', 'cancelled'));

CREATE POLICY "action_intents_cancel_actor"
  ON action_intents FOR UPDATE
  TO authenticated
  USING (actor_user_id = auth.uid() AND status = 'pending')
  WITH CHECK (actor_user_id = auth.uid() AND status = 'cancelled');
