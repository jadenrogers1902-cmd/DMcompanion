-- Player-safe realtime and read boundaries for live maps and Story.
--
-- Postgres Changes applies RLS to rows, not columns. The source tables below
-- contain both player-facing and DM-only columns, so players must never SELECT
-- or subscribe to those source rows directly. A small event table carries no
-- gameplay payload; clients respond by fetching a sanitized SECURITY DEFINER
-- snapshot.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

-- Harden the legacy authorization helpers that every new projection delegates
-- to. Fixed search paths prevent object-shadowing inside SECURITY DEFINER code.
CREATE OR REPLACE FUNCTION public.is_campaign_member(cid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.campaign_members AS cm
    WHERE cm.campaign_id = cid
      AND cm.user_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_campaign_dm(cid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.campaign_members AS cm
    WHERE cm.campaign_id = cid
      AND cm.user_id = (SELECT auth.uid())
      AND cm.role = 'dm'
  ) OR EXISTS (
    SELECT 1
    FROM public.campaigns AS c
    WHERE c.id = cid
      AND c.owner_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.character_owner_id(char_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.user_id FROM public.characters AS c WHERE c.id = char_id;
$$;

CREATE OR REPLACE FUNCTION public.character_campaign_id(char_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.campaign_id FROM public.characters AS c WHERE c.id = char_id;
$$;

-- Keep active-map changes atomic. The service-role allowance is required by
-- validated transport travel after it has checked the caller and destination;
-- browser callers still need to be the campaign DM.
CREATE OR REPLACE FUNCTION public.set_active_map(
  p_campaign_id UUID,
  p_map_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role'
     AND NOT public.is_campaign_dm(p_campaign_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.maps AS m
    WHERE m.id = p_map_id AND m.campaign_id = p_campaign_id
  ) THEN
    RAISE EXCEPTION 'Map not found';
  END IF;

  UPDATE public.maps AS m
  SET is_active = (m.id = p_map_id)
  WHERE m.campaign_id = p_campaign_id
    AND m.is_active IS DISTINCT FROM (m.id = p_map_id);
END;
$$;

REVOKE ALL ON FUNCTION public.set_active_map(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_active_map(UUID, UUID) TO authenticated, service_role;

-- The legacy travel-settings RPC allowed a non-member who knew a map UUID to
-- change unlocked travel settings, and allowed players to submit DM-only
-- movement-limit flags. Preserve the intended player choice between freeroam
-- and group travel while enforcing campaign membership and DM-only controls.
CREATE OR REPLACE FUNCTION public.set_map_travel_options(
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
SET search_path = ''
AS $$
DECLARE
  v_map public.maps%ROWTYPE;
  v_is_service BOOLEAN := COALESCE((SELECT auth.role()), '') = 'service_role';
  v_is_dm BOOLEAN;
BEGIN
  SELECT m.* INTO v_map FROM public.maps AS m WHERE m.id = p_map_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Map not found');
  END IF;

  IF NOT v_is_service AND NOT public.is_campaign_member(v_map.campaign_id) THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;
  v_is_dm := v_is_service OR public.is_campaign_dm(v_map.campaign_id);

  IF NOT v_is_dm AND v_map.is_active IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('error', 'This is not the active map');
  END IF;
  IF p_travel_mode IS NOT NULL
     AND p_travel_mode NOT IN ('group_party', 'freeroam', 'combat') THEN
    RETURN jsonb_build_object('error', 'Invalid travel mode');
  END IF;
  IF NOT v_is_dm AND v_map.party_options_locked THEN
    RETURN jsonb_build_object('error', 'Party options are locked by the DM');
  END IF;
  IF NOT v_is_dm AND (
    p_party_options_locked IS NOT NULL
    OR p_group_movement_unlimited IS NOT NULL
    OR p_freeroam_movement_unlimited IS NOT NULL
    OR p_player_vision_radius_feet IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('error', 'Only the DM can change movement limits or locks');
  END IF;
  IF NOT v_is_dm AND p_travel_mode = 'combat' THEN
    RETURN jsonb_build_object('error', 'Only the DM can start combat mode');
  END IF;

  UPDATE public.maps AS m
  SET travel_mode = COALESCE(p_travel_mode, m.travel_mode),
      party_options_locked = CASE
        WHEN p_travel_mode = 'combat' THEN TRUE
        WHEN v_is_dm AND p_travel_mode IN ('group_party', 'freeroam') AND m.travel_mode = 'combat' THEN FALSE
        ELSE COALESCE(p_party_options_locked, m.party_options_locked)
      END,
      player_movement_locked = CASE
        WHEN p_travel_mode = 'combat' THEN TRUE
        WHEN v_is_dm AND p_travel_mode IN ('group_party', 'freeroam') AND m.travel_mode = 'combat' THEN FALSE
        ELSE m.player_movement_locked
      END,
      group_movement_unlimited = COALESCE(p_group_movement_unlimited, m.group_movement_unlimited),
      freeroam_movement_unlimited = COALESCE(p_freeroam_movement_unlimited, m.freeroam_movement_unlimited),
      player_vision_radius_feet = CASE
        WHEN v_is_dm AND p_player_vision_radius_feet IS NOT NULL
          THEN GREATEST(0, LEAST(300, p_player_vision_radius_feet))
        ELSE m.player_vision_radius_feet
      END
  WHERE m.id = p_map_id;

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.set_map_travel_options(UUID, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_map_travel_options(UUID, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, INTEGER)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_travel_party(
  p_campaign_id UUID,
  p_map_id UUID,
  p_name TEXT,
  p_leader_user_id UUID,
  p_member_user_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_party_id UUID;
  v_member_id UUID;
  v_name TEXT;
  v_map public.maps%ROWTYPE;
BEGIN
  IF NOT public.is_campaign_member(p_campaign_id) THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  SELECT m.* INTO v_map
  FROM public.maps AS m
  WHERE m.id = p_map_id AND m.campaign_id = p_campaign_id;
  IF NOT FOUND OR v_map.is_active IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('error', 'Active map not found');
  END IF;
  IF v_map.party_options_locked AND NOT public.is_campaign_dm(p_campaign_id) THEN
    RETURN jsonb_build_object('error', 'Party options are locked by the DM');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.campaign_members AS cm
    WHERE cm.campaign_id = p_campaign_id AND cm.user_id = p_leader_user_id
  ) THEN
    RETURN jsonb_build_object('error', 'Leader must be a campaign member');
  END IF;

  v_name := COALESCE(NULLIF(TRIM(p_name), ''), 'Travel Party');
  INSERT INTO public.map_travel_parties (
    campaign_id, map_id, name, created_by, leader_user_id
  )
  VALUES (p_campaign_id, p_map_id, v_name, (SELECT auth.uid()), p_leader_user_id)
  RETURNING id INTO v_party_id;

  FOR v_member_id IN
    SELECT DISTINCT member_ids.x
    FROM unnest(array_append(COALESCE(p_member_user_ids, ARRAY[]::UUID[]), p_leader_user_id)) AS member_ids(x)
    WHERE member_ids.x IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.campaign_members AS cm
        WHERE cm.campaign_id = p_campaign_id AND cm.user_id = member_ids.x
      )
  LOOP
    INSERT INTO public.map_travel_party_members (
      party_id, campaign_id, map_id, user_id, status
    )
    VALUES (
      v_party_id,
      p_campaign_id,
      p_map_id,
      v_member_id,
      CASE WHEN v_member_id = (SELECT auth.uid()) THEN 'accepted' ELSE 'pending' END
    )
    ON CONFLICT (party_id, user_id) DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object('ok', TRUE, 'party_id', v_party_id);
END;
$$;

-- Fix search paths on the remaining player-facing travel RPCs and make their
-- intended execution roles explicit. Their bodies validate membership,
-- self-only responses, and DM review respectively.
ALTER FUNCTION public.respond_travel_party_invite(UUID, BOOLEAN)
  SET search_path = public;
ALTER FUNCTION public.review_travel_party(UUID, BOOLEAN, TEXT)
  SET search_path = public;
REVOKE ALL ON FUNCTION public.create_travel_party(UUID, UUID, TEXT, UUID, UUID[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_travel_party_invite(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.review_travel_party(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_travel_party(UUID, UUID, TEXT, UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_travel_party_invite(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_travel_party(UUID, BOOLEAN, TEXT) TO authenticated;

-- These helpers are internal to trusted movement/reveal functions or triggers.
-- They previously inherited PUBLIC execute, which exposed private wall labels
-- or allowed direct room-reveal mutation outside the validated movement RPC.
ALTER FUNCTION public.movement_crosses_wall(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION)
  SET search_path = public;
ALTER FUNCTION public.reveal_auto_room_regions(UUID, DOUBLE PRECISION, DOUBLE PRECISION, UUID)
  SET search_path = public;
ALTER FUNCTION public.reveal_auto_room_regions_from_area()
  SET search_path = public;
ALTER FUNCTION public.discover_tokens_in_area()
  SET search_path = public;
REVOKE ALL ON FUNCTION public.movement_crosses_wall(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reveal_auto_room_regions(UUID, DOUBLE PRECISION, DOUBLE PRECISION, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reveal_auto_room_regions_from_area()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.discover_tokens_in_area()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.segment_intersection_point(
  p_ax1 DOUBLE PRECISION,
  p_ay1 DOUBLE PRECISION,
  p_ax2 DOUBLE PRECISION,
  p_ay2 DOUBLE PRECISION,
  p_bx1 DOUBLE PRECISION,
  p_by1 DOUBLE PRECISION,
  p_bx2 DOUBLE PRECISION,
  p_by2 DOUBLE PRECISION
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_rx DOUBLE PRECISION := p_ax2 - p_ax1;
  v_ry DOUBLE PRECISION := p_ay2 - p_ay1;
  v_sx DOUBLE PRECISION := p_bx2 - p_bx1;
  v_sy DOUBLE PRECISION := p_by2 - p_by1;
  v_denominator DOUBLE PRECISION;
  v_t DOUBLE PRECISION;
BEGIN
  v_denominator := (v_rx * v_sy) - (v_ry * v_sx);
  -- Parallel or collinear overlaps have no single safe doorway crossing and
  -- therefore stay blocked by the caller.
  IF ABS(v_denominator) < 0.000000001 THEN
    RETURN NULL;
  END IF;

  v_t := (((p_bx1 - p_ax1) * v_sy) - ((p_by1 - p_ay1) * v_sx)) / v_denominator;
  RETURN jsonb_build_object(
    'x', p_ax1 + (v_t * v_rx),
    'y', p_ay1 + (v_t * v_ry)
  );
END;
$$;

REVOKE ALL ON FUNCTION private.segment_intersection_point(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION,
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.wall_edge_is_blocked(
  p_map_id UUID,
  p_old_x DOUBLE PRECISION,
  p_old_y DOUBLE PRECISION,
  p_new_x DOUBLE PRECISION,
  p_new_y DOUBLE PRECISION,
  p_edge_x1 DOUBLE PRECISION,
  p_edge_y1 DOUBLE PRECISION,
  p_edge_x2 DOUBLE PRECISION,
  p_edge_y2 DOUBLE PRECISION,
  p_door_token_ids UUID[],
  p_door_threshold DOUBLE PRECISION
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH crossing AS (
    SELECT private.segment_intersection_point(
      p_old_x, p_old_y, p_new_x, p_new_y,
      p_edge_x1, p_edge_y1, p_edge_x2, p_edge_y2
    ) AS point
  )
  SELECT public.segments_intersect(
      p_old_x, p_old_y, p_new_x, p_new_y,
      p_edge_x1, p_edge_y1, p_edge_x2, p_edge_y2
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.tokens AS door
      CROSS JOIN crossing
      WHERE door.map_id = p_map_id
        AND door.token_type = 'door'
        AND door.id = ANY(COALESCE(p_door_token_ids, ARRAY[]::UUID[]))
        AND crossing.point IS NOT NULL
        AND sqrt(
          power(door.x - ((crossing.point->>'x')::DOUBLE PRECISION), 2)
          + power(door.y - ((crossing.point->>'y')::DOUBLE PRECISION), 2)
        ) <= p_door_threshold
    );
$$;

REVOKE ALL ON FUNCTION private.wall_edge_is_blocked(
  UUID,
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION,
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION,
  UUID[], DOUBLE PRECISION
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.movement_crosses_wall(
  p_map_id UUID,
  p_old_x DOUBLE PRECISION,
  p_old_y DOUBLE PRECISION,
  p_new_x DOUBLE PRECISION,
  p_new_y DOUBLE PRECISION
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_wall RECORD;
  v_edge_count INTEGER;
  v_index INTEGER;
  v_x1 DOUBLE PRECISION;
  v_y1 DOUBLE PRECISION;
  v_x2 DOUBLE PRECISION;
  v_y2 DOUBLE PRECISION;
  v_point1 JSONB;
  v_point2 JSONB;
  v_door_threshold DOUBLE PRECISION;
BEGIN
  SELECT GREATEST(m.grid_size, 1) * 0.75
  INTO v_door_threshold
  FROM public.maps AS m
  WHERE m.id = p_map_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  FOR v_wall IN
    SELECT w.name, w.shape_type, w.x, w.y, w.width, w.height,
           w.points, w.door_token_ids
    FROM public.map_walls AS w
    WHERE w.map_id = p_map_id
  LOOP
    IF v_wall.shape_type = 'rectangle'
       AND v_wall.width IS NOT NULL
       AND v_wall.height IS NOT NULL THEN
      FOR v_index IN 0..3 LOOP
        CASE v_index
          WHEN 0 THEN
            v_x1 := v_wall.x; v_y1 := v_wall.y;
            v_x2 := v_wall.x + v_wall.width; v_y2 := v_wall.y;
          WHEN 1 THEN
            v_x1 := v_wall.x + v_wall.width; v_y1 := v_wall.y;
            v_x2 := v_wall.x + v_wall.width; v_y2 := v_wall.y + v_wall.height;
          WHEN 2 THEN
            v_x1 := v_wall.x + v_wall.width; v_y1 := v_wall.y + v_wall.height;
            v_x2 := v_wall.x; v_y2 := v_wall.y + v_wall.height;
          ELSE
            v_x1 := v_wall.x; v_y1 := v_wall.y + v_wall.height;
            v_x2 := v_wall.x; v_y2 := v_wall.y;
        END CASE;

        IF private.wall_edge_is_blocked(
          p_map_id,
          p_old_x, p_old_y, p_new_x, p_new_y,
          v_x1, v_y1, v_x2, v_y2,
          v_wall.door_token_ids,
          v_door_threshold
        ) THEN
          RETURN v_wall.name;
        END IF;
      END LOOP;
    ELSIF v_wall.shape_type = 'polygon' THEN
      v_edge_count := jsonb_array_length(v_wall.points);
      IF v_edge_count >= 3 THEN
        FOR v_index IN 0..(v_edge_count - 1) LOOP
          v_point1 := v_wall.points->v_index;
          v_point2 := v_wall.points->((v_index + 1) % v_edge_count);
          v_x1 := (v_point1->>'x')::DOUBLE PRECISION;
          v_y1 := (v_point1->>'y')::DOUBLE PRECISION;
          v_x2 := (v_point2->>'x')::DOUBLE PRECISION;
          v_y2 := (v_point2->>'y')::DOUBLE PRECISION;

          IF private.wall_edge_is_blocked(
            p_map_id,
            p_old_x, p_old_y, p_new_x, p_new_y,
            v_x1, v_y1, v_x2, v_y2,
            v_wall.door_token_ids,
            v_door_threshold
          ) THEN
            RETURN v_wall.name;
          END IF;
        END LOOP;
      END IF;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.movement_crosses_wall(
  UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION
) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Live-map safe event stream
-- ---------------------------------------------------------------------------

CREATE TABLE public.player_safe_map_events (
  campaign_id UUID PRIMARY KEY REFERENCES public.campaigns(id) ON DELETE CASCADE,
  revision BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.player_safe_map_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign members read player safe map events"
  ON public.player_safe_map_events FOR SELECT
  TO authenticated
  USING (public.is_campaign_member(campaign_id));

GRANT SELECT ON public.player_safe_map_events TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.player_safe_map_events FROM authenticated, anon;

-- Center Screen is DM-authenticated and may preview an inactive map. It still
-- receives only a revision event and a sanitized snapshot, never source rows.
CREATE TABLE public.center_safe_map_events (
  map_id UUID PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  revision BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.center_safe_map_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign dms read center safe map events"
  ON public.center_safe_map_events FOR SELECT
  TO authenticated
  USING (public.is_campaign_dm(campaign_id));

GRANT SELECT ON public.center_safe_map_events TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.center_safe_map_events FROM authenticated, anon;

CREATE OR REPLACE FUNCTION private.bump_center_safe_map_event(
  p_campaign_id UUID,
  p_map_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.campaigns AS c WHERE c.id = p_campaign_id
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.center_safe_map_events (map_id, campaign_id, revision, updated_at)
  VALUES (p_map_id, p_campaign_id, 1, NOW())
  ON CONFLICT (map_id) DO UPDATE
    SET campaign_id = EXCLUDED.campaign_id,
        revision = public.center_safe_map_events.revision + 1,
        updated_at = NOW()
    WHERE public.center_safe_map_events.updated_at IS DISTINCT FROM NOW();
END;
$$;

REVOKE ALL ON FUNCTION private.bump_center_safe_map_event(UUID, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.bump_player_safe_map_event(
  p_campaign_id UUID,
  p_source_map_id UUID,
  p_force BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_active_map_id UUID;
BEGIN
  -- Parent-campaign cascades delete maps and tokens after the campaign row is
  -- no longer visible. Do not recreate an event child during that cascade.
  IF NOT EXISTS (
    SELECT 1 FROM public.campaigns AS c WHERE c.id = p_campaign_id
  ) THEN
    RETURN;
  END IF;

  SELECT m.id INTO v_active_map_id
  FROM public.maps AS m
  WHERE m.campaign_id = p_campaign_id
    AND m.is_active = TRUE
  LIMIT 1;

  -- Changes to an inactive prep/preview map are irrelevant to player clients.
  IF NOT p_force AND p_source_map_id IS DISTINCT FROM v_active_map_id THEN
    RETURN;
  END IF;

  INSERT INTO public.player_safe_map_events (campaign_id, revision, updated_at)
  VALUES (p_campaign_id, 1, NOW())
  ON CONFLICT (campaign_id) DO UPDATE
    SET revision = public.player_safe_map_events.revision + 1,
        updated_at = NOW()
    -- A group move can update many tokens and reveal rows in one transaction.
    -- Emit at most one revision for that map/transaction so Realtime usage
    -- scales with user actions instead of affected rows.
    WHERE public.player_safe_map_events.updated_at IS DISTINCT FROM NOW();
END;
$$;

REVOKE ALL ON FUNCTION private.bump_player_safe_map_event(UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.live_map_source_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_map_id UUID;
  v_campaign_id UUID;
  v_force BOOLEAN := FALSE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'maps' THEN
      v_map_id := OLD.id;
      v_force := OLD.is_active;
    ELSE
      v_map_id := OLD.map_id;
    END IF;
    v_campaign_id := OLD.campaign_id;
  ELSE
    IF TG_TABLE_NAME = 'maps' THEN
      v_map_id := NEW.id;
      IF TG_OP = 'INSERT' THEN
        v_force := NEW.is_active;
      ELSE
        v_force := OLD.is_active OR NEW.is_active;
      END IF;
    ELSE
      v_map_id := NEW.map_id;
    END IF;
    v_campaign_id := NEW.campaign_id;
  END IF;

  IF TG_TABLE_NAME = 'maps' AND TG_OP = 'DELETE' THEN
    -- Deleting the safe event row itself notifies an open Center Screen, while
    -- avoiding an orphan event for a map that no longer exists.
    DELETE FROM public.center_safe_map_events AS e WHERE e.map_id = v_map_id;
  ELSE
    PERFORM private.bump_center_safe_map_event(v_campaign_id, v_map_id);
  END IF;
  PERFORM private.bump_player_safe_map_event(v_campaign_id, v_map_id, v_force);

  -- A child row can be reassigned between maps. Refresh both projections so
  -- neither the old nor the new map retains a stale token/room/wall/party row.
  IF TG_OP = 'UPDATE'
     AND TG_TABLE_NAME <> 'maps'
     AND (OLD.map_id IS DISTINCT FROM NEW.map_id
          OR OLD.campaign_id IS DISTINCT FROM NEW.campaign_id) THEN
    PERFORM private.bump_center_safe_map_event(OLD.campaign_id, OLD.map_id);
    PERFORM private.bump_player_safe_map_event(OLD.campaign_id, OLD.map_id, FALSE);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.live_map_source_changed() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS player_safe_maps_changed ON public.maps;
CREATE TRIGGER player_safe_maps_changed
  AFTER INSERT OR UPDATE OR DELETE ON public.maps
  FOR EACH ROW EXECUTE FUNCTION private.live_map_source_changed();

DROP TRIGGER IF EXISTS player_safe_tokens_changed ON public.tokens;
CREATE TRIGGER player_safe_tokens_changed
  AFTER INSERT OR UPDATE OR DELETE ON public.tokens
  FOR EACH ROW EXECUTE FUNCTION private.live_map_source_changed();

DROP TRIGGER IF EXISTS player_safe_areas_changed ON public.map_revealed_areas;
CREATE TRIGGER player_safe_areas_changed
  AFTER INSERT OR UPDATE OR DELETE ON public.map_revealed_areas
  FOR EACH ROW EXECUTE FUNCTION private.live_map_source_changed();

DROP TRIGGER IF EXISTS player_safe_rooms_changed ON public.map_room_regions;
CREATE TRIGGER player_safe_rooms_changed
  AFTER INSERT OR UPDATE OR DELETE ON public.map_room_regions
  FOR EACH ROW EXECUTE FUNCTION private.live_map_source_changed();

DROP TRIGGER IF EXISTS player_safe_walls_changed ON public.map_walls;
CREATE TRIGGER player_safe_walls_changed
  AFTER INSERT OR UPDATE OR DELETE ON public.map_walls
  FOR EACH ROW EXECUTE FUNCTION private.live_map_source_changed();

DROP TRIGGER IF EXISTS player_safe_travel_parties_changed ON public.map_travel_parties;
CREATE TRIGGER player_safe_travel_parties_changed
  AFTER INSERT OR UPDATE OR DELETE ON public.map_travel_parties
  FOR EACH ROW EXECUTE FUNCTION private.live_map_source_changed();

DROP TRIGGER IF EXISTS player_safe_travel_members_changed ON public.map_travel_party_members;
CREATE TRIGGER player_safe_travel_members_changed
  AFTER INSERT OR UPDATE OR DELETE ON public.map_travel_party_members
  FOR EACH ROW EXECUTE FUNCTION private.live_map_source_changed();

DROP TRIGGER IF EXISTS player_safe_transport_confirmations_changed ON public.map_transport_confirmations;
CREATE TRIGGER player_safe_transport_confirmations_changed
  AFTER INSERT OR UPDATE OR DELETE ON public.map_transport_confirmations
  FOR EACH ROW EXECUTE FUNCTION private.live_map_source_changed();

INSERT INTO public.player_safe_map_events (campaign_id)
SELECT m.campaign_id
FROM public.maps AS m
WHERE m.is_active = TRUE
ON CONFLICT (campaign_id) DO NOTHING;

INSERT INTO public.center_safe_map_events (map_id, campaign_id)
SELECT m.id, m.campaign_id
FROM public.maps AS m
ON CONFLICT (map_id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'player_safe_map_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.player_safe_map_events;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'center_safe_map_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.center_safe_map_events;
  END IF;
END $$;

ALTER TABLE public.player_safe_map_events REPLICA IDENTITY FULL;
ALTER TABLE public.center_safe_map_events REPLICA IDENTITY FULL;

-- One sanitized fetch replaces five mixed-row subscriptions and the initial
-- player map fan-out. Keys intentionally preserve the current TypeScript row
-- shapes, but private values are omitted or replaced with inert values.
CREATE OR REPLACE FUNCTION public.get_player_live_map_snapshot(p_map_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_map public.maps%ROWTYPE;
  v_zero UUID := '00000000-0000-0000-0000-000000000000'::UUID;
BEGIN
  SELECT m.* INTO v_map
  FROM public.maps AS m
  WHERE m.id = p_map_id
    AND (
      public.is_campaign_dm(m.campaign_id)
      OR (m.is_active = TRUE AND public.is_campaign_member(m.campaign_id))
    );

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'map', jsonb_build_object(
      'id', v_map.id,
      'campaign_id', v_map.campaign_id,
      'name', v_map.name,
      -- Used only as an immutable image cache version in the client. A digest
      -- avoids exposing the private Storage object name.
      'storage_path', md5(v_map.storage_path),
      'grid_enabled', v_map.grid_enabled,
      'grid_size', v_map.grid_size,
      'grid_scale_feet', v_map.grid_scale_feet,
      'grid_color', v_map.grid_color,
      'grid_opacity', v_map.grid_opacity,
      'grid_line_width', v_map.grid_line_width,
      'grid_subdivisions', v_map.grid_subdivisions,
      'grid_offset_x', v_map.grid_offset_x,
      'grid_offset_y', v_map.grid_offset_y,
      'dm_light_brightness', 1,
      'width', v_map.width,
      'height', v_map.height,
      'is_active', v_map.is_active,
      'player_movement_locked', v_map.player_movement_locked,
      'travel_mode', v_map.travel_mode,
      'party_options_locked', v_map.party_options_locked,
      'group_movement_unlimited', v_map.group_movement_unlimited,
      'freeroam_movement_unlimited', v_map.freeroam_movement_unlimited,
      'player_vision_radius_feet', v_map.player_vision_radius_feet,
      'cast_settings', v_map.cast_settings,
      'combat_round', v_map.combat_round,
      'source_prepared_map_id', NULL,
      'fog_mode', v_map.fog_mode,
      'fog_style', v_map.fog_style,
      'reveal_override', v_map.reveal_override,
      'created_by', v_zero,
      'created_at', v_map.created_at,
      'updated_at', v_map.updated_at
    ),
    'tokens', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'campaign_id', t.campaign_id,
          'map_id', t.map_id,
          'token_type', CASE WHEN t.visible_to_players THEN t.token_type ELSE 'custom' END,
          'name', CASE WHEN t.visible_to_players THEN t.name ELSE 'Unrevealed token' END,
          'x', t.x,
          'y', t.y,
          'size', t.size,
          'color', CASE WHEN t.visible_to_players THEN COALESCE(t.color, '#6b7280') ELSE '#a855f7' END,
          'image_url', CASE WHEN t.visible_to_players THEN t.image_url ELSE NULL END,
          'visible_to_players', t.visible_to_players,
          'controlled_by_user_id', CASE WHEN t.visible_to_players THEN t.controlled_by_user_id ELSE NULL END,
          'linked_character_id', CASE WHEN t.visible_to_players THEN t.linked_character_id ELSE NULL END,
          'notes', CASE WHEN t.visible_to_players THEN t.notes ELSE NULL END,
          'movement_locked', CASE WHEN t.visible_to_players THEN t.movement_locked ELSE TRUE END,
          'movement_used', CASE WHEN t.visible_to_players THEN t.movement_used ELSE 0 END,
          'movement_override_allowed', CASE WHEN t.visible_to_players THEN t.movement_override_allowed ELSE FALSE END,
          'last_x', CASE WHEN t.visible_to_players THEN t.last_x ELSE NULL END,
          'last_y', CASE WHEN t.visible_to_players THEN t.last_y ELSE NULL END,
          'interaction_range_feet', CASE WHEN t.visible_to_players THEN t.interaction_range_feet ELSE 0 END,
          'available_actions', CASE WHEN t.visible_to_players THEN COALESCE(t.available_actions, ARRAY[]::TEXT[]) ELSE ARRAY[]::TEXT[] END,
          'hidden_dm_actions', ARRAY[]::TEXT[],
          'interactable', CASE WHEN t.visible_to_players THEN t.interactable ELSE FALSE END,
          'object_state', CASE WHEN t.visible_to_players THEN t.object_state ELSE 'hidden' END,
          'destination_prepared_map_id', NULL,
          'source_prepared_token_id', NULL,
          'discoverable', t.discoverable,
          'public_description', CASE WHEN t.visible_to_players THEN t.public_description ELSE NULL END,
          -- Safe display eligibility is needed so Center Screen can honor the
          -- DM's undiscovered-hint setting without receiving private token data.
          'visible_on_cast', t.visible_on_cast,
          'requires_approval', CASE WHEN t.visible_to_players THEN t.requires_approval ELSE TRUE END,
          'resolver_type', CASE WHEN t.visible_to_players THEN t.resolver_type ELSE 'manual' END,
          'resolver_config', '{}'::JSONB,
          'max_hp', CASE WHEN t.visible_to_players THEN t.max_hp ELSE 0 END,
          'current_hp', CASE WHEN t.visible_to_players THEN t.current_hp ELSE 0 END,
          'temp_hp', CASE WHEN t.visible_to_players THEN t.temp_hp ELSE 0 END,
          -- Numeric AC stays private. The 10/11 sentinel preserves the
          -- existing client-side "attack-capable" predicate without exposing
          -- the target number used by server-side resolution.
          'armor_class', CASE
            WHEN t.visible_to_players AND (
              t.token_type IN ('enemy', 'npc')
              OR t.resolver_type = 'attack'
              OR t.max_hp > 0
              OR t.armor_class > 10
              OR EXISTS (
                SELECT 1
                FROM unnest(COALESCE(t.available_actions, ARRAY[]::TEXT[])) AS actions(action_name)
                WHERE lower(trim(action_name)) = 'attack'
              )
            ) THEN 11
            ELSE 10
          END,
          'is_defeated', CASE WHEN t.visible_to_players THEN t.is_defeated ELSE FALSE END,
          'created_at', t.created_at,
          'updated_at', t.updated_at
        ) ORDER BY t.created_at
      )
      FROM public.tokens AS t
      WHERE t.map_id = v_map.id
        AND (t.visible_to_players = TRUE OR t.discoverable = TRUE)
    ), '[]'::JSONB),
    'areas', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'campaign_id', a.campaign_id,
          'map_id', a.map_id,
          'shape_type', a.shape_type,
          'x', a.x,
          'y', a.y,
          'width', a.width,
          'height', a.height,
          'radius', a.radius,
          'visible_to_players', TRUE,
          'created_by', v_zero,
          'created_at', a.created_at,
          'updated_at', a.updated_at
        ) ORDER BY a.created_at
      )
      FROM public.map_revealed_areas AS a
      WHERE a.map_id = v_map.id AND a.visible_to_players = TRUE
    ), '[]'::JSONB),
    'rooms', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'campaign_id', r.campaign_id,
          'map_id', r.map_id,
          'source_prepared_room_id', NULL,
          'linked_campaign_doc_id', NULL,
          'name', CASE WHEN r.is_revealed OR r.player_label_visible THEN r.name ELSE '' END,
          'shape_type', r.shape_type,
          'x', r.x,
          'y', r.y,
          'width', r.width,
          'height', r.height,
          'points', r.points,
          'reveal_mode', r.reveal_mode,
          'mask_style', r.mask_style,
          'border_style', r.border_style,
          'border_color', r.border_color,
          'door_token_ids', r.door_token_ids,
          'player_label_visible', r.player_label_visible,
          'auto_reveal_distance_feet', 0,
          'is_revealed', r.is_revealed,
          'visible_to_players', TRUE,
          'created_by', v_zero,
          'created_at', r.created_at,
          'updated_at', r.updated_at
        ) ORDER BY r.created_at
      )
      FROM public.map_room_regions AS r
      WHERE r.map_id = v_map.id AND r.visible_to_players = TRUE
    ), '[]'::JSONB),
    'walls', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', w.id,
          'campaign_id', w.campaign_id,
          'map_id', w.map_id,
          'source_prepared_wall_id', NULL,
          'name', 'Wall',
          'shape_type', w.shape_type,
          'x', w.x,
          'y', w.y,
          'width', w.width,
          'height', w.height,
          'points', w.points,
          'border_style', w.border_style,
          'border_color', w.border_color,
          'door_token_ids', w.door_token_ids,
          'created_by', v_zero,
          'created_at', w.created_at,
          'updated_at', w.updated_at
        ) ORDER BY w.created_at
      )
      FROM public.map_walls AS w
      WHERE w.map_id = v_map.id
    ), '[]'::JSONB),
    'travel_parties', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) - 'approved_by' ORDER BY p.updated_at)
      FROM public.map_travel_parties AS p
      WHERE p.map_id = v_map.id
    ), '[]'::JSONB),
    'travel_party_members', COALESCE((
      SELECT jsonb_agg(to_jsonb(pm) ORDER BY pm.created_at)
      FROM public.map_travel_party_members AS pm
      WHERE pm.map_id = v_map.id
    ), '[]'::JSONB),
    'transport_confirmations', COALESCE((
      SELECT jsonb_agg(
        (to_jsonb(c) - 'destination_prepared_map_id') ||
        jsonb_build_object('destination_prepared_map_id', NULL)
        ORDER BY c.created_at
      )
      FROM public.map_transport_confirmations AS c
      WHERE c.map_id = v_map.id
    ), '[]'::JSONB)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_player_live_map_snapshot(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_player_live_map_snapshot(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_player_active_live_map_snapshot(p_campaign_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.get_player_live_map_snapshot(m.id)
  FROM public.maps AS m
  WHERE m.campaign_id = p_campaign_id
    AND m.is_active = TRUE
    AND public.is_campaign_member(m.campaign_id)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_player_active_live_map_snapshot(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_player_active_live_map_snapshot(UUID) TO authenticated;

-- Superseded by the snapshot above. The older RPC exposed fields (including
-- visible-token AC/source metadata) that are no longer part of the player
-- contract, so leaving it callable would bypass the new boundary.
REVOKE ALL ON FUNCTION public.get_player_live_map_tokens(UUID) FROM PUBLIC, anon, authenticated;

-- The legacy movement RPC returns the private wall label in its error text.
-- Keep its battle-tested authorization/collision logic behind a narrow wrapper
-- that exposes only a generic collision result to browser clients.
REVOKE ALL ON FUNCTION public.move_token(UUID, DOUBLE PRECISION, DOUBLE PRECISION)
  FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.move_token(UUID, DOUBLE PRECISION, DOUBLE PRECISION)
  SET search_path = public;

CREATE OR REPLACE FUNCTION public.move_player_token(
  p_token_id UUID,
  p_x DOUBLE PRECISION,
  p_y DOUBLE PRECISION
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result JSONB;
  v_campaign_id UUID;
  v_map_id UUID;
  v_map_active BOOLEAN;
  v_travel_mode TEXT;
  v_party_id UUID;
  v_member RECORD;
  v_offset RECORD;
  v_member_index INTEGER := 0;
  v_grid_size INTEGER;
  v_blocked_wall TEXT;
BEGIN
  SELECT t.campaign_id, t.map_id, m.is_active, m.travel_mode, GREATEST(m.grid_size, 1)
  INTO v_campaign_id, v_map_id, v_map_active, v_travel_mode, v_grid_size
  FROM public.tokens AS t
  JOIN public.maps AS m ON m.id = t.map_id AND m.campaign_id = t.campaign_id
  WHERE t.id = p_token_id
    AND t.visible_to_players = TRUE;

  IF NOT FOUND OR NOT public.is_campaign_member(v_campaign_id) THEN
    RETURN jsonb_build_object('error', 'Token is not available.');
  END IF;
  IF v_map_active IS DISTINCT FROM TRUE AND NOT public.is_campaign_dm(v_campaign_id) THEN
    RETURN jsonb_build_object('error', 'This is not the active map.');
  END IF;

  -- The legacy group branch checks only the leader path before moving every
  -- accepted follower into formation. Validate every resulting path first so
  -- the group move is all-or-nothing at the wall boundary.
  IF v_travel_mode = 'group_party' THEN
    SELECT p.id INTO v_party_id
    FROM public.map_travel_parties AS p
    JOIN public.map_travel_party_members AS pm ON pm.party_id = p.id
    WHERE p.map_id = v_map_id
      AND p.status = 'approved'
      AND p.leader_user_id = (SELECT auth.uid())
      AND pm.user_id = (SELECT auth.uid())
      AND pm.status = 'accepted'
    ORDER BY p.updated_at DESC
    LIMIT 1;

    IF v_party_id IS NOT NULL THEN
      FOR v_member IN
        SELECT tok.id, tok.x, tok.y
        FROM public.map_travel_party_members AS pm
        JOIN public.tokens AS tok ON tok.controlled_by_user_id = pm.user_id
        WHERE pm.party_id = v_party_id
          AND pm.status = 'accepted'
          AND tok.map_id = v_map_id
          AND tok.visible_to_players = TRUE
          AND tok.token_type = 'player'
          AND tok.movement_locked = FALSE
        ORDER BY CASE
          WHEN pm.user_id = (SELECT auth.uid()) THEN 0 ELSE 1
        END, tok.created_at
        LIMIT 16
      LOOP
        SELECT offsets.ox, offsets.oy INTO v_offset
        FROM (
          VALUES
            (0, 0, 0),
            (0, -1, 1), (1, 0, 2), (0, 1, 3), (-1, 0, 4),
            (1, -1, 5), (1, 1, 6), (-1, 1, 7), (-1, -1, 8),
            (0, -2, 9), (2, 0, 10), (0, 2, 11), (-2, 0, 12),
            (2, -1, 13), (2, 1, 14), (-2, 1, 15), (-2, -1, 16)
        ) AS offsets(ox, oy, rank)
        WHERE offsets.rank = v_member_index
        LIMIT 1;

        v_blocked_wall := public.movement_crosses_wall(
          v_map_id,
          v_member.x,
          v_member.y,
          p_x + (v_offset.ox * v_grid_size),
          p_y + (v_offset.oy * v_grid_size)
        );
        IF v_blocked_wall IS NOT NULL THEN
          RETURN jsonb_build_object('error', 'Group path is blocked by a wall.');
        END IF;
        v_member_index := v_member_index + 1;
      END LOOP;
    END IF;
  END IF;

  v_result := public.move_token(p_token_id, p_x, p_y);
  IF v_result ? 'error'
     AND (v_result->>'error') LIKE 'Path blocked by wall:%' THEN
    v_result := jsonb_set(
      v_result,
      '{error}',
      to_jsonb('Path blocked by wall.'::TEXT)
    );
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.move_player_token(UUID, DOUBLE PRECISION, DOUBLE PRECISION)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_player_token(UUID, DOUBLE PRECISION, DOUBLE PRECISION)
  TO authenticated;

DROP POLICY IF EXISTS "action_intents_insert_actor" ON public.action_intents;
REVOKE INSERT ON public.action_intents FROM authenticated, anon;

-- Player roll mutations run through validated Server Actions. Table-wide
-- UPDATE/INSERT policies cannot restrict callers to one status/result column,
-- so the older permissive policies allowed relationship, target, campaign,
-- roll-context, and target-number tampering.
DROP POLICY IF EXISTS "action_intents_cancel_actor" ON public.action_intents;
DROP POLICY IF EXISTS "action_intents_roll_update_actor" ON public.action_intents;

DROP POLICY IF EXISTS "action_roll_requests_update_dm_or_player" ON public.action_roll_requests;
CREATE POLICY "action_roll_requests_update_dm"
  ON public.action_roll_requests FOR UPDATE
  TO authenticated
  USING (public.is_campaign_dm(campaign_id))
  WITH CHECK (public.is_campaign_dm(campaign_id));

DROP POLICY IF EXISTS "action_roll_results_insert_player" ON public.action_roll_results;
CREATE POLICY "action_roll_results_insert_dm"
  ON public.action_roll_results FOR INSERT
  TO authenticated
  WITH CHECK (public.is_campaign_dm(campaign_id));

DROP POLICY IF EXISTS "action_attack_results_insert_player_or_dm" ON public.action_attack_results;
CREATE POLICY "action_attack_results_insert_dm"
  ON public.action_attack_results FOR INSERT
  TO authenticated
  WITH CHECK (public.is_campaign_dm(campaign_id));

DROP POLICY IF EXISTS "action_attack_result_dm_details_insert_player_or_dm"
  ON public.action_attack_result_dm_details;
CREATE POLICY "action_attack_result_dm_details_insert_dm"
  ON public.action_attack_result_dm_details FOR INSERT
  TO authenticated
  WITH CHECK (public.is_campaign_dm(campaign_id));

DROP POLICY IF EXISTS "pending_state_updates_insert_member" ON public.pending_state_updates;

DROP POLICY IF EXISTS "action_hp_effect_results_insert_player_or_dm"
  ON public.action_hp_effect_results;
CREATE POLICY "action_hp_effect_results_insert_dm"
  ON public.action_hp_effect_results FOR INSERT
  TO authenticated
  WITH CHECK (public.is_campaign_dm(campaign_id));

-- Source map rows are DM-only after the safe snapshot is installed.
DROP POLICY IF EXISTS "maps_select" ON public.maps;
CREATE POLICY "maps_select" ON public.maps FOR SELECT TO authenticated
  USING (public.is_campaign_dm(campaign_id));

DROP POLICY IF EXISTS "tokens_select" ON public.tokens;
CREATE POLICY "tokens_select" ON public.tokens FOR SELECT TO authenticated
  USING (public.is_campaign_dm(campaign_id));

DROP POLICY IF EXISTS "map_revealed_areas_select" ON public.map_revealed_areas;
CREATE POLICY "map_revealed_areas_select" ON public.map_revealed_areas FOR SELECT TO authenticated
  USING (public.is_campaign_dm(campaign_id));

DROP POLICY IF EXISTS "map_room_regions_select" ON public.map_room_regions;
CREATE POLICY "map_room_regions_select" ON public.map_room_regions FOR SELECT TO authenticated
  USING (public.is_campaign_dm(campaign_id));

DROP POLICY IF EXISTS "map_walls_select" ON public.map_walls;
CREATE POLICY "map_walls_select" ON public.map_walls FOR SELECT TO authenticated
  USING (public.is_campaign_dm(campaign_id));

DROP POLICY IF EXISTS "map_transport_confirmations_select" ON public.map_transport_confirmations;
CREATE POLICY "map_transport_confirmations_select"
  ON public.map_transport_confirmations FOR SELECT TO authenticated
  USING (public.is_campaign_dm(campaign_id));

-- Player clients receive redacted party/confirmation rows only through the
-- safe snapshot. Direct legacy policies allowed forged approved parties,
-- accepted members, and destination metadata, bypassing the validated RPCs.
DROP POLICY IF EXISTS "map_travel_parties_select" ON public.map_travel_parties;
CREATE POLICY "map_travel_parties_select_dm"
  ON public.map_travel_parties FOR SELECT TO authenticated
  USING (public.is_campaign_dm(campaign_id));
DROP POLICY IF EXISTS "map_travel_parties_insert_member" ON public.map_travel_parties;
DROP POLICY IF EXISTS "map_travel_parties_update_dm" ON public.map_travel_parties;

DROP POLICY IF EXISTS "map_travel_party_members_select" ON public.map_travel_party_members;
CREATE POLICY "map_travel_party_members_select_dm"
  ON public.map_travel_party_members FOR SELECT TO authenticated
  USING (public.is_campaign_dm(campaign_id));
DROP POLICY IF EXISTS "map_travel_party_members_insert_creator" ON public.map_travel_party_members;
DROP POLICY IF EXISTS "map_travel_party_members_update_self_or_dm" ON public.map_travel_party_members;

DROP POLICY IF EXISTS "map_transport_confirmations_insert_self" ON public.map_transport_confirmations;
DROP POLICY IF EXISTS "map_transport_confirmations_update_self" ON public.map_transport_confirmations;
DROP POLICY IF EXISTS "map_transport_confirmations_delete_self_or_dm" ON public.map_transport_confirmations;

REVOKE INSERT, UPDATE, DELETE ON public.map_travel_parties FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.map_travel_party_members FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.map_transport_confirmations FROM authenticated, anon;

-- Combat logs contain target AC and private resolution arithmetic. Player
-- outcomes are published through the dedicated safe result tables instead.
DROP POLICY IF EXISTS "combat_logs_select" ON public.combat_logs;
CREATE POLICY "combat_logs_select" ON public.combat_logs FOR SELECT TO authenticated
  USING (public.is_campaign_dm(campaign_id));

-- ---------------------------------------------------------------------------
-- Story safe snapshot and notification stream
-- ---------------------------------------------------------------------------

CREATE TABLE public.player_safe_story_events (
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('quest', 'npc', 'location', 'note', 'handout', 'session_recap')),
  revision BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, entity_type)
);

ALTER TABLE public.player_safe_story_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign members read player safe story events"
  ON public.player_safe_story_events FOR SELECT
  TO authenticated
  USING (public.is_campaign_member(campaign_id));

GRANT SELECT ON public.player_safe_story_events TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.player_safe_story_events FROM authenticated, anon;

CREATE OR REPLACE FUNCTION private.story_source_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_campaign_id UUID;
  v_type TEXT;
  v_was_visible BOOLEAN := FALSE;
  v_is_visible BOOLEAN := FALSE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_campaign_id := OLD.campaign_id;
  ELSE
    v_campaign_id := NEW.campaign_id;
  END IF;

  v_type := CASE TG_TABLE_NAME
    WHEN 'quests' THEN 'quest'
    WHEN 'npcs' THEN 'npc'
    WHEN 'locations' THEN 'location'
    WHEN 'notes' THEN 'note'
    WHEN 'handouts' THEN 'handout'
    WHEN 'session_recaps' THEN 'session_recap'
  END;

  IF TG_OP <> 'INSERT' THEN
    IF TG_TABLE_NAME = 'notes' THEN
      v_was_visible := OLD.visibility = 'shared';
    ELSIF TG_TABLE_NAME = 'handouts' THEN
      v_was_visible := OLD.is_revealed;
    ELSE
      v_was_visible := OLD.visible_to_players;
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    IF TG_TABLE_NAME = 'notes' THEN
      v_is_visible := NEW.visibility = 'shared';
    ELSIF TG_TABLE_NAME = 'handouts' THEN
      v_is_visible := NEW.is_revealed;
    ELSE
      v_is_visible := NEW.visible_to_players;
    END IF;
  END IF;

  IF v_was_visible OR v_is_visible THEN
    -- Avoid inserting an event child while a parent campaign DELETE is
    -- cascading through Story source tables.
    IF NOT EXISTS (
      SELECT 1 FROM public.campaigns AS c WHERE c.id = v_campaign_id
    ) THEN
      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;
      RETURN NEW;
    END IF;

    INSERT INTO public.player_safe_story_events (campaign_id, entity_type, revision, updated_at)
    VALUES (v_campaign_id, v_type, 1, NOW())
    ON CONFLICT (campaign_id, entity_type) DO UPDATE
      SET revision = public.player_safe_story_events.revision + 1,
          updated_at = NOW()
      WHERE public.player_safe_story_events.updated_at IS DISTINCT FROM NOW();
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.story_source_changed() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS player_safe_quests_changed ON public.quests;
CREATE TRIGGER player_safe_quests_changed AFTER INSERT OR UPDATE OR DELETE ON public.quests
  FOR EACH ROW EXECUTE FUNCTION private.story_source_changed();
DROP TRIGGER IF EXISTS player_safe_npcs_changed ON public.npcs;
CREATE TRIGGER player_safe_npcs_changed AFTER INSERT OR UPDATE OR DELETE ON public.npcs
  FOR EACH ROW EXECUTE FUNCTION private.story_source_changed();
DROP TRIGGER IF EXISTS player_safe_locations_changed ON public.locations;
CREATE TRIGGER player_safe_locations_changed AFTER INSERT OR UPDATE OR DELETE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION private.story_source_changed();
DROP TRIGGER IF EXISTS player_safe_notes_changed ON public.notes;
CREATE TRIGGER player_safe_notes_changed AFTER INSERT OR UPDATE OR DELETE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION private.story_source_changed();
DROP TRIGGER IF EXISTS player_safe_handouts_changed ON public.handouts;
CREATE TRIGGER player_safe_handouts_changed AFTER INSERT OR UPDATE OR DELETE ON public.handouts
  FOR EACH ROW EXECUTE FUNCTION private.story_source_changed();
DROP TRIGGER IF EXISTS player_safe_recaps_changed ON public.session_recaps;
CREATE TRIGGER player_safe_recaps_changed AFTER INSERT OR UPDATE OR DELETE ON public.session_recaps
  FOR EACH ROW EXECUTE FUNCTION private.story_source_changed();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'player_safe_story_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.player_safe_story_events;
  END IF;
END $$;

ALTER TABLE public.player_safe_story_events REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION public.get_player_story_snapshot(p_campaign_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN public.is_campaign_member(p_campaign_id) THEN jsonb_build_object(
    'quests', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', q.id, 'campaign_id', q.campaign_id, 'title', q.title,
        'status', q.status, 'description', NULL, 'player_visible_description', q.player_visible_description,
        'dm_notes', NULL, 'related_npc_ids', ARRAY[]::UUID[], 'related_location_ids', ARRAY[]::UUID[],
        'rewards', q.rewards, 'visible_to_players', TRUE,
        'created_at', q.created_at, 'updated_at', q.updated_at
      ) ORDER BY q.updated_at DESC)
      FROM public.quests AS q WHERE q.campaign_id = p_campaign_id AND q.visible_to_players = TRUE
    ), '[]'::JSONB),
    'npcs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', n.id, 'campaign_id', n.campaign_id, 'name', n.name, 'role', n.role,
        'location_id', n.location_id, 'relationship_to_party', n.relationship_to_party,
        'player_visible_notes', n.player_visible_notes, 'dm_notes', NULL,
        'portrait_url', n.portrait_url, 'linked_token_id', n.linked_token_id,
        'visible_to_players', TRUE, 'created_at', n.created_at, 'updated_at', n.updated_at
      ) ORDER BY n.updated_at DESC)
      FROM public.npcs AS n WHERE n.campaign_id = p_campaign_id AND n.visible_to_players = TRUE
    ), '[]'::JSONB),
    'locations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', l.id, 'campaign_id', l.campaign_id, 'name', l.name,
        'description', l.description, 'player_visible_notes', l.player_visible_notes,
        'dm_notes', NULL, 'map_id', l.map_id, 'visible_to_players', TRUE,
        'created_at', l.created_at, 'updated_at', l.updated_at
      ) ORDER BY l.updated_at DESC)
      FROM public.locations AS l WHERE l.campaign_id = p_campaign_id AND l.visible_to_players = TRUE
    ), '[]'::JSONB),
    'notes', COALESCE((
      SELECT jsonb_agg(to_jsonb(n) ORDER BY n.updated_at DESC)
      FROM public.notes AS n WHERE n.campaign_id = p_campaign_id AND n.visibility = 'shared'
    ), '[]'::JSONB),
    'handouts', COALESCE((
      SELECT jsonb_agg(to_jsonb(h) ORDER BY h.updated_at DESC)
      FROM public.handouts AS h WHERE h.campaign_id = p_campaign_id AND h.is_revealed = TRUE
    ), '[]'::JSONB),
    'recaps', COALESCE((
      SELECT jsonb_agg((to_jsonb(r) - 'dm_follow_up_notes') || jsonb_build_object('dm_follow_up_notes', NULL) ORDER BY r.session_date DESC NULLS LAST)
      FROM public.session_recaps AS r WHERE r.campaign_id = p_campaign_id AND r.visible_to_players = TRUE
    ), '[]'::JSONB)
  ) ELSE NULL END;
$$;

REVOKE ALL ON FUNCTION public.get_player_story_snapshot(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_player_story_snapshot(UUID) TO authenticated;

DROP POLICY IF EXISTS "Players can view visible quests" ON public.quests;
DROP POLICY IF EXISTS "Players can view visible npcs" ON public.npcs;
DROP POLICY IF EXISTS "Players can view visible locations" ON public.locations;
DROP POLICY IF EXISTS "Players can view shared notes" ON public.notes;
DROP POLICY IF EXISTS "Players can view revealed handouts" ON public.handouts;
DROP POLICY IF EXISTS "Players can view shared session recaps" ON public.session_recaps;

-- ---------------------------------------------------------------------------
-- Storage rows follow the same reveal boundary as their source metadata.
-- ---------------------------------------------------------------------------

-- Storage policies cannot rely on the caller being able to SELECT the source
-- metadata row: those source tables are intentionally DM-only above. These
-- narrow predicates evaluate the reveal rule without returning metadata.
CREATE OR REPLACE FUNCTION public.can_read_map_storage_object(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    CASE
      WHEN (storage.foldername(p_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN public.is_campaign_dm(((storage.foldername(p_name))[1])::UUID)
      ELSE FALSE
    END;
$$;

REVOKE ALL ON FUNCTION public.can_read_map_storage_object(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_map_storage_object(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_read_handout_storage_object(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    CASE
      WHEN (storage.foldername(p_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN public.is_campaign_dm(((storage.foldername(p_name))[1])::UUID)
      ELSE FALSE
    END
    OR EXISTS (
      SELECT 1 FROM public.handouts AS h
      WHERE h.storage_path = p_name
        AND h.is_revealed = TRUE
        AND public.is_campaign_member(h.campaign_id)
    );
$$;

REVOKE ALL ON FUNCTION public.can_read_handout_storage_object(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_handout_storage_object(TEXT) TO authenticated;

DROP POLICY IF EXISTS "maps_storage_select" ON storage.objects;
CREATE POLICY "maps_storage_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'maps'
    AND public.can_read_map_storage_object(storage.objects.name)
  );

DROP POLICY IF EXISTS "Campaign members can read handout files" ON storage.objects;
CREATE POLICY "Campaign members can read revealed handout files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'handouts'
    AND public.can_read_handout_storage_object(storage.objects.name)
  );
