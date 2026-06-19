-- Backfill discoverable tokens that are already inside player-visible reveal
-- areas. Migration 038 discovers tokens when a reveal row is inserted, but
-- tokens made discoverable after reveal rows already existed need this one-time
-- reconciliation.

UPDATE tokens t
  SET visible_to_players = TRUE,
      discoverable = FALSE
  WHERE t.discoverable = TRUE
    AND t.visible_to_players = FALSE
    AND EXISTS (
      SELECT 1
      FROM map_revealed_areas a
      WHERE a.map_id = t.map_id
        AND a.visible_to_players = TRUE
        AND (
          a.shape_type = 'full'
          OR (
            a.shape_type = 'circle'
            AND a.radius IS NOT NULL
            AND ((t.x - COALESCE(a.x, 0)) * (t.x - COALESCE(a.x, 0)) + (t.y - COALESCE(a.y, 0)) * (t.y - COALESCE(a.y, 0))) <= (a.radius * a.radius)
          )
          OR (
            a.shape_type = 'rectangle'
            AND a.width IS NOT NULL
            AND a.height IS NOT NULL
            AND t.x >= COALESCE(a.x, 0)
            AND t.x <= COALESCE(a.x, 0) + a.width
            AND t.y >= COALESCE(a.y, 0)
            AND t.y <= COALESCE(a.y, 0) + a.height
          )
        )
    );
