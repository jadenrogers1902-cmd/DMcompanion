# Role and Permission Notes

## Universal Action System Addendum

Implemented in `supabase/migrations/010_universal_action_system.sql`.

Database-level rules:
- `character_attacks`: character owner or campaign DM can manage attack options.
- `action_results`: DMs can manage all results. Players can read only their own
  results or public results, and only when `private_dm_details IS NULL`.
- `combat_logs`: campaign members can read logs; only DMs can insert/update/delete.
- `action_intents`: players can submit/cancel their own requests; DMs control
  approval, denial, roll requests, manual resolution, and resolver state.
- `tokens`: HP, AC, defeated, resolver config, allowed actions, state, cast
  visibility, and interaction settings remain DM-controlled through existing
  token UPDATE policies.

Application-level rules:
- Player action submission rechecks visibility, interactability, allowed action,
  ownership, and distance on the server.
- Attack resolution requires the original actor and a DM-approved request.
- Players do not get UI to mutate enemy HP, target AC, resolver config, object
  state, visibility, or allowed actions.
- DM override is handled by Map Editor token state/HP controls.

## Phase 9 Addendum - Live Map Visibility & Interactable Object Permissions

Implemented in `supabase/migrations/008_map_visibility_objects.sql` plus
application changes to `MapEditor`/`PlayerMapView`/`ActionCenter`. Extends the
existing token-visibility and action-intent systems — see `DATA_MODEL_NOTES.md`
Phase 9 addendum for the schema details.

Database-level RLS:
- `map_revealed_areas`: DMs can `SELECT/INSERT/UPDATE/DELETE` all rows for
  their campaign. Players can only `SELECT` rows where `visible_to_players =
  true` AND the row belongs to the campaign's currently-active map. There is
  **no** player INSERT/UPDATE/DELETE policy — players cannot create, move,
  resize, or hide/reveal fog areas under any circumstance.
- `tokens`: unchanged select policies continue to gate row visibility (DM sees
  all; players see only `visible_to_players = true` rows on the active map).
  The new `interactable`, `object_state`, and `public_description` columns ride
  along on the same row and are therefore covered by the same RLS — a hidden
  token's state/description/interactivity is invisible to players exactly like
  its position and existence.
- `action_intents`: existing DM-only policies continue to gate
  approve/deny/ask-roll/resolve transitions. The new `action_intents_cancel_actor`
  policy is scoped tightly enough that a player can only move *their own*
  *pending* request to *cancelled* — they cannot use it to self-approve,
  self-deny, mark-resolved, or touch another player's request (`USING`/`WITH
  CHECK` both pin `actor_user_id = auth.uid()`, and the status transition is
  locked to `pending → cancelled`).

Application-level rules:
- `actionsForToken()` (in `lib/utils/actions.ts`) now short-circuits to `[]`
  when `token.interactable` is `false`, regardless of what `available_actions`
  contains — a token must be explicitly marked interactable by the DM before
  any action button appears for players, even if it's visible on the map.
- The player Action Center's "nearby" filter requires `visible_to_players &&
  interactable` AND a computed in-range distance check
  (`distanceFeet(...) <= interaction_range_feet ?? 5`) before listing a target
  — satisfying the "DM has not revealed any nearby interactable objects" /
  range-gating requirements.
- Players have no UI to: place/move/delete tokens, edit `object_state`,
  `public_description`, `interactable`, `available_actions`,
  `interaction_range_feet`, or `dm_notes`, draw/toggle/delete revealed areas, or
  change a request's status to anything other than `pending → cancelled`.
- The Map Editor (`MapEditor.tsx`) is the only place these controls render, and
  that page redirects non-DM members back to `/campaigns/[id]/maps` server-side.
- Realtime privacy: `map_revealed_areas` and `tokens` broadcast full rows, but
  RLS filters which *rows* reach a subscriber — DM-only data (notes) lives in
  the separate, unpublished `token_dm_notes` / `action_intent_dm_notes` tables
  so it never reaches a player's realtime channel even as a byproduct of a
  broadcast on the parent row.

## Phase 7 Addendum - Story Tools Permissions

Story content is campaign-scoped and follows the same DM/player split as maps, encounters, and action intents.

Database-level RLS:
- `quests`, `npcs`, `locations`, and `session_recaps`: DMs can create, update, and delete. Campaign members can select only rows where `visible_to_players = true`.
- `notes`: DMs can manage all notes. Players can select only notes where `visibility = 'shared'`.
- `handouts`: DMs can manage all metadata rows. Players can select only rows where `is_revealed = true`.
- Storage bucket `handouts`: private bucket. Campaign members may read files under their campaign folder; DMs may upload/update/delete. The app only creates signed URLs for handout rows visible to the current role.

Application-level rules:
- `/campaigns/[id]/story` is role-aware. DMs see Story Tools; players see Party Journal.
- Player journal queries use explicit select lists that omit quest/NPC/location/session DM-only note fields.
- Hidden quests, NPCs, locations, private notes, hidden handouts, and unshared recaps are not loaded into the player journal.
- Players have no UI controls for creating, editing, revealing, deleting, or uploading story content.

## Roles

There are two roles within a campaign:

| Role | Description |
|---|---|
| `dm` | Dungeon Master — full control over the campaign |
| `player` | Player — limited to their character and DM-revealed content |

A user may be a DM in one campaign and a player in another. Role is stored per-campaign in the `campaign_members` table.

---

## Phase 1 — Implemented Permissions

### What's enforced at the database level (RLS)

**profiles:**
- Any authenticated user can SELECT any profile (needed to display member names)
- Users can INSERT only their own profile (auto-created by trigger)
- Users can UPDATE only their own profile

**campaigns:**
- SELECT: user is the owner OR user has a row in campaign_members for this campaign
- INSERT: any authenticated user (owner_id must equal auth.uid())
- UPDATE: owner only
- DELETE: owner only

**campaign_members:**
- SELECT: user is in the campaign OR user is the owner of the campaign
- INSERT: user_id must equal auth.uid() (players join themselves)
- DELETE: member can remove themselves OR campaign owner can remove any member

### What's enforced at the application level

- `/dashboard` — redirect to `/login` if unauthenticated (proxy.ts)
- `/campaigns/*` — redirect to `/login` if unauthenticated (proxy.ts)
- `/join` — redirect to `/login` if unauthenticated (proxy.ts)
- `/campaigns/[id]/settings` — redirects non-owners client-side; ownership checked server-side
- Invite code lookup uses a SECURITY DEFINER function that returns only `id` and `name` — no DM data leaked

---

## Phase 2 — Character Permissions (RLS)

**characters:**
- SELECT: owner OR any member of the same campaign (party + DM can view the sheet)
- INSERT: `user_id = auth.uid()` AND the user is a member of the campaign
- UPDATE: owner OR the campaign DM (DM may adjust HP/conditions)
- DELETE: owner only

**character_inventory_items:**
- SELECT: character owner (sees all) OR campaign DM **only if `visible_to_dm = true`**
- INSERT / UPDATE / DELETE: character owner only

**character_spells / character_abilities:**
- SELECT: character owner OR campaign DM
- INSERT / UPDATE / DELETE: character owner only

**character_conditions:**
- SELECT: character owner OR any campaign member (for the party glance)
- INSERT / DELETE: character owner OR campaign DM (DM may apply/clear conditions)

### Application-level character rules

- `/campaigns/[id]/characters` is role-aware: DM sees the quick-glance party dashboard; players see their own characters plus a read-only party roster.
- `/campaigns/[id]/characters/[charId]/edit` redirects anyone who is not the character owner.
- The character sheet UI grants full editing to the owner, vitals/conditions editing to the DM, and read-only to other players.
- Full character edits in `updateCharacter` are additionally scoped to `user_id = auth.uid()` in the server action (defense in depth on top of RLS).

---

## Phase 3 — Maps & Tokens Permissions (RLS)

**Storage bucket `maps` (private):**
- READ: any campaign member (folder segment 1 = campaign id → `is_campaign_member`)
- WRITE / UPDATE / DELETE: DM of that campaign only (`is_campaign_dm`)
- Images are never public; the app serves them via short-lived signed URLs.

**maps:**
- SELECT: DM (all maps) OR member (only the `is_active = true` map)
- INSERT / UPDATE / DELETE: DM only
- `set_active_map()` (SECURITY DEFINER) enforces DM-only activation

**tokens:**
- SELECT: DM (all tokens) OR member (only `visible_to_players = true`)
- INSERT / UPDATE / DELETE: DM only (player token control is deferred to Phase 4)

### Application-level map rules

- `/campaigns/[id]/maps` is role-aware: DM sees the map list; players see the active map read-only.
- `/campaigns/[id]/maps/new` and `/campaigns/[id]/maps/[mapId]` (editor) redirect non-DMs.
- Hidden tokens (enemies/traps/doors with `visible_to_players = false`) are excluded from the player query by RLS and never rendered in the player view.
- (As of Phase 4) DM-only token notes live in `token_dm_notes`, not on the token row — see below.

---

## Phase 4 — Live Movement Permissions

**Realtime:** `tokens` and `maps` are published to `supabase_realtime`. Realtime authorization uses the table's RLS SELECT policy per subscriber, so players receive live updates **only for tokens they may see** (visible tokens on the active map).

**DM-only notes:** `dm_notes` was moved off `tokens` into `token_dm_notes` (RLS: DM only, and **not** in the realtime publication). This closes a leak where realtime would have broadcast the full token row — including DM notes — to players over the websocket. RLS gates rows, not columns, so column-level privacy requires a separate table.

**Player token movement — `move_token` RPC (SECURITY DEFINER):**
- `tokens` UPDATE remains **DM-only** in RLS. Players never get a direct UPDATE grant (which would let them flip `visible_to_players`, etc.).
- Players move tokens exclusively through `move_token(token_id, x, y)`, which verifies, server-side:
  1. `controlled_by_user_id = auth.uid()` (you control this token)
  2. the map is not `player_movement_locked`
  3. the token is not `movement_locked`
  4. the move is within the linked character's `speed` (unless `movement_override_allowed`)
- It then updates **only** `x`, `y`, and `movement_used`.

**Control assignment:** linking a token to a character (DM) auto-sets `controlled_by_user_id` to that character's owner; unlinking clears it.

| Actor | Movement capability |
|---|---|
| DM | Move any token freely; lock/unlock all player movement; lock individual tokens; allow over-speed; reset movement; reset position |
| Player | Move only tokens they control, only when unlocked, only within speed |
| Player | Cannot move other players' tokens, NPC/enemy/hidden tokens, or any token when locked |

---

## Phase 5 - Encounter Permissions

**encounters:**
- SELECT: any campaign member can see encounter rows.
- INSERT / UPDATE / DELETE: campaign DM only.

**encounter_participants:**
- SELECT: DM sees all participants; players see only `is_visible_to_players = true`.
- INSERT / UPDATE / DELETE: campaign DM only.

**encounter_participant_dm_notes:**
- ALL operations require campaign DM.
- This table is separate from participant rows so player-visible participants never expose private DM note columns.

**encounter_conditions:**
- SELECT: DM sees all conditions; players see conditions only for visible participants.
- INSERT / DELETE: campaign DM only.

### Application-level encounter rules

- `/campaigns/[id]/encounters` is role-aware: DM can create encounters; players can open shared encounter state.
- `/campaigns/[id]/encounters/new` redirects non-DMs.
- `/campaigns/[id]/encounters/[encounterId]` shows DM controls only to DMs.
- Players cannot edit initiative, HP, conditions, visibility, defeated state, or turn order.
- Hidden participants and private DM notes are excluded at the database layer.

---

## DM Permissions

| Action | Allowed |
|---|---|
| Create a campaign | Yes |
| Delete their own campaign | Yes (Phase 2) |
| Invite players to their campaign | Yes — via invite code |
| Remove players from their campaign | Yes |
| View all player characters in their campaign | Yes ✅ (Phase 2) |
| Edit any character's HP / conditions | Yes ✅ (Phase 2) |
| Edit full character sheets (other than HP/conditions) | No — owner only |
| Create, edit, and delete maps | Yes ✅ (Phase 3) |
| Upload map images | Yes ✅ (Phase 3) |
| Place, move, and delete tokens | Yes ✅ (Phase 3) |
| Toggle token visibility (hidden/revealed) | Yes ✅ (Phase 3) |
| Set the active map players see | Yes ✅ (Phase 3) |
| Lock/unlock all player movement | Yes ✅ (Phase 4) |
| Lock an individual token | Yes ✅ (Phase 4) |
| Reset movement / reset position | Yes ✅ (Phase 4) |
| Allow a token to exceed its speed | Yes ✅ (Phase 4) |
| Reveal/hide map regions (fog of war) | Deferred (not in scope this phase) |
| Create, edit, and delete NPCs | Yes (Phase 7) |
| Set NPC visibility | Yes (Phase 7) |
| Create, edit, and delete quests | Yes (Phase 7) |
| Set quest visibility | Yes (Phase 7) |
| Create, edit, and delete notes | Yes (Phase 7) |
| Set note visibility | Yes (Phase 7) |
| Create handouts | Yes (Phase 7) |
| Reveal handouts to players | Yes (Phase 7) |
| Create and run encounters | Yes (Phase 5) |
| Manage initiative, HP, and conditions | Yes (Phase 5) |
| View all data in their campaign | Yes |

---

## Player Permissions

| Action | Allowed |
|---|---|
| Join a campaign via invite | Yes |
| Create their own character | Yes ✅ (Phase 2) |
| Edit their own character | Yes ✅ (Phase 2) |
| Delete their own character | Yes ✅ (Phase 2) |
| View other players' characters | Read-only ✅ (Phase 2) |
| Edit other players' characters | No |
| View maps | Yes ✅ — the active map only (Phase 3) |
| View tokens | Yes ✅ — only `visible_to_players = true` (Phase 3) |
| Move their own (controlled) token | Yes ✅ — when unlocked, within speed (Phase 4) |
| Move other tokens / NPC / enemy | No ✅ (RPC rejects) |
| Move any token when locked | No ✅ (RPC rejects) |
| View hidden tokens | No ✅ (enforced by RLS) |
| View token DM notes | No ✅ (separate DM-only table, not broadcast) |
| View NPC details | Only if `is_shared = true` (Phase 7) |
| View quests | Only if `is_shared = true` (Phase 7) |
| View notes | Only if `is_shared = true` (Phase 7) |
| View handouts | Only if `is_revealed = true` (Phase 7) |
| Create maps, tokens, NPCs, or encounters | No |
| Access DM-only data | No |

---

## Enforcement Strategy

### Database Layer (Primary Enforcement)
All permissions must be enforced via Supabase Row Level Security (RLS) policies. The UI must never be the sole gate for sensitive data.

**RLS principles:**
- Every table has RLS enabled.
- DM data (hidden tokens, private notes, etc.) is excluded from player queries at the database level.
- Players can only access rows that belong to them or are explicitly shared.
- SECURITY DEFINER functions are used sparingly and reviewed carefully.

### Application Layer (Secondary Enforcement)
- `proxy.ts` verifies authentication and redirects on every request.
- Server components verify ownership before rendering DM-only views.
- Server actions verify the caller's role before mutating data.

### UI Layer (Tertiary / UX Only)
- The UI hides DM controls from players.
- Hidden tokens and private notes do not render in the player view.
- The UI must never be relied upon as the sole protection for sensitive data.

---

## Role Escalation

- A player cannot escalate to DM within a campaign.
- Only the campaign owner (DM) can assign or change roles.
- There is no self-serve role change.

---

## Multi-Campaign Context

- A user may be `dm` in campaign A and `player` in campaign B.
- Session context must always be scoped to the active campaign.
- Do not bleed permissions across campaign boundaries.

---

## Future: Spectator Role

Not in scope for MVP, but reserved for planning:
- A `spectator` role may watch the session view without controlling a character.
- Spectators would have the same visibility as players but no character.
# Phase 6 - Contextual Action Permissions

**Token interaction settings:**
- DM edits interaction range and action lists through the map editor.
- Players can only read interaction settings for tokens already visible to them through token RLS.

**action_intents:**
- SELECT: campaign DM sees all; player sees only their own submitted intents.
- INSERT: player can submit only for their own character and only against visible tokens.
- UPDATE / DELETE: DM only.

**action_intent_dm_notes:**
- DM-only for all operations.
- Player-facing DM responses live on `action_intents.dm_response`; private notes stay separate.

### Application-level action rules

- `/campaigns/[id]/actions` is role-aware.
- Players see nearby interactable tokens on the active map only.
- Distance uses Chebyshev grid distance and the map's feet-per-square scale.
- Hidden tokens are excluded by token RLS and cannot be targeted by players.
- The system records intent only; it does not resolve success, damage, dialogue, or pickpocket outcomes automatically.

---
