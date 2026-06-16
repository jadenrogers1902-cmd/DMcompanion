# Realtime / No-Refresh Sync Requirements (Phase 9b)

Hard requirement: every session-critical change must reach all connected,
permitted viewers live, with **no manual browser refresh**. This document
describes the architecture, what's subscribed where, and the manual two-browser
test checklist.

## Architecture: two complementary patterns

### 1. Fine-grained merge (`useTokenRealtime`)
Used for the map canvas, where payloads map cleanly onto a flat row shape and
hand-merging is cheap and precise: subscribes to `tokens`, `maps`
(`player_movement_locked`), and `map_revealed_areas` for a specific map, and
merges `INSERT`/`UPDATE` into local state / treats `DELETE` (including the
"row no longer matches my RLS filter" pseudo-delete) as a removal.

### 2. Debounced refetch (`useRealtimeRefresh`, new in this phase)
Used for join-heavy screens (Action Center, Encounter Manager, Character
Sheet, Story Workspace) where the rendered data is a deep join across several
tables (e.g. an action intent with its actor profile, character, and target
token). Hand-merging every realtime payload into that shape would be brittle
and easy to get subtly wrong (stale joins, missed nested updates). Instead,
`useRealtimeRefresh(channelName, watches)`:
- Subscribes to `postgres_changes` on each watched table/filter.
- On any matching event, debounces (200ms) and calls Next.js's
  `router.refresh()`.
- `router.refresh()` re-runs the **server component** for the current route —
  re-querying Supabase with the user's real session (RLS re-applied
  server-side) — and passes fresh props to the client component. Existing
  client-side state (open panels, draft text in textareas, selected tab, etc.)
  is preserved because the client component instance doesn't unmount.
- This never trusts the realtime payload's *contents* for anything
  sensitive — the payload is only a "something changed, go re-fetch" signal;
  the actual data always comes back through the normal RLS-scoped query path.

Both patterns do an **initial fetch** via the server component (props), then
**listen** for changes — satisfying "UI performs an initial data fetch, then
listens for realtime changes."

## Tables added to the realtime publication (migration 009)

Previously **only** `tokens`, `maps`, and `map_revealed_areas` were in the
`supabase_realtime` publication — every other feature table had correct RLS
but never emitted realtime events at all (a silent gap, not a security issue,
but it meant nothing outside the map screen was ever live). Migration
`009_realtime_live_sync.sql` adds, with `REPLICA IDENTITY FULL`:

`characters`, `character_conditions`, `character_inventory_items`,
`character_spells`, `character_abilities`, `encounters`,
`encounter_participants`, `encounter_conditions`, `action_intents`, `quests`,
`npcs`, `locations`, `notes`, `handouts`, `session_recaps`.

**Deliberately NOT added** (DM-only data — see "Hidden data protection"
below): `token_dm_notes`, `action_intent_dm_notes`,
`encounter_participant_dm_notes`.

## Channels subscribed to, by screen

| Screen / Component | Channel | Tables watched |
|---|---|---|
| Map (DM editor & player view) | `map-{mapId}` (`useTokenRealtime`) | `tokens`, `maps` (lock), `map_revealed_areas` — filtered to the map |
| Player map view | `maps-watch-{campaignId}` (`useRealtimeRefresh`) | `maps` filtered to campaign — catches "active map switched" |
| Action Center (DM + player) | `actions-{campaignId}` | `action_intents`, `tokens`, `characters` (campaign-scoped), `character_conditions` |
| Encounter Manager | `encounter-{encounterId}` | `encounters`, `encounter_participants`, `encounter_conditions` (encounter-scoped), `characters`, `tokens` (campaign-scoped) |
| Character Sheet | `character-{characterId}` | `characters`, `character_conditions`, `character_inventory_items`, `character_spells`, `character_abilities` (character-scoped) |
| Story Workspace / Party Journal | `story-{campaignId}` | `quests`, `npcs`, `locations`, `notes`, `handouts`, `session_recaps` (campaign-scoped) |

## Which UI screens update live

- `/campaigns/[id]/maps` and `/campaigns/[id]/maps/[mapId]` — tokens, fog/reveal
  areas, movement lock, and active-map switches
- `/campaigns/[id]/actions` — action intent submissions, status changes, DM
  responses, object state/description changes
- `/campaigns/[id]/encounters/[encounterId]` — round/turn, participants, HP,
  conditions
- `/campaigns/[id]/characters/[charId]` — HP, temp HP, AC, speed, conditions,
  inventory, spells, abilities
- `/campaigns/[id]/story` — quests, NPCs, locations, notes, handouts, recaps
  (DM edits & reveals appear in the player's Party Journal live)

## Actions verified to require no refresh (code-level)

All of the following are wired to either `useTokenRealtime` merges or
`useRealtimeRefresh` refetches and should propagate without a manual refresh:
active map switch, map visibility/fog changes, grid/image/name changes, token
add/move/delete/hide/reveal/rename/type/state changes, movement lock/unlock and
movement-used updates, object add/move/delete/hide/reveal/state/description/
allowed-action/range changes, interaction request submit/approve/deny/
ask-roll/resolve/cancel and DM responses, HP/temp HP/AC/speed/condition
changes, encounter round/turn/participant changes, and quest/NPC/location/
note/handout/recap reveals and edits.

## Actions that still require a refresh

- None identified by design — every "must sync live" item in the spec maps to
  a subscribed table/channel above. The remaining `[ ]` items in
  `QA_CHECKLIST.md` are runtime verifications (the code paths exist and
  compile/build cleanly; live two-browser confirmation is the last step before
  sign-off).
- Note: `router.refresh()`-based screens have an inherent ~200ms debounce plus
  one network round-trip for the refetch — perceptibly "live" but not
  literally instantaneous like the in-place `useTokenRealtime` merges on the
  map canvas. This is an intentional trade-off for correctness over
  micro-latency on deep-join screens.

## Reconnect / resync behavior

- Each hook's `useEffect` creates a fresh `supabase.channel(...)` and tears it
  down (`supabase.removeChannel`) on unmount/dependency change — no duplicate
  subscriptions accumulate across re-renders (handlers are kept in a `useRef`
  for `useTokenRealtime`; `useRealtimeRefresh`'s dependency array is keyed on
  the channel name + a stable JSON-serialized watch list).
- The Supabase JS client's realtime layer auto-reconnects on transient network
  loss (built-in heartbeat/backoff). On reconnect, any change that happened
  while disconnected will (a) generate a fresh event once the channel resumes
  postgres_changes delivery, and/or (b) be picked up by the next debounced
  `router.refresh()` / merge triggered by subsequent activity. Because every
  screen does an authoritative **initial fetch** through the server component
  on mount/navigation, returning to or reloading any of these routes always
  resyncs to ground truth regardless of what was missed mid-disconnect.
- `ConnectionStatus` (in `app/(app)/layout.tsx`) shows a persistent banner —
  "Connection lost. Changes may not save until you are back online." — based
  on the browser's `online`/`offline` events, satisfying "show a small
  connection/sync status indicator if practical."

## How hidden data is protected from realtime leaks

Realtime broadcasts **full rows**; **RLS filters which rows** reach a given
subscriber, but never which *columns*. The app's privacy model (already
established in Phase 4 and extended here) is:

1. **DM-only annotation tables stay unpublished.** `token_dm_notes`,
   `action_intent_dm_notes`, and `encounter_participant_dm_notes` are
   deliberately excluded from the `supabase_realtime` publication — even
   though they have RLS, simply never emitting events for them means a
   player's channel can never receive a DM-note payload, full stop.
2. **Hidden rows never match a player's SELECT policy**, so `postgres_changes`
   never delivers them to a player subscriber in the first place — there is no
   "received then filtered client-side" step to get wrong. This applies to
   hidden tokens (`visible_to_players = false`), hidden objects (same flag +
   `interactable`), unrevealed `map_revealed_areas`, and inactive maps
   (`maps` SELECT policy requires `is_campaign_dm OR (member AND
   is_active = true)`).
3. **Visibility toggles look like deletes to the player.** When a DM flips
   `visible_to_players` (or `is_active`, or `visible_to_players` on a revealed
   area) from true to false, the row stops matching the player's RLS filter —
   Supabase Realtime delivers that as an effective `DELETE` to that subscriber,
   so the item simply vanishes from their view; it was never re-sent with
   "now hidden" data for the client to act on.
4. **`router.refresh()` re-applies RLS server-side.** The debounced-refetch
   pattern never trusts realtime payload contents — a change notification only
   triggers an authoritative re-query through the user's real session, so even
   a hypothetical malformed/oversized payload can't leak data the query
   wouldn't otherwise return.
5. **Subscriptions are scoped.** Every channel filter includes `campaign_id`,
   `map_id`, `character_id`, or `encounter_id` (all derived from rows the
   current user's membership already authorizes them to load), so a user never
   subscribes to another campaign's channel. DMs, by virtue of their RLS
   policies (`is_campaign_dm`), receive the full unfiltered set of rows for
   their own campaign — exactly as required ("DM subscriptions can receive
   full campaign data").

## Manual two-browser test checklist

Setup: normal window as DM, incognito/private window as player (campaign
member with a linked character/token). Apply migrations 008 and 009 first.

- [ ] DM switches the active map → player's map view swaps live, no refresh.
- [ ] DM moves a token / player moves their own token → other side sees it move live.
- [ ] DM hides a token → it disappears from the player's map live; DM reveals it → it reappears live.
- [ ] DM marks an object hidden/revealed → player's nearby list and map update live.
- [ ] DM changes an object's `object_state` / `public_description` → player's selected-token card updates live.
- [ ] DM changes a token's `available_actions` / `interaction_range_feet` / `interactable` → player's available actions update live (appear/disappear as appropriate).
- [ ] Player submits an interaction request → appears in DM's queue live with timestamp.
- [ ] DM approves / denies / asks for a roll / resolves → player's "My Requests" status and DM response update live.
- [ ] Player cancels a pending request → DM's queue reflects `cancelled` live.
- [ ] DM locks/unlocks player movement → player's drag controls enable/disable live.
- [ ] Player moves and uses movement → remaining-movement readout updates live for both sides (e.g. DM's encounter view, if linked).
- [ ] DM or owner changes HP / temp HP / AC / speed / adds a condition → updates appear live on the character sheet for all viewers (owner, DM, party).
- [ ] DM advances the encounter turn/round, changes a participant's HP/condition, or adds/removes a participant → all connected viewers see it live.
- [ ] DM reveals a quest / NPC / location / note / handout / recap → it appears in the player's Party Journal live.
- [ ] **After every test above**, refresh both browsers once and confirm the final state persisted correctly (i.e. the live update wasn't merely a transient client-side artifact).
- [ ] Disconnect the player's network briefly, reconnect, and confirm the view resyncs to the current ground truth (either via a queued realtime event or the next refetch).
- [ ] Confirm in devtools/network that the player's realtime channel never receives a `token_dm_notes`, `action_intent_dm_notes`, or `encounter_participant_dm_notes` payload, nor any row for a hidden token/object/inactive map/unrevealed area.
