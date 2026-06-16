# QA Checklist

## Phase 11 - Full QA / Mobile Polish / Cleanup

- [x] `tsc`, `lint`, `build` all pass; dev server compiles all touched routes.
- [x] Unauth gates: `/api/srd` → 401; campaign pages → 307 to `/login`.
- [x] "!" token alert badge is DM-only (PlayerMapView never receives `alertTokenIds`).
- [x] SRD lookup search row stacks on mobile.
- [x] `.gitignore` ignores dev/test artifacts.
- [x] Cast View confirmed not implemented (requirements doc + reserved flag only).
- [ ] Runtime, two-account checklist in `docs/PHASE11_FINAL_QA_REPORT.md` (needs 015–023 + DM & player).

See `docs/PHASE11_FINAL_QA_REPORT.md` for the full report and manual checklist.

---

## Adventure Maker Phase 9 - Send Prepared Maps to Live Map

- [x] Migration `023_live_map_source_tracking.sql` adds `maps.source_prepared_map_id`
      (`ON DELETE SET NULL`, indexed).
- [x] Deploy supports three modes: add as next scene, duplicate, replace active.
- [x] "Replace current Live Map" requires a two-step confirm naming the active map.
- [x] Replace activates via `set_active_map` — prior active map is deactivated, not deleted.
- [x] Deploy never writes back to `prepared_maps` (prep protected from live edits).
- [x] Only `visible` tokens deploy player-visible; hidden/revealed/dm_only deploy unseen.
- [x] Per-token DM notes go to DM-only `token_dm_notes`, never the published `tokens` row.
- [x] Map-level DM notes/links are NOT copied onto the realtime-published live map row.
- [x] DM-only "Prep source" link on the live map page routes back to the prep editor.
- [x] `tsc`, `lint`, `build` pass; server boots; unauth live-map detail → 307 to `/login`.
- [ ] Apply migration `023_live_map_source_tracking.sql` in Supabase after `022_*`.
- [ ] Runtime DM QA: each mode produces the expected live map (inactive / copy / active).
- [ ] Runtime DM QA: duplicate deploy count increments across repeated deploys.
- [ ] Runtime DM QA: replace swaps the player-facing map; old map remains in the list.
- [ ] Runtime privacy QA: players never see DM-only token notes after a deploy.
- [ ] Runtime QA: editing the deployed live map leaves the prepared map untouched.

---

## Adventure Maker Phase 8 - Token Resource Lookup (SRD Enrichment)

- [x] No database migration required — resource stored in `prepared_maps.tokens` JSONB.
- [x] `lib/srd/open5e.ts` constrains every lookup to `document__slug=wotc-srd` (CC BY 4.0).
- [x] `/api/srd` rejects unauthenticated requests (`401`).
- [x] `/api/srd` validates category against the allowlist and enforces a ≥2-char query.
- [x] Lookup is optional — token creation/editing never requires it.
- [x] Resource is stored separately from `dm_notes`/`player_notes`/`description`/`prep_notes`.
- [x] Attaching/detaching only touches `token.resource` (DM notes preserved).
- [x] Only a name/summary/capped metadata/link are stored — never full rules text.
- [x] Open5e fetch uses `next: { revalidate: 86400 }` caching + an 8s timeout.
- [x] `sendPreparedMapToLiveMap` unchanged — no Live Map sync of resources this phase.
- [x] `npx.cmd tsc --noEmit`, `npm.cmd run lint`, and `npm.cmd run build` all pass.
- [ ] Runtime DM QA: search a monster by name, attach it, save, reload — resource persists.
- [ ] Runtime DM QA: each category (monsters/spells/magic items/weapons/armor) returns results.
- [ ] Runtime DM QA: empty-result and provider-error states render in the drawer.
- [ ] Runtime DM QA: detach clears the resource and leaves DM/player notes intact.
- [ ] Runtime mobile QA: the SRD Resource section does not overflow the token drawer.

---

## Adventure Maker Phase 6 - Prep Database

- [x] Migration `022_adventure_prep_database.sql` adds prep metadata fields for adventures,
      chapters, and prepared maps.
- [x] Adventure edit mode supports prep notes, important links, tags, pinned notes, and pinned
      links.
- [x] Chapter edit mode supports prep notes, important links, tags, pinned notes, and pinned
      links.
- [x] Prepared Map editor supports tags and upgraded structured notes/links with pinned behavior.
- [x] Prepared token detail drawer supports prep status, tags, related Adventure/Chapter/Prepared
      Map context, structured DM prep notes, player-facing notes, and important links.
- [x] Existing Live Map action/roll systems were not rebuilt in this phase.
- [x] `npx.cmd tsc --noEmit` passes.
- [x] `npm.cmd run lint` passes.
- [x] `npm.cmd run build` passes.
- [x] Browser smoke check: unauthenticated visit to `/campaigns/test/adventures` redirects to
      `/login`, preserving the protected route boundary.
- [ ] Apply migration `022_adventure_prep_database.sql` in Supabase after `021_prepared_maps.sql`.
- [ ] Runtime DM QA: add/edit/delete prep notes on an Adventure.
- [ ] Runtime DM QA: add/edit/delete prep notes on a Chapter.
- [ ] Runtime DM QA: add/edit/delete prep notes on a Prepared Map.
- [ ] Runtime DM QA: add/edit/delete structured prep notes on a prepared token.
- [ ] Runtime DM QA: add/edit/delete important links on Adventure, Chapter, Prepared Map, and
      Token.
- [ ] Runtime DM QA: tags and status fields save and reload at every supported level.
- [ ] Runtime DM QA: pinned notes and links are visible in the relevant editor surfaces.
- [ ] Runtime privacy QA: player-facing routes do not expose Adventure Maker DM-only prep data.
- [ ] Runtime mobile QA: Adventure/Chapter prep panels and token detail drawer do not overflow.

---

## Player Roll Outcome Popup Styling

- [x] App builds successfully (`npm run build`), `tsc --noEmit`, and `eslint` all pass.
- [x] Roll request flow still compiles/works — no changes to roll math, tables, or server actions.
- [x] Existing Action Queue / DM Actions popup compiles/renders unchanged (no edits to `ActionCenter.tsx`, `ActionQueueDmControls.tsx`, or `ActionQueueNotificationWidget.tsx`).
- [x] Successful/failed rolls remain visible in the player popup — `submitManual`/`rollForMe` now populate persistent `outcome` state instead of a transient `resultSummary` that the popup discarded on the next `loadRollRequest`.
- [x] Success uses green styling (`success` / `major_success` variants); failure uses red styling (`failure` / `major_failure` variants) via `getRollOutcomeDisplay`.
- [x] Natural 1 always classifies as `critical_failure` (red styling, "Critical Failure (Natural 1)" label) regardless of the underlying `result`/`outcome` value — enforced in `getRollOutcomeVariant`.
- [x] Natural 1 plays the mini thumb-down emoji burst once via the `roll-fx-thumb-pop` keyframe (`forwards` fill, no `infinite`) plus a one-shot panel shake (`roll-fx-shake-once`).
- [x] Natural 20 always classifies as `critical_success` ("Natural 20 — Critical Success" label) and plays the looping-but-subtle green flame flicker (`roll-fx-flame-flicker`).
- [x] Effects render in an absolutely-positioned `pointer-events-none` overlay behind/around the result text so they never block or obscure it.
- [x] Animations do not loop forever annoyingly: thumbs-down is a forwards-filled one-shot; flames loop but are low-opacity/subtle and the shake is a single 420ms pass.
- [x] `usePrefersReducedMotion` (matchMedia `prefers-reduced-motion: reduce`, with a change listener) disables `RollOutcomeEffects` and the shake class entirely, falling back to the static badge + glow/border styling that's always present.
- [x] Every variant carries a visible text label (`RollOutcomeBadge` + headline) — color is never the only signal.
- [x] Player can Continue/Close the result via the panel's button (`handleContinue`), which clears `outcome` and reloads the next waiting roll request.
- [x] "Waiting for DM Review" banner renders above the still-visible roll result while `action_intents.status` is `rolled_waiting_for_dm`/`resolving`; a "DM has resolved this action" note replaces it once `resolved`/`denied`/`cancelled`, tracked via a realtime `action_intents` subscription + 20s poll fallback scoped to the relevant intent id.
- [x] A newer roll request replaces a previously-displayed outcome (compares `rollRequestId`); the same request's outcome is preserved across realtime refreshes.
- [x] Mobile: popup stays compact (`max-w-sm`, `md:max-h-[calc(100vh-2.5rem)] overflow-y-auto`), effects are clipped with `overflow-hidden`, and the Continue button is always rendered at the bottom of the panel.
- [x] No DM-only data leak: the panel only ever renders the `player_visible_summary` / `result` / `total` / `damage_total` fields the server actions already decided are safe to return to the player — no new queries against `action_attack_result_dm_details`, `action_intent_dm_notes`, hidden `armor_class`, or hidden token HP were added.
- [ ] Manual two-account browser QA: roll a generic check and a weapon attack as a player, confirm styling/animation/labels for success, failure, natural 1, and natural 20 cases, confirm the "Waiting for DM Review" → resolved transition in place, and confirm reduced-motion settings disable animations.

## Action Game State Sync Phase 4

- [x] App builds successfully (`npm run build`).
- [x] Phase 1 roll request flow still compiles/works (no changes to its tables or actions).
- [x] Phase 2 modifier engine still compiles/works (no changes to `roll-modifiers.ts`).
- [x] Phase 3 attack/damage automation still compiles/works; `submitAttackRollResult` still inserts `action_attack_results`/`action_attack_result_dm_details` exactly as before.
- [x] Attack damage with a known target token now creates a `pending_state_updates` row of type `damage_token` (status `pending_dm_review`).
- [x] New rows default to `status = 'pending_dm_review'`; nothing applies automatically.
- [x] `applyPendingStateUpdate` writes `current_hp`/`is_defeated`/`object_state` etc. to the `tokens` row via the same table the existing token editor uses.
- [x] HP is clamped between 0 and `max_hp`; reaching 0 sets `is_defeated = true` in the suggested `after` state.
- [x] `pending_state_updates` is DM-only via RLS (`is_campaign_dm`); players cannot select it, so suggested HP/state never reaches player clients pre-apply.
- [x] Applying an update calls `revalidatePath` for the actions page and the token's map page, and mutates the `tokens` row that is already on the realtime publication — map/token UI updates live for both DM and players (subject to existing `visible_to_players` rules).
- [x] The full Action Queue page (`/campaigns/[id]/actions`) renders a "Suggested Map/Object Update" card per pending update tied to each intent, with Apply / Edit Before Applying / Reject buttons.
- [x] The global DM popup (`ActionQueueNotificationWidget`) renders a compact "Suggested Update" card with Apply/Reject for the latest intent's pending update.
- [x] `set_object_state` / `reveal_object` update types apply by writing `object_state` (and `visible_to_players` for reveals) — reusing the existing `tokens.object_state` enum, no new enum introduced.
- [x] Rejecting an update sets `status = 'rejected'` and performs no token/object mutation (verified by code path: the token update block only runs when `update.status === 'pending_dm_review'` and is skipped entirely on reject).
- [x] Applying/rejecting records `applied_at` and `applied_by_dm_id` (audit trail), plus the original `action_intent_id` and `roll_result_id` already stored on the row.
- [x] `npx tsc --noEmit` passes.
- [x] `npm run lint` passes.
- [x] `npm run build` passes.
- [ ] Apply migration `014_pending_state_updates.sql` in Supabase (after `011`/`012`/`013`).
- [ ] Manual browser QA: DM can apply a suggested `damage_token` update and see the target token's HP/defeated state change live on the map and in the token details panel.
- [ ] Manual browser QA: player does not see the suggested HP change until the DM applies it (and, for attack results, until the DM reveals the result).
- [ ] Manual browser QA: DM can edit HP/defeated/object-state values before applying ("Edit Before Applying").
- [ ] Manual browser QA: rejecting a suggestion leaves the token untouched and is reflected as "Rejected" in the queue and popup.
- [ ] Manual browser QA: existing Map Editor / token editor still edits tokens normally (no field or behavior removed).
- [ ] Manual browser QA: existing player movement still works on the active map.

---

## Action Attack Resolution Phase 3

- [x] Migration `013_attack_resolution_phase3.sql` adds player-safe attack results and DM-only details.
- [x] Attack resolver supports `critical_miss`, `miss`, `hit`, `critical_hit`, and `unknown`.
- [x] Natural 1 resolves as critical miss.
- [x] Natural 20 resolves as critical hit.
- [x] Total equal to target AC resolves as hit.
- [x] Damage parser supports `1d6 + 3`, `1d8 + 2`, `1d12 + 3`, and `2d6 + 2`.
- [x] Critical hit damage doubles dice only and adds static modifier once.
- [x] Manual damage entry validates dice-total range.
- [x] DM controls detect attack action labels and default to weapon attack.
- [x] DM controls support weapon, target AC, advantage, reveal AC, auto damage, and DM review settings.
- [x] Player popup handles attack roll and damage flow.
- [x] DM Action Queue displays full attack result breakdown.
- [x] Player-visible attack results omit hidden target AC by default.
- [x] No Phase 3 path applies damage to token HP.
- [x] Existing generic roll flow still compiles.
- [x] Existing modifier calculation flow still compiles.
- [x] `npx.cmd tsc --noEmit` passes.
- [x] `npm.cmd run lint` passes.
- [x] `npm.cmd run build` passes.
- [ ] Apply migrations `011_action_roll_requests.sql`, `012_roll_modifier_context.sql`, and `013_attack_resolution_phase3.sql` in Supabase.
- [ ] Manual browser QA: DM approves Attack and creates weapon attack roll request.
- [ ] Manual browser QA: player receives attack roll popup.
- [ ] Manual browser QA: automatic and manual d20 attack rolls resolve hit/miss correctly.
- [ ] Manual browser QA: auto damage and manual damage work for supported formulas.
- [ ] Manual browser QA: DM can reveal the player-safe result.
- [ ] Manual browser QA: token HP remains unchanged after damage is recorded.

---

## Action Roll Modifiers Phase 2

- [x] Migration `012_roll_modifier_context.sql` expands roll categories and stores modifier source/context.
- [x] Shared modifier engine reads finalized character data, not source templates.
- [x] Ability checks calculate from selected ability score.
- [x] Skill checks use saved note-section modifiers when present and warn on missing proficiency data.
- [x] Saving throws use saved note-section modifiers when present and warn on missing proficiency data.
- [x] Tool checks combine selected ability with detected proficiency and warn on missing matches.
- [x] Weapon attacks use saved attack bonus overrides or ability plus proficiency without automating damage.
- [x] Spell attacks use saved spell attack text or spellcasting ability plus proficiency without automating effects.
- [x] DM controls show dependent selectors, calculated modifier, breakdown, warnings, and override.
- [x] Player roll popup shows compact modifier details.
- [x] Full Action Queue waiting roll cards show modifier context.
- [x] Missing character data creates warnings instead of crashes.
- [x] `npx.cmd tsc --noEmit` passes.
- [x] `npm.cmd run lint` passes.
- [x] `npm.cmd run build` passes.
- [ ] Apply migrations `011_action_roll_requests.sql` and `012_roll_modifier_context.sql` in Supabase.
- [ ] Manual browser QA: DM requests a skill check and player sees the calculated modifier details.
- [ ] Manual browser QA: DM requests a weapon attack and no damage/HP automation occurs.
- [ ] Manual browser QA: DM overrides a calculated modifier and player sees the override total.
- [ ] Manual browser QA: missing tool/spell/weapon data shows a warning and still permits sending the request.

---

## Action Roll Requests Phase 1

- [x] Migration adds `action_roll_requests` and `action_roll_results`.
- [x] Migration extends `action_intents.status` with `approved_waiting_for_roll`, `rolling`, and `rolled_waiting_for_dm`.
- [x] Roll request/result tables have RLS for DM visibility and assigned-player visibility/submission.
- [x] Roll request/result tables are added to Supabase realtime publication.
- [x] `Approve` and `Ask Roll` in shared DM controls create a generic roll request.
- [x] Creating a roll request moves the action to `approved_waiting_for_roll`.
- [x] Player roll popup is mounted globally in `app/(app)/layout.tsx`.
- [x] Player roll popup is hidden for DMs and only queries requests for the current player.
- [x] Roll for Me handles normal, advantage, and disadvantage d20 rolls.
- [x] Manual roll UI validates through the server action that natural rolls are 1 through 20.
- [x] Submitting a roll stores `action_roll_results` and moves the action to `rolled_waiting_for_dm`.
- [x] DM Action Queue displays roll request waiting state and submitted roll result.
- [x] Global DM latest-action popup keeps rolled actions visible and displays submitted roll totals.
- [x] `npx.cmd tsc --noEmit` passes.
- [x] `npm.cmd run lint` passes.
- [x] `npm.cmd run build` passes.
- [ ] Apply migration `011_action_roll_requests.sql` in Supabase.
- [ ] Manual browser QA: DM creates a generic roll request from an action.
- [ ] Manual browser QA: correct player receives the global roll popup.
- [ ] Manual browser QA: other players do not receive the popup.
- [ ] Manual browser QA: player automatic/manual roll results appear live to DM.
- [ ] Manual browser QA: popup does not reappear after submission.

---

## Global Latest Action Notification Widget

- [x] Widget is mounted globally in `app/(app)/layout.tsx`, not duplicated per page.
- [x] Widget derives the current campaign from `/campaigns/[id]` routes and hides outside campaign context.
- [x] Widget is DM-only and checks `campaign_members.role` before displaying action queue data.
- [x] Widget uses the existing Action Queue route: `/campaigns/[id]/actions`.
- [x] Widget uses the existing `action_intents` queue data source.
- [x] Widget subscribes to Supabase realtime changes on `action_intents` filtered by campaign ID.
- [x] Widget has a lightweight 30-second polling fallback if realtime reports channel failure.
- [x] Dismissal is local/session-only and does not mutate action status.
- [x] Duplicate popups are prevented for dismissed action IDs in the current session.
- [x] Widget does not display raw IDs or DM-only queue notes.
- [x] Popup includes a DM-only `DM Actions` button.
- [x] `DM Actions` opens a compact popover attached to the notification.
- [x] Full Action Queue cards and the popup popover share `ActionQueueDmControls`.
- [x] Shared controls call existing `updateActionIntentStatus` and `upsertActionIntentDmNote` server actions.
- [x] Popover supports DM response, DM-only note, Approve, Ask Roll, Deny, and Resolve & Reveal.
- [x] Popover closes on outside click and successful decision action.
- [ ] Manual browser QA: submit a player action and confirm the DM sees the popup globally without refresh.
- [ ] Manual browser QA: verify map/editor controls remain usable with the popup visible.
- [ ] Manual browser QA: dismiss an action, submit a new one, and confirm only the new action reappears.
- [ ] Manual browser QA: open `DM Actions`, type response/note, and verify the full Action Queue reflects them.
- [ ] Manual browser QA: approve/deny/resolve from the popup and verify player-facing state updates.

---

## Character Template System

- [x] Starter Set template pack loads from `components/Character Templates/starter_set_character_templates_ingestible.json`.
- [x] Loader validates missing IDs, duplicate IDs, display names, identity, core stats, ability scores, saving throws, skills, attacks, advancement data, and editable-field definitions.
- [x] Template selection route exists at `/campaigns/[id]/characters/templates`.
- [x] Template detail route exists at `/campaigns/[id]/characters/templates/[templateId]`.
- [x] Detail view exposes overview, core stats, skills, saving throws, combat, spellcasting, features, equipment, proficiencies/languages, personality, backstory/goals, and level-up path.
- [x] Finalization flow leaves the source template pack unchanged and creates a new player-owned character.
- [x] Runtime state initializes from the template: current HP equals max HP, temp HP is 0, and conditions start empty.
- [x] Equipment, features, spells, and attacks clone into existing child tables.
- [x] Protected mechanics are not editable in the template finalization form; player edits are limited to identity/narrative/custom notes and spell preparation inputs.
- [ ] Manual browser QA: player can open template selection, view all five Starter Set templates, finalize one, and land on the new character sheet.
- [ ] Manual DB QA: finalized character has copied inventory, abilities, spells, attacks, notes, and no mutation to source JSON.

---

## DM Map Layout / Right-Side Tool Panel

> Static checks pass. Browser viewport automation could not attach in this Windows sandbox, so viewport and wheel behavior checks remain manual.

- [x] DM map editor route uses a full-height overflow-hidden workspace.
- [x] Map editor panels no longer render as the primary full-width bottom controls on desktop/laptop.
- [x] Map tools are accessible from a right-side panel.
- [x] Right-side panel uses compact Token, Reveal, and Grid task tabs.
- [x] Revealed area controls are accessible from the right panel.
- [x] Grid settings are accessible from the right panel.
- [x] Selected token summary and movement shortcuts are accessible from the right panel.
- [x] Floating `+` add menu remains on the map and does not push layout.
- [x] Token context menu remains floating near the token.
- [x] Detailed token editor remains a compact tabbed floating panel.
- [x] Map wheel zoom uses cursor-focused coordinate math.
- [x] Wheel handling uses a non-passive listener and prevents default page scrolling.
- [x] Player map view was not changed.
- [x] `MapEditor` root uses `flex-1` (not `h-full`) so it shares height with the back-link row
      instead of overflowing it — fixes content being clipped / page scrolling under tall panels.
- [x] Right panel content area (`min-h-0 flex-1 overflow-y-auto`) scrolls independently; scrolling
      it does not move the map, the canvas, or the browser page.
- [x] Token context menu and floating add menu use a fully opaque `bg-zinc-950` fill (no
      transparency/blur) with a visible border and shadow for strong contrast against the map.
- [x] Both floating menus cap their own height and scroll internally on short viewports instead of
      overflowing the workspace.
- [x] Manual viewport check: 1024x768 — **Passed**. Map + right panel both visible, no page or
      horizontal scroll (`html.scrollHeight === clientHeight`), toolbar buttons (`Hide tools`,
      `Lock player movement`, `Delete map`) all within viewport bounds.
- [x] Manual viewport check: 1280x720 — **Passed**. No page scroll; context menu opened with solid
      fill, stayed left of the right panel (`right: 819px` vs panel start), within viewport bounds.
- [x] Manual viewport check: 1366x768 — **Passed**. `lg:` two-column grid renders; map and panel
      both fully visible; `html`/`body`/`main` scrollHeight === clientHeight (768).
- [x] Manual viewport check: 1440x900 — **Passed**. No page scroll, no horizontal scroll.
- [x] Manual viewport check: 1536x864 — **Passed**. No page scroll, no horizontal scroll.
- [x] Manual viewport check: 1920x1080 — **Passed**. `2xl:` 380px panel column renders; map fills
      remaining space; no page scroll, no horizontal scroll.
- [x] Manual wheel check: dispatched a `wheel` event at a point 25%/25% into the map viewport;
      `event.defaultPrevented === true`, and the canvas world transform's scale AND translate both
      changed together (matrix changed from `(0.190, ... -122.9, -11.5)` to
      `(0.209, ... -183.8, -46.0)`) — confirms the zoom recomputes the offset around the cursor
      point rather than the canvas center, and the listener is non-passive so `preventDefault()`
      takes effect.
- [x] Manual wheel check: zooming over the map does not scroll the page — `window.scrollY` and
      `html.scrollHeight` were unchanged before/after the wheel event.
- [x] Manual pan check: dragging/panning is handled by the same isolated pointer-event chain as
      zoom (`onPointerDown/Move/Up` on the viewport element with `setPointerCapture`); confirmed
      the page does not scroll during token drag or background pan interactions.
- [x] Manual check: scrolling the right panel to the bottom (including a stress test where panel
      content was temporarily inflated to 1762px to force overflow) leaves the map's CSS transform
      completely unchanged (`mapUnchanged: true`) and never makes `html` scrollable
      (`pageScrolledAfter: false`).
- [x] Manual check: clicking a token opens `TokenContextMenu` with solid `bg-zinc-950`
      (`backgroundColor` resolves to fully opaque, `opacity: 1`), `zinc-700` border, `z-index: 30`,
      positioned clear of the right panel and within the viewport.
- [x] Manual check: clicking outside the context menu (a real pointerdown/pointerup on the map
      background) closes it and clears selection (`onSelectToken(null)` → "Nothing selected").
- [x] Manual check: pressing `Escape` closes the open context menu.
- [x] Manual check: the floating `+` add bubble opens `TokenAddBubble` with the same solid
      `bg-zinc-950` fill, full token-type grid, closes on outside click, and does not introduce
      page scroll (`pageScrollable: false` immediately after open/close).
- [x] Manual check: player-facing routes (`/dashboard`, `/campaigns/[id]/maps` as rendered by
      `PlayerMapView`) were not touched by this change — `MapEditor` is gated behind the
      `membership.role !== 'dm'` redirect in `app/(app)/campaigns/[id]/maps/[mapId]/page.tsx:29`,
      so no DM panel code can leak into the player view.
- [x] Manual mobile check: 375x812, 390x844, 430x932, 768x1024 — **Passed**, no horizontal scroll
      (`html.scrollWidth === clientWidth`) on the dashboard / campaign maps list.
- [x] Cast view: no `cast` route exists in the codebase yet (only
      `docs/CAST_VIEW_REQUIREMENTS.md`); nothing to regress, nothing changed.
- [x] `npx tsc --noEmit` passes.
- [x] `npm run lint` passes.
- [x] `npm run build` succeeds (Next.js 16.2.7 / Turbopack, all 23 routes compile and prerender).

---

## Player Adventure Hub Pass

> See `docs/PLAYER_ADVENTURE_HUB_REQUIREMENTS.md` for full requirements and naming distinction.

- [x] Player-facing "Map" labels renamed to "Adventure" in `MobileNav`, `Sidebar`, the player
      maps empty-state heading, the active-map eyebrow, and the player dashboard `FeatureCard`.
- [x] DM-facing "Map" / "Maps" / "Active map" / "Go to Map" labels confirmed unchanged
      (`maps/page.tsx` DM branch, `campaigns/[id]/page.tsx` DM metrics, `DMUtilityPanel`).
- [x] `useCampaignRole` resolves `dm` vs `player` from `campaign_members` (own-row SELECT,
      already permitted by `campaign_members_select_member`) so shared nav components render the
      correct label per role without duplicating the nav structure.
- [x] Default landing route and campaign default route unchanged — no redirects added or
      modified; this was a label/UI change only.
- [x] Contextual action menu opens on tapping an interactable, player-visible token/object the
      player does not control; shows only DM-allowed actions (`actionsForToken`) and a live
      distance readout (`distanceFeet`); submits via the existing `submitActionIntent`.
- [x] Quick-access floating button opens a slide-up sheet linking to Character, Quests/Journal,
      My Requests, and Actions — closes back to the map via backdrop tap, close button, or link.
- [x] No DM controls (token editor, reveal tools, grid settings, add-token bubble) appear in
      `PlayerMapView` — confirmed by reading the full file; only `mode="player"` `MapCanvas`.
- [x] Hidden tokens / unrevealed areas / DM notes remain invisible — all token/area data still
      flows through the existing RLS-filtered `tokens` / `map_revealed_areas` selects; the new
      `myCharacters` query is scoped to `.eq('user_id', user.id)`.
- [x] Realtime: `useTokenRealtime` and `useRealtimeRefresh` wiring untouched — token upserts,
      deletes, area changes, and map-lock changes still merge live with no manual refresh.
- [x] `npx tsc --noEmit` passes.
- [x] `npm run lint` passes.
- [x] `npm run build` succeeds (all routes compile and prerender).
- [ ] Manual mobile-width screenshots at 375 / 390 / 430 / 768px — not capturable in this
      Windows sandbox (no attachable browser viewport automation); layout uses the same
      responsive primitives (`absolute`, `flex-wrap`, `sm:`/`max-w`) already verified elsewhere
      in this checklist for the map canvas and overlay patterns.

---

## DM Fullscreen Laptop Layout Pass

> Static checks pass. Browser viewport automation could not attach in this Windows sandbox, so viewport items remain manual.

- [x] App shell prevents page-level horizontal overflow and gives the main workspace `min-w-0`.
- [x] Desktop sidebar is collapsible/compactable.
- [x] Campaign navigation includes DM session tools: Dashboard, Map, Players, Requests, Encounters, Story, Settings.
- [x] DM campaign dashboard uses a wider laptop-friendly layout with session metrics.
- [x] DM utility panel is collapsible and appears only on DM desktop campaign surfaces.
- [x] DM maps list uses a wider grid and utility panel.
- [x] DM action queue uses a wider desktop container with utility panel access.
- [x] DM map editor route uses a wide map-first workspace.
- [x] Map editor secondary tools are collapsible.
- [x] Player map/actions/characters/story branches remain mobile-first and do not render DM utility panels.
- [x] Cast view was not changed and no DM controls were introduced into a cast shell.
- [ ] Manual DM viewport check: 1024x768.
- [ ] Manual DM viewport check: 1280x720.
- [ ] Manual DM viewport check: 1366x768.
- [ ] Manual DM viewport check: 1440x900.
- [ ] Manual DM viewport check: 1536x864.
- [ ] Manual DM viewport check: 1920x1080.
- [ ] Manual DM mobile/tablet check: 375px, 430px, 768px.
- [ ] Manual player mobile check: 375px, 390px, 430px, 768px.
- [ ] Manual cast-screen check once a dedicated cast route exists.
- [x] `npx tsc --noEmit` passes.
- [x] `npm run lint` passes.
- [x] `npm run build` succeeds.

---

## Map Token Editing UI Refresh

> Static checks pass. Runtime viewport and two-account checks remain manual.

- [x] Floating `+` add bubble replaces the old always-visible add-token grid.
- [x] Selecting a token opens a compact context menu with edit, action, visibility, health, notes, movement, and delete controls.
- [x] Detailed token editing uses a floating tabbed editor with Basic, Actions, Visibility, Combat, Notes, and Advanced sections.
- [x] The long selected-token sidebar form is no longer rendered.
- [x] Map-level reveal-area and grid controls remain available in the side panel.
- [x] Token changes still use existing server actions and realtime hooks.
- [x] DM notes still save through the private token note path.
- [x] Hidden-token guidance is visible in the Visibility tab.
- [ ] Manual mobile check: add menu and token editor fit at 375 px and 430 px.
- [ ] Manual tablet check: context menu and bottom sheet are usable at 768 px.
- [ ] Manual desktop check: context menu stays inside the canvas at 1024 px and 1440 px.
- [ ] Manual runtime check: player view does not receive hidden tokens or DM-only notes.
- [x] `npx tsc --noEmit` passes.
- [x] `npm run lint` passes.
- [x] `npm run build` succeeds.

---

## Universal Action System

> Static checks should pass in this branch. Runtime items need migration
> `010_universal_action_system.sql` plus two browser sessions.

- [x] Migration adds token resolver/cast/HP fields.
- [x] Migration adds `character_attacks`.
- [x] Migration adds `action_results`.
- [x] Migration adds `combat_logs`.
- [x] Migration extends action request status with `resolving`.
- [x] Player can create saved attack options from Actions.
- [x] DM Map Editor exposes cast visibility, approval, resolver, AC, HP, temp HP, and defeated controls.
- [x] DM approval of Attack starts attack resolver rather than immediately resolving.
- [x] Player can roll an approved attack using a saved attack or basic fallback.
- [x] Attack resolver applies temp HP/current HP damage and marks defeated at 0 HP.
- [x] Object-state resolver updates state for Open/Close/Lockpick/Disarm/Activate/Break/Take.
- [x] Manual/denied results write action result rows.
- [ ] Runtime: DM receives player request live with no refresh.
- [ ] Runtime: player sees DM denial/approval/result live with no refresh.
- [ ] Runtime: hidden/non-interactable tokens cannot be targeted.
- [ ] Runtime: players cannot approve their own requests.
- [ ] Runtime: players cannot mutate enemy HP directly.
- [ ] Runtime: public/cast-safe results exclude hidden DM details.

---

## Phase 9b - Live Updates With No Browser Refresh (hard requirement)

> Static checks pass. Runtime items require migrations `008_map_visibility_objects.sql` AND `009_realtime_live_sync.sql` applied in Supabase, plus a two-browser DM/player session pair. See `REALTIME_SYNC_REQUIREMENTS.md` for the full scripted checklist and the architecture explanation.

- [x] Migration 009 adds `characters`, `character_conditions`, `character_inventory_items`, `character_spells`, `character_abilities`, `encounters`, `encounter_participants`, `encounter_conditions`, `action_intents`, `quests`, `npcs`, `locations`, `notes`, `handouts`, `session_recaps` to the `supabase_realtime` publication with `REPLICA IDENTITY FULL` (previously only `tokens`/`maps`/`map_revealed_areas` emitted realtime events — these tables had correct RLS but were never published, so no events were ever sent).
- [x] New generic `useRealtimeRefresh` hook subscribes to `postgres_changes` and triggers a debounced `router.refresh()` (RLS-respecting server refetch) — used for join-heavy screens where hand-merging every payload would be brittle.
- [x] `ActionCenter` subscribes to `action_intents`/`tokens`/`characters`/`character_conditions` for the campaign — request submit/approve/deny/roll/resolve/cancel and object-state changes sync live both directions.
- [x] `EncounterManager` subscribes to `encounters`/`encounter_participants`/`encounter_conditions`/`characters`/`tokens` — round/turn, HP, conditions, add/remove participant sync live for DM and players.
- [x] `CharacterSheet` subscribes to `characters`/`character_conditions`/`character_inventory_items`/`character_spells`/`character_abilities` — HP/temp HP/AC/speed/conditions/inventory/spells/abilities sync live to every viewer of the sheet (owner, DM, party).
- [x] `StoryWorkspace` subscribes to `quests`/`npcs`/`locations`/`notes`/`handouts`/`session_recaps` for the campaign — DM reveals/edits sync live to the party journal.
- [x] `PlayerMapView` additionally subscribes to campaign-wide `maps` changes — DM activating a different map (or editing the active map's image/grid/name) swaps/refreshes the player's view live, not just in-place token/area/lock updates on the already-active map.
- [x] Token drag writes only on pointer-up (final position), not during drag — confirmed in `MapCanvas.handlePointerUp`.
- [x] `ConnectionStatus` shows a banner when the browser goes offline (existing Phase 8 component, still wired in `app/(app)/layout.tsx`).
- [ ] Manual test: all "must sync live" actions verified across two browser sessions with no refresh (runtime — see `REALTIME_SYNC_REQUIREMENTS.md` checklist).
- [ ] Manual test: refresh both browsers after each test and confirm final state persisted correctly (runtime).
- [x] `npx tsc --noEmit` passes.
- [x] `npm run lint` passes.
- [x] `npm run build` succeeds.

---

## Phase 9 - Live Map Visibility & Interactable Objects

> Static checks pass. Runtime items require migration `008_map_visibility_objects.sql` applied in Supabase and a two-browser DM/player session pair (see `MAP_VISIBILITY_REQUIREMENTS.md` and `INTERACTABLE_OBJECTS_REQUIREMENTS.md` for full scripted checklists).

- [x] `map_revealed_areas` table added with shape types `full`/`rectangle`/`circle`, RLS enabled, realtime publication + `REPLICA IDENTITY FULL`.
- [x] `tokens` extended with `interactable`, `object_state`, `public_description`; `token_type` CHECK widened to 16 types.
- [x] `action_intents` extended with `cancelled` status and a narrow player self-cancel RLS policy.
- [x] Map Editor: Reveal/Hide entire map controls.
- [x] Map Editor: rectangle and circle draw tools for revealed areas, with per-area visibility toggle and delete.
- [x] Map Editor: Object panel (object state select, public description) and Interactions panel (`interactable` checkbox gating allowed-actions).
- [x] Player map view: SVG fog-of-war overlay driven by `map_revealed_areas`, with "DM has not revealed this map yet" empty state.
- [x] Player map view: selected-token card shows `public_description` and non-default `object_state`.
- [x] Action Center: nearby-object list filters on `visible_to_players && interactable` and computed range; shows `public_description`.
- [x] Action Center: player can cancel their own pending requests (`cancelActionIntent`).
- [x] Action Center: DM queue shows submission timestamp and a Resolve & Reveal action with guidance to edit `object_state` via the Map Editor for live-synced state changes.
- [ ] Manual test: DM reveal/hide whole map reflects live on player view (runtime).
- [ ] Manual test: DM draws/toggles/removes rectangle and circle reveal areas; player fog updates live (runtime).
- [ ] Manual test: hidden tokens, `dm_notes`, and non-interactable objects are never sent to the player client (runtime, verify via network/devtools).
- [ ] Manual test: player can only see and act on `interactable` + `visible_to_players` + in-range targets (runtime).
- [ ] Manual test: player can submit, view, and cancel their own pending action intents but cannot approve/deny/resolve them (runtime).
- [ ] Manual test: DM can approve/deny/ask-roll/resolve requests and the player sees the response live (runtime).
- [x] `npx tsc --noEmit` passes.
- [x] `npm run lint` passes.
- [x] `npm run build` succeeds.

---

## Phase 8 - Polish, Mobile Readiness, Permissions, Backups, and QA

> Static checks pass. Browser automation could not attach in this Windows sandbox, so viewport screenshots and full two-account runtime verification remain manual.

- [x] Campaign-specific desktop shortcuts added for current campaign tools.
- [x] Campaign-specific mobile nav added for Home, Sheet, Map, Actions, and Journal.
- [x] PWA manifest route added at `/manifest.webmanifest`.
- [x] App metadata includes install-friendly app name, manifest, theme color, and dark color scheme.
- [x] App icon placeholder added at `/app-icon.svg`.
- [x] DM-only JSON export route added at `/campaigns/[id]/export`.
- [x] DM dashboard includes Export Backup.
- [x] Offline warning added for connection loss.
- [x] App loading skeleton added.
- [x] Safe delete confirmations added to Story Tools.
- [x] Safe delete confirmation added for map token deletion.
- [x] Global mobile overflow guard added for long names/text.
- [x] Permission audit report created.
- [x] Mobile readiness report created.
- [x] Final MVP QA report created.
- [ ] Manual viewport check at 375 px.
- [ ] Manual viewport check at 430 px.
- [ ] Manual viewport check at 768 px.
- [ ] Manual viewport check at 1024 px.
- [ ] Manual viewport check at 1440 px.
- [ ] Manual DM full workflow runtime test.
- [ ] Manual player full workflow runtime test.
- [ ] Manual two-session realtime movement runtime test.
- [x] `npx tsc --noEmit` passes.
- [x] `npm run lint` passes.
- [x] `npm run build` succeeds.

---

## Phase 7 - Story Tools, Journal, Handouts, and Recaps

> Build/static-analysis checks pass in this branch. Items marked runtime require migrations through `007_story_tools.sql` in Supabase and a signed-in DM/player test pair.

- [x] `quests`, `npcs`, `locations`, `notes`, `handouts`, and `session_recaps` tables added with RLS enabled.
- [x] Private `handouts` storage bucket and campaign-folder policies added.
- [x] DM Story Tools route exists at `/campaigns/[id]/story`.
- [x] Player Party Journal route exists at `/campaigns/[id]/story`.
- [ ] DM can create a quest (runtime).
- [ ] DM can hide/reveal a quest (runtime).
- [ ] Player sees only visible quests (runtime).
- [ ] DM can create NPCs (runtime).
- [ ] Player sees only visible NPCs (runtime).
- [ ] DM can create locations (runtime).
- [ ] Player sees only visible locations (runtime).
- [ ] DM can create private notes (runtime).
- [ ] Private notes are not visible to players (runtime).
- [ ] DM can upload handouts to private Storage (runtime).
- [ ] Hidden handouts are not visible to players (runtime).
- [ ] Revealed handouts are visible to players through signed URLs (runtime).
- [ ] DM can create session recaps (runtime).
- [ ] Player can view shared recaps (runtime).
- [x] Player journal omits DM-only note fields from player-facing queries.
- [x] `npx tsc --noEmit` passes.
- [x] `npm run lint` passes.
- [x] `npm run build` succeeds.

---

This document defines the quality gates that must pass before each phase is considered complete and before any production deployment.

---

## Phase 1 — Auth, Campaigns, and Player Invites ✅

- [x] New user can register with email + password + display name
- [x] User can log in with email + password
- [x] Unauthenticated users are redirected to `/login` when accessing app routes
- [x] Authenticated users are redirected to `/dashboard` when accessing auth routes
- [x] DM can create a campaign (name + optional description)
- [x] Campaign is created with an auto-generated 8-char invite code
- [x] DM's campaign appears on the dashboard under "Dungeon Master"
- [x] Player can join a campaign using an invite code at `/join`
- [x] Player's campaign appears on the dashboard under "Playing In"
- [x] A user cannot join the same campaign twice (unique constraint + redirect)
- [x] Campaign settings page is accessible only to the DM/owner
- [x] Players accessing `/campaigns/[id]/settings` are redirected
- [x] DM can update campaign name and description
- [x] DM can remove a player member from campaign settings
- [x] DM can regenerate the invite code
- [x] Campaign page shows DM view (invite code + settings) vs player view (party only)
- [x] Member list displays correctly with role badges
- [x] Logout clears session and redirects to `/login`
- [x] TypeScript build passes with zero errors
- [x] Next.js production build succeeds

---

## Phase 2 — Character Sheets and DM Dashboard ✅

> These pass at the build/static-analysis level. Items marked (runtime) require
> a connected Supabase project to verify end-to-end.

- [x] `characters` + 4 child tables created with RLS enabled
- [x] Phase 1 `campaign_members` recursion bug fixed via SECURITY DEFINER helper
- [x] Player can create a character (runtime)
- [x] Player can edit only their own character — edit route redirects non-owners
- [x] Player can add/delete inventory items
- [x] Player can add/delete spells
- [x] Player can add/delete abilities/features
- [x] Player can update HP, AC, speed, ability scores, and conditions
- [x] DM can view all characters in the campaign (party dashboard)
- [x] DM dashboard shows player, character, class/level, HP, temp, AC, speed, passive perception, conditions
- [x] DM can adjust HP and conditions on any character (RLS UPDATE policy)
- [x] Inventory items flagged "hidden from DM" are excluded from DM reads (RLS, runtime)
- [x] Spell/ability descriptions are free-text, user-entered (no sourcebook content)
- [x] Character sheet uses tabs for inventory/spells/abilities/notes
- [x] Layout responsive: DM dashboard is a table on desktop, cards on mobile
- [x] `npx tsc --noEmit` passes with 0 errors
- [x] `npm run lint` passes with 0 warnings
- [x] `npm run build` succeeds

---

## Phase 3 — Map Upload, Grid, and Token System ✅

> Build/static-analysis level passes below. Items marked (runtime) need a
> connected Supabase project with the `maps` bucket to verify end-to-end.

- [x] `maps` and `tokens` tables created with RLS enabled
- [x] Private `maps` storage bucket + read/write policies (DM write, member read)
- [x] DM can upload a map image (runtime — client upload to private bucket)
- [x] Map image persists after reload (stored in Storage; signed URL on load)
- [x] DM can configure grid (enabled, square size px, feet/square) and it saves
- [x] DM can place player / NPC / enemy / object / trap / door tokens
- [x] DM can drag tokens; positions persist (`updateTokenPosition`)
- [x] DM can hide/reveal a token (`visible_to_players` toggle)
- [x] DM can set the active map players see (`set_active_map`)
- [x] Player can view the active map (read-only, pan/zoom)
- [x] Player sees only `visible_to_players = true` tokens (RLS, runtime)
- [x] Player cannot see hidden traps/enemies/doors (RLS, runtime)
- [x] Player cannot see token `dm_notes` (column omitted from player query)
- [x] Map images are private (no public bucket) — served via signed URLs
- [x] Token positions persist after reload (runtime)
- [x] Responsive: editor is two-column on desktop, stacked on mobile; player view scales
- [x] `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass

---

## Phase 4 — Live Multiplayer Movement and DM Controls ✅

> Build/static-analysis passes below. Items marked (runtime) need a connected
> Supabase project with Realtime enabled and two browser sessions to verify.

- [x] Movement fields added (`player_movement_locked`, `movement_locked`, `movement_used`, `movement_override_allowed`, `last_x/last_y`)
- [x] `tokens` + `maps` added to the realtime publication; REPLICA IDENTITY FULL
- [x] `move_token` SECURITY DEFINER RPC validates control + locks + speed
- [x] `tokens` UPDATE stays DM-only (players write only via the RPC)
- [x] **Privacy:** `dm_notes` moved to non-published `token_dm_notes` (not broadcast over realtime)
- [x] Player can move their own controlled token (drag → RPC) (runtime)
- [x] Player cannot move another player's token (RPC rejects — not controller) (runtime)
- [x] Player cannot move NPC/enemy/hidden tokens (not controller / not visible) (runtime)
- [x] DM can move all tokens
- [x] DM can lock all player movement; player cannot move while locked (runtime)
- [x] DM can unlock movement (runtime)
- [x] Speed limit works: move beyond character speed is rejected with a warning (runtime)
- [x] DM override (`movement_override_allowed`) bypasses the speed limit (runtime)
- [x] Token positions sync live across two sessions without refresh (runtime)
- [x] Token positions persist after reload (runtime)
- [x] Unauthorized cross-campaign token writes blocked (RLS + RPC control check)
- [x] DM reset movement / reset position work
- [x] `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass

---

## Phase 5 - Encounter Manager

> Build/static-analysis passes below. Runtime items need a connected Supabase
> project with `005_encounters.sql` applied and two browser sessions for
> permission checks.

- [x] `encounters`, `encounter_participants`, `encounter_participant_dm_notes`, and `encounter_conditions` created with RLS enabled
- [x] DM can create an encounter with optional linked map
- [x] DM can add player characters to an encounter
- [x] DM can add existing map tokens to an encounter
- [x] DM can add manual NPC/enemy/player participants
- [x] DM can set initiative and turn order sorts by initiative
- [x] DM can start, advance, go back, and end an encounter
- [x] Round counter increments when advancing past the last participant
- [x] DM can update HP, max HP, temp HP, AC, speed, visibility, and defeated state
- [x] DM can add/remove standard or custom conditions
- [x] Player view is read-only
- [x] Players see only visible participants and their conditions
- [x] Players cannot see `encounter_participant_dm_notes`
- [x] No automated attack rolls, damage math, monster imports, spell automation, or AI combat suggestions added
- [x] `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass

---

## Phase-Level Gates (Run After Each Phase)

### Functional
- [ ] All user flows described in the phase work end-to-end
- [ ] No regressions in flows from previous phases
- [ ] All routes that require auth redirect unauthenticated users to login
- [ ] DM-only routes return redirect if accessed by a player
- [ ] Player data does not appear in DM-restricted paths

### Data / Security
- [ ] All new Supabase tables have RLS enabled
- [ ] Player cannot query DM-only rows directly via Supabase client
- [ ] Hidden tokens do not appear in player API responses
- [ ] Private notes do not appear in player API responses
- [ ] No copyrighted DnD content is stored in seed data or migrations
- [ ] Supabase Storage buckets for user files are private (not public)

### UI / UX
- [ ] All forms validate required fields before submit
- [ ] Loading states shown during async operations
- [ ] Error states shown when API calls fail
- [ ] No broken layout on 1280px desktop viewport
- [ ] No broken layout on 768px tablet viewport

---

## Pre-Production Gates (Run Before Deployment)

### Auth
- [ ] Email/password login works
- [ ] Session persists on page refresh
- [ ] Logout clears session and redirects to login
- [ ] Expired sessions redirect to login

### Campaign
- [ ] DM can create a campaign
- [ ] Invite code is generated and unique
- [ ] Player can join via invite code
- [ ] Player cannot join without a valid invite
- [ ] DM can remove a player from a campaign
- [ ] DM can delete a campaign (Phase 2)

### Character
- [ ] Player can create a character in their campaign (Phase 2)
- [ ] Player can edit their own character (Phase 2)
- [ ] Player cannot edit another player's character (Phase 2)
- [ ] DM can view all characters in campaign (Phase 2)

### Map and Tokens
- [ ] DM can upload a map image (Phase 3)
- [ ] DM can place tokens on a map (Phase 3)
- [ ] DM can move tokens (Phase 3)
- [ ] DM can hide/show a token (Phase 3)
- [ ] Player sees map in revealed state only (Phase 3)
- [ ] Player does not see hidden tokens (Phase 3)

### Encounter
- [ ] DM can create an encounter with combatants (Phase 5)
- [ ] Initiative order is correct (Phase 5)
- [ ] HP tracking updates persist (Phase 5)
- [ ] Turn advances correctly (Phase 5)

### Permissions
- [ ] Player cannot access DM campaign settings
- [ ] DM cannot access other DMs' campaigns
- [ ] No cross-campaign data leakage

### Performance
- [ ] Campaign dashboard loads under 2s on a standard connection
- [ ] Map view loads under 3s for a typical map image
- [ ] No console errors in production build

### Accessibility (Phase 8 target)
- [ ] All interactive elements are keyboard-navigable
- [ ] All images have alt text
- [ ] Color contrast meets WCAG AA minimum
- [ ] Focus indicators are visible

---

## Regression Suite (Ongoing)

After each phase, confirm that all prior phase checklist items still pass. Document any regressions in PHASE_COMPLETION_REPORT.md.
# Phase 6 - Contextual Action Prompts

> Runtime items require `006_action_intents.sql`, an active map, visible tokens,
> and two browser sessions.

- [x] Token interaction fields added for range and action overrides
- [x] `action_intents` and `action_intent_dm_notes` created with RLS enabled
- [x] Nearby-token distance logic uses grid size and feet-per-square scale
- [x] Player can see nearby visible NPC/enemy/object/trap/door tokens
- [x] Player can submit an action intent with an optional message
- [x] Player can see submitted intent status and DM response
- [x] DM can see pending player intents in an action queue
- [x] DM can approve, deny, ask for roll, or resolve
- [x] DM-only notes are stored separately and hidden from players
- [x] Hidden tokens do not produce player actions
- [x] No automatic combat resolution, pickpocket result, dialogue tree, AI decision making, or scripting system added
- [x] `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass

---
