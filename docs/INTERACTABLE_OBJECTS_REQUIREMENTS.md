# Interactable Objects & DM Interaction Queue Requirements (Phase 9)

This document describes the real-time player-interaction system for
DM-approved objects/items/doors/traps/NPCs/enemies, what it does and does not
do, and the manual two-browser test checklist for verifying it.

## Scope

In scope (implemented):
- DM marks any token `interactable` and gives it an `object_state`, a player-safe
  `public_description`, and a list of `available_actions` (from a 19-item
  suggested vocabulary, freeform-extensible).
- Players within `interaction_range_feet` (default 5 ft) of an interactable,
  visible token can submit an action request with an optional message.
- DM reviews requests in a live queue, can respond with a message, attach a
  DM-only note, and set status to Approved / Needs Roll / Denied / Resolved.
- Players see their own requests and the DM's response live, and can cancel
  their own still-pending requests.
- Object-state changes the DM makes in the Map Editor sync to players live
  through the same token realtime channel already used for position/visibility.

Explicitly out of scope (per product direction — do not build):
- Encounter automation, AI DM tools, automated trap/lock resolution.
- Any full virtual-tabletop interaction automation (auto-opening doors,
  auto-looting, dice-roll execution, etc.) — the DM remains the sole arbiter;
  this system only carries *requests* and *responses* between DM and players.

## Object model

Built by extending the existing `tokens` table (see `DATA_MODEL_NOTES.md` →
"Phase 9 Addendum") rather than introducing a parallel object table:

- **Token types** (16): Player, NPC, Enemy, Object, Trap, Door, Chest, Book,
  Note, Loot pile, Lever, Switch, Portal, Key, Container, Custom.
- **`interactable`** (boolean) — the master switch. If `false`, the token never
  appears as an action target for players, no matter what `available_actions`
  contains or how close the player is.
- **`object_state`** — one of Hidden, Visible, Locked, Unlocked, Open, Closed,
  Trapped, Disarmed, Activated, Disabled, Looted, Broken, Custom.
- **`public_description`** — DM-authored player-safe flavor text, separate from
  the existing DM-only `dm_notes` (`token_dm_notes` table, never published to
  players).
- **`available_actions`** — freeform list, with a 19-item suggested vocabulary
  surfaced as a hint in the editor (Open, Close, Lock, Unlock, Search, Take,
  Use, Read, Push, Pull, Examine, Talk, Attack, Disarm, Pick Lock, Hide,
  Listen, Investigate, Custom).
- **`interaction_range_feet`** — per-token override of the default 5 ft range.

## DM Interaction Queue

The Action Center (`/campaigns/[id]/actions`) renders `DMActionQueue` for DMs:
- Each pending/active request shows actor, character, target, computed
  distance/range, message, and **submission timestamp**.
- DM can write a player-visible **DM response** and a separate **DM-only
  note** (stored in the unpublished `action_intent_dm_notes` table — never sent
  to players, even via realtime broadcast of the parent row).
- Status buttons: **Approve**, **Ask Roll** (`needs_roll`), **Deny**,
  **Resolve & Reveal** (`resolved` — marks the request done and reveals the DM
  response to the player).
- "Mark Object State" / "Reveal Result" from the spec are satisfied by editing
  the target token's `object_state` / `public_description` directly in the Map
  Editor — those changes broadcast to the player over the existing token
  realtime channel immediately, so no separate plumbing was needed and DMs have
  one consistent place to manage object state.

## Player Action Center

`PlayerActions` (same route, player view):
- "Nearby" list = tokens that are `visible_to_players && interactable` AND
  within `interaction_range_feet` of one of the player's controlled/linked
  tokens (computed via `distanceFeet`). Empty state: "The DM has not revealed
  any nearby interactable objects."
- Each nearby target shows its `public_description` (if set) and its allowed
  actions (gated through `actionsForToken`, which returns `[]` for
  non-interactable tokens regardless of `available_actions`).
- Submitting an action calls `submitActionIntent`, which re-checks
  `interactable` server-side and returns "The DM has not made that available
  for interaction." if it isn't — defense in depth beyond the UI filter.
- "My Requests" panel shows status, message, and the DM's response live, plus
  a **Cancel request** button shown only while `status === 'pending'`, wired to
  `cancelActionIntent` (new narrowly-scoped self-cancel RLS policy: a player
  can only flip their own `pending` row to `cancelled`, nothing else).

## How enforcement works (not just hidden in the UI)

1. **`interactable` gate** — `actionsForToken()` returns `[]` immediately if
   `!token.interactable`, so no action UI is ever generated for a
   non-interactable token, and `submitActionIntent` re-checks the same flag
   server-side before inserting a row.
2. **Visibility gate** — the "nearby" filter requires `visible_to_players`;
   combined with `tokens` RLS (players can only ever fetch
   `visible_to_players = true` rows), a hidden object's existence, state,
   description, and available actions never reach the player's client at all.
3. **Range gate** — `distanceFeet(actor, target, ...) <= (interaction_range_feet
   ?? 5)` is computed client-side for display and is informational; the
   authoritative gate is that the player simply cannot see/target hidden
   objects, and the DM reviews every request before anything happens.
4. **Status-transition gate** — `action_intents` RLS only allows the DM to set
   `approved/denied/needs_roll/resolved`, and only allows the *actor* to move
   their own row from `pending` to `cancelled`. No policy permits a player to
   self-approve, self-deny, self-resolve, or modify another player's request.
5. **DM-only data isolation** — `dm_notes`/`token_dm_notes` and
   `action_intent_dm_notes` live in separate, unpublished tables, so even
   though Realtime broadcasts full rows of `tokens`/`action_intents`, the DM's
   private annotations are never part of those broadcasts.

## Manual two-browser test checklist

Setup: two browser sessions, DM + player (player has a linked
character/token). Apply migration `008_map_visibility_objects.sql` first, and
ensure at least one interactable object (e.g. a Chest) and one non-interactable
decoration exist near the player's token, plus one hidden interactable object.

Object visibility & gating:
- [ ] Player does not see the hidden interactable object in their "nearby" list at all.
- [ ] Player does not see a non-interactable (but visible) token in their "nearby" list.
- [ ] Player sees the visible, interactable, in-range Chest with its `public_description` and allowed actions.
- [ ] Moving the player's token out of range removes the Chest from "nearby" without a refresh.
- [ ] Player cannot see `dm_notes`/DM-only notes anywhere in their UI or network payloads.

Submitting & responding:
- [ ] Player submits an "Open" request with a message → it appears instantly in the DM's queue with actor, character, target, distance/range, message, and timestamp.
- [ ] Player sees their request in "My Requests" with status `pending`.
- [ ] DM writes a response and clicks **Approve** → player sees status flip to `approved` and the response text live, no refresh.
- [ ] DM clicks **Ask Roll** on another request → player sees `needs_roll` live.
- [ ] DM clicks **Deny** → player sees `denied` live.
- [ ] DM clicks **Resolve & Reveal** → player sees `resolved` and the DM response live.
- [ ] DM adds a DM-only note → it never appears anywhere in the player's UI or network traffic.
- [ ] DM edits the Chest's `object_state` to "Looted" and `public_description` in the Map Editor → player's selected-token card updates live to show the new state/description.

Cancellation & self-service limits:
- [ ] While a request is `pending`, the player sees a "Cancel request" button; clicking it sets status to `cancelled` and the button disappears.
- [ ] Once a request is no longer `pending` (approved/denied/etc.), no cancel control is shown.
- [ ] Player has no UI path to set their own request to approved/denied/resolved, or to alter another player's request.
- [ ] Attempting to call the cancel action on someone else's request or a non-pending request (e.g. via devtools) fails at the database (RLS rejects the update).
- [ ] Player has no UI to edit `interactable`, `object_state`, `public_description`, `available_actions`, or `interaction_range_feet` on any token.
# Universal Action System Addendum

Implemented in `supabase/migrations/010_universal_action_system.sql`.

Additional token/object configuration now includes:
- `visible_on_cast`
- `requires_approval`
- `resolver_type`
- `resolver_config`
- `max_hp`
- `current_hp`
- `temp_hp`
- `armor_class`
- `is_defeated`

DMs configure these in the Map Editor. Players still see only visible,
interactable, in-range objects and only the actions listed in
`available_actions`.

Implemented resolver behavior:
- Manual resolver: DM response/result logging.
- Object state resolver: Open/Close/Lockpick/Disarm/Activate/Break/Take update
  object state and emit an action result.
- Attack resolver: Attack is one allowed action; after DM approval the player
  chooses an attack option or basic fallback, rolls server-side, updates token
  HP, logs combat, and marks defeated at 0 HP.

---
