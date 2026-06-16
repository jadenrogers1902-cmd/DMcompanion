-- ============================================================
-- DnD Companion App — Phase 4: Live Movement & DM Controls
-- Run this AFTER 003_maps.sql
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- NEW FIELDS
-- ────────────────────────────────────────────────────────────
ALTER TABLE maps
  ADD COLUMN IF NOT EXISTS player_movement_locked BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE tokens
  ADD COLUMN IF NOT EXISTS movement_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS movement_used DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS movement_override_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_x DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_y DOUBLE PRECISION;

-- ────────────────────────────────────────────────────────────
-- PRIVACY FIX: move dm_notes OUT of tokens.
-- Realtime broadcasts the full row (RLS filters rows, not columns), so a
-- player subscribed to `tokens` would receive dm_notes over the websocket.
-- Storing DM notes in a separate, NON-published, DM-only table guarantees
-- they never reach a player's client.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS token_dm_notes (
  token_id UUID PRIMARY KEY REFERENCES tokens(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  content TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Migrate any existing notes, then drop the column from tokens.
INSERT INTO token_dm_notes (token_id, campaign_id, content)
  SELECT id, campaign_id, dm_notes FROM tokens WHERE dm_notes IS NOT NULL
  ON CONFLICT (token_id) DO NOTHING;

ALTER TABLE tokens DROP COLUMN IF EXISTS dm_notes;

ALTER TABLE token_dm_notes ENABLE ROW LEVEL SECURITY;

-- DM-only, full access. (Not added to the realtime publication.)
CREATE POLICY "token_dm_notes_all"
  ON token_dm_notes FOR ALL
  TO authenticated
  USING (is_campaign_dm(campaign_id))
  WITH CHECK (is_campaign_dm(campaign_id));

-- ────────────────────────────────────────────────────────────
-- REALTIME: publish tokens + maps so clients get live updates.
-- RLS still applies per-subscriber, so players only receive rows
-- they are allowed to see. tokens now contains NO DM-only columns.
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'tokens'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tokens;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'maps'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE maps;
  END IF;
END $$;

-- Ensure UPDATE events carry the full row for filtering/diffing.
ALTER TABLE tokens REPLICA IDENTITY FULL;
ALTER TABLE maps REPLICA IDENTITY FULL;

-- ────────────────────────────────────────────────────────────
-- PLAYER MOVE RPC (SECURITY DEFINER)
-- Players never get a direct UPDATE grant on tokens. This function
-- validates control + locks + speed, then updates ONLY position fields.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION move_token(
  p_token_id UUID,
  p_x DOUBLE PRECISION,
  p_y DOUBLE PRECISION
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  t tokens;
  m maps;
  spd INTEGER;
  gsize INTEGER;
  scale INTEGER;
  anchor_x DOUBLE PRECISION;
  anchor_y DOUBLE PRECISION;
  dist_squares INTEGER;
  dist_feet INTEGER;
BEGIN
  SELECT * INTO t FROM tokens WHERE id = p_token_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Token not found');
  END IF;

  -- Must control this token
  IF t.controlled_by_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('error', 'You do not control this token');
  END IF;

  SELECT * INTO m FROM maps WHERE id = t.map_id;

  -- Locks
  IF m.player_movement_locked THEN
    RETURN jsonb_build_object('error', 'Movement is locked by the DM');
  END IF;
  IF t.movement_locked THEN
    RETURN jsonb_build_object('error', 'This token is locked by the DM');
  END IF;

  gsize := GREATEST(m.grid_size, 1);
  scale := GREATEST(m.grid_scale_feet, 1);

  -- Establish the round anchor on first move since the last reset
  IF t.last_x IS NULL OR t.last_y IS NULL THEN
    anchor_x := t.x;
    anchor_y := t.y;
    UPDATE tokens SET last_x = t.x, last_y = t.y WHERE id = p_token_id;
  ELSE
    anchor_x := t.last_x;
    anchor_y := t.last_y;
  END IF;

  -- Chebyshev distance in squares → feet
  dist_squares := ROUND(
    GREATEST(ABS(p_x - anchor_x), ABS(p_y - anchor_y)) / gsize
  );
  dist_feet := dist_squares * scale;

  -- Speed limit from the linked character (if any)
  spd := NULL;
  IF t.linked_character_id IS NOT NULL THEN
    SELECT speed INTO spd FROM characters WHERE id = t.linked_character_id;
  END IF;

  IF spd IS NOT NULL AND NOT t.movement_override_allowed AND dist_feet > spd THEN
    RETURN jsonb_build_object(
      'error', format('Too far — %s ft from start, but speed is %s ft.', dist_feet, spd),
      'max_feet', spd,
      'attempted_feet', dist_feet
    );
  END IF;

  UPDATE tokens
    SET x = p_x, y = p_y, movement_used = dist_feet
    WHERE id = p_token_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'x', p_x,
    'y', p_y,
    'movement_used', dist_feet
  );
END;
$$;
