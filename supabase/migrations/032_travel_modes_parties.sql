-- Travel modes, party creation, and movement reveal support for live maps.

ALTER TABLE maps
  ADD COLUMN IF NOT EXISTS travel_mode TEXT NOT NULL DEFAULT 'freeroam'
    CHECK (travel_mode IN ('group_party', 'freeroam', 'combat')),
  ADD COLUMN IF NOT EXISTS party_options_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS group_movement_unlimited BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS freeroam_movement_unlimited BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS combat_round INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS map_travel_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Travel Party',
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  leader_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending_dm'
    CHECK (status IN ('pending_dm', 'approved', 'denied', 'disbanded')),
  dm_response TEXT,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS map_travel_party_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id UUID NOT NULL REFERENCES map_travel_parties(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'denied')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (party_id, user_id)
);

CREATE INDEX IF NOT EXISTS map_travel_parties_map_idx ON map_travel_parties(map_id);
CREATE INDEX IF NOT EXISTS map_travel_parties_campaign_idx ON map_travel_parties(campaign_id);
CREATE INDEX IF NOT EXISTS map_travel_party_members_party_idx ON map_travel_party_members(party_id);
CREATE INDEX IF NOT EXISTS map_travel_party_members_user_idx ON map_travel_party_members(user_id);

ALTER TABLE map_travel_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE map_travel_party_members ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS map_travel_parties_updated_at ON map_travel_parties;
CREATE TRIGGER map_travel_parties_updated_at
  BEFORE UPDATE ON map_travel_parties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS map_travel_party_members_updated_at ON map_travel_party_members;
CREATE TRIGGER map_travel_party_members_updated_at
  BEFORE UPDATE ON map_travel_party_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY "map_travel_parties_select"
  ON map_travel_parties FOR SELECT
  TO authenticated
  USING (is_campaign_member(campaign_id));

CREATE POLICY "map_travel_parties_insert_member"
  ON map_travel_parties FOR INSERT
  TO authenticated
  WITH CHECK (is_campaign_member(campaign_id) AND created_by = auth.uid());

CREATE POLICY "map_travel_parties_update_dm"
  ON map_travel_parties FOR UPDATE
  TO authenticated
  USING (is_campaign_dm(campaign_id))
  WITH CHECK (is_campaign_dm(campaign_id));

CREATE POLICY "map_travel_party_members_select"
  ON map_travel_party_members FOR SELECT
  TO authenticated
  USING (is_campaign_member(campaign_id));

CREATE POLICY "map_travel_party_members_insert_creator"
  ON map_travel_party_members FOR INSERT
  TO authenticated
  WITH CHECK (
    is_campaign_member(campaign_id)
    AND EXISTS (
      SELECT 1 FROM map_travel_parties p
      WHERE p.id = party_id AND p.created_by = auth.uid()
    )
  );

CREATE POLICY "map_travel_party_members_update_self_or_dm"
  ON map_travel_party_members FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR is_campaign_dm(campaign_id))
  WITH CHECK (user_id = auth.uid() OR is_campaign_dm(campaign_id));

GRANT SELECT, INSERT, UPDATE ON TABLE map_travel_parties TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE map_travel_party_members TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'map_travel_parties'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE map_travel_parties;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'map_travel_party_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE map_travel_party_members;
  END IF;
END $$;

ALTER TABLE map_travel_parties REPLICA IDENTITY FULL;
ALTER TABLE map_travel_party_members REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION set_map_travel_options(
  p_map_id UUID,
  p_travel_mode TEXT DEFAULT NULL,
  p_party_options_locked BOOLEAN DEFAULT NULL,
  p_group_movement_unlimited BOOLEAN DEFAULT NULL,
  p_freeroam_movement_unlimited BOOLEAN DEFAULT NULL
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

  IF NOT is_campaign_member(m.campaign_id) THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  caller_is_dm := is_campaign_dm(m.campaign_id);
  IF NOT caller_is_dm AND m.party_options_locked THEN
    RETURN jsonb_build_object('error', 'Party options are locked by the DM');
  END IF;
  IF NOT caller_is_dm AND p_party_options_locked IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Only the DM can lock party options');
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
        freeroam_movement_unlimited = COALESCE(p_freeroam_movement_unlimited, freeroam_movement_unlimited)
    WHERE id = p_map_id;

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION create_travel_party(
  p_campaign_id UUID,
  p_map_id UUID,
  p_name TEXT,
  p_leader_user_id UUID,
  p_member_user_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  party_id UUID;
  member_id UUID;
  normalized_name TEXT;
BEGIN
  IF NOT is_campaign_member(p_campaign_id) THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM maps WHERE id = p_map_id AND campaign_id = p_campaign_id) THEN
    RETURN jsonb_build_object('error', 'Map not found');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM campaign_members
    WHERE campaign_id = p_campaign_id AND user_id = p_leader_user_id
  ) THEN
    RETURN jsonb_build_object('error', 'Leader must be a campaign member');
  END IF;

  normalized_name := COALESCE(NULLIF(TRIM(p_name), ''), 'Travel Party');

  INSERT INTO map_travel_parties (campaign_id, map_id, name, created_by, leader_user_id)
  VALUES (p_campaign_id, p_map_id, normalized_name, auth.uid(), p_leader_user_id)
  RETURNING id INTO party_id;

  FOR member_id IN
    SELECT DISTINCT x
    FROM unnest(array_append(COALESCE(p_member_user_ids, ARRAY[]::UUID[]), p_leader_user_id)) AS member_ids(x)
    WHERE x IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM campaign_members cm
        WHERE cm.campaign_id = p_campaign_id AND cm.user_id = x
      )
  LOOP
    INSERT INTO map_travel_party_members (party_id, campaign_id, map_id, user_id, status)
    VALUES (
      party_id,
      p_campaign_id,
      p_map_id,
      member_id,
      CASE WHEN member_id = auth.uid() THEN 'accepted' ELSE 'pending' END
    )
    ON CONFLICT (party_id, user_id) DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object('ok', TRUE, 'party_id', party_id);
END;
$$;

CREATE OR REPLACE FUNCTION respond_travel_party_invite(
  p_party_id UUID,
  p_accepted BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE map_travel_party_members
    SET status = CASE WHEN p_accepted THEN 'accepted' ELSE 'denied' END
    WHERE party_id = p_party_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Party invite not found');
  END IF;

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION review_travel_party(
  p_party_id UUID,
  p_approved BOOLEAN,
  p_dm_response TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  p map_travel_parties;
BEGIN
  SELECT * INTO p FROM map_travel_parties WHERE id = p_party_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Party not found');
  END IF;
  IF NOT is_campaign_dm(p.campaign_id) THEN
    RETURN jsonb_build_object('error', 'Only the DM can review parties');
  END IF;

  UPDATE map_travel_parties
    SET status = CASE WHEN p_approved THEN 'approved' ELSE 'denied' END,
        dm_response = NULLIF(TRIM(p_dm_response), ''),
        approved_by = auth.uid()
    WHERE id = p_party_id;

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

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
BEGIN
  SELECT * INTO t FROM tokens WHERE id = p_token_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Token not found');
  END IF;

  IF t.controlled_by_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('error', 'You do not control this token');
  END IF;

  SELECT * INTO m FROM maps WHERE id = t.map_id;

  IF m.travel_mode = 'combat' THEN
    RETURN jsonb_build_object('error', 'Combat mode is active. Movement is locked.');
  END IF;
  IF m.player_movement_locked THEN
    RETURN jsonb_build_object('error', 'Movement is locked by the DM');
  END IF;
  IF t.movement_locked THEN
    RETURN jsonb_build_object('error', 'This token is locked by the DM');
  END IF;

  gsize := GREATEST(m.grid_size, 1);
  scale := GREATEST(m.grid_scale_feet, 1);
  reveal_radius := (15.0 / scale) * gsize;

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
