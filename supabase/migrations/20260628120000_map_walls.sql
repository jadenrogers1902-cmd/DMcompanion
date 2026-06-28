-- Dungeon wall / border system.
--
-- Walls are a separate layer from room regions. Rooms handle DM planning (fog
-- masks, NPC linking, Codex docs). Walls handle movement blocking -- players
-- cannot move tokens through wall edges. Door tokens linked to a wall create
-- passable gaps.
--
-- Prepared maps keep wall authoring data as JSONB (same pattern as room_regions
-- and fog_regions). Live maps get a realtime table so the DM can add/toggle
-- walls during play and the move_token RPC can enforce them server-side.

-- Prep column
ALTER TABLE prepared_maps
  ADD COLUMN IF NOT EXISTS wall_regions JSONB NOT NULL DEFAULT '[]'::JSONB;

-- Live table
CREATE TABLE IF NOT EXISTS map_walls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  source_prepared_wall_id TEXT,
  name TEXT NOT NULL DEFAULT 'Wall',
  shape_type TEXT NOT NULL DEFAULT 'rectangle'
    CHECK (shape_type IN ('rectangle', 'polygon')),
  x DOUBLE PRECISION NOT NULL DEFAULT 0,
  y DOUBLE PRECISION NOT NULL DEFAULT 0,
  width DOUBLE PRECISION,
  height DOUBLE PRECISION,
  points JSONB NOT NULL DEFAULT '[]'::JSONB,
  border_style TEXT NOT NULL DEFAULT 'solid'
    CHECK (border_style IN ('solid', 'double', 'thick')),
  border_color TEXT,
  door_token_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS map_walls_map_idx ON map_walls(map_id);
CREATE INDEX IF NOT EXISTS map_walls_campaign_idx ON map_walls(campaign_id);

ALTER TABLE map_walls ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS map_walls_updated_at ON map_walls;
CREATE TRIGGER map_walls_updated_at
  BEFORE UPDATE ON map_walls
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Walls are always visible to all campaign members on the active map (no
-- visible_to_players filter -- walls are physical reality).
CREATE POLICY "map_walls_select"
  ON map_walls FOR SELECT
  TO authenticated
  USING (
    is_campaign_dm(campaign_id)
    OR (
      is_campaign_member(campaign_id)
      AND EXISTS (
        SELECT 1 FROM maps m
        WHERE m.id = map_walls.map_id AND m.is_active = TRUE
      )
    )
  );

CREATE POLICY "map_walls_insert_dm"
  ON map_walls FOR INSERT
  TO authenticated
  WITH CHECK (is_campaign_dm(campaign_id) AND created_by = auth.uid());

CREATE POLICY "map_walls_update_dm"
  ON map_walls FOR UPDATE
  TO authenticated
  USING (is_campaign_dm(campaign_id))
  WITH CHECK (is_campaign_dm(campaign_id));

CREATE POLICY "map_walls_delete_dm"
  ON map_walls FOR DELETE
  TO authenticated
  USING (is_campaign_dm(campaign_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE map_walls TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'map_walls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE map_walls;
  END IF;
END $$;

ALTER TABLE map_walls REPLICA IDENTITY FULL;

----------------------------------------------------------------------------
-- Geometry helpers for wall-crossing detection
----------------------------------------------------------------------------

-- Pure line-segment intersection test (cross-product method).
-- Returns TRUE if segment (ax1,ay1)-(ax2,ay2) properly crosses
-- segment (bx1,by1)-(bx2,by2). Collinear overlap counts as crossing.
CREATE OR REPLACE FUNCTION segments_intersect(
  ax1 DOUBLE PRECISION, ay1 DOUBLE PRECISION,
  ax2 DOUBLE PRECISION, ay2 DOUBLE PRECISION,
  bx1 DOUBLE PRECISION, by1 DOUBLE PRECISION,
  bx2 DOUBLE PRECISION, by2 DOUBLE PRECISION
)
RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  d1 DOUBLE PRECISION;
  d2 DOUBLE PRECISION;
  d3 DOUBLE PRECISION;
  d4 DOUBLE PRECISION;
BEGIN
  -- Cross products: d = (bx2-bx1)*(ay-by1) - (by2-by1)*(ax-bx1)
  d1 := (bx2 - bx1) * (ay1 - by1) - (by2 - by1) * (ax1 - bx1);
  d2 := (bx2 - bx1) * (ay2 - by1) - (by2 - by1) * (ax2 - bx1);
  d3 := (ax2 - ax1) * (by1 - ay1) - (ay2 - ay1) * (bx1 - ax1);
  d4 := (ax2 - ax1) * (by2 - ay1) - (ay2 - ay1) * (bx2 - ax1);

  IF ((d1 > 0 AND d2 < 0) OR (d1 < 0 AND d2 > 0)) AND
     ((d3 > 0 AND d4 < 0) OR (d3 < 0 AND d4 > 0)) THEN
    RETURN TRUE;
  END IF;

  -- Collinear cases: check if an endpoint lies on the other segment
  IF d1 = 0 AND on_segment(bx1, by1, bx2, by2, ax1, ay1) THEN RETURN TRUE; END IF;
  IF d2 = 0 AND on_segment(bx1, by1, bx2, by2, ax2, ay2) THEN RETURN TRUE; END IF;
  IF d3 = 0 AND on_segment(ax1, ay1, ax2, ay2, bx1, by1) THEN RETURN TRUE; END IF;
  IF d4 = 0 AND on_segment(ax1, ay1, ax2, ay2, bx2, by2) THEN RETURN TRUE; END IF;

  RETURN FALSE;
END;
$$;

-- Helper: is point (px,py) on the segment (sx1,sy1)-(sx2,sy2)?
-- Only called when the cross product is zero (collinear).
CREATE OR REPLACE FUNCTION on_segment(
  sx1 DOUBLE PRECISION, sy1 DOUBLE PRECISION,
  sx2 DOUBLE PRECISION, sy2 DOUBLE PRECISION,
  px DOUBLE PRECISION, py DOUBLE PRECISION
)
RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN px >= LEAST(sx1, sx2) AND px <= GREATEST(sx1, sx2)
     AND py >= LEAST(sy1, sy2) AND py <= GREATEST(sy1, sy2);
END;
$$;

-- Point-to-segment distance (perpendicular projection, clamped to endpoints).
CREATE OR REPLACE FUNCTION point_to_segment_distance(
  px DOUBLE PRECISION, py DOUBLE PRECISION,
  sx1 DOUBLE PRECISION, sy1 DOUBLE PRECISION,
  sx2 DOUBLE PRECISION, sy2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  dx DOUBLE PRECISION := sx2 - sx1;
  dy DOUBLE PRECISION := sy2 - sy1;
  len_sq DOUBLE PRECISION;
  t DOUBLE PRECISION;
  proj_x DOUBLE PRECISION;
  proj_y DOUBLE PRECISION;
BEGIN
  len_sq := dx * dx + dy * dy;
  IF len_sq = 0 THEN
    RETURN sqrt((px - sx1) * (px - sx1) + (py - sy1) * (py - sy1));
  END IF;
  t := ((px - sx1) * dx + (py - sy1) * dy) / len_sq;
  t := GREATEST(0, LEAST(1, t));
  proj_x := sx1 + t * dx;
  proj_y := sy1 + t * dy;
  RETURN sqrt((px - proj_x) * (px - proj_x) + (py - proj_y) * (py - proj_y));
END;
$$;

-- Check if a movement path crosses any wall on the map.
-- Returns NULL if the path is clear, or the wall's name if blocked.
-- Door tokens within door_threshold of a wall edge make that edge passable.
CREATE OR REPLACE FUNCTION movement_crosses_wall(
  p_map_id UUID,
  p_old_x DOUBLE PRECISION,
  p_old_y DOUBLE PRECISION,
  p_new_x DOUBLE PRECISION,
  p_new_y DOUBLE PRECISION
)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  wall RECORD;
  edge_count INTEGER;
  i INTEGER;
  ex1 DOUBLE PRECISION; ey1 DOUBLE PRECISION;
  ex2 DOUBLE PRECISION; ey2 DOUBLE PRECISION;
  pts JSONB;
  pt1 JSONB; pt2 JSONB;
  door RECORD;
  door_near BOOLEAN;
  door_threshold DOUBLE PRECISION;
  gsize INTEGER;
BEGIN
  SELECT GREATEST(m.grid_size, 1) INTO gsize FROM maps m WHERE m.id = p_map_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  door_threshold := gsize * 0.75;

  FOR wall IN
    SELECT w.name, w.shape_type, w.x, w.y, w.width, w.height, w.points, w.door_token_ids
    FROM map_walls w
    WHERE w.map_id = p_map_id
  LOOP
    IF wall.shape_type = 'rectangle' AND wall.width IS NOT NULL AND wall.height IS NOT NULL THEN
      -- 4 edges of the rectangle
      FOR i IN 0..3 LOOP
        CASE i
          WHEN 0 THEN -- top
            ex1 := wall.x; ey1 := wall.y; ex2 := wall.x + wall.width; ey2 := wall.y;
          WHEN 1 THEN -- right
            ex1 := wall.x + wall.width; ey1 := wall.y; ex2 := wall.x + wall.width; ey2 := wall.y + wall.height;
          WHEN 2 THEN -- bottom
            ex1 := wall.x + wall.width; ey1 := wall.y + wall.height; ex2 := wall.x; ey2 := wall.y + wall.height;
          WHEN 3 THEN -- left
            ex1 := wall.x; ey1 := wall.y + wall.height; ex2 := wall.x; ey2 := wall.y;
        END CASE;

        IF segments_intersect(p_old_x, p_old_y, p_new_x, p_new_y, ex1, ey1, ex2, ey2) THEN
          -- Check if any door token is near this edge
          door_near := FALSE;
          IF array_length(wall.door_token_ids, 1) IS NOT NULL THEN
            FOR door IN
              SELECT t.x, t.y FROM tokens t WHERE t.id = ANY(wall.door_token_ids)
            LOOP
              IF point_to_segment_distance(door.x, door.y, ex1, ey1, ex2, ey2) <= door_threshold THEN
                door_near := TRUE;
                EXIT;
              END IF;
            END LOOP;
          END IF;
          IF NOT door_near THEN
            RETURN wall.name;
          END IF;
        END IF;
      END LOOP;

    ELSIF wall.shape_type = 'polygon' THEN
      pts := wall.points;
      edge_count := jsonb_array_length(pts);
      IF edge_count >= 3 THEN
        FOR i IN 0..(edge_count - 1) LOOP
          pt1 := pts->i;
          pt2 := pts->((i + 1) % edge_count);
          ex1 := (pt1->>'x')::DOUBLE PRECISION;
          ey1 := (pt1->>'y')::DOUBLE PRECISION;
          ex2 := (pt2->>'x')::DOUBLE PRECISION;
          ey2 := (pt2->>'y')::DOUBLE PRECISION;

          IF segments_intersect(p_old_x, p_old_y, p_new_x, p_new_y, ex1, ey1, ex2, ey2) THEN
            door_near := FALSE;
            IF array_length(wall.door_token_ids, 1) IS NOT NULL THEN
              FOR door IN
                SELECT t.x, t.y FROM tokens t WHERE t.id = ANY(wall.door_token_ids)
              LOOP
                IF point_to_segment_distance(door.x, door.y, ex1, ey1, ex2, ey2) <= door_threshold THEN
                  door_near := TRUE;
                  EXIT;
                END IF;
              END LOOP;
            END IF;
            IF NOT door_near THEN
              RETURN wall.name;
            END IF;
          END IF;
        END LOOP;
      END IF;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;
