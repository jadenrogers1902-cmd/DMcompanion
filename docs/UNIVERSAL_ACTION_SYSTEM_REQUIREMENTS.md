# Universal Action System Requirements

## Status

Implemented as the first universal DM-controlled action framework.

This system extends the existing token/object interaction model instead of creating a parallel attack-only flow. Attack is one resolver type inside the broader action system.

## Implemented

- DM-configured interactable tokens/objects.
- DM-configured `available_actions` per token/object.
- Floating Map Editor token/object editor with an Actions tab for interaction range,
  allowed actions, hidden DM-only actions, approval requirement, and resolver type.
- Player nearby action menu based on active map, token visibility, `interactable`, and range.
- Inline contextual action menu directly on the player Adventure/map screen (`PlayerMapView`):
  tapping an interactable target shows the same DM-allowed action list (`actionsForToken`) and
  range check (`distanceFeet`), and submits via the existing `submitActionIntent` action without
  leaving the map. See `docs/PLAYER_ADVENTURE_HUB_REQUIREMENTS.md`.
- Action request creation using `action_intents`.
- Live DM request queue through Supabase Realtime refresh.
- DM approve, deny, ask for roll, and resolve manually controls.
- Resolver metadata on action requests:
  - `resolver_type`
  - `resolver_status`
  - `response_visibility`
  - `resolved_by`
- Resolver result table: `action_results`.
- Combat log table: `combat_logs`.
- Character attack definitions: `character_attacks`.
- Token/object combat fields:
  - `max_hp`
  - `current_hp`
  - `temp_hp`
  - `armor_class`
  - `is_defeated`
- Token/object resolver fields:
  - `visible_on_cast`
  - `requires_approval`
  - `resolver_type`
  - `resolver_config`
- Basic dramatic countdown UI during resolver progress.

## Implemented Resolver Types

- `manual`: DM writes a response and resolves the request.
- `object_state`: approval updates object state for actions like Open, Close, Lockpick, Disarm, Activate, Break, and Take.
- `attack`: DM approval starts player attack resolution; player chooses an attack option or basic fallback, rolls attack/damage, and updates target HP.

## Not Implemented Yet

- Full spell automation.
- Full trap automation.
- Advanced scripted events.
- Complex dialogue trees.
- Import/restore for exports.
- Dedicated cast-screen route. Public-safe action results are stored with `public_result` for a future cast screen to consume.
- Undo damage / override hit-miss UI beyond direct HP/defeated edits in the Map Editor.
- Dedicated duplicate-token workflow from the map quick menu.
