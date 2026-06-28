-- Add wall-crossing enforcement to move_token.
--
-- Copies the full function body from 054 and adds a movement_crosses_wall()
-- check in each travel-mode branch, after distance validation and before the
-- UPDATE. If the path crosses a wall edge that has no door gap, the move is
-- rejected with a descriptive error.

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
  max_feet INTEGER := 30;
  anchor_x DOUBLE PRECISION;
  anchor_y DOUBLE PRECISION;
  dist_squares INTEGER;
  dist_feet INTEGER;
  reveal_radius DOUBLE PRECISION;
  party map_travel_parties;
  moved_count INTEGER := 0;
  member_record RECORD;
  offset_record RECORD;
  blocked_wall TEXT;
BEGIN
  SELECT * INTO t FROM tokens WHERE id = p_token_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Token not found');
  END IF;

  IF t.controlled_by_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('error', 'You do not control this token');
  END IF;

  SELECT * INTO m FROM maps WHERE id = t.map_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Map not found');
  END IF;

  IF m.player_movement_locked THEN
    RETURN jsonb_build_object('error', 'Movement is locked by the DM');
  END IF;
  IF t.movement_locked THEN
    RETURN jsonb_build_object('error', 'This token is locked by the DM');
  END IF;

  gsize := GREATEST(m.grid_size, 1);
  scale := GREATEST(m.grid_scale_feet, 1);
  reveal_radius := (GREATEST(COALESCE(m.player_vision_radius_feet, 7), 0)::DOUBLE PRECISION / scale) * gsize;

  IF m.travel_mode = 'group_party' THEN
    SELECT p.* INTO party
    FROM map_travel_parties p
    JOIN map_travel_party_members pm ON pm.party_id = p.id
    WHERE p.map_id = m.id
      AND p.status = 'approved'
      AND p.leader_user_id = auth.uid()
      AND pm.user_id = auth.uid()
      AND pm.status = 'accepted'
    ORDER BY p.updated_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'Only an approved party leader can move the group');
    END IF;

    dist_squares := ROUND(GREATEST(ABS(p_x - t.x), ABS(p_y - t.y)) / gsize);
    dist_feet := dist_squares * scale;
    IF NOT m.group_movement_unlimited AND NOT t.movement_override_allowed AND dist_feet > max_feet THEN
      RETURN jsonb_build_object(
        'error', format('Too far - group travel is limited to %s ft.', max_feet),
        'max_feet', max_feet,
        'attempted_feet', dist_feet
      );
    END IF;

    -- Wall check on the leader's path
    blocked_wall := movement_crosses_wall(m.id, t.x, t.y, p_x, p_y);
    IF blocked_wall IS NOT NULL THEN
      RETURN jsonb_build_object('error', format('Path blocked by wall: %s', blocked_wall));
    END IF;

    FOR member_record IN
      SELECT tok.id, tok.x, tok.y
      FROM map_travel_party_members pm
      JOIN tokens tok ON tok.controlled_by_user_id = pm.user_id
      WHERE pm.party_id = party.id
        AND pm.status = 'accepted'
        AND tok.map_id = m.id
        AND tok.visible_to_players = TRUE
        AND tok.token_type = 'player'
        AND tok.movement_locked = FALSE
      ORDER BY CASE WHEN pm.user_id = party.leader_user_id THEN 0 ELSE 1 END, tok.created_at
      LIMIT 16
    LOOP
      SELECT ox, oy INTO offset_record
      FROM (
        VALUES
          (0, 0, 0),
          (0, -1, 1), (1, 0, 2), (0, 1, 3), (-1, 0, 4),
          (1, -1, 5), (1, 1, 6), (-1, 1, 7), (-1, -1, 8),
          (0, -2, 9), (2, 0, 10), (0, 2, 11), (-2, 0, 12),
          (2, -1, 13), (2, 1, 14), (-2, 1, 15), (-2, -1, 16)
      ) AS offsets(ox, oy, rank)
      WHERE rank = moved_count
      LIMIT 1;

      UPDATE tokens
        SET x = p_x + (offset_record.ox * gsize),
            y = p_y + (offset_record.oy * gsize),
            last_x = p_x + (offset_record.ox * gsize),
            last_y = p_y + (offset_record.oy * gsize),
            movement_used = 0
        WHERE id = member_record.id;

      INSERT INTO map_revealed_areas (
        campaign_id, map_id, shape_type, x, y, radius, visible_to_players, created_by
      )
      VALUES (
        m.campaign_id,
        m.id,
        'circle',
        p_x + (offset_record.ox * gsize),
        p_y + (offset_record.oy * gsize),
        reveal_radius,
        TRUE,
        auth.uid()
      );

      moved_count := moved_count + 1;
    END LOOP;

    RETURN jsonb_build_object('ok', TRUE, 'movement_used', 0, 'moved_tokens', moved_count);
  END IF;

  IF m.travel_mode = 'combat' THEN
    IF t.last_x IS NULL OR t.last_y IS NULL THEN
      anchor_x := t.x;
      anchor_y := t.y;
      UPDATE tokens SET last_x = t.x, last_y = t.y WHERE id = p_token_id;
    ELSE
      anchor_x := t.last_x;
      anchor_y := t.last_y;
    END IF;

    dist_squares := ROUND(GREATEST(ABS(p_x - anchor_x), ABS(p_y - anchor_y)) / gsize);
    dist_feet := dist_squares * scale;

    spd := NULL;
    IF t.linked_character_id IS NOT NULL THEN
      SELECT speed INTO spd FROM characters WHERE id = t.linked_character_id;
    END IF;
    spd := COALESCE(spd, max_feet);

    IF NOT t.movement_override_allowed AND dist_feet > spd THEN
      RETURN jsonb_build_object(
        'error', format('Too far - %s ft from start, but speed is %s ft.', dist_feet, spd),
        'max_feet', spd,
        'attempted_feet', dist_feet
      );
    END IF;

    -- Wall check from the round anchor
    blocked_wall := movement_crosses_wall(m.id, anchor_x, anchor_y, p_x, p_y);
    IF blocked_wall IS NOT NULL THEN
      RETURN jsonb_build_object('error', format('Path blocked by wall: %s', blocked_wall));
    END IF;

    UPDATE tokens
      SET x = p_x, y = p_y, movement_used = dist_feet
      WHERE id = p_token_id;

    INSERT INTO map_revealed_areas (
      campaign_id, map_id, shape_type, x, y, radius, visible_to_players, created_by
    )
    VALUES (m.campaign_id, m.id, 'circle', p_x, p_y, reveal_radius, TRUE, auth.uid());

    RETURN jsonb_build_object('ok', TRUE, 'x', p_x, 'y', p_y, 'movement_used', dist_feet);
  END IF;

  -- Freeroam mode
  anchor_x := t.x;
  anchor_y := t.y;
  dist_squares := ROUND(GREATEST(ABS(p_x - anchor_x), ABS(p_y - anchor_y)) / gsize);
  dist_feet := dist_squares * scale;

  IF NOT m.freeroam_movement_unlimited AND NOT t.movement_override_allowed AND dist_feet > max_feet THEN
    RETURN jsonb_build_object(
      'error', format('Too far - freeroam movement is limited to %s ft.', max_feet),
      'max_feet', max_feet,
      'attempted_feet', dist_feet
    );
  END IF;

  -- Wall check from current position
  blocked_wall := movement_crosses_wall(m.id, t.x, t.y, p_x, p_y);
  IF blocked_wall IS NOT NULL THEN
    RETURN jsonb_build_object('error', format('Path blocked by wall: %s', blocked_wall));
  END IF;

  UPDATE tokens
    SET x = p_x, y = p_y, last_x = p_x, last_y = p_y, movement_used = 0
    WHERE id = p_token_id;

  INSERT INTO map_revealed_areas (
    campaign_id, map_id, shape_type, x, y, radius, visible_to_players, created_by
  )
  VALUES (m.campaign_id, m.id, 'circle', p_x, p_y, reveal_radius, TRUE, auth.uid());

  RETURN jsonb_build_object('ok', TRUE, 'x', p_x, 'y', p_y, 'movement_used', 0);
END;
$$;
