# Phase Completion Report

## Player Roll Outcome Popup Styling

Date: 2026-06-07

Status: Code complete. `npx tsc --noEmit`, `npm run lint`, and `npm run build` pass. No migrations
or data-model changes — purely player-facing presentation in the existing roll popup.

### Files Changed

- `lib/utils/roll-outcome-display.ts` (new) — the reusable outcome-styling mapper.
- `components/actions/RollOutcomeEffects.tsx` (new) — `usePrefersReducedMotion`, `RollOutcomeBadge`, `RollOutcomeEffects`, `PlayerRollOutcomePanel`.
- `components/actions/PlayerRollRequestPopup.tsx` — popup no longer auto-closes; renders the persistent outcome panel and tracks DM-review/resolution status.
- `app/globals.css` — added `roll-fx-thumb-pop`, `roll-fx-flame-flicker`, `roll-fx-shake-once` keyframes/classes plus a `prefers-reduced-motion` override block.
- `docs/ACTION_ROLL_REQUESTS_PHASE1.md`, `docs/ACTION_ATTACK_RESOLUTION_PHASE3.md` — addendum sections updated from "Recorded, not yet implemented" to "Implemented".
- `docs/QA_CHECKLIST.md` — new "Player Roll Outcome Popup Styling" section.

### Components Added/Updated

- **Added**: `RollOutcomeBadge` (color-independent text-label badge), `RollOutcomeEffects` (thumb-down burst / flame flicker overlay), `PlayerRollOutcomePanel` (the full persistent result card — natural roll, modifier, total, label, summary, optional damage, review-state banner, Continue button), `usePrefersReducedMotion` hook.
- **Updated**: `PlayerRollRequestPopup` — added `outcome` state that survives `loadRollRequest` refreshes, `setAttackOutcome`/`setGenericOutcome` builders, a realtime+poll effect that watches the originating `action_intents` row for DM review/resolution, and a `handleContinue` dismiss action. Removed the old transient `finalTotal`/`resultSummary` state and the `window.setTimeout(loadRollRequest, 900)` calls that effectively caused the popup to lose its result on the next refresh.

### Where the Styling Mapper Lives

`lib/utils/roll-outcome-display.ts` exports `RollOutcomeVariant` (`success` / `major_success` /
`failure` / `major_failure` / `critical_failure` / `critical_success` / `unknown`),
`getRollOutcomeVariant(...)`, and `getRollOutcomeDisplay(variant)`. It is pure presentation logic
with no Supabase/server dependencies, so any future surface (action log, character sheet
notifications — see Phase 5 "consistency across surfaces") can import it directly.

### How Variants Are Determined

`getRollOutcomeVariant({ resultValue, attackOutcome, naturalRoll })`:
- Natural 1 always wins → `critical_failure`; Natural 20 always wins → `critical_success` (the
  requirement calls these out explicitly regardless of what the underlying check/attack resolved
  to).
- Otherwise, attack rolls map `critical_miss → critical_failure`, `miss → failure`, `hit →
  success`, `critical_hit → critical_success`.
- Otherwise, generic rolls map the existing `RollResultValue` 1:1 (`critical_failure`, `failure`,
  `success`, `major_success`, `critical_success`; `unknown` falls through). `major_failure` is
  reserved in the variant/display vocabulary for forward compatibility (the current roll engine
  never emits it), so a future engine change can opt in without another styling pass.

### How the Natural-1 Thumb-Down Animation Works

`RollOutcomeEffects` renders six `👎` spans absolutely positioned across an
`overflow-hidden`/`pointer-events-none` layer, each running the `roll-fx-thumb-pop` CSS keyframe
once with `forwards` fill (fade in, drift up, fade out — never `infinite`) and a small staggered
`animation-delay`. The panel itself also gets a single `roll-fx-shake-once` 420ms shake. Both are
purely decorative (`aria-hidden="true"`) and layered behind the relatively-positioned text content.

### How the Natural-20 Green-Flame Animation Works

Five `🔥` spans are positioned along the bottom edge of the panel and run the looping
`roll-fx-flame-flicker` keyframe (gentle opacity/scale/translate pulses, staggered delays). It is
intentionally subtle (low base opacity, small movement) so it stays "magical/celebratory but
readable" and doesn't make the panel unreadable, per the requirement that Natural 20 effects "may
loop subtly but must not make the popup unreadable."

### How Reduced Motion Is Handled

`usePrefersReducedMotion` reads `window.matchMedia('(prefers-reduced-motion: reduce)')` (lazily, to
avoid the `set-state-in-effect` lint rule) and subscribes to changes. When true,
`RollOutcomeEffects` renders nothing and the shake class is omitted — the panel falls back to its
always-present static border/background/shadow styling and the text-label badge, satisfying "never
rely on color alone" and the reduced-motion requirement simultaneously. `app/globals.css` also adds
a `@media (prefers-reduced-motion: reduce)` rule that force-disables the animation classes as a
defense-in-depth fallback for any environment where the JS check races the paint.

### How Hidden DM Data Is Protected

The panel renders only fields the server actions already classified as player-safe:
`result`/`outcome`/`total`/`natural_roll`/`modifier` (the player's own roll, always visible to
them), and `summary` — which is exactly the `result.summary` / `player_visible_summary` string
`submitRollResult`/`submitAttackRollResult` already build server-side with hidden-AC gating baked
in (e.g. "Your attack roll was 21. The attack hits." when AC is hidden). `damageTotal` is only ever
populated from that same safe return value — never fetched from `action_attack_result_dm_details`
or by reading hidden token HP/AC directly. No new Supabase queries against DM-only tables
(`action_intent_dm_notes`, `action_attack_result_dm_details`, `pending_state_updates`) were added;
the only new query is a `status` read on the player's own `action_intents` row (already visible to
them via existing RLS) used solely to drive the "waiting for DM review" → "resolved" banner.

### Assumptions

- "Major failure" has no corresponding `RollResultValue` in the current schema (only
  `critical_failure`/`failure`/`success`/`major_success`/`critical_success`/`unknown` exist per
  migration `011`). The variant/display vocabulary still defines `major_failure` styling so a
  future roll-engine change can opt in without another pass, but nothing currently emits it.
- "Waiting for DM review" / "resolved" is derived from `action_intents.status`
  (`rolled_waiting_for_dm`/`resolving` = pending, `resolved`/`denied`/`cancelled` = done) rather
  than a dedicated reveal flag, since the player's own roll result/summary is already returned
  synchronously and safely by the server action regardless of `revealed_to_player` (which gates a
  separate DM-controlled narrative reveal elsewhere in the pipeline, not the player's own roll
  feedback).
- The result panel intentionally does not requery `action_attack_results` (players can only SELECT
  rows where `revealed_to_player = true`, per RLS in migration `013`) — re-deriving the outcome
  from a query the player may not have access to yet would either error or silently show nothing,
  so the synchronous server-action return remains the single source of truth for the popup's
  result content.

### QA Results

Code-level checks (build/typecheck/lint, persistence across refresh, variant mapping, animation
one-shot vs. loop behavior, reduced-motion fallback, no new DM-only queries) are verified — see
`docs/QA_CHECKLIST.md` ("Player Roll Outcome Popup Styling"). Manual two-account browser QA
(visual confirmation of colors/animations/labels and the DM-review → resolved transition) remains
pending, consistent with prior phases.

## Action Game State Sync Phase 4

Date: 2026-06-07

Status: Code complete. `npx tsc --noEmit`, `npm run lint`, and `npm run build` pass. Runtime QA requires applying migration `014_pending_state_updates.sql` (after `011`/`012`/`013`).

### Files Changed

- `supabase/migrations/014_pending_state_updates.sql` (new)
- `lib/types/database.ts`
- `lib/actions/state-updates.ts` (new)
- `lib/actions/roll-requests.ts`
- `components/actions/ActionCenter.tsx`
- `components/actions/ActionQueueNotificationWidget.tsx`
- `app/(app)/campaigns/[id]/actions/page.tsx`
- `docs/GAME_STATE_SYNC_PHASE4.md` (new)
- `docs/QA_CHECKLIST.md`
- `docs/PHASE_COMPLETION_REPORT.md`

### What Changed

- Added a generic `pending_state_updates` table (DM-only via RLS) that records suggested map/token/object changes with `before`/`after` JSON, a player-safe `summary`, status (`pending_dm_review` / `applied` / `rejected`), and a full audit trail (`applied_at`, `applied_by_dm_id`, original `action_intent_id`/`roll_result_id`).
- Hooked `submitAttackRollResult` so a landed attack with damage on a known token automatically queues a `damage_token` suggestion (e.g. "Goblin takes 7 piercing damage and is reduced to 0 HP (defeated)."), instead of mutating HP directly.
- Added `lib/actions/state-updates.ts` with `applyPendingStateUpdate` (DM-only; writes `current_hp`/`max_hp`/`temp_hp`/`is_defeated`/`object_state`/`visible_to_players`/awareness back onto the existing `tokens` row, the same row the Map/Token editor already edits) and `rejectPendingStateUpdate` (marks rejected, mutates nothing).
- Added a "Suggested Map/Object Update" review card to the full Action Queue (`ActionCenter.tsx`) and a compact version to the global DM popup (`ActionQueueNotificationWidget.tsx`), each with **Apply Update**, **Edit Before Applying**, and **Reject Update** — matching the DM-controlled flow described in the spec.
- "Edit Before Applying" lets the DM change the suggested HP value and defeated flag (for damage updates) or the suggested object state string (for object/reveal updates) before applying; the edited values are written into `after` and become the audit record.
- Reused the existing `tokens.object_state` enum (`locked`/`unlocked`/`open`/`closed`/`looted`/`broken`/`hidden`/`visible`/etc. from `010_universal_action_system.sql`) for `set_object_state`/`reveal_object`/`set_token_state` updates — no parallel state model was introduced.
- `set_awareness` updates (for stealth/sneak) store `{ awareness }` inside the token's existing `resolver_config` JSONB rather than adding new columns, per "only add this if it fits the existing token model."

### Known Limits / Assumptions

- Automatic suggestion *creation* is wired only for the attack-damage path (the one flow in Phases 1-3 that already produces a numeric, structured outcome tied to a target token). Lockpick/door/search/stealth suggestions are supported by the generic engine (`set_object_state`, `reveal_object`, `set_awareness` all apply correctly when a `pending_state_updates` row exists), but nothing yet auto-creates those rows from the generic `submitRollResult` path — doing so well would require classifying arbitrary `action_type` strings into object/stealth verbs, which risks "overbuilding" rules the user explicitly asked to avoid. The existing `object_state` resolver (DM-approval-time direct mutation) is left untouched so current DM workflows for doors/chests keep working unchanged.
- "Edit Before Applying" covers the fields explicitly called out in the spec (HP, defeated flag, object state string). Free-form editing of arbitrary `after` JSON is not exposed in the UI; the underlying `applyPendingStateUpdate(... { after: {...} })` override mechanism supports it for future expansion.
- `pending_state_updates` is DM-only at the RLS layer (no player SELECT policy at all), which is the simplest way to guarantee "do not leak hidden HP/AC/state" — players only ever learn about a change once the DM applies it and the normal `tokens` RLS/reveal rules make the result visible.

---

## Action Attack Resolution Phase 3

Date: 2026-06-08

Status: Code complete. `npx.cmd tsc --noEmit`, `npm.cmd run lint`, and `npm.cmd run build` pass. Runtime QA requires applying migrations `011_action_roll_requests.sql`, `012_roll_modifier_context.sql`, and `013_attack_resolution_phase3.sql`.

### Files Changed

- `supabase/migrations/013_attack_resolution_phase3.sql`
- `lib/utils/attack-resolution.ts`
- `lib/types/database.ts`
- `lib/actions/roll-requests.ts`
- `components/actions/ActionQueueDmControls.tsx`
- `components/actions/PlayerRollRequestPopup.tsx`
- `components/actions/ActionCenter.tsx`
- `components/actions/ActionQueueNotificationWidget.tsx`
- `app/(app)/campaigns/[id]/actions/page.tsx`
- `docs/ACTION_ATTACK_RESOLUTION_PHASE3.md`
- `docs/QA_CHECKLIST.md`
- `docs/PHASE_COMPLETION_REPORT.md`

### What Changed

- Added attack roll resolution for weapon attacks in the existing roll-request flow.
- Added damage formula parsing/rolling for common dice formulas.
- Added simple critical hit handling: double damage dice, add static modifier once.
- Added manual damage dice-total entry and validation.
- Added player-safe attack result rows and DM-only detail rows so hidden AC stays out of player-readable data by default.
- Added DM controls for weapon, target AC, advantage, reveal AC, auto damage, and DM review before reveal.
- Added DM Action Queue attack result breakdown and Reveal Result action.

### Known Limits

- Damage is recorded only and is not applied to token HP.
- Unknown target AC produces an `unknown` attack outcome unless AC can be resolved from target token data or revealed/manual AC is supplied.
- Advanced class features, spell effects, resistances, vulnerabilities, and multiattack automation are intentionally out of scope.

---

## Action Roll Modifiers Phase 2

Date: 2026-06-08

Status: Code complete. `npx.cmd tsc --noEmit`, `npm.cmd run lint`, and `npm.cmd run build` pass. Runtime QA requires applying migrations `011_action_roll_requests.sql` and `012_roll_modifier_context.sql`.

### Files Changed

- `supabase/migrations/012_roll_modifier_context.sql`
- `lib/utils/roll-modifiers.ts`
- `lib/types/database.ts`
- `lib/actions/roll-requests.ts`
- `components/actions/ActionQueueDmControls.tsx`
- `components/actions/ActionCenter.tsx`
- `components/actions/PlayerRollRequestPopup.tsx`
- `docs/ACTION_ROLL_MODIFIERS_PHASE2.md`
- `docs/QA_CHECKLIST.md`
- `docs/PHASE_COMPLETION_REPORT.md`

### What Changed

- Added a shared roll modifier engine for finalized character data.
- Added ability check, skill check, saving throw, tool check, weapon attack, spell attack, and custom roll support.
- DM roll controls now show dependent selectors, calculated modifier preview, breakdown, warnings, and an override toggle.
- Roll requests store modifier source, breakdown, notes, warnings, and context so player and DM views share the same explanation.
- Player roll popup and the full Action Queue now show compact modifier details.

### Known Limits

- This does not automate damage, HP, spell effects, encounter scripting, or advanced rules.
- Character data that only exists as free text is parsed conservatively and may need a DM override.
- Live two-account QA remains pending until the Supabase migrations are applied.

---

## Action Roll Requests Phase 1

Date: 2026-06-08

Status: Code complete. `npx.cmd tsc --noEmit`, `npm.cmd run lint`, and `npm.cmd run build` pass. Runtime QA requires applying migration `011_action_roll_requests.sql`.

### Files Changed

- `supabase/migrations/011_action_roll_requests.sql`
- `lib/types/database.ts`
- `lib/actions/roll-requests.ts`
- `components/actions/ActionQueueDmControls.tsx`
- `components/actions/ActionCenter.tsx`
- `components/actions/ActionQueueNotificationWidget.tsx`
- `components/actions/PlayerRollRequestPopup.tsx`
- `app/(app)/campaigns/[id]/actions/page.tsx`
- `app/(app)/layout.tsx`
- `docs/ACTION_ROLL_REQUESTS_PHASE1.md`
- `docs/QA_CHECKLIST.md`
- `docs/PHASE_COMPLETION_REPORT.md`

### What Changed

- Added Phase 1 generic d20 roll requests/results linked to existing action intents.
- Added `approved_waiting_for_roll`, `rolling`, and `rolled_waiting_for_dm` action statuses.
- `Approve` and `Ask Roll` in the shared DM controls now create a generic roll request instead of
  running the older attack damage/HP resolver path.
- Added global player roll popup with Roll for Me and manual roll modes.
- Added basic d20 result logic: natural 1/20, optional target/DC success/failure/major success,
  and unknown when no target is provided.
- The Action Queue and global DM popup display waiting roll state and submitted roll totals.

### Known Limits

- No weapon damage automation, map/token HP updates, or advanced DnD rule engine in this phase.
- Supabase migration must be applied before live DM/player QA.

---

## Global Latest Action Notification Widget

Date: 2026-06-08

Status: Code complete. `npx.cmd tsc --noEmit`, `npm.cmd run lint`, and `npm.cmd run build` pass.

### Files Changed

- `app/(app)/layout.tsx`
- `components/actions/ActionQueueDmControls.tsx`
- `components/actions/ActionQueueNotificationWidget.tsx`
- `components/actions/ActionCenter.tsx`
- `docs/ACTION_QUEUE_NOTIFICATION_WIDGET.md`
- `docs/QA_CHECKLIST.md`
- `docs/PHASE_COMPLETION_REPORT.md`

### What Changed

- Added a global DM-only Latest Action notification widget.
- The widget is mounted once in the authenticated app layout and appears on campaign-specific
  pages by deriving the campaign ID from the current path.
- It uses the existing `action_intents` data source and links to the existing Action Queue route:
  `/campaigns/[id]/actions`.
- It subscribes to Supabase realtime updates for `action_intents` filtered by campaign ID.
- If realtime reports a channel error/timeout/close, it falls back to a lightweight 30-second poll.
- Dismissing a notification stores only local `sessionStorage` UI state and does not mutate queue
  status.
- Added a DM-only `DM Actions` shortcut inside the popup.
- Extracted the full Action Queue item response/note/decision controls into
  `ActionQueueDmControls` so the full page and popup use the same server-action path.
- The popup popover supports DM response, DM-only note, Approve, Ask Roll, Deny, and
  Resolve & Reveal, with loading and error states.

### Known Limits

- Hidden on global pages without a campaign ID, such as `/dashboard`, because there is no single
  campaign queue context there.
- Browser QA still needs an authenticated DM/player flow to submit an action and confirm the popup
  appears live across pages.

---

## Starter Character Template System

Date: 2026-06-08

Status: Code complete. `npx.cmd tsc --noEmit` passes. Browser/database finalization QA remains pending.

### Files Changed

- `lib/character-templates.ts`
- `lib/actions/character-templates.ts`
- `components/characters/CharacterTemplateBrowser.tsx`
- `app/(app)/campaigns/[id]/characters/templates/page.tsx`
- `app/(app)/campaigns/[id]/characters/templates/[templateId]/page.tsx`
- `app/(app)/campaigns/[id]/characters/page.tsx`
- `app/(app)/campaigns/[id]/characters/new/page.tsx`
- `docs/CHARACTER_TEMPLATE_REQUIREMENTS.md`
- `docs/QA_CHECKLIST.md`
- `docs/PHASE_COMPLETION_REPORT.md`

### What Changed

- Added a validated loader for the immutable Starter Set template JSON pack in
  `components/Character Templates`.
- Added a template selection route and full template detail/finalization route.
- Added a server action that clones a selected template into the existing playable character model.
- Finalization copies core stats to `characters`, equipment to `character_inventory_items`,
  features to `character_abilities`, spells to `character_spells`, and attacks to
  `character_attacks`.
- Full narrative/template details are preserved in the finalized character's notes because the
  current schema does not yet have dedicated source-template, narrative, or advancement columns.

### Known Limits

- Browser QA and live database insert verification still need to be run with an authenticated
  campaign member.
- Cleric prepared spells are captured through a free-form field because the source pack does not
  include a full cleric spell-list dataset.
- A future migration could add first-class `source_template_id`, `template_snapshot`, and
  narrative/customization columns instead of preserving those details in notes.

---

## DM Map Layout / Right-Side Tool Panel

Date: 2026-06-07

Status: Code complete. `npx tsc --noEmit`, `npm run lint`, and `npm run build` pass. Browser viewport automation could not attach in this Windows sandbox, so manual viewport and wheel behavior checks remain pending.

### Files Changed

- `app/(app)/campaigns/[id]/maps/[mapId]/page.tsx`
- `components/maps/MapEditor.tsx`
- `components/maps/MapCanvas.tsx`
- `docs/DM_MAP_LAYOUT_REQUIREMENTS.md`
- `docs/MAP_EDITOR_UI_REQUIREMENTS.md`
- `docs/QA_CHECKLIST.md`
- `docs/PHASE_COMPLETION_REPORT.md`

### Layout Components Changed

- Map editor route now uses a full-height, overflow-hidden wrapper.
- `MapEditor` now fills available route height instead of behaving like a scrolling document section.
- Map canvas and tools are arranged in a side-by-side grid at desktop/laptop widths.
- Right-side tool panel uses compact Token, Reveal, and Grid tabs.
- Revealed area and grid controls were moved into the right-side panel.

### Bottom Menus Moved

The previous Map Editing, Revealed Areas, and Grid sections no longer act as full-width bottom panels in the DM desktop/laptop layout. They are available inside the right-side task panel, with internal scrolling only when needed.

### Floating Add Menu

The floating `+` bubble remains on the map. It opens the compact add-token menu without pushing page layout or creating page scroll.

### Token Context Menus

Selecting a token still opens a compact floating context menu near the token. Detailed editing still opens the tabbed floating editor.

### Cursor-Based Zoom

`MapCanvas` now attaches wheel handling directly to the viewport with a non-passive listener. The handler prevents default page scrolling, stops propagation, and calls the existing cursor-relative zoom calculation so the map point under the cursor remains stable.

### Page Scroll Prevention

- The map route wrapper uses full height and `overflow-hidden`.
- The editor uses `min-h-0`, `flex-1`, and internal overflow boundaries.
- The right tool panel scrolls internally.
- Wheel zoom is isolated to the map viewport.

### Responsive Behavior

- Desktop/laptop: right tool panel is visible when tools are open.
- Smaller laptop: DM can hide tools to recover map width.
- Tablet/mobile DM: tools may stack but remain tab-organized.
- Player mobile map view was not changed.

### Manual Viewport Test Results

- Automated browser attach failed in this Windows sandbox.
- Manual viewport checks remain pending for 1024x768, 1280x720, 1366x768, 1440x900, 1536x864, and 1920x1080.
- Manual wheel/pan isolation checks remain pending.

### Known Limitations

- The right-side panel uses three task tabs, not a larger icon rail with Requests/Settings.
- Duplicate token is still not implemented.
- Context-menu anchoring remains map-coordinate based and can be approximate after heavy pan/zoom.

### Next Recommended Improvements

- Add an icon rail variant for the right tool panel at tight laptop widths.
- Add duplicate-token action.
- Expose rendered token screen coordinates from `MapCanvas` for exact menu anchoring.
- Add Playwright viewport and wheel-behavior regression tests.

---

## DM Fullscreen Laptop Layout Pass

Date: 2026-06-07

Status: Code complete. `npx tsc --noEmit`, `npm run lint`, and `npm run build` pass. Browser viewport automation could not attach in this Windows sandbox, so manual viewport verification remains pending.

### Files Changed

- `app/(app)/layout.tsx`
- `components/nav/Sidebar.tsx`
- `components/nav/DMUtilityPanel.tsx`
- `app/(app)/campaigns/[id]/page.tsx`
- `app/(app)/campaigns/[id]/maps/page.tsx`
- `app/(app)/campaigns/[id]/maps/[mapId]/page.tsx`
- `app/(app)/campaigns/[id]/actions/page.tsx`
- `app/(app)/campaigns/[id]/characters/page.tsx`
- `app/(app)/campaigns/[id]/encounters/page.tsx`
- `app/(app)/campaigns/[id]/encounters/[encounterId]/page.tsx`
- `app/(app)/campaigns/[id]/story/page.tsx`
- `components/maps/MapEditor.tsx`
- `docs/DM_LAYOUT_REQUIREMENTS.md`
- `docs/MOBILE_PLAYER_LAYOUT_REQUIREMENTS.md`
- `docs/CAST_VIEW_REQUIREMENTS.md`
- `docs/QA_CHECKLIST.md`
- `docs/PHASE_COMPLETION_REPORT.md`

### Layout Components Changed

- App shell now uses an overflow-hidden root and `min-w-0` main workspace.
- Desktop sidebar is collapsible and has campaign/session task navigation.
- Added `DMUtilityPanel`, a collapsible right-side desktop utility rail with sync status, active scene, request count, and quick links.
- Map editor tool panel is collapsible and moves out of the map's way on smaller laptop widths.

### DM Desktop / Laptop Layout

- DM dashboard is wider and uses session metric cards plus a two-column control layout.
- DM maps, actions, characters, encounters, story, and map editor pages use wider desktop containers where the user is the DM.
- Utility panel appears at desktop widths and can be collapsed when the map/workspace needs more room.
- The map editor route now uses a wide `max-w-[1800px]` workspace for fullscreen browser use.

### Responsive Behavior

- Large desktops can show sidebar, main workspace, and utility panel.
- Laptop widths can collapse the sidebar and map tools to preserve workspace width.
- Tablet/mobile keep stacked page sections and mobile bottom navigation.
- Player pages keep their existing mobile-first branches.

### Player Mobile Preservation

- Player map, action, character, and journal routes were not converted to desktop-first layouts.
- DM utility panel is only rendered inside DM branches.
- Player branches still rely on player-safe queries/RLS and do not fetch DM-only notes.

### Cast View Preservation

- No cast route was changed.
- No global DM panel was introduced that would leak into a future cast shell.
- Cast requirements are documented for a future fullscreen player-safe route.

### Overflow / Spacing Fixes

- Main app shell uses `overflow-hidden` plus scrollable `main`.
- `main` uses `min-w-0` to prevent nested grids from forcing horizontal overflow.
- DM map editor page no longer caps at a cramped desktop width.
- Map editor secondary tools can be hidden.

### Manual Viewport Test Results

- Automated browser checks were attempted but the in-app browser runtime failed to attach in this Windows sandbox.
- Manual viewport checks remain pending for DM laptop, DM mobile/tablet, player mobile, and future cast view.

### Known Limitations

- Utility panel shows counts and navigation links, not inline approve/deny controls.
- Viewport screenshot evidence is not available from this run.
- Cast route remains future work.

### Next Recommended Improvements

- Add exact inline pending-request quick actions to the utility panel.
- Add Playwright viewport tests for 1024, 1366, 1440, and mobile widths.
- Create a dedicated fullscreen cast route consuming player-safe action results.

---

## Map Token Editing UI Refresh

Date: 2026-06-07

Status: Code complete for the requested UI/UX pass. `npx tsc --noEmit`, `npm run lint`, and `npm run build` pass. Manual viewport/runtime verification remains pending.

### Files Changed

- `components/maps/MapEditor.tsx`
- `docs/MAP_EDITOR_UI_REQUIREMENTS.md`
- `docs/UNIVERSAL_ACTION_SYSTEM_REQUIREMENTS.md`
- `docs/QA_CHECKLIST.md`
- `docs/PHASE_COMPLETION_REPORT.md`

### Components Added / Replaced

- Added `TokenAddBubble` for canvas-level token creation.
- Added `TokenContextMenu` for compact selected-token actions.
- Added `TokenEditPanel` for tabbed token/object editing.
- Removed the rendered long selected-token sidebar form.
- Preserved the map side panel for reveal-area and grid controls.

### Menu Behavior

- No token selected: DM uses the floating `+` bubble to add tokens/objects.
- Token selected: context menu opens with edit sections, movement controls, and delete.
- Detailed editing opens in tabs: Basic, Actions, Visibility, Combat, Notes, Advanced.
- Escape closes floating menus.
- Save/Cancel applies batched editor changes instead of autosaving every field keystroke.

### Mobile Handling

- The editor renders as a fixed bottom sheet on small screens.
- Tabs scroll horizontally.
- Add menu width is viewport constrained.
- Context controls use compact touch-friendly buttons.

### Realtime / Security

- Existing map actions, `updateToken`, movement actions, and `useTokenRealtime` remain the source of truth.
- DM-only notes still use `token_dm_notes`.
- Hidden token behavior remains protected by existing player queries and RLS.
- No new player-edit permissions were introduced.

### Tests

- `npx tsc --noEmit` passes.
- `npm run lint` passes.
- `npm run build` succeeds.

### Limitations

- Manual viewport verification remains pending.
- Duplicate-token quick action is not implemented yet.
- Context menu position is coordinate-based and may be approximate after heavy canvas pan/zoom.

### Next Recommended Improvements

- Add a real duplicate-token server action and quick-menu entry.
- Add Playwright coverage for token editor tabs and hidden-data boundaries.
- Expose exact rendered token screen coordinates from `MapCanvas` for tighter context-menu anchoring.

---

## Universal DM-Controlled Action System

Date: 2026-06-07

Status: Code complete at the first-framework level. `npx tsc --noEmit`, `npm run lint`, and `npm run build` all pass. Runtime verification remains pending migration `010_universal_action_system.sql`.

### Files Changed

- `supabase/migrations/010_universal_action_system.sql`
- `lib/types/database.ts`
- `lib/utils/actions.ts`
- `lib/actions/action-intents.ts`
- `lib/actions/maps.ts`
- `components/actions/ActionCenter.tsx`
- `components/maps/MapEditor.tsx`
- `app/(app)/campaigns/[id]/actions/page.tsx`
- `docs/UNIVERSAL_ACTION_SYSTEM_REQUIREMENTS.md`
- `docs/ACTION_REQUESTS_REQUIREMENTS.md`
- `docs/INTERACTABLE_OBJECTS_REQUIREMENTS.md`
- `docs/COMBAT_RESOLUTION_REQUIREMENTS.md`
- `docs/DATA_MODEL_NOTES.md`
- `docs/ROLE_PERMISSION_NOTES.md`
- `docs/QA_CHECKLIST.md`

### Database / Schema Changes

- Extended `tokens` with cast visibility, approval/resolver config, AC/HP/temp HP, and defeated fields.
- Extended `action_intents` with response visibility, resolver type/status, `resolved_by`, and `resolving` status.
- Added `character_attacks` for user-authored attacks.
- Added `action_results` for player-safe resolver output.
- Added `combat_logs` for attack rolls/damage/HP changes.
- Added realtime publication coverage for `action_intents`, `action_results`, `combat_logs`, and `character_attacks`.

### RLS Policies

- Players can manage attacks for their own characters; DMs can manage attacks for campaign characters.
- Players can read own/public action results only when no private DM details are present.
- Campaign members can read combat logs; DMs own combat log writes/edits/deletes.
- DM-only token mutation policies continue to protect HP, AC, resolver config, visibility, and state.

### Resolver Behavior

- Manual resolver: DM response/result logging.
- Object-state resolver: approval updates object state for Open/Close/Lockpick/Disarm/Activate/Break/Take.
- Attack resolver: Attack is one allowed action; DM approval starts `pending_player`; player chooses a saved attack or basic fallback; server rolls d20/damage, applies temp/current HP damage, writes combat log/result, and marks defeated at 0 HP.

### Realtime / No Refresh

`ActionCenter` subscribes to `action_intents`, `action_results`, `combat_logs`, `character_attacks`, `tokens`, `characters`, and `character_conditions`, so request submission, approval, resolver output, object state, and HP updates are refetched live through the existing realtime refresh pattern.

### Known Limitations

- No full spell automation.
- No trap automation or scripted event system.
- No dedicated cast-screen route yet; public-safe results are stored with `public_result` for a future cast view.
- No explicit undo-last-damage button; DM can manually correct HP/defeated state in Map Editor.
- Runtime two-browser tests still required after applying migration 010.

### Next Recommended Improvements

- Dedicated cast screen consuming `public_result` action results.
- Undo/override controls for combat logs.
- Richer resolver configuration UI.
- Playwright tests for action permissions and hidden-data boundaries.

---

## Phase 9b - Live Updates With No Browser Refresh (hard requirement)

Date: 2026-06-07

Status: Code complete. `npx tsc --noEmit`, `npm run lint`, and `npm run build` all pass. Requires `supabase/migrations/009_realtime_live_sync.sql` (in addition to 008) applied before runtime use; manual two-browser runtime checks remain (see `QA_CHECKLIST.md` Phase 9b and `REALTIME_SYNC_REQUIREMENTS.md`).

### Files Changed
- `supabase/migrations/009_realtime_live_sync.sql` (new)
- `lib/hooks/useRealtimeRefresh.ts` (new)
- `components/actions/ActionCenter.tsx`
- `components/encounters/EncounterManager.tsx`
- `components/characters/CharacterSheet.tsx`
- `components/story/StoryWorkspace.tsx`
- `components/maps/PlayerMapView.tsx`
- `docs/QA_CHECKLIST.md`, `docs/REALTIME_SYNC_REQUIREMENTS.md` (new), `docs/PHASE_COMPLETION_REPORT.md`

### What changed and why
Auditing the realtime setup found that **only `tokens`, `maps`, and
`map_revealed_areas` were ever added to the `supabase_realtime` publication** —
every other feature table (characters, encounters, action_intents, story
tools…) had correct RLS but silently emitted zero realtime events, so those
screens only ever updated on a manual refresh. Migration 009 closes that gap
for all "session-critical" tables named in the spec (with `REPLICA IDENTITY
FULL`), while deliberately leaving the three DM-only annotation tables
(`token_dm_notes`, `action_intent_dm_notes`, `encounter_participant_dm_notes`)
unpublished so they can never be broadcast to a player's channel.

A new generic hook, `useRealtimeRefresh`, complements the existing
`useTokenRealtime` fine-grained-merge hook: for screens whose rendered data is
a deep join (action intents + actor/character/profile/target, encounters +
participants, character + conditions/inventory/spells/abilities, story
content), it subscribes to the relevant tables and triggers a debounced
`router.refresh()` — an authoritative, RLS-respecting server refetch — rather
than hand-merging every payload shape. This was wired into `ActionCenter`,
`EncounterManager`, `CharacterSheet`, and `StoryWorkspace`, plus a
campaign-wide `maps` watch on `PlayerMapView` so a DM switching the active map
swaps the player's view live (previously only in-place changes to the
*already-active* map propagated).

See **`docs/REALTIME_SYNC_REQUIREMENTS.md`** for the full architecture
explanation, channel/table matrix, hidden-data-protection analysis, and the
manual two-browser test checklist — including the dedicated "Realtime /
No-Refresh Verification" report section requested in the spec.

## Phase 9 - Live Map Visibility & Interactable Objects

Date: 2026-06-07

Status: Code complete. `npx tsc --noEmit`, `npm run lint`, and `npm run build` all pass. Requires `supabase/migrations/008_map_visibility_objects.sql` applied before runtime use; manual two-account runtime checks remain (see `QA_CHECKLIST.md` Phase 9, `MAP_VISIBILITY_REQUIREMENTS.md`, `INTERACTABLE_OBJECTS_REQUIREMENTS.md`).

## Files Changed

- `supabase/migrations/008_map_visibility_objects.sql` (new)
- `lib/types/database.ts`
- `lib/utils/actions.ts`
- `lib/actions/action-intents.ts`
- `lib/actions/maps.ts`
- `lib/hooks/useTokenRealtime.ts`
- `components/maps/MapCanvas.tsx`
- `components/maps/MapEditor.tsx`
- `components/maps/PlayerMapView.tsx`
- `components/actions/ActionCenter.tsx`
- `app/(app)/campaigns/[id]/maps/page.tsx`
- `app/(app)/campaigns/[id]/maps/[mapId]/page.tsx`
- `docs/DATA_MODEL_NOTES.md`
- `docs/ROLE_PERMISSION_NOTES.md`
- `docs/QA_CHECKLIST.md`
- `docs/MAP_VISIBILITY_REQUIREMENTS.md` (new)
- `docs/INTERACTABLE_OBJECTS_REQUIREMENTS.md` (new)
- `docs/PHASE_COMPLETION_REPORT.md`

## Features Completed

- DM-controlled fog/reveal layer (`map_revealed_areas`): reveal/hide the whole
  map, draw rectangle or circle reveal areas by dragging on the canvas, toggle
  individual areas visible/hidden without losing them, and delete areas — all
  synced live to players via an SVG `<mask>`-based fog overlay.
- Interactable object model layered onto the existing `tokens` table: 16 token
  types (added Chest, Door, Trap, Book, Note, Loot pile, Lever, Switch, Portal,
  Key, Container, Object, Custom to the existing Player/NPC/Enemy), an
  `interactable` flag that fully gates whether players can target/act on a
  token, an `object_state` field (Hidden/Visible/Locked/Unlocked/Open/Closed/
  Trapped/Disarmed/Activated/Disabled/Looted/Broken/Custom), and a
  `public_description` field for player-safe flavor text shown on selection and
  in the Action Center.
- DM Map Editor gained an "Object" panel (state + description) and a rewired
  "Interactions" panel (interactable checkbox gating an allowed-actions list
  with the 19-item suggested action vocabulary), plus a "Revealed Areas" panel
  with reveal/hide-all, draw tools, and a manage list.
- Player Action Center now filters nearby targets on
  `interactable && visible_to_players` plus computed range, shows
  `public_description`, displays request submission timestamps, and lets
  players cancel their own still-pending requests via a narrowly-scoped RLS
  self-cancel policy (`pending → cancelled`, own rows only).
- DM Action Queue gained a "Resolve & Reveal" action and guidance pointing the
  DM at the Map Editor for `object_state` changes (which already sync live to
  players through the existing token realtime channel — no separate "reveal
  result" plumbing was needed).



Date: 2026-06-07

Status: Code complete. MVP is session-ready for a controlled play-session test after Supabase migrations and manual two-account runtime checks.

## Files Changed

- `app/(app)/campaigns/[id]/export/route.ts`
- `app/(app)/campaigns/[id]/page.tsx`
- `app/(app)/layout.tsx`
- `app/(app)/loading.tsx`
- `app/globals.css`
- `app/layout.tsx`
- `app/manifest.ts`
- `components/maps/MapEditor.tsx`
- `components/nav/MobileNav.tsx`
- `components/nav/Sidebar.tsx`
- `components/story/StoryWorkspace.tsx`
- `components/ui/ConnectionStatus.tsx`
- `public/app-icon.svg`
- `docs/PROJECT_SOURCE_OF_TRUTH.md`
- `docs/ROADMAP.md`
- `docs/QA_CHECKLIST.md`
- `docs/MOBILE_READINESS_REPORT.md`
- `docs/PERMISSION_AUDIT_REPORT.md`
- `docs/FINAL_MVP_QA_REPORT.md`
- `PHASE_COMPLETION_REPORT.md`

## Features Completed

- Campaign-aware desktop and mobile session navigation.
- DM-only JSON campaign export.
- PWA manifest, mobile theme color, install metadata, and icon placeholder.
- Offline warning.
- App route loading skeleton.
- Safe delete confirmations for Story Tools and map tokens.
- Mobile overflow hardening.
- Required QA and audit reports.

## Bugs Fixed

- Phase 7 migration timestamp trigger function was corrected to use `public.update_updated_at()`.
- Story Tools destructive actions no longer delete immediately without confirmation.
- Map token deletion now asks for confirmation.

## Remaining Risks

- Browser automation could not attach in this environment, so viewport screenshots remain manual.
- Supabase runtime permission checks still need a two-account test.
- Story DM note fields should eventually move to separate DM-only tables for stronger column privacy.
- Export is backup/reference only; restore/import is not built.

## Recommended Next Improvements

- Add Playwright permission tests.
- Add campaign import/restore.
- Add toast confirmations for saves.
- Improve mobile map gestures and controls.
- Add realtime reconnect status.

## MVP Session Readiness

Yes, the MVP is ready for a controlled real play-session test after migrations are applied and manual runtime checks are completed.

---

## Player Adventure Hub Reframe

Date: 2026-06-07

Status: Code complete. `npx tsc --noEmit`, `npm run lint`, and `npm run build` all pass.
Browser viewport automation could not attach in this Windows sandbox, so manual mobile-width
screenshots remain pending (see `docs/QA_CHECKLIST.md`).

See `docs/PLAYER_ADVENTURE_HUB_REQUIREMENTS.md` for the full requirements writeup, naming
distinction, and known limitations.

### Files Changed

- `lib/hooks/useCampaignRole.ts` (new)
- `components/nav/MobileNav.tsx`
- `components/nav/Sidebar.tsx`
- `app/(app)/layout.tsx`
- `app/(app)/campaigns/[id]/maps/page.tsx`
- `app/(app)/campaigns/[id]/page.tsx`
- `components/maps/PlayerMapView.tsx`
- `docs/PLAYER_ADVENTURE_HUB_REQUIREMENTS.md` (new)
- `docs/UNIVERSAL_ACTION_SYSTEM_REQUIREMENTS.md`
- `docs/QA_CHECKLIST.md`
- `docs/PHASE_COMPLETION_REPORT.md`

### Naming Rename — Every Location

Renamed player-facing "Map" → "Adventure":

1. `components/nav/MobileNav.tsx:49` — bottom-nav label, now resolved per-role via
   `useCampaignRole` (`'dm' ? 'Map' : 'Adventure'`).
2. `components/nav/Sidebar.tsx:46` — desktop campaign-nav label, same per-role resolution.
3. `app/(app)/campaigns/[id]/maps/page.tsx:72` — player empty-state `<h1>`.
4. `app/(app)/campaigns/[id]/maps/page.tsx` — added an "Adventure" eyebrow above the active
   map's dynamic name heading (`{activeMap.name}` was kept as the `<h1>`; "Adventure" now
   labels the section above it).
5. `app/(app)/campaigns/[id]/page.tsx:276` — player dashboard `FeatureCard` title
   ("Map View" → "Adventure").

### Intentionally Left "Map" (DM-facing)

- `app/(app)/campaigns/[id]/maps/page.tsx` DM branch `<h1>Maps</h1>`.
- `app/(app)/campaigns/[id]/page.tsx` DM `SessionMetric` ("Active map") and `FeatureCard`
  ("Go to Map").
- `components/nav/DMUtilityPanel.tsx` "Go to Map" quick link and "Active scene" label.
- `MobileNav` / `Sidebar` campaign nav items render literal `Map` whenever
  `useCampaignRole` resolves to `dm` (including the brief moment before the role loads,
  which defaults to the DM-safe label).
- All Map Editor routes/components/copy (`MapEditor`, `MapCanvas` DM tools, "Live Map", etc.)

### How the Hub Works

`PlayerMapView` is now the in-session Adventure hub. The map canvas remains the visual focus —
no persistent chrome was added to it. Two additions make it a hub:

1. **Contextual action menu** — appended to the existing selected-token detail panel. When a
   player taps an interactable, player-visible token/object they don't control, the panel now
   lists only the actions the DM allowed (`actionsForToken`), shows the live distance to the
   player's nearest controlled token (`distanceFeet`), and lets them submit directly via the
   existing `submitActionIntent` server action with an optional message — all inline, no
   navigation.
2. **Floating quick-access button** — a single round button (top-right of the map) opens a
   dismissible slide-up sheet with cards to Character, Quests & Journal, My Requests, and full
   Actions/Requests.

### How Quick Menus Are Accessed

Tap the round "Quick access" button floating over the top-right corner of the map. A slide-up
sheet opens (bottom sheet on mobile, centered modal on larger screens) with four destinations.
Tapping the backdrop, the close (×) button, or any link closes the sheet and returns to the map
— the player is never routed away from the Adventure screen involuntarily.

### How Contextual Menus Work

Selecting any token opens (or updates) the existing bottom-left detail panel. If that token is
interactable, visible to players, and not controlled by the current player, an "action menu"
section is appended showing compact buttons for each DM-allowed action plus an optional message
field. Buttons are disabled (with a "Sending…" state) while the request is in flight, and a
range warning appears inline if the player's nearest token is outside `interaction_range_feet`.
Submission reuses `submitActionIntent` — identical to the flow already used on the Actions page,
so DM-side behavior (approval queue, resolver types, visibility) is unchanged.

### Mobile / Realtime / Security Preservation

- **Mobile**: the action panel and quick-access sheet use the same `absolute`/`fixed` overlay
  patterns and `bg-zinc-900/95` / `bg-zinc-950` solid-fill styling already verified at
  375–1920px elsewhere in `docs/QA_CHECKLIST.md`. The panel now spans `left-3 right-3` on small
  screens and caps to `max-w-sm` on larger ones; the sheet is bottom-anchored on mobile and
  centered from `sm:` up.
- **Realtime**: `useTokenRealtime` and `useRealtimeRefresh` hook calls and their handlers
  (`onUpsert`, `onDelete`, `onMapChange`, `onAreaUpsert`, `onAreaDelete`) are untouched — live
  token moves, reveals, lock changes, and active-map swaps still propagate with no refresh.
- **Security**: no new client-side table writes were introduced. The new `myCharacters` query
  in `maps/page.tsx` is scoped with `.eq('user_id', user.id)`; all token/area data continues to
  flow through the existing RLS-filtered selects (`tokens`, `map_revealed_areas`); and action
  submission goes through the existing `submitActionIntent` server action — the same path
  already exercised (and QA'd) by `ActionCenter`'s `PlayerActions`.

### Manual Test Results

- `npx tsc --noEmit` — pass.
- `npm run lint` — pass.
- `npm run build` — pass, all 23 routes compile and prerender.
- Mobile-width (375/390/430/768px) and desktop/tablet screenshots — not capturable in this
  Windows sandbox (no attachable browser viewport automation, consistent with prior phases'
  notes in `docs/QA_CHECKLIST.md`); the new overlay/panel markup reuses layout primitives
  already manually verified at those widths for `MapCanvas` and floating menus.

### Known Limitations

- Character and Quests/Journal quick-access cards link to their full pages rather than
  rendering embedded mini-views (HP/inventory/active-quest summaries inline).
- "My Requests" inside the quick sheet links to the full Actions page rather than showing a
  live mini-list of the player's own pending requests.

### Next Recommended Improvements

- Embed a compact HP/inventory summary and an active-quest snippet directly into the quick
  sheet, sourced from the same queries already used by the Character and Story pages.
- Surface the player's own `action_intents` (status, DM response, pending rolls) as a live
  mini-list inside the "My Requests" sheet, reusing the realtime subscription pattern from
  `ActionCenter`.
- Add a brief onboarding hint the first time a player opens the Adventure screen, pointing out
  the quick-access button and that tapping tokens opens action menus.
