-- Sub-location room regions for dungeon maps.
--
-- Prepared maps keep authoring data as JSONB, matching the existing tokens /
-- notes / links pattern. Live maps get their own realtime room table so reveal
-- state can change during play without mutating the Adventure Maker source.

ALTER TABLE prepared_maps
  ADD COLUMN IF NOT EXISTS room_regions JSONB NOT NULL DEFAULT '[]'::JSONB;

CREATE TABLE IF NOT EXISTS map_room_regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  source_prepared_room_id TEXT,
  linked_campaign_doc_id UUID REFERENCES campaign_docs(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT 'Room',
  shape_type TEXT NOT NULL DEFAULT 'rectangle'
    CHECK (shape_type IN ('rectangle', 'polygon')),
  x DOUBLE PRECISION NOT NULL DEFAULT 0,
  y DOUBLE PRECISION NOT NULL DEFAULT 0,
  width DOUBLE PRECISION,
  height DOUBLE PRECISION,
  points JSONB NOT NULL DEFAULT '[]'::JSONB,
  reveal_mode TEXT NOT NULL DEFAULT 'manual'
    CHECK (reveal_mode IN ('manual', 'auto', 'manual_auto')),
  mask_style TEXT NOT NULL DEFAULT 'blackout'
    CHECK (mask_style IN ('blackout', 'dim', 'outline_only')),
  border_style TEXT NOT NULL DEFAULT 'door'
    CHECK (border_style IN ('door', 'dashed', 'solid', 'glow')),
  player_label_visible BOOLEAN NOT NULL DEFAULT FALSE,
  auto_reveal_distance_feet INTEGER NOT NULL DEFAULT 0,
  is_revealed BOOLEAN NOT NULL DEFAULT FALSE,
  visible_to_players BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS map_room_regions_map_idx ON map_room_regions(map_id);
CREATE INDEX IF NOT EXISTS map_room_regions_campaign_idx ON map_room_regions(campaign_id);
CREATE INDEX IF NOT EXISTS map_room_regions_source_prepared_idx
  ON map_room_regions(map_id, source_prepared_room_id);

ALTER TABLE map_room_regions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS map_room_regions_updated_at ON map_room_regions;
CREATE TRIGGER map_room_regions_updated_at
  BEFORE UPDATE ON map_room_regions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY "map_room_regions_select"
  ON map_room_regions FOR SELECT
  TO authenticated
  USING (
    is_campaign_dm(campaign_id)
    OR (
      is_campaign_member(campaign_id)
      AND visible_to_players = TRUE
      AND EXISTS (
        SELECT 1 FROM maps m
        WHERE m.id = map_room_regions.map_id AND m.is_active = TRUE
      )
    )
  );

CREATE POLICY "map_room_regions_insert_dm"
  ON map_room_regions FOR INSERT
  TO authenticated
  WITH CHECK (is_campaign_dm(campaign_id) AND created_by = auth.uid());

CREATE POLICY "map_room_regions_update_dm"
  ON map_room_regions FOR UPDATE
  TO authenticated
  USING (is_campaign_dm(campaign_id))
  WITH CHECK (is_campaign_dm(campaign_id));

CREATE POLICY "map_room_regions_delete_dm"
  ON map_room_regions FOR DELETE
  TO authenticated
  USING (is_campaign_dm(campaign_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE map_room_regions TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'map_room_regions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE map_room_regions;
  END IF;
END $$;

ALTER TABLE map_room_regions REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION point_in_room_region(
  room map_room_regions,
  p_x DOUBLE PRECISION,
  p_y DOUBLE PRECISION,
  p_distance_px DOUBLE PRECISION DEFAULT 0
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  point JSONB;
  points JSONB := COALESCE(room.points, '[]'::JSONB);
  count_points INTEGER := jsonb_array_length(points);
  i INTEGER;
  j INTEGER;
  xi DOUBLE PRECISION;
  yi DOUBLE PRECISION;
  xj DOUBLE PRECISION;
  yj DOUBLE PRECISION;
  inside BOOLEAN := FALSE;
BEGIN
  IF room.shape_type = 'rectangle' THEN
    RETURN p_x >= LEAST(room.x, room.x + COALESCE(room.width, 0)) - p_distance_px
      AND p_x <= GREATEST(room.x, room.x + COALESCE(room.width, 0)) + p_distance_px
      AND p_y >= LEAST(room.y, room.y + COALESCE(room.height, 0)) - p_distance_px
      AND p_y <= GREATEST(room.y, room.y + COALESCE(room.height, 0)) + p_distance_px;
  END IF;

  IF count_points < 3 THEN
    RETURN FALSE;
  END IF;

  j := count_points - 1;
  FOR i IN 0..(count_points - 1) LOOP
    point := points -> i;
    xi := COALESCE((point ->> 'x')::DOUBLE PRECISION, 0);
    yi := COALESCE((point ->> 'y')::DOUBLE PRECISION, 0);
    point := points -> j;
    xj := COALESCE((point ->> 'x')::DOUBLE PRECISION, 0);
    yj := COALESCE((point ->> 'y')::DOUBLE PRECISION, 0);

    IF ((yi > p_y) <> (yj > p_y))
      AND (p_x < ((xj - xi) * (p_y - yi) / NULLIF(yj - yi, 0) + xi)) THEN
      inside := NOT inside;
    END IF;
    j := i;
  END LOOP;

  IF inside OR p_distance_px <= 0 THEN
    RETURN inside;
  END IF;

  -- Distance fallback for polygon auto-reveal: use the polygon bounding box as
  -- a practical doorway/threshold halo without requiring PostGIS.
  RETURN p_x >= (
      SELECT MIN(COALESCE((value ->> 'x')::DOUBLE PRECISION, 0)) FROM jsonb_array_elements(points)
    ) - p_distance_px
    AND p_x <= (
      SELECT MAX(COALESCE((value ->> 'x')::DOUBLE PRECISION, 0)) FROM jsonb_array_elements(points)
    ) + p_distance_px
    AND p_y >= (
      SELECT MIN(COALESCE((value ->> 'y')::DOUBLE PRECISION, 0)) FROM jsonb_array_elements(points)
    ) - p_distance_px
    AND p_y <= (
      SELECT MAX(COALESCE((value ->> 'y')::DOUBLE PRECISION, 0)) FROM jsonb_array_elements(points)
    ) + p_distance_px;
END;
$$;

CREATE OR REPLACE FUNCTION reveal_auto_room_regions(
  p_map_id UUID,
  p_x DOUBLE PRECISION,
  p_y DOUBLE PRECISION,
  p_user_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  m maps;
  room map_room_regions;
  scale INTEGER;
  gsize INTEGER;
  distance_px DOUBLE PRECISION;
  revealed_count INTEGER := 0;
BEGIN
  SELECT * INTO m FROM maps WHERE id = p_map_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  gsize := GREATEST(COALESCE(m.grid_size, 1), 1);
  scale := GREATEST(COALESCE(m.grid_scale_feet, 5), 1);

  FOR room IN
    SELECT *
    FROM map_room_regions
    WHERE map_id = p_map_id
      AND is_revealed = FALSE
      AND reveal_mode IN ('auto', 'manual_auto')
  LOOP
    distance_px := (GREATEST(COALESCE(room.auto_reveal_distance_feet, 0), 0)::DOUBLE PRECISION / scale) * gsize;
    IF point_in_room_region(room, p_x, p_y, distance_px) THEN
      UPDATE map_room_regions
        SET is_revealed = TRUE,
            updated_at = NOW()
        WHERE id = room.id;
      revealed_count := revealed_count + 1;
    END IF;
  END LOOP;

  RETURN revealed_count;
END;
$$;

CREATE OR REPLACE FUNCTION reveal_auto_room_regions_from_area()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  room map_room_regions;
  reveal_x DOUBLE PRECISION;
  reveal_y DOUBLE PRECISION;
  reveal_distance DOUBLE PRECISION;
BEGIN
  IF NEW.visible_to_players IS DISTINCT FROM TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.shape_type = 'full' THEN
    UPDATE map_room_regions
      SET is_revealed = TRUE,
          updated_at = NOW()
      WHERE map_id = NEW.map_id
        AND is_revealed = FALSE
        AND reveal_mode IN ('auto', 'manual_auto');
    RETURN NEW;
  END IF;

  IF NEW.shape_type = 'circle' THEN
    reveal_x := NEW.x;
    reveal_y := NEW.y;
    reveal_distance := COALESCE(NEW.radius, 0);
  ELSE
    reveal_x := NEW.x + (COALESCE(NEW.width, 0) / 2);
    reveal_y := NEW.y + (COALESCE(NEW.height, 0) / 2);
    reveal_distance := GREATEST(COALESCE(NEW.width, 0), COALESCE(NEW.height, 0)) / 2;
  END IF;

  FOR room IN
    SELECT *
    FROM map_room_regions
    WHERE map_id = NEW.map_id
      AND is_revealed = FALSE
      AND reveal_mode IN ('auto', 'manual_auto')
  LOOP
    IF point_in_room_region(room, reveal_x, reveal_y, reveal_distance) THEN
      UPDATE map_room_regions
        SET is_revealed = TRUE,
            updated_at = NOW()
        WHERE id = room.id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reveal_auto_rooms_on_area ON map_revealed_areas;
CREATE TRIGGER reveal_auto_rooms_on_area
  AFTER INSERT ON map_revealed_areas
  FOR EACH ROW EXECUTE FUNCTION reveal_auto_room_regions_from_area();
