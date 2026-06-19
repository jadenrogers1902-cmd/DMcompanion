-- Player-safe live-map token projection.
--
-- Players normally receive visible tokens only. Discoverable portal tokens are
-- the exception: return a sanitized, dimmable hint row so players can tell that
-- something is there without receiving destination details before discovery.

CREATE OR REPLACE FUNCTION get_player_live_map_tokens(p_map_id UUID)
RETURNS TABLE (
  id UUID,
  campaign_id UUID,
  map_id UUID,
  token_type TEXT,
  name TEXT,
  x DOUBLE PRECISION,
  y DOUBLE PRECISION,
  size DOUBLE PRECISION,
  color TEXT,
  image_url TEXT,
  visible_to_players BOOLEAN,
  controlled_by_user_id UUID,
  linked_character_id UUID,
  notes TEXT,
  movement_locked BOOLEAN,
  movement_used DOUBLE PRECISION,
  movement_override_allowed BOOLEAN,
  last_x DOUBLE PRECISION,
  last_y DOUBLE PRECISION,
  interaction_range_feet INTEGER,
  available_actions TEXT[],
  hidden_dm_actions TEXT[],
  interactable BOOLEAN,
  object_state TEXT,
  destination_prepared_map_id UUID,
  source_prepared_token_id TEXT,
  discoverable BOOLEAN,
  public_description TEXT,
  visible_on_cast BOOLEAN,
  requires_approval BOOLEAN,
  resolver_type TEXT,
  resolver_config JSONB,
  max_hp INTEGER,
  current_hp INTEGER,
  temp_hp INTEGER,
  armor_class INTEGER,
  is_defeated BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.campaign_id,
    t.map_id,
    t.token_type,
    CASE
      WHEN t.visible_to_players THEN t.name
      ELSE 'Unrevealed portal'
    END AS name,
    t.x,
    t.y,
    t.size,
    COALESCE(t.color, '#a855f7') AS color,
    CASE WHEN t.visible_to_players THEN t.image_url ELSE NULL END AS image_url,
    t.visible_to_players,
    CASE WHEN t.visible_to_players THEN t.controlled_by_user_id ELSE NULL END AS controlled_by_user_id,
    CASE WHEN t.visible_to_players THEN t.linked_character_id ELSE NULL END AS linked_character_id,
    CASE WHEN t.visible_to_players THEN t.notes ELSE NULL END AS notes,
    CASE WHEN t.visible_to_players THEN t.movement_locked ELSE TRUE END AS movement_locked,
    CASE WHEN t.visible_to_players THEN t.movement_used ELSE 0 END AS movement_used,
    CASE WHEN t.visible_to_players THEN t.movement_override_allowed ELSE FALSE END AS movement_override_allowed,
    CASE WHEN t.visible_to_players THEN t.last_x ELSE NULL END AS last_x,
    CASE WHEN t.visible_to_players THEN t.last_y ELSE NULL END AS last_y,
    CASE WHEN t.visible_to_players THEN t.interaction_range_feet ELSE 0 END AS interaction_range_feet,
    CASE WHEN t.visible_to_players THEN t.available_actions ELSE ARRAY[]::TEXT[] END AS available_actions,
    ARRAY[]::TEXT[] AS hidden_dm_actions,
    CASE WHEN t.visible_to_players THEN t.interactable ELSE FALSE END AS interactable,
    CASE WHEN t.visible_to_players THEN t.object_state ELSE 'hidden' END AS object_state,
    CASE WHEN t.visible_to_players THEN t.destination_prepared_map_id ELSE NULL END AS destination_prepared_map_id,
    CASE WHEN t.visible_to_players THEN t.source_prepared_token_id ELSE NULL END AS source_prepared_token_id,
    t.discoverable,
    CASE WHEN t.visible_to_players THEN t.public_description ELSE NULL END AS public_description,
    CASE WHEN t.visible_to_players THEN t.visible_on_cast ELSE FALSE END AS visible_on_cast,
    CASE WHEN t.visible_to_players THEN t.requires_approval ELSE TRUE END AS requires_approval,
    CASE WHEN t.visible_to_players THEN t.resolver_type ELSE 'manual' END AS resolver_type,
    CASE WHEN t.visible_to_players THEN t.resolver_config ELSE '{}'::JSONB END AS resolver_config,
    CASE WHEN t.visible_to_players THEN t.max_hp ELSE 0 END AS max_hp,
    CASE WHEN t.visible_to_players THEN t.current_hp ELSE 0 END AS current_hp,
    CASE WHEN t.visible_to_players THEN t.temp_hp ELSE 0 END AS temp_hp,
    CASE WHEN t.visible_to_players THEN t.armor_class ELSE 10 END AS armor_class,
    CASE WHEN t.visible_to_players THEN t.is_defeated ELSE FALSE END AS is_defeated,
    t.created_at,
    t.updated_at
  FROM tokens t
  JOIN maps m ON m.id = t.map_id
  WHERE t.map_id = p_map_id
    AND m.is_active = TRUE
    AND is_campaign_member(t.campaign_id)
    AND (
      t.visible_to_players = TRUE
      OR (
        t.token_type = 'portal'
        AND t.discoverable = TRUE
        AND t.visible_to_players = FALSE
      )
    );
$$;

GRANT EXECUTE ON FUNCTION get_player_live_map_tokens(UUID) TO authenticated;
