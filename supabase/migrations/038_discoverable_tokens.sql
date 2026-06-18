-- "Discoverable" tokens: hidden from players until their vision (a player-visible
-- revealed area) physically reaches the token, at which point it becomes visible
-- and stays visible. The DM always sees every token regardless (DM map queries
-- never filter on visible_to_players).
--
-- A discoverable token deploys with visible_to_players = FALSE and
-- discoverable = TRUE. Every reveal source (player movement via move_token, DM
-- manual reveal, reveal-entire-map) inserts a row into map_revealed_areas, so a
-- single AFTER INSERT trigger there discovers any covered tokens — no matter how
-- the area was revealed.

ALTER TABLE tokens
  ADD COLUMN IF NOT EXISTS discoverable BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION discover_tokens_in_area()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- DM-only (hidden) markers never reveal tokens to players.
  IF NEW.visible_to_players IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.shape_type = 'full' THEN
    UPDATE tokens
      SET visible_to_players = TRUE, discoverable = FALSE
      WHERE map_id = NEW.map_id
        AND discoverable = TRUE
        AND visible_to_players = FALSE;

  ELSIF NEW.shape_type = 'circle' AND NEW.radius IS NOT NULL THEN
    UPDATE tokens
      SET visible_to_players = TRUE, discoverable = FALSE
      WHERE map_id = NEW.map_id
        AND discoverable = TRUE
        AND visible_to_players = FALSE
        AND ((x - NEW.x) * (x - NEW.x) + (y - NEW.y) * (y - NEW.y)) <= (NEW.radius * NEW.radius);

  ELSIF NEW.shape_type = 'rectangle' AND NEW.width IS NOT NULL AND NEW.height IS NOT NULL THEN
    UPDATE tokens
      SET visible_to_players = TRUE, discoverable = FALSE
      WHERE map_id = NEW.map_id
        AND discoverable = TRUE
        AND visible_to_players = FALSE
        AND x >= NEW.x AND x <= NEW.x + NEW.width
        AND y >= NEW.y AND y <= NEW.y + NEW.height;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS discover_tokens_on_reveal ON map_revealed_areas;
CREATE TRIGGER discover_tokens_on_reveal
  AFTER INSERT ON map_revealed_areas
  FOR EACH ROW EXECUTE FUNCTION discover_tokens_in_area();
