# Data Model Notes

## Adventure Maker Phase 9 - Live Map Source Tracking

`maps.source_prepared_map_id` (migration 023) records which prepared map a live map was
deployed from. `REFERENCES prepared_maps(id) ON DELETE SET NULL` — deleting the prep
nulls the link instead of cascading. `maps` is realtime-published, so this is an
**opaque reference id only**: no DM-private content is stored on the live row, and
`prepared_maps` stays behind DM-only RLS. Deploy creates fully independent live
`maps`/`tokens` rows (+ copied image) and never writes back to `prepared_maps`, so prep
is immune to live-session edits. Map-level DM notes/links are intentionally NOT copied
onto the live map; the DM reaches them via the "Prep source" link instead. Per-token DM
notes still flow to the DM-only `token_dm_notes` table; only `visible` tokens deploy
player-visible.

---

## Adventure Maker Phase 8 - Token Resource Lookup

Each prepared token may carry an optional `resource: TokenResourceRef | null`
(`lib/types/adventure.ts`), stored inside the existing `prepared_maps.tokens` JSONB —
**no migration**. The reference is deliberately slim (source/source_id/source_url/
category/name/summary/metadata/synced_at) and never holds full SRD rules text. It is
kept entirely separate from `dm_notes`, `player_notes`, `description`, `prep_notes`,
and `links`. `normalizeTokenResource()` in `components/adventures/token-meta.ts` caps
every field on load and save. The source is the WotC SRD 5.1 (CC BY 4.0) via Open5e,
pinned with `document__slug=wotc-srd` in `lib/srd/open5e.ts`. Resources are prep-only
and are not copied to live tokens on deploy.

---

## Adventure Maker Phase 6 - Prep Database

Adventure Maker prep metadata is intentionally lightweight:

- Adventure and Chapter prep notes/links live as JSONB on `adventures` and
  `adventure_chapters`.
- Prepared Map notes/links continue to live as JSONB on `prepared_maps`.
- Prepared tokens continue to live inside `prepared_maps.tokens` JSONB, now with status,
  tags, structured prep notes, player-facing notes, and important links.
- Tags are stored as `text[]` on Adventure, Chapter, and Prepared Map records.

This keeps Phase 6 aligned with the existing single-editor prep model. The backing tables are
DM-only under RLS, so prep notes and unrevealed resources are not exposed to players.

---

## Universal Action System Addendum

Implemented in `supabase/migrations/010_universal_action_system.sql`.

### tokens (extended)

Tokens now support universal object configuration and first-version combat state:
- `visible_on_cast`
- `requires_approval`
- `resolver_type`
- `resolver_config`
- `max_hp`
- `current_hp`
- `temp_hp`
- `armor_class`
- `is_defeated`

`object_state` now also supports `defeated`.

### action_intents (extended)

The existing request table is the universal action request table. It now includes:
- `response_visibility`
- `resolver_type`
- `resolver_status`
- `resolved_by`

Status now includes `resolving`.

### character_attacks

Player/DM-authored attack options for the attack resolver. This avoids storing
copyrighted sourcebook data while allowing characters to define attacks manually.

### action_results

Player-safe action result rows. DMs can read all rows; non-DMs only read rows
where `private_dm_details IS NULL` and they are either the actor or the result is
public.

### combat_logs

Attack resolver logs containing d20 rolls, attack totals, target AC, damage
rolls, HP before/after, and defeated state.

## Phase 9 Addendum - Live Map Visibility & Interactable Objects

Implemented in `supabase/migrations/008_map_visibility_objects.sql`. Extends the
existing `tokens` and `action_intents` tables rather than introducing parallel
object/queue tables (the existing infrastructure already covered most of the
"suggested schema" in the spec).

### tokens (extended)

New/changed columns:
- `token_type` — CHECK constraint widened to a 16-member union: `player, npc,
  enemy, object, trap, door, chest, book, note, loot, lever, switch, portal,
  key, container, custom`.
- `interactable` (boolean, default `false`) — gates whether a token shows up as
  an interaction target for players at all (independent of `visible_to_players`
  and `available_actions`). A backfill (`UPDATE ... WHERE token_type IN
  ('player','npc','enemy','door','trap')`) marks the common interactable types
  `interactable = true` for existing rows.
- `object_state` (text, nullable) — one of `OBJECT_STATES` (Hidden, Visible,
  Locked, Unlocked, Open, Closed, Trapped, Disarmed, Activated, Disabled,
  Looted, Broken, Custom). Freeform text column; UI constrains to the known set.
- `public_description` (text, nullable) — DM-authored, player-safe flavor text
  shown to players when they inspect the token (distinct from the existing
  DM-only `dm_notes`/`token_dm_notes`).

### map_revealed_areas (new table)

Implements the "first version" fog/reveal layer described in the spec — a set
of DM-controlled shapes that determine what part of the map image players can
see, fully independent of per-token visibility.

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| campaign_id | uuid | FK → campaigns.id |
| map_id | uuid | FK → maps.id |
| shape_type | text | `full`, `rectangle`, or `circle` (CHECK constraint) |
| x, y | numeric | World-space origin (top-left for rectangle, center for circle) |
| width, height | numeric, nullable | Rectangle dimensions (null for circle/full) |
| radius | numeric, nullable | Circle radius (null for rectangle/full) |
| visible_to_players | boolean | DM toggle — area can be "drawn" but hidden again without deleting it |
| created_by | uuid | FK → profiles.id |
| created_at / updated_at | timestamptz | `updated_at` maintained by trigger |

RLS: DMs can select/insert/update/delete all rows for their campaign; players
can only `SELECT` rows where `visible_to_players = true` AND the row's map is
the campaign's currently active map. Realtime is enabled with `REPLICA IDENTITY
FULL`, mirroring the `tokens` pattern — when the DM flips `visible_to_players`
to `false`, the row stops matching the player's RLS policy and Supabase
Realtime delivers it to that subscriber as an effective delete, removing the
revealed cutout from their fog overlay live.

### action_intents (extended)

- `status` — CHECK constraint widened to add `cancelled` to the existing
  `pending, approved, denied, needs_roll, resolved` set.
- New narrow RLS policy `action_intents_cancel_actor`: `FOR UPDATE … USING
  (actor_user_id = auth.uid() AND status = 'pending') WITH CHECK
  (actor_user_id = auth.uid() AND status = 'cancelled')`. This lets a player
  withdraw their own still-pending request without granting any path to
  self-approve, self-deny, or self-resolve (those remain DM-only via the
  existing DM-scoped policies).

## Phase 7 Addendum - Story Tools, Journal, Handouts, and Recaps

Implemented in `supabase/migrations/007_story_tools.sql`.

New tables:
- `quests`: campaign-scoped quest records with status, DM description, player-visible description, rewards, visibility, and DM notes.
- `npcs`: campaign-scoped NPC records with role, optional location/token links, player notes, DM notes, portrait URL, and visibility.
- `locations`: campaign-scoped locations with optional map link, public notes, DM notes, and visibility.
- `notes`: campaign-scoped notes with `dm` or `shared` visibility and optional links to quest, NPC, location, map, or encounter.
- `handouts`: metadata for private Storage files in the `handouts` bucket, with reveal state and optional story links.
- `session_recaps`: structured session recap fields plus DM-only follow-up notes and player visibility.

Storage:
- `handouts` is a private bucket. File paths use `{campaign_id}/{uuid}.{ext}`.
- The app generates short-lived signed URLs for files the current user is allowed to view.

Privacy model:
- DM views load full story rows.
- Player journal queries only visible/revealed/shared rows and omit DM-only columns from player-facing selects.
- RLS allows DMs to manage all story content and players to select only visible/revealed/shared rows.

## Phase 1 — Implemented

These tables are live in `supabase/migrations/001_initial_schema.sql`.

### profiles
Extends `auth.users`. Auto-created by a trigger on user signup.

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK, FK → auth.users.id |
| display_name | text | Set from `raw_user_meta_data.display_name` or email prefix |
| avatar_url | text | Nullable |
| created_at | timestamptz | |

### campaigns

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| name | text | |
| description | text | Nullable |
| owner_id | uuid | FK → profiles.id |
| invite_code | text | Unique, 8-char alphanumeric, auto-generated |
| created_at | timestamptz | |
| updated_at | timestamptz | Auto-updated by trigger |

### campaign_members

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| campaign_id | uuid | FK → campaigns.id |
| user_id | uuid | FK → profiles.id |
| role | text | `dm` or `player` (CHECK constraint) |
| joined_at | timestamptz | |
| (unique) | | (campaign_id, user_id) must be unique |

### Database Functions (Phase 1)

| Function | Purpose |
|---|---|
| `handle_new_user()` | Trigger: auto-create profile on auth.users INSERT |
| `generate_invite_code()` | Returns a random 8-char invite code |
| `get_campaign_by_invite_code(code)` | SECURITY DEFINER: returns campaign id+name by invite code without leaking DM data |
| `regenerate_invite_code(campaign_id)` | SECURITY DEFINER: regenerates code for campaigns the caller owns |
| `update_updated_at()` | Trigger: keep updated_at current |

---

## Phase 2 — Implemented

These tables are live in `supabase/migrations/002_characters.sql`.

### characters

> **Design decision:** Ability scores (STR–CHA) and all core combat stats are
> stored directly on the `characters` row, **not** in a separate
> `character_stats` table. They are strictly 1:1 with a character, so a join
> table would add complexity and an extra query for zero benefit. The Phase 2
> prompt listed `character_stats` as a candidate table; it was consolidated
> into `characters` for simplicity and performance.
>
> **Naming note:** the Intelligence column is named `intel`, not `int`, because
> `int` is a reserved type keyword in Postgres. The UI still labels it "INT".

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| campaign_id | uuid | FK → campaigns.id (cascade delete) |
| user_id | uuid | FK → profiles.id (owner) |
| name | text | Required |
| class | text | Nullable |
| level | integer | Default 1 |
| race | text | Nullable |
| background | text | Nullable |
| armor_class | integer | Default 10 |
| max_hp | integer | Default 0 |
| current_hp | integer | Default 0 |
| temp_hp | integer | Default 0 |
| speed | integer | Default 30 |
| initiative_bonus | integer | Default 0 |
| passive_perception | integer | Default 10 |
| proficiency_bonus | integer | Default 2 (manual) |
| str / dex / con / intel / wis / cha | integer | Default 10 each |
| notes | text | Nullable |
| created_at / updated_at | timestamptz | updated_at via trigger |

### character_inventory_items

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| character_id | uuid | FK → characters.id (cascade) |
| name | text | Required |
| quantity | integer | Default 1 |
| description | text | Nullable |
| equipped | boolean | Default false |
| magical | boolean | Default false |
| visible_to_dm | boolean | Default true — when false, DM cannot read the row (RLS) |
| notes | text | Nullable |
| created_at | timestamptz | |

### character_spells

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| character_id | uuid | FK → characters.id (cascade) |
| name | text | Required |
| spell_level | integer | Default 0 (0 = cantrip) |
| prepared | boolean | Default false |
| uses | text | Manual, e.g. "3/4" or "2 slots" |
| description | text | User-written only (no sourcebook text) |
| notes | text | Nullable |
| created_at | timestamptz | |

### character_abilities

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| character_id | uuid | FK → characters.id (cascade) |
| name | text | Required |
| source | text | class / race / feat / homebrew |
| uses | text | Manual |
| reset_type | text | short rest / long rest / manual |
| description | text | User-written only |
| notes | text | Nullable |
| created_at | timestamptz | |

### character_conditions

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| character_id | uuid | FK → characters.id (cascade) |
| name | text | Standard 5e condition or custom string |
| notes | text | Nullable |
| created_at | timestamptz | |

### Database Functions (Phase 2)

| Function | Purpose |
|---|---|
| `is_campaign_member(cid)` | SECURITY DEFINER: is the current user a member of campaign `cid`? Used in RLS to avoid recursion. |
| `is_campaign_dm(cid)` | SECURITY DEFINER: is the current user the DM/owner of campaign `cid`? |
| `character_owner_id(char_id)` | SECURITY DEFINER: returns the owner user_id of a character (for child-table RLS) |
| `character_campaign_id(char_id)` | SECURITY DEFINER: returns the campaign_id of a character |

> **Phase 1 bug fixed in 002:** The original `campaign_members` SELECT policy
> queried `campaign_members` from within its own policy, which Postgres rejects
> with "infinite recursion detected in policy". Migration 002 replaces it with
> the `is_campaign_member()` SECURITY DEFINER helper.

---

## Phase 3 — Implemented

These tables are live in `supabase/migrations/003_maps.sql`. Map images are
stored in a **private** Supabase Storage bucket named `maps`
(path convention `maps/{campaign_id}/{uuid}.{ext}`) and served to authorized
users via short-lived signed URLs.

### maps

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| campaign_id | uuid | FK → campaigns.id (cascade) |
| name | text | Required |
| storage_path | text | Path within the `maps` bucket |
| grid_enabled | boolean | Default true |
| grid_size | integer | Pixels per square, default 50 |
| grid_scale_feet | integer | Feet per square, default 5 |
| width | integer | Natural image width (px) |
| height | integer | Natural image height (px) |
| is_active | boolean | The single map players currently see |
| player_movement_locked | boolean | **(Phase 4)** When true, players cannot move tokens |
| created_by | uuid | FK → profiles.id |
| created_at / updated_at | timestamptz | updated_at via trigger |

### tokens

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| campaign_id | uuid | FK → campaigns.id (cascade) |
| map_id | uuid | FK → maps.id (cascade) |
| token_type | text | `player` / `npc` / `enemy` / `object` / `trap` / `door` (CHECK) |
| name | text | Default '' |
| x | double precision | Center X in image-pixel space |
| y | double precision | Center Y in image-pixel space |
| size | double precision | Diameter in grid squares (default 1) |
| color | text | Hex color (defaults per type) |
| image_url | text | Optional custom icon (future) |
| visible_to_players | boolean | Default true; enemies/traps/doors created hidden |
| controlled_by_user_id | uuid | Optional, FK → profiles.id (set null on delete) |
| linked_character_id | uuid | Optional, FK → characters.id (set null on delete) |
| notes | text | Player-visible note |
| movement_locked | boolean | **(Phase 4)** Per-token lock |
| movement_used | double precision | **(Phase 4)** Feet moved from the round anchor |
| movement_override_allowed | boolean | **(Phase 4)** DM lets this token exceed speed |
| last_x / last_y | double precision | **(Phase 4)** Round anchor (nullable) |
| created_at / updated_at | timestamptz | updated_at via trigger |

> **`dm_notes` moved out in Phase 4.** It was originally a column on `tokens`,
> but realtime broadcasts the full row (RLS filters rows, not columns), so the
> column would have reached players over the websocket. It now lives in a
> separate, non-published `token_dm_notes` table (see Phase 4 below).

### Storage & Functions (Phase 3)

| Object | Purpose |
|---|---|
| bucket `maps` (private) | Stores uploaded map images |
| `maps_storage_*` policies | Campaign members can read; only the DM can write/delete, scoped by the campaign-id folder segment |
| `set_active_map(campaign_id, map_id)` | SECURITY DEFINER: atomically marks one map active and clears the rest (DM only) |

> **Coordinate model:** token `x`/`y` are stored in the map image's natural
> pixel space (origin top-left, center anchor). The viewer applies pan/zoom as a
> CSS transform, so stored positions are resolution-independent.

---

## Phase 4 — Implemented

Live in `supabase/migrations/004_movement.sql`.

### token_dm_notes

DM-only token notes, kept out of the realtime publication so they are never
broadcast to players.

| Field | Type | Notes |
|---|---|---|
| token_id | uuid | PK, FK → tokens.id (cascade) |
| campaign_id | uuid | FK → campaigns.id (cascade) — used for the RLS DM check |
| content | text | The private note |
| updated_at | timestamptz | |

RLS: `ALL` operations require `is_campaign_dm(campaign_id)`.

### Realtime & Functions (Phase 4)

| Object | Purpose |
|---|---|
| publication `supabase_realtime` += `tokens`, `maps` | Live token/lock updates; RLS applies per subscriber |
| `REPLICA IDENTITY FULL` on tokens, maps | Full row in change events for diffing |
| `move_token(token_id, x, y)` | SECURITY DEFINER: the **only** way a player writes a token. Validates control, map/token locks, and the speed limit, then updates **only** position + movement_used. Returns JSON `{ ok | error, x, y, movement_used, max_feet }`. |

> **Movement model:** `movement_used` = Chebyshev distance (squares → feet) from
> the round anchor (`last_x`/`last_y`). The anchor is set on the first move after
> a reset; the DM "Reset movement" re-anchors and zeroes the counter. A DM move
> also re-anchors. Speed comes from the linked character; with no link or with
> `movement_override_allowed`, no limit is enforced.
>
> **Why a SECURITY DEFINER RPC instead of a player UPDATE policy:** RLS gates
> rows, not columns. A blanket player UPDATE grant would let a player flip
> `visible_to_players` or other fields. The RPC keeps `tokens` UPDATE DM-only
> while letting players move only the tokens they control, position-only.

---

## Planned — Future Phases

### Encounter (Phase 5)

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| campaign_id | uuid | FK → campaigns.id |
| name | text | |
| status | text | `prep`, `active`, `completed` |
| current_turn | integer | Index into combatants |
| created_by | uuid | FK → profiles.id |
| created_at | timestamptz | |

### EncounterCombatant (Phase 5)

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| encounter_id | uuid | FK → encounters.id |
| name | text | |
| type | text | `player`, `npc`, `enemy` |
| initiative | integer | |
| max_hp | integer | |
| current_hp | integer | |
| armor_class | integer | |
| conditions | text[] | |
| linked_character_id | uuid | Optional |
| sort_order | integer | |

### NPC (Phase 7)

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| campaign_id | uuid | FK → campaigns.id |
| name | text | |
| description | text | |
| notes | text | DM-only |
| is_shared | boolean | Whether players can see this NPC |
| created_by | uuid | FK → profiles.id |
| created_at | timestamptz | |

### Quest (Phase 7)

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| campaign_id | uuid | FK → campaigns.id |
| title | text | |
| description | text | |
| status | text | `active`, `completed`, `failed` |
| is_shared | boolean | |
| created_by | uuid | FK → profiles.id |
| created_at / updated_at | timestamptz | |

### Note (Phase 7)

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| campaign_id | uuid | FK → campaigns.id |
| title | text | |
| content | text | |
| is_shared | boolean | |
| created_by | uuid | FK → profiles.id |
| created_at / updated_at | timestamptz | |

### Handout (Phase 7)

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| campaign_id | uuid | FK → campaigns.id |
| title | text | |
| description | text | |
| file_url | text | Supabase Storage path |
| is_revealed | boolean | |
| created_by | uuid | FK → profiles.id |
| created_at | timestamptz | |

> **Note:** Character inventory was implemented in Phase 2 as
> `character_inventory_items` (see the Phase 2 section above). A `weight` field
> was intentionally omitted to keep entry simple; it can be added later.

---

## Design Notes

- All tables have Row Level Security (RLS) enabled in Supabase.
- `is_hidden`, `is_shared`, and `visible_to_dm` fields are the primary visibility toggles.
- DM-only data must never be returned by player-accessible queries.
- Ability scores live on `characters` (1:1); only genuinely one-to-many data (inventory, spells, abilities, conditions) gets its own table.
- All IDs are UUIDs.
- `updated_at` columns are managed by database triggers, not application code.
- `SECURITY DEFINER` functions are used for cross-table RLS checks to avoid policy recursion.
- Spell/ability descriptions are user-written only — no sourcebook content is stored (see RULES_AND_LICENSING_NOTES.md).
# Phase 5 - Encounter Data Model Addendum

Live in `supabase/migrations/005_encounters.sql`.

## encounters

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| campaign_id | uuid | FK to campaigns.id |
| map_id | uuid | Optional FK to maps.id |
| name | text | Required |
| status | text | `draft`, `active`, or `completed` |
| current_round | integer | Default 1 |
| current_turn_participant_id | uuid | Optional FK to encounter_participants.id |
| created_by | uuid | FK to profiles.id |
| created_at / updated_at | timestamptz | updated_at via trigger |

## encounter_participants

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| encounter_id | uuid | FK to encounters.id |
| campaign_id | uuid | FK to campaigns.id, used by RLS |
| token_id | uuid | Optional FK to tokens.id |
| character_id | uuid | Optional FK to characters.id |
| name | text | Required |
| participant_type | text | `player`, `npc`, or `enemy` |
| initiative | integer | Nullable manual value |
| armor_class | integer | Default 10 |
| max_hp / current_hp / temp_hp | integer | Manual HP tracking |
| speed | integer | Default 30 |
| is_visible_to_players | boolean | Hidden participants are excluded from player reads |
| is_defeated | boolean | Manual defeated marker |
| notes | text | Player-visible note |
| created_at / updated_at | timestamptz | updated_at via trigger |

## encounter_participant_dm_notes

DM-only participant notes. Kept separate from `encounter_participants` so
player-visible participant rows do not expose private DM note columns.

## encounter_conditions

Manual standard/custom conditions per participant. Players only see conditions
for visible participants.

---
# Phase 6 - Contextual Action Data Model Addendum

Live in `supabase/migrations/006_action_intents.sql`.

## tokens interaction fields

| Field | Type | Notes |
|---|---|---|
| interaction_range_feet | integer | Default 5 ft |
| available_actions | text[] | Optional DM override for player-visible actions |
| hidden_dm_actions | text[] | Optional private DM action hints |

## action_intents

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| campaign_id | uuid | FK to campaigns.id |
| map_id | uuid | FK to maps.id |
| encounter_id | uuid | Optional FK to encounters.id |
| actor_character_id | uuid | Character submitting intent |
| actor_user_id | uuid | User submitting intent |
| target_token_id | uuid | Visible target token |
| action_type | text | Manual intent, no automatic resolution |
| message | text | Optional player details |
| status | text | `pending`, `approved`, `denied`, `needs_roll`, `resolved` |
| distance_feet / range_feet | integer | Snapshot at submission time |
| dm_response | text | Player-visible DM response |
| created_at / resolved_at | timestamptz | |

## action_intent_dm_notes

DM-only notes for action requests. Kept separate from `action_intents` so
players never receive private DM notes.

---
