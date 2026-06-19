-- Make existing transport/portal tokens Discoverable on sight (hidden until a
-- player's vision reaches them). New portals already default to discoverable;
-- this backfills any created before that default.

-- Live tokens.
UPDATE tokens
  SET discoverable = TRUE, visible_to_players = FALSE
  WHERE token_type = 'portal';

-- Name existing portals after the location they lead to (so the player travel
-- popup shows the destination name). Only touch generic/blank names so a DM's
-- custom label is preserved.
UPDATE tokens t
  SET name = pm.title
  FROM prepared_maps pm
  WHERE t.token_type = 'portal'
    AND t.destination_prepared_map_id = pm.id
    AND (t.name IS NULL OR t.name = '' OR t.name = 'Transport');

-- Prepared-map tokens live as a JSONB array on prepared_maps.tokens. Rewrite the
-- array, flipping transport tokens to discoverable + not player-visible.
UPDATE prepared_maps pm
  SET tokens = (
    SELECT jsonb_agg(
      CASE
        WHEN elem->>'token_type' = 'transport'
          THEN elem || '{"reveal_state":"discoverable","visible_to_players":false}'::jsonb
        ELSE elem
      END
    )
    FROM jsonb_array_elements(pm.tokens) AS elem
  )
  WHERE pm.tokens @> '[{"token_type":"transport"}]'::jsonb;
