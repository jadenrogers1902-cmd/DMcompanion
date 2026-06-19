-- Make placed non-player tokens discoverable by default.
--
-- Existing hidden live tokens become discoverable rather than permanently
-- DM-only. Player tokens and already-visible tokens are left alone.
UPDATE tokens
SET discoverable = TRUE
WHERE token_type <> 'player'
  AND visible_to_players = FALSE
  AND discoverable = FALSE;

-- Prepared-map tokens are stored as JSONB. Convert hidden/DM-only draft tokens
-- to discoverable so future deployments carry the same default.
UPDATE prepared_maps pm
SET tokens = (
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN COALESCE((token->>'visible_to_players')::boolean, FALSE) = FALSE
        AND COALESCE(token->>'reveal_state', 'dm_only') IN ('dm_only', 'hidden')
      THEN token || jsonb_build_object(
        'reveal_state', 'discoverable',
        'visible_to_players', FALSE
      )
      ELSE token
    END
    ORDER BY ord
  ), '[]'::jsonb)
  FROM jsonb_array_elements(COALESCE(pm.tokens, '[]'::jsonb)) WITH ORDINALITY AS entries(token, ord)
)
WHERE jsonb_typeof(COALESCE(pm.tokens, '[]'::jsonb)) = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(pm.tokens, '[]'::jsonb)) AS entries(token)
    WHERE COALESCE((token->>'visible_to_players')::boolean, FALSE) = FALSE
      AND COALESCE(token->>'reveal_state', 'dm_only') IN ('dm_only', 'hidden')
  );

-- If the party already revealed an area, immediately reveal any newly
-- discoverable token that is inside that area.
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
          a.shape_type = 'rectangle'
          AND t.x >= COALESCE(a.x, 0)
          AND t.x <= COALESCE(a.x, 0) + COALESCE(a.width, 0)
          AND t.y >= COALESCE(a.y, 0)
          AND t.y <= COALESCE(a.y, 0) + COALESCE(a.height, 0)
        )
        OR (
          a.shape_type = 'circle'
          AND sqrt(power(t.x - COALESCE(a.x, 0), 2) + power(t.y - COALESCE(a.y, 0), 2)) <= COALESCE(a.radius, 0)
        )
      )
  );
