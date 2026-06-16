# Action Game State Sync - Phase 4

## Status

Implemented as a DM-reviewed state-sync layer on top of Phases 1-3 (roll requests, modifiers,
attack/damage resolution). Connects resolved actions to live map/token/object state without
bypassing DM control.

## Scope

This phase lets resolved actions suggest map/token/object state changes (HP, defeated, object
state, revealed objects, awareness) that the DM reviews and applies. It does not add advanced
D&D rules, rebuild the map system, replace the token editor, or auto-apply state changes without
DM confirmation.

## Core Principle

Nothing mutates token/object state automatically. When an attack resolves with damage against a
known token, the server queues a **suggested** update with status `pending_dm_review`. The DM
sees a compact "Suggested Update" card and chooses **Apply Update**, **Edit Before Applying**, or
**Reject Update**. Only an explicit DM action calls `applyPendingStateUpdate`, which is the single
path that writes to the `tokens` table for this flow.

## Data Model

Added migration `supabase/migrations/014_pending_state_updates.sql`:

- `pending_state_updates`: generic suggestion row with `update_type`, `target_id`/`target_kind`,
  `before`/`after` JSON snapshots, a player-safe `summary`, `status`
  (`pending_dm_review` / `applied` / `rejected`), and audit fields (`applied_at`,
  `applied_by_dm_id`, plus the originating `action_intent_id` and `roll_result_id`).
- RLS: DM-only (`is_campaign_dm`). Players have no SELECT access to this table at all — the
  safest way to guarantee hidden HP/AC/state never reaches a player client before the DM acts.
- Added to the `supabase_realtime` publication with `REPLICA IDENTITY FULL` so the DM's queue and
  popup update live.

`update_type` values: `damage_token`, `set_token_state`, `set_object_state`, `reveal_object`,
`set_awareness`, `custom`. `target_kind` values: `token`, `object`, `room`, `map`, `custom`.

No new token columns or object-state values were added — Phase 4 reuses the existing
`tokens.current_hp` / `max_hp` / `temp_hp` / `is_defeated` / `object_state` / `visible_to_players`
/ `resolver_config` fields from `010_universal_action_system.sql`, which the Map/Token editor
already edits.

## How Pending Updates Are Created

`submitAttackRollResult` (Phase 3's attack path, in `lib/actions/roll-requests.ts`) now also
inserts a `damage_token` pending update immediately after writing `action_attack_results`, when
the attack hits, rolls damage, and resolves to a known target token. It computes:

- `before` / `after`: `{ current_hp, max_hp, is_defeated }`
- `summary`: e.g. "Goblin takes 7 piercing damage." or, if HP would reach 0,
  "...and is reduced to 0 HP (defeated)."

The row is linked back to `action_intent_id` and the `action_attack_results.id` (`roll_result_id`)
for the audit trail, and starts at `status = 'pending_dm_review'`.

## How DM Review / Apply Works

`lib/actions/state-updates.ts` exposes:

- `applyPendingStateUpdate(campaignId, updateId, overrides?)` — DM-only. Loads the pending row,
  merges any `overrides.after` (from "Edit Before Applying"), writes the resulting fields onto the
  `tokens` row (HP clamped to `[0, max_hp]`, `is_defeated`, `object_state`,
  `visible_to_players`, and — for `set_awareness` — `resolver_config.awareness`), marks the row
  `applied` with `applied_at`/`applied_by_dm_id`, and revalidates both the actions page and the
  token's map page.
- `rejectPendingStateUpdate(campaignId, updateId)` — DM-only. Marks the row `rejected` with the
  same audit fields and **does not** touch the `tokens` table.

UI: `components/actions/ActionCenter.tsx` renders a `SuggestedStateUpdatePanel` per pending row in
the DM's Action Queue cards (placed alongside the existing `AttackResultPanel`s, just above the
shared `ActionQueueDmControls`). It shows the before/after summary (e.g. "Goblin HP: 10 -> 3" /
"State: defeated" or "Chest: locked -> unlocked") and three buttons:

- **Apply Update** — applies the suggestion as-is.
- **Edit Before Applying** — opens an inline form to change the new HP / defeated flag (for
  `damage_token`) or the new object-state string (for `set_object_state`/`reveal_object`/
  `set_token_state`), then applies with those overrides.
- **Reject Update** — rejects without mutating state.

Already-resolved rows render as a compact "Applied"/"Rejected" record with the summary and
applied timestamp (the audit trail).

`components/actions/ActionQueueNotificationWidget.tsx` (the global DM popup, satisfying QA #13)
shows a compact `PendingUpdateMiniCard` with **Apply Update** / **Reject Update** for the latest
intent's pending row, refreshed over the same realtime channel.

## How Map/Token State Updates Live

`applyPendingStateUpdate` writes directly to the `tokens` table — the same table the existing
Map Editor/token editor uses and which is already on the realtime publication with
`REPLICA IDENTITY FULL`. No parallel state model or visual layer was introduced:

- The DM's Action Queue, the global popup, and the live Map view all subscribe to `tokens`
  changes and refresh automatically once the update is applied.
- Token detail panels immediately reflect the new `current_hp`/`is_defeated`/`object_state`
  because they read straight from the `tokens` row.
- If a map has no special "defeated"/"open"/"looted" iconography yet, the underlying state change
  is still visible in the token details panel and to any UI that reads `object_state`/`is_defeated`
  — satisfying "at minimum the underlying state should change and be visible in token details."

## How Player Visibility Is Protected

- `pending_state_updates` carries no player SELECT policy — players cannot see suggestions, hidden
  HP deltas, or DM-only summaries before the DM acts.
- Applying an update does not, by itself, reveal the linked attack result to players; the existing
  Phase 3 `revealAttackResult` flow (and `revealed_to_player` flag) still gates that separately, so
  a DM can apply an HP change to the map while keeping the narrative reveal under their control.
- Once applied, only the normal `tokens` RLS rules govern what players see: `visible_to_players`
  and `is_campaign_dm` still gate row visibility exactly as they did before this phase. Hidden
  tokens/objects remain hidden; revealed ones become visible because the DM chose to reveal them
  (e.g. by applying a `reveal_object` update that flips `visible_to_players`).

## Editing Before Apply

Implemented for the fields named in the spec: new HP + defeated flag for `damage_token`
suggestions, and a new object-state string for object/reveal/token-state suggestions. Free-form
editing of arbitrary `before`/`after` JSON is intentionally not exposed in the UI (kept to the
fields the DM is most likely to need to tweak); the server action already accepts an `after`
override object, so broader editing UI can be layered on later without another migration.

## Assumptions / Known Limits

- Automatic suggestion creation is wired for the **attack-damage** path only — the one flow that
  already produces a structured numeric result against a known token. Lockpick/door/search/stealth
  flows go through the generic `submitRollResult` path, which currently only records a pass/fail
  roll result; classifying arbitrary `action_type` strings into object/stealth verbs to
  auto-suggest `set_object_state`/`reveal_object`/`set_awareness` updates would add interpretive
  rules beyond "connect resolved actions to state" and risks the "do not overbuild" constraint. The
  generic engine fully supports applying those update types — a future phase can wire additional
  triggers without further schema changes.
- The pre-existing `object_state` resolver (which lets a DM directly set a token's object state at
  approval time) is left untouched, so current door/chest workflows keep working exactly as before.
- `set_awareness` stores its value inside `tokens.resolver_config` (`{ awareness: ... }`) rather
  than adding a dedicated column, per "only add this if it fits the existing token model."

## QA

See `docs/QA_CHECKLIST.md` ("Action Game State Sync Phase 4") for the full checklist. Code-level
checks (build/typecheck/lint, no-mutation-on-reject, RLS DM-only, audit fields) are verified;
live two-account browser QA items remain pending as with prior phases.
