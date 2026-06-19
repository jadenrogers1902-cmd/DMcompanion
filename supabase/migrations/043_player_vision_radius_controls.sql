-- DM-controlled player vision radius for automatic movement reveals.
-- The value is stored per live map in feet and converted to map pixels inside
-- move_token, preserving the existing grid scale behavior.

ALTER TABLE maps
  ADD COLUMN IF NOT EXISTS player_vision_radius_feet INTEGER NOT NULL DEFAULT 7;

UPDATE maps
  SET player_vision_radius_feet = GREATEST(0, LEAST(300, COALESCE(player_vision_radius_feet, 7)));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'maps_player_vision_radius_feet_check'
  ) THEN
    ALTER TABLE maps
      ADD CONSTRAINT maps_player_vision_radius_feet_check
      CHECK (player_vision_radius_feet >= 0 AND player_vision_radius_feet <= 300);
  END IF;
END $$;

DROP FUNCTION IF EXISTS set_map_travel_options(UUID, TEXT, BOOLEAN, BOOLEAN, BOOLEAN);

CREATE OR REPLACE FUNCTION set_map_travel_options(
  p_map_id UUID,
  p_travel_mode TEXT DEFAULT NULL,
  p_party_options_locked BOOLEAN DEFAULT NULL,
  p_group_movement_unlimited BOOLEAN DEFAULT NULL,
  p_freeroam_movement_unlimited BOOLEAN DEFAULT NULL,
  p_player_vision_radius_feet INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  m maps;
  caller_is_dm BOOLEAN;
BEGIN
  SELECT * INTO m FROM maps WHERE id = p_map_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Map not found');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM campaign_members
    WHERE campaign_id = m.campaign_id AND user_id = auth.uid() AND role = 'dm'
  ) INTO caller_is_dm;

  IF NOT caller_is_dm AND m.party_options_locked THEN
    RETURN jsonb_build_object('error', 'Party options are locked by the DM');
  END IF;
  IF NOT caller_is_dm AND p_party_options_locked IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Only the DM can lock party options');
  END IF;
  IF NOT caller_is_dm AND p_player_vision_radius_feet IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Only the DM can adjust player vision radius');
  END IF;
  IF NOT caller_is_dm AND p_travel_mode = 'combat' THEN
    RETURN jsonb_build_object('error', 'Only the DM can start combat mode');
  END IF;

  UPDATE maps
    SET travel_mode = COALESCE(p_travel_mode, travel_mode),
        party_options_locked = CASE
          WHEN p_travel_mode = 'combat' THEN TRUE
          WHEN caller_is_dm AND p_travel_mode IN ('group_party', 'freeroam') AND travel_mode = 'combat' THEN FALSE
          ELSE COALESCE(p_party_options_locked, party_options_locked)
        END,
        player_movement_locked = CASE
          WHEN p_travel_mode = 'combat' THEN TRUE
          WHEN caller_is_dm AND p_travel_mode IN ('group_party', 'freeroam') AND travel_mode = 'combat' THEN FALSE
          ELSE player_movement_locked
        END,
        group_movement_unlimited = COALESCE(p_group_movement_unlimited, group_movement_unlimited),
        freeroam_movement_unlimited = COALESCE(p_freeroam_movement_unlimited, freeroam_movement_unlimited),
        player_vision_radius_feet = CASE
          WHEN caller_is_dm AND p_player_vision_radius_feet IS NOT NULL
            THEN GREATEST(0, LEAST(300, p_player_vision_radius_feet))
          ELSE player_vision_radius_feet
        END
    WHERE id = p_map_id;

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

DO $$
DECLARE
  fn TEXT;
BEGIN
  SELECT pg_get_functiondef('move_token(uuid,double precision,double precision)'::regprocedure)
    INTO fn;

  fn := REPLACE(
    fn,
    'reveal_radius := (7.0 / scale) * gsize;',
    'reveal_radius := (GREATEST(COALESCE(m.player_vision_radius_feet, 7), 0)::DOUBLE PRECISION / scale) * gsize;'
  );

  fn := REPLACE(
    fn,
    'reveal_radius := (15.0 / scale) * gsize;',
    'reveal_radius := (GREATEST(COALESCE(m.player_vision_radius_feet, 7), 0)::DOUBLE PRECISION / scale) * gsize;'
  );

  EXECUTE fn;
END $$;
