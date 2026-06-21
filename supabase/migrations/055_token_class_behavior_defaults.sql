-- Apply live-map token class behavior defaults to already placed tokens.
-- This is a data migration only; token classes continue to be represented by
-- the existing token_type column.

UPDATE tokens
SET
  visible_to_players = FALSE,
  discoverable = TRUE,
  visible_on_cast = TRUE,
  interactable = TRUE,
  requires_approval = TRUE,
  movement_locked = FALSE,
  movement_override_allowed = FALSE,
  interaction_range_feet = 5,
  available_actions = ARRAY['Attack', 'Inspect']::TEXT[],
  hidden_dm_actions = ARRAY[]::TEXT[],
  object_state = 'visible',
  resolver_type = 'attack'
WHERE token_type = 'enemy';

UPDATE tokens
SET
  visible_to_players = TRUE,
  discoverable = TRUE,
  visible_on_cast = TRUE,
  interactable = TRUE,
  requires_approval = TRUE,
  movement_locked = TRUE,
  movement_override_allowed = FALSE,
  interaction_range_feet = 10,
  available_actions = ARRAY['Talk', 'Inspect']::TEXT[],
  hidden_dm_actions = ARRAY[]::TEXT[],
  object_state = 'visible',
  resolver_type = 'manual'
WHERE token_type = 'npc';

UPDATE tokens
SET
  visible_to_players = FALSE,
  discoverable = TRUE,
  visible_on_cast = TRUE,
  interactable = TRUE,
  requires_approval = TRUE,
  movement_locked = TRUE,
  movement_override_allowed = FALSE,
  interaction_range_feet = 5,
  available_actions = ARRAY['Enter', 'Inspect']::TEXT[],
  hidden_dm_actions = ARRAY[]::TEXT[],
  object_state = 'visible',
  resolver_type = 'manual'
WHERE token_type = 'portal';

UPDATE tokens
SET
  visible_to_players = FALSE,
  discoverable = TRUE,
  visible_on_cast = TRUE,
  interactable = TRUE,
  requires_approval = TRUE,
  movement_locked = TRUE,
  movement_override_allowed = FALSE,
  interaction_range_feet = 5,
  available_actions = ARRAY['Inspect', 'Search', 'Take', 'Use Item']::TEXT[],
  hidden_dm_actions = ARRAY[]::TEXT[],
  object_state = 'visible',
  resolver_type = 'object_state'
WHERE token_type IN ('loot', 'chest', 'key', 'container');

UPDATE tokens
SET
  visible_to_players = FALSE,
  discoverable = TRUE,
  visible_on_cast = TRUE,
  interactable = TRUE,
  requires_approval = TRUE,
  movement_locked = TRUE,
  movement_override_allowed = FALSE,
  interaction_range_feet = 5,
  available_actions = ARRAY['Inspect', 'Open', 'Close', 'Use Item', 'Lockpick', 'Disarm', 'Read']::TEXT[],
  hidden_dm_actions = ARRAY[]::TEXT[],
  object_state = 'visible',
  resolver_type = 'object_state'
WHERE token_type IN ('object', 'trap', 'door', 'book', 'note', 'lever', 'switch', 'custom');
