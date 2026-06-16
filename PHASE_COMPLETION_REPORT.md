# Phase Completion Report

---

## Hotfix - Approved Player Roll Flow Inside Action Request Menu

**Date:** 2026-06-10
**Status:** Fixed; `tsc`/`lint`/`build` pass; dev server compiles. **No schema change.**

### Root Cause

`rollInlineFromActionPage` in `components/maps/PlayerMapView.tsx` explicitly bailed on
attack rolls ("Attack damage rolls still use the dedicated roll prompt for now") and only
supported generic `submitRollResult`. For an approved **attack** (the common case), the
Resolve Action dice icon hit that guard and showed an error instead of rolling. There was
also no manual-roll option and no shared outcome effects inside the guided menu.

### Fix

Rewrote the inline roll to reuse the existing roll actions and shared outcome component —
no new roll system:

- Dice icon → automatic roll with an in-menu number animation; handles both generic
  (`submitRollResult`) and attack (`submitAttackRollResult`) rolls, including the
  attack damage step.
- Added a "I rolled manually instead" path (validates 1–20, advantage second die) using the
  same submit + confirmation flow; the DM sees `roll_mode = manual`.
- Confirmed results render via the shared `PlayerRollOutcomePanel` (green/red/flame/
  thumbs-down/shake from `RollOutcomeEffects` + `roll-outcome-display`), and stay visible
  through "waiting for DM review" → "resolved".
- `markRollRequestRolling` is fired so the DM sees the "rolling" phase; duplicate clicks are
  blocked while busy; a fresh request / DM reroll resets the sub-flow once via a ref guard.

### Files Changed

- `components/maps/PlayerMapView.tsx` (only).

### Verification

| Check | Result |
|---|---|
| `npx.cmd tsc --noEmit` | Pass |
| `npm.cmd run lint` | Pass |
| `npm.cmd run build` | Pass |
| Dev server compile + `/login` | OK / 200 |

Runtime confirmation (player rolls → DM receives) needs a live DM+player session with
migrations 015–023 applied.

---

## Phase 11 - Full QA, Mobile Polish, Cleanup & Documentation

**Date:** 2026-06-10
**Status:** Stabilization pass complete. `tsc`/`lint`/`build` clean; dev server compiles;
unauth route/API gates correct. Runtime (two-account) QA pending migrations 015–023.

### What Changed

- **Mobile polish:** SRD lookup search row now stacks on mobile (`flex-col sm:flex-row`).
- **Cleanup:** `.gitignore` now ignores `playwright-report/`, `test-results/`, `dev*.log`,
  `*.smoke.log`.
- **Docs:** added `docs/PHASE11_FINAL_QA_REPORT.md` (full QA report with manual checklist,
  privacy notes, and the updated prompt-classification table); refreshed `QA_CHECKLIST.md`.

### Verification

| Check | Result |
|---|---|
| `npx.cmd tsc --noEmit` | Pass |
| `npm.cmd run lint` | Pass |
| `npm.cmd run build` | Pass |
| Unauth `/api/srd` | 401 |
| Unauth `/campaigns/*/actions`, `/live-map/*`, `/adventures` | 307 → `/login` |

### Findings

- 5 bugs found across Phases 7–11, all fixed (broken baseline compile, duplicate link
  editor, `Date.now()` purity error, `string[]` status typing, untracked artifacts).
- No known remaining static bugs. Cast View is not implemented (requirements doc only).
- Highest-value next step: apply migrations 015–023 and run the manual checklist with a DM
  + player account.

See `docs/PHASE11_FINAL_QA_REPORT.md` for the complete report.

---

## Live Map Phase 10 - Action Requests, Rolls, DM Cards & Nudge Highlight (Remaster)

**Date:** 2026-06-10
**Status:** Code complete; `tsc`/`lint`/`build` pass; dev server compiles. Full runtime QA
needs a live DM+player session. **No new migration required.**

### Summary

Remastered (not rebuilt) the existing action/roll system. Added: a pulsing "!" token alert
badge for active requests; newest-at-bottom DM card stacking; a player-matched "Action
Phase" view (Request → Roll → Review → Resolved, with a waiting-on indicator — not a
Dominoes layout); the existing Nudge DM connected to a red card highlight that clears on
open/act; and a "Request Another Roll" (reroll) DM control beside complete/modify/cancel/
add-note.

### Files Changed

- `lib/actions/party-messages.ts` — `sendDMNudge` persists `intentId` in `delivery_log`.
- `components/maps/MapCanvas.tsx` — `alertTokenIds` prop + "!" badge.
- `components/maps/MapEditor.tsx` — seeds + live-subscribes to `action_intents` for the badge.
- `app/(app)/campaigns/[id]/live-map/[mapId]/page.tsx` — seeds `initialAlertTokenIds`.
- `app/(app)/campaigns/[id]/actions/page.tsx` — derives `nudgedIntentIds` (DM only).
- `components/actions/ActionCenter.tsx` — newest-at-bottom, red nudge highlight + clear,
  `ActionPhaseStrip`, `party_messages` realtime resync.
- `components/actions/ActionQueueDmControls.tsx` — reroll button (`hasRollResult`).
- `app/globals.css` — badge + nudge-glow keyframes (reduced-motion aware).

### Nudge (found & reused, not rebuilt)

`sendDMNudge` (`lib/actions/party-messages.ts`), called from `PlayerMapView.nudgeDM`. It
already accepted `intentId`; now it persists it to `delivery_log.intentId`. The DM reads
recent nudge rows → `nudgedIntentIds` → red `action-nudge-highlight` on matching active
cards. Highlight clears client-side when the DM opens or acts on the card, and drops when
the intent goes final. No new nudge table/component/pathway.

### Roll effects / DM phase view

Reused `roll-outcome-display.ts` + `RollOutcomeEffects.tsx` (Natural 1/20, flame/thumbs/
shake, reduced-motion). The expanded DM card shows the same outcome panels plus a synced
phase strip and DM controls — matching the player request screen.

### Verification

| Check | Result |
|---|---|
| `npx.cmd tsc --noEmit` | Passed |
| `npm.cmd run lint` | Passed |
| `npm.cmd run build` | Passed |
| Dev server compile + `/login` | OK / 200 |

### Known Limitations

- Nudge dismissal is client-side (reload re-shows an unhandled nudge — by design).
- "!" badge reflects active intents on the current map only.
- Reroll uses the standard Ask-Roll builder (doesn't auto-copy prior roll settings).
- Runtime QA blocked until migrations 015–023 are applied + a live session is available.

### Recommended Next Phase

Live-session polish/QA pass: verify realtime timing of badge/nudge/phase sync end-to-end;
optionally add a setting to globally disable celebratory roll animations (Phase 5 a11y
carry-forward).

---

## Adventure Maker Phase 9 - Send Prepared Maps to Live Map

**Date:** 2026-06-10
**Status:** Code complete; `tsc`/`lint`/`build` pass; server boots and unauth routes
redirect. Full runtime QA needs **migration 023 applied** + a DM session.

### Files Changed

- `supabase/migrations/023_live_map_source_tracking.sql` *(new)* — `maps.source_prepared_map_id`.
- `lib/types/database.ts` — `maps` + `GameMap` gain `source_prepared_map_id`.
- `lib/actions/prepared-maps.ts` — `sendPreparedMapToLiveMap({ mode })`
  (`next_scene`/`duplicate`/`replace_active`), `getLiveMapDeployContext`, `DeployMode`.
- `components/adventures/SendToLiveMapDialog.tsx` *(new)* — three-mode dialog + replace confirm.
- `components/adventures/PreparedMapEditor.tsx` — adopts the dialog; old send flow removed.
- `app/(app)/campaigns/[id]/live-map/[mapId]/page.tsx` — DM-only "Prep source" back-link.
- Docs: `ADVENTURE_MAKER_PHASE9.md`, `QA_CHECKLIST.md`, `DATA_MODEL_NOTES.md`, this report.

### Copy/Sync Behavior

Three deploy modes: **add as next scene** (new inactive map), **duplicate** (independent
`"(Copy)"`), **replace current Live Map** (new map + atomic `set_active_map`, two-step
confirm naming the map being replaced). Each copies the image, creates fresh
`maps`/`tokens` rows, copies grid settings, sets `source_prepared_map_id`, and shows a
deploy count for the prep.

### Prep Protection

Deploy only reads the prep and writes new independent rows + a copied image — nothing
writes back to `prepared_maps`. The link is one-way (`source_prepared_map_id`,
`ON DELETE SET NULL`), so live edits never touch prep and the prep can be redeployed.

### Token Visibility

Only `visible` reveal-state tokens deploy `visible_to_players=true`; `hidden`/`revealed`/
`dm_only` deploy unseen for live reveal. `player_notes` (→ `description` fallback)
becomes `public_description`.

### DM-Only Content

Per-token DM notes → DM-only `token_dm_notes` (unpublished). Map-level pinned DM notes/
links are **never** copied onto the realtime-published `maps` row; they stay in DM-only
prep tables, reachable via the new "Prep source" link. `source_prepared_map_id` is an
opaque id; prep stays behind DM-only RLS.

### Verification

| Check | Result |
|---|---|
| `npx.cmd tsc --noEmit` | Passed |
| `npm.cmd run lint` | Passed |
| `npm.cmd run build` | Passed |
| Server boot + unauth `/campaigns/*/live-map/*` | 307 → `/login` |

### Known Limitations

- Map-level DM notes/links surfaced via back-link, not copied (avoids leaking onto the
  published live row).
- Token coords stay in pixel space across image replacement (pre-existing).
- Runtime QA blocked until migration 023 is applied (same pattern as 015–022).

### Recommended Next Phase

Deferred Live Map action/roll remaster (roll button, visual dice, manual entry, shared
roll state, stacked DM action cards, Nudge highlighting, Dominoes tracker).

---

## Adventure Maker Phase 8 - Token Resource Lookup (Public SRD Enrichment)

**Date:** 2026-06-10
**Status:** Code complete; builds/lints/type-checks; unauthenticated route smoke test
passes. Full happy-path runtime QA needs a signed-in DM session. **No migration required.**

### APIs Investigated & Chosen

Investigated Open5e, the D&D 5e API (`dnd5eapi.co`), and SRD mirrors. Chose **Open5e**
constrained to `document__slug=wotc-srd` (WotC SRD 5.1, CC BY 4.0): one API spans all
five categories with a uniform `search`, and the document filter keeps results inside
the project's CC-BY-4.0-only licensing rule (third-party OGL docs excluded).

### Files Changed

- `lib/srd/open5e.ts` *(new)* — shared SRD module (categories, `wotc-srd` pin,
  summary/metadata extraction, result mapping, `TokenResourceRef` builder).
- `app/api/srd/route.ts` *(new)* — auth-gated, cached GET proxy to Open5e.
- `components/adventures/TokenResourceLookup.tsx` *(new)* — search/attach UI with
  loading/empty/error states.
- `components/adventures/TokenDetailPanel.tsx` — renders the lookup section.
- `components/adventures/token-meta.ts` — `normalizeTokenResource()`; token
  normalization carries `resource`.
- `components/adventures/PreparedMapEditor.tsx` — new tokens init `resource: null`.
- `lib/actions/prepared-maps.ts` — `sanitizeTokens()` re-normalizes `resource` server-side.
- `lib/types/adventure.ts` — `TokenResourceRef` + `PreparedMapToken.resource` fully wired.
- `docs/ADVENTURE_MAKER_PHASE8.md`, `docs/QA_CHECKLIST.md`, `docs/DATA_MODEL_NOTES.md`,
  `docs/RULES_AND_LICENSING_NOTES.md`, `PHASE_COMPLETION_REPORT.md`.

### Behavior

Token drawer gains an optional **SRD Resource** section: category defaults from the
token type, DM searches by name, picks a result, and a slim reference card is attached
(name, summary, capped metadata chips, source link, sync date). Detach/replace
supported. Lookup is never required.

### Data Storage & Note Protection

`resource: TokenResourceRef | null` persists in `prepared_maps.tokens` JSONB — name,
summary, ≤12 metadata highlights, stable source URL, `synced_at`; never full rules
text. The lookup only ever writes `token.resource`, so `dm_notes`/`player_notes`/
`description`/`prep_notes`/`links` are untouched. Resource is prep-only — `send to
Live Map` is unchanged.

### Licensing

WotC SRD 5.1 (CC BY 4.0) via Open5e, enforced with `document__slug=wotc-srd`. Link,
don't embed; no bundled datasets; no scraping; D&D Beyond's private API untouched.

### Verification

| Check | Result |
|---|---|
| `npx.cmd tsc --noEmit` | Passed |
| `npm.cmd run lint` | Passed |
| `npm.cmd run build` | Passed (`/api/srd` registered, dynamic) |
| Unauthenticated `GET /api/srd` | `401 {"error":"Not authenticated."}` |

> Note: this pass also repaired a non-compiling baseline — the `TokenResourceRef` type
> and required `resource` field had been added previously without updating the token
> construction sites, so `tsc`/`build` were failing before this phase.

### Known Limitations

- `source_url` is the Open5e API detail endpoint (stable across all categories; the
  website pages 404 for some categories).
- Only the WotC SRD subset is searchable, by design.
- No global resource cache table; Next's data cache (24h) covers repeat lookups.
- Happy-path DM runtime QA still pending a signed-in session (same blocker as Phase 6/7).

---

## Adventure Maker Phase 6 - Notion-Style Prep Database

**Date:** 2026-06-10  
**Status:** Code complete; runtime CRUD verification pending Supabase migration
`022_adventure_prep_database.sql`.

### Files Changed

- `app/(app)/campaigns/[id]/adventures/[adventureId]/chapters/[chapterId]/maps/[preparedMapId]/page.tsx`
- `components/adventures/AdventureSettingsPanel.tsx`
- `components/adventures/ChapterSettingsPanel.tsx`
- `components/adventures/PreparedMapEditor.tsx`
- `components/adventures/PrepDatabasePanel.tsx`
- `components/adventures/TokenDetailPanel.tsx`
- `components/adventures/prep-metadata.ts`
- `components/adventures/token-meta.ts`
- `lib/actions/adventures.ts`
- `lib/actions/chapters.ts`
- `lib/actions/prepared-maps.ts`
- `lib/types/adventure.ts`
- `lib/types/database.ts`
- `supabase/migrations/022_adventure_prep_database.sql`
- `docs/ADVENTURE_MAKER_PHASE6.md`
- `docs/QA_CHECKLIST.md`
- `PHASE_COMPLETION_REPORT.md`

### What Changed

- Added Adventure and Chapter prep database panels for notes, important links, pinned items,
  tags, and statuses.
- Added migration-backed JSON/tag fields for Adventure and Chapter prep metadata.
- Added Prepared Map tags and upgraded map notes/links from simple text rows into structured
  note/link objects with pinned behavior.
- Expanded prepared token detail drawers into database-style records with prep status, tags,
  related Adventure/Chapter/Prepared Map context, DM-only prep notes, player-facing notes, and
  important links.
- Added normalization helpers so older JSONB notes/links/tokens keep loading safely.

### Privacy And Security

- Adventure Maker remains DM-only at route level and RLS level.
- DM-only prep data remains in `adventures`, `adventure_chapters`, and `prepared_maps`, all of
  which already use DM-only RLS.
- Player-facing notes are visually separated from DM-only prep notes. They are still inside
  DM-only prep rows until existing deploy logic intentionally copies safe token text into Live Map
  public fields.

### Verification

| Check | Result |
|---|---|
| `npx.cmd tsc --noEmit` | Passed |
| `npm.cmd run lint` | Passed |
| `npm.cmd run build` | Passed |
| Browser smoke: unauthenticated `/campaigns/test/adventures` | Redirected to `/login` |

### Known Limitations

- Full add/edit/delete runtime QA requires applying migration `022_adventure_prep_database.sql`
  in Supabase and using a signed-in DM session.
- Prep tags are stored directly on records rather than in a separate global `prep_tags` table.
  This is intentionally lightweight for this phase.
- Prepared tokens still live inside `prepared_maps.tokens` JSONB, so token database rows are
  scoped to the prepared map editor rather than a standalone global token table.

### Next Recommended Phase

Implement the deferred Live Map action/roll phase: fix the roll button, add visual dice rolls and
manual roll entry, share roll state across related screens, add stacked DM action cards, wire
Nudge DM highlighting to the related card, and build the Dominoes-style action tracker.

---

## DM Map Editor — Independent Right-Panel Scroll & Menu Visibility Fix

**Date:** 2026-06-07
**Status:** Code complete and live-verified in a real browser session against an existing DM
campaign/map (see Manual Viewport Test Results below and `docs/QA_CHECKLIST.md`).

### Files Changed

- `components/maps/MapEditor.tsx`
- `docs/DM_MAP_LAYOUT_REQUIREMENTS.md`
- `docs/MAP_EDITOR_UI_REQUIREMENTS.md`
- `docs/QA_CHECKLIST.md`
- `PHASE_COMPLETION_REPORT.md`

### What Changed And Why

1. **Right-panel scroll vs. page scroll.** `MapEditor`'s root container previously used `h-full`
   while sitting next to a `shrink-0` back-link row inside a `flex-col` parent — its 100% height
   plus the back link's height exceeded the parent's box, so content got clipped (or, depending on
   ancestor overflow, the whole route could scroll). It now uses `flex min-h-0 flex-1 flex-col
   overflow-hidden`, so it correctly shares the available height with its sibling instead of
   overflowing it.
2. **How independent right-panel scrolling works.** The tools grid row is
   `grid min-h-0 flex-1 ... overflow-hidden`; the panel itself is
   `flex min-h-0 flex-col overflow-hidden`; only its inner content wrapper is
   `min-h-0 flex-1 overflow-y-auto p-3`. That inner wrapper is the *only* scroll container in the
   chain — the map column, the panel shell, and the page wrapper all stay `overflow-hidden`, so
   scrolling the tools can never move the map or the browser page.
3. **How page-level scroll is prevented.** The app shell (`app/(app)/layout.tsx`) is
   `flex h-screen overflow-hidden` with a scrollable `<main>`; the map page wraps its content in
   `flex h-full min-h-0 flex-col overflow-hidden`, exactly matching `<main>`'s box. With the
   `MapEditor` root fix above, the route's total content height now never exceeds that box, so
   `<main>` has nothing to scroll during normal map use.
4. **Cursor-based zoom** was already isolated to `MapCanvas` via a non-passive `wheel` listener
   that calls `preventDefault()`/`stopPropagation()` and computes zoom around the cursor's client
   coordinates — untouched by this pass, and still isolated from the page/panel since the listener
   lives on the canvas viewport element only.
5. **Filled-background context menu / add menu.** Both `TokenContextMenu` and `TokenAddBubble`
   switched from a translucent `bg-zinc-950/95 backdrop-blur` fill to a fully opaque `bg-zinc-950`
   fill (still with the `zinc-700` border and `shadow-2xl`), giving maximum contrast against the
   map per the "solid dark background" requirement. Both also gained
   `max-h-[calc(100%-1.5rem)] overflow-y-auto` so long content scrolls within the menu rather than
   spilling outside the workspace or forcing page scroll. Position/clamping, `z-30`/`z-20`
   stacking, click-outside-to-deselect (`handleSelectToken(null)`), and `Escape`-to-close were
   already implemented and remain unchanged.

### Manual Viewport Test Results

Live-tested via the project's preview browser against an existing campaign ("The Lost Mine of
Phandelver" / map "Phandalin") logged in as its DM. Full pass/fail detail is in
`docs/QA_CHECKLIST.md`; summary:

| Viewport | Result |
| --- | --- |
| 1024x768 | **Passed** — map + panel visible, no page/horizontal scroll, toolbar buttons reachable |
| 1280x720 | **Passed** — no page scroll; context menu solid, positioned clear of right panel |
| 1366x768 | **Passed** — `lg:` two-column grid, `html`/`body`/`main` heights all equal viewport |
| 1440x900 | **Passed** — no page or horizontal scroll |
| 1536x864 | **Passed** — no page or horizontal scroll |
| 1920x1080 | **Passed** — `2xl:` 380px panel column, map fills remaining space, no scroll |

Key live measurements:
- Page scroll: `html.scrollHeight === html.clientHeight` at every tested size (confirmed via
  `document.documentElement` introspection, not just visual inspection).
- Right-panel isolation stress test: temporarily inflated panel content to 1762px (well past the
  ~570–610px visible height at these sizes), scrolled to bottom — the map's CSS `transform` stayed
  byte-for-byte identical (`mapUnchanged: true`) and `html` never became scrollable
  (`pageScrolledAfter: false`).
- Cursor zoom: dispatched a real `wheel` event 25%/25% into the canvas; `event.defaultPrevented
  === true`, and the resulting transform changed both scale *and* translate together
  (`matrix(0.190…, -122.9, -11.5)` → `matrix(0.209…, -183.8, -46.0)`), proving the zoom recenters
  on the cursor point rather than the canvas center — and `window.scrollY`/`html.scrollHeight`
  were unchanged, so the page did not move.
- Context menu: opening it on the "Goblin" token rendered `bg-zinc-950` at `opacity: 1`
  (fully solid), `border: zinc-700`, `z-index: 30`, positioned at `x: 531–819` — clear of the
  right panel's left edge and within the 1280px viewport. A real outside pointerdown/pointerup on
  the map background closed it and cleared selection; `Escape` closed it too.
- Add bubble: opened `TokenAddBubble` with the same solid `bg-zinc-950` fill and the full
  token-type grid (Player, NPC, Enemy, Object, Trap, Door, Chest, Book, Note, Loot Pile, Lever,
  Switch, Portal, Key, Container, Custom); closed on outside click without inducing page scroll.

### Player / Cast Regression

- Player routes are served by a wholly separate `PlayerMapView` component
  ([app/(app)/campaigns/[id]/maps/page.tsx:7](app/(app)/campaigns/[id]/maps/page.tsx)); `MapEditor`
  is gated behind the `membership.role !== 'dm'` redirect, so this pass could not and did not leak
  DM layout into the player experience.
- Mobile widths 375 / 390 / 430 / 768px were checked on the dashboard and campaign maps list:
  no horizontal scroll at any of them.
- No `cast` route exists in the codebase yet (only `docs/CAST_VIEW_REQUIREMENTS.md`) — nothing to
  regress, nothing changed.

### Known Limitations

- Same as previously documented in `docs/MAP_EDITOR_UI_REQUIREMENTS.md`: duplicate-token is not
  implemented, and the context menu's position is approximate (token map-coordinate based) under
  heavy pan/zoom.
- The right panel did not naturally overflow with the current seed data (only one selected token
  and two revealed areas existed in the test campaign), so independent scrolling was verified via
  a controlled DOM stress test (temporary filler element, removed immediately after) rather than
  by scrolling organically-long content. The structural chain that makes this work
  (`overflow-hidden` at every ancestor, `overflow-y-auto` only on the panel's inner content
  wrapper) is the same regardless of how much real content exists.

### Next Recommended Improvements

- Add enough revealed areas / a longer character roster to a test campaign to exercise the panel's
  organic scroll path end-to-end (the stress test proves the mechanism works; real content would
  remove the need for a synthetic filler).
- Consider a sticky section header inside the right panel's scroll area if future tool sections
  grow long enough that users lose track of which tab they're in while scrolling.
- Build the cast view (tracked in `docs/CAST_VIEW_REQUIREMENTS.md`) — there is currently nothing
  to regress because the route doesn't exist.

---

## Universal DM-Controlled Action System

**Date:** 2026-06-07  
**Status:** Code complete at the first-framework level; runtime verification pending migration `010_universal_action_system.sql`

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
- `docs/PHASE_COMPLETION_REPORT.md`

### Features Completed

- Universal action requests remain centered on `action_intents`.
- DM-configured token/object action menus remain enforced server-side.
- Manual, object-state, and attack resolvers implemented.
- Character attack options added.
- Token HP/AC/temp HP/defeated fields added and exposed to DM.
- Attack resolver rolls, compares against AC, applies damage, logs combat, and marks defeated at 0 HP.
- Realtime refresh subscriptions include intents, results, logs, attacks, tokens, and character data.

### Remaining Risks

- Runtime two-browser verification still needed.
- No dedicated cast screen yet, though public result data is ready for one.
- No undo-last-damage or explicit hit/miss override UI yet.
- No full spell/trap/script automation.

---

## Phase 8 - Polish, Mobile Readiness, Permissions, Backups, and QA

**Date:** 2026-06-07  
**Status:** Code complete; MVP is session-ready for a controlled play-session test after migrations and manual runtime checks

### Files Changed

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
- `docs/PHASE_COMPLETION_REPORT.md`

### Features Completed

- Campaign-aware desktop and mobile session navigation.
- DM-only JSON campaign export at `/campaigns/[id]/export`.
- PWA manifest, app metadata, mobile theme color, and icon placeholder.
- Offline/connection warning.
- App route loading skeleton.
- Safe delete confirmations for Story Tools and map tokens.
- Mobile overflow hardening for long names and text.
- Required mobile, permission, final QA, and phase reports.

### Bugs Fixed

- Phase 7 migration trigger function reference corrected to `public.update_updated_at()`.
- Story Tools destructive actions now require confirmation.
- Map token deletion now requires confirmation.

### Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Passed |
| `npm run lint` | Passed |
| `npm run build` | Passed |

### Remaining Risks

- Browser automation could not attach in this Windows sandbox, so viewport screenshot checks remain manual.
- Supabase runtime permission checks still need a two-account test.
- Story DM note fields should eventually move to separate DM-only tables for stronger column privacy.
- Export is backup/reference only; restore/import is not built.

### Recommended Next Improvements

- Add Playwright permission tests.
- Add import/restore for campaign exports.
- Add toast-based save confirmations.
- Improve mobile map gestures and controls.
- Add realtime reconnect status beyond browser online/offline.

### MVP Session Readiness

Yes. The MVP is ready for a controlled real play-session test after migrations are applied and manual runtime checks are completed.

---

## Phase 7 - Story Tools, Quests, NPCs, Notes, Handouts, and Recaps

**Date:** 2026-06-07  
**Status:** Code complete; runtime verification pending Supabase migration `007_story_tools.sql`

### What Was Done

#### Database and Storage
**File:** `supabase/migrations/007_story_tools.sql`

- Added `quests`, `npcs`, `locations`, `notes`, `handouts`, and `session_recaps`.
- Added private `handouts` Storage bucket with 15 MB limit for images, PDFs, and text files.
- Added RLS so DMs manage story content while players select only visible/revealed/shared records.
- Added storage policies keyed by campaign folder path.

#### Server Actions
**File:** `lib/actions/story.ts`

- Added create actions for quests, NPCs, locations, notes, handouts, and session recaps.
- Added quick visibility/share/reveal actions.
- Added delete actions, including handout storage cleanup.

#### UI and Routes
- Added role-aware route `/campaigns/[id]/story`.
- DMs see searchable Story Tools tabs for Quests, NPCs, Locations, Notes, Handouts, and Recaps.
- Players see a simplified Party Journal with only shared campaign content.
- Added campaign dashboard links for Story Tools / Party Journal.

#### Documentation
- Updated `docs/DATA_MODEL_NOTES.md`.
- Updated `docs/ROLE_PERMISSION_NOTES.md`.
- Updated `docs/QA_CHECKLIST.md`.
- Updated `docs/ROADMAP.md`.

### Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Passed |
| `npm run lint` | Passed |
| `npm run build` | Passed |

### Runtime Setup

Run migrations in order through `supabase/migrations/007_story_tools.sql` in the Supabase SQL editor. After that, test with one DM account and one player account in the same campaign.

### Manual QA Still Needed

- DM creates, hides, reveals, and deletes a quest.
- Player sees only visible quests.
- DM creates NPCs and locations; player sees only visible records.
- DM creates private and shared notes; private notes never appear in the player journal.
- DM uploads a hidden handout; player cannot see it until revealed.
- DM creates and shares a session recap; player can read it without DM follow-up notes.

---

## Phase 4 — Live Multiplayer Movement and DM Controls

**Date:** 2026-06-06
**Status:** Code complete (pending Supabase project with Realtime enabled for runtime verification)

---

### What Was Done

#### Database & Realtime
**File:** [`supabase/migrations/004_movement.sql`](supabase/migrations/004_movement.sql)

- **New fields:** `maps.player_movement_locked`; `tokens.movement_locked`, `tokens.movement_used`, `tokens.movement_override_allowed`, `tokens.last_x`, `tokens.last_y`.
- **Realtime:** added `tokens` and `maps` to the `supabase_realtime` publication with `REPLICA IDENTITY FULL`. Realtime authorization uses RLS per subscriber.
- **`move_token(token_id, x, y)`** — SECURITY DEFINER RPC, the only path for a player to write a token. Validates control, map/token locks, and the speed limit, then updates only position + `movement_used`. Returns `{ ok | error, x, y, movement_used, max_feet }`.

#### Security fix found during this phase
DM-only token notes (`dm_notes`) were a **column on `tokens`** (Phase 3). Realtime broadcasts the *full row* (RLS filters rows, not columns), so once `tokens` is published, a player subscribed to the channel would receive `dm_notes` over the websocket. Fixed by moving DM notes to a separate **`token_dm_notes`** table that is DM-only (RLS) and **not** in the realtime publication. The `tokens` table now contains no DM-private columns, making it safe to broadcast.

#### Movement model (kept deliberately simple, no rules engine)
- `movement_used` = Chebyshev distance (squares → feet) from a round anchor (`last_x`/`last_y`).
- The anchor is set on the first move after a reset; DM "Reset movement" re-anchors and zeroes it; a DM move also re-anchors.
- Speed comes from the linked character (`30 ft → 6 squares` at 5 ft/square). No link or `movement_override_allowed` ⇒ no limit.

#### Server Actions (added to [`lib/actions/maps.ts`](lib/actions/maps.ts))
- `movePlayerToken` (calls the RPC), `updateTokenPosition` (DM move now re-anchors)
- `setMapMovementLock`, `setTokenMovementLock`, `setTokenOverride`
- `resetTokenMovement`, `resetTokenPosition`
- `upsertTokenDmNote` (writes to `token_dm_notes`)
- `updateToken` now auto-syncs `controlled_by_user_id` from the linked character's owner

#### Realtime hook
[`lib/hooks/useTokenRealtime.ts`](lib/hooks/useTokenRealtime.ts) — subscribes to token changes (filtered by `map_id`) and map-lock changes; upserts/deletes into local state. Handlers held in a `useRef` synced via effect so the subscription never goes stale and never re-subscribes per render.

#### Components
- [`MapCanvas`](components/maps/MapCanvas.tsx) — drag gating generalized to a `canDragToken(id)` predicate so players can drag only the tokens they control.
- [`MapEditor`](components/maps/MapEditor.tsx) — live updates; toolbar "Lock/Unlock player movement"; per-token movement panel (used-this-round vs speed, lock token, allow over-speed, reset movement, reset position); DM notes now edit `token_dm_notes`.
- [`PlayerMapView`](components/maps/PlayerMapView.tsx) — live updates; drag your controlled token; remaining-movement readout; lock banner; optimistic move with revert + over-speed/lock warning.

#### Pages
- Map editor page loads `token_dm_notes` and character speeds; passes them to the editor.
- Player maps page selects full token rows (no private columns now), passes `currentUserId` and character speeds for limit display.

### Build Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npm run lint` | ✅ 0 warnings |
| `npm run build` | ✅ Success |

### Setup Required Before Runtime
Run [`004_movement.sql`](supabase/migrations/004_movement.sql) in the Supabase SQL editor (after 001–003). Ensure **Realtime is enabled** for the project (it is by default on Supabase; the migration adds the tables to the `supabase_realtime` publication). Because the migration **drops `tokens.dm_notes`**, apply it before relying on the new code.

### Manual Verification Steps (two browser sessions)
1. DM links a token to a player's character (auto-grants that player control).
2. DM sets the map active. Player opens Map View and sees their token marked "Yours".
3. Player drags their token a short distance → it moves; the DM's screen updates live (no refresh).
4. Player drags beyond the character's speed → move is rejected, token snaps back, "Too far" warning shows.
5. DM toggles "Allow over-speed" on that token → player can now exceed speed.
6. DM clicks "Lock player movement" → player sees the lock banner and can no longer drag; attempts are rejected.
7. DM unlocks → player can move again.
8. Player tries to drag an NPC/enemy token → not draggable (not controlled).
9. DM "Reset movement" → player's remaining returns to full speed.
10. Reload both browsers → positions persist.
11. Confirm a player never receives token `dm_notes` (now in a separate, unpublished table).

### Known Limitations / Remaining
| Item | Notes |
|---|---|
| Hiding a previously-visible token | The player may keep showing it until refresh (realtime can't deliver a row the player can no longer SELECT). Revealing works live. |
| Movement path | Distance is straight-line Chebyshev from the round anchor, not pathfinding (no terrain/walls — out of scope). |
| Rounds/initiative | No automatic round reset; the DM resets movement manually (initiative is Phase 5). |
| Per-move write | One DB write per drop (not per drag frame), as required; no throttling needed. |

### Next Recommended Phase
**Phase 5 — Encounter Manager** (initiative order, HP/condition tracking in combat, turn tracker).

---

## Phase 3 — Map Upload, Grid, and Token System

**Date:** 2026-06-06
**Status:** Code complete (pending Supabase project + `maps` bucket for runtime verification)

---

### Library Decision

A **custom HTML/SVG + pointer-events** renderer was chosen over Konva/Fabric. It is the simplest reliable approach for this stack (Next 16 / React 19), needs no extra dependency, and is SSR-friendly: the map is an `<img>`, the grid is an SVG `<pattern>` overlay with `vector-effect="non-scaling-stroke"`, tokens are absolutely-positioned elements, and pan/zoom is a single CSS transform on the world container. Token dragging and panning are handled with unified pointer events + pointer capture.

### Database & Storage
**File:** [`supabase/migrations/003_maps.sql`](supabase/migrations/003_maps.sql)

- **Private `maps` Storage bucket** with policies: campaign members can read; only the DM can write/update/delete (access scoped by the `{campaign_id}/…` path segment). Images are served via short-lived signed URLs — never public.
- **`maps` table** — name, storage_path, grid settings (enabled, size px, feet/square), natural width/height, `is_active`, RLS (DM sees all; players see only the active map).
- **`tokens` table** — type (player/npc/enemy/object/trap/door), name, x/y (image-pixel space), size (grid squares), color, `visible_to_players`, optional `linked_character_id`/`controlled_by_user_id`, `notes`, and DM-only `dm_notes`. RLS: DM sees all; players see only visible tokens.
- **`set_active_map()`** SECURITY DEFINER function — atomically activates one map and clears the rest (DM only).

### Server Actions
**File:** [`lib/actions/maps.ts`](lib/actions/maps.ts)
- Maps: `createMap`, `updateMapSettings`, `setActiveMap`, `deleteMap` (with storage cleanup)
- Tokens: `addToken`, `updateTokenPosition`, `updateToken`, `deleteToken`

### Components
- [`MapCanvas`](components/maps/MapCanvas.tsx) — shared pan/zoom/grid/token renderer; DM drag-to-move, zoom buttons, fit-to-screen, hidden-token styling (dashed/translucent in DM view)
- [`MapUploader`](components/maps/MapUploader.tsx) — validates file, reads natural dimensions, uploads to the private bucket, creates the row, rolls back the file on failure
- [`MapEditor`](components/maps/MapEditor.tsx) — DM toolbar, add-token palette, selected-token editor (name, type, size, visibility, linked character, player note, DM note), grid settings, set-active, delete
- [`PlayerMapView`](components/maps/PlayerMapView.tsx) — read-only canvas + selected-token info bar (player-safe fields only)

### Pages

| Route | Description |
|---|---|
| `/campaigns/[id]/maps` | Role-aware: DM map list / player active-map view |
| `/campaigns/[id]/maps/new` | DM upload (redirects non-DMs) |
| `/campaigns/[id]/maps/[mapId]` | DM map editor (redirects non-DMs) |

The campaign dashboard "Maps" / "Map View" cards now link to the live feature.

### Visibility / Privacy Model
- **Hidden tokens:** RLS excludes `visible_to_players = false` rows from player reads; the player view never receives or renders them.
- **DM notes:** the player token query selects an explicit column list that omits `dm_notes` — defense in depth on top of row-level RLS.
- **Map images:** private bucket only, accessed through signed URLs generated server-side per request.
- **Default hiding:** enemies, traps, and doors are created with `visible_to_players = false`.

### Build Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npm run lint` | ✅ 0 warnings |
| `npm run build` | ✅ Success |
| New routes | 3 map routes added (17 total) |

### Setup Required Before Runtime
In addition to prior phases, run [`003_maps.sql`](supabase/migrations/003_maps.sql) in the Supabase SQL editor. It creates the private `maps` bucket and its storage policies. (Alternatively the bucket can be created in the dashboard: Storage → New bucket → name `maps`, Public = off — but the SQL also adds the access policies, so running it is recommended.)

### Manual Verification Steps (once Supabase is connected)
1. As DM, open **Maps → Upload Map**, choose an image, upload → lands in the editor.
2. Reload the editor — the map image still renders (served via signed URL).
3. Toggle grid / change square size + feet-per-square → Save → grid updates.
4. Add a player, an NPC, and an enemy token; drag each; reload → positions persist.
5. Confirm the enemy token shows dashed/translucent (hidden) in the DM view.
6. Add a DM note and a player note to a token.
7. Click **Set active for players**.
8. As a player (second account), open **Map View** → see the map and only visible tokens.
9. Confirm the player cannot see the hidden enemy, and selecting a token shows the player note but never the DM note.
10. Resize to mobile width — the editor stacks and the player view scales.

### Known Limitations / Remaining
| Item | Notes |
|---|---|
| Real-time movement | Token moves require a reload for other clients; live sync is Phase 4. |
| Fog of war | Out of scope this phase (per prompt). |
| Custom token images | `image_url` column exists but upload UI is deferred; tokens use color + initial. |
| Player-controlled tokens | `controlled_by_user_id` exists but player movement is Phase 4. |
| Signed URL expiry | URLs last 1 hour; a long editing session may need a reload to refresh the image. |

### Next Recommended Phase
**Phase 4 — Live Multiplayer Movement and DM Controls** (Supabase Realtime on the `tokens` table; DM-gated player token movement).

---

## Phase 2 — Character Sheets and DM Dashboard

**Date:** 2026-06-06
**Status:** Code complete (pending Supabase project connection for runtime verification)

---

### What Was Done

#### Database Schema
**File:** [`supabase/migrations/002_characters.sql`](supabase/migrations/002_characters.sql)

Five new tables (all with RLS enabled):
- `characters` — identity, combat stats, the six ability scores, and notes, all on one row
- `character_inventory_items` — name, quantity, equipped, magical, `visible_to_dm`, notes
- `character_spells` — name, level, prepared, manual uses/slots, description
- `character_abilities` — name, source, uses, reset type, description
- `character_conditions` — standard or custom condition names

Four new SECURITY DEFINER helper functions:
- `is_campaign_member(cid)`, `is_campaign_dm(cid)` — membership/role checks used by RLS
- `character_owner_id(char_id)`, `character_campaign_id(char_id)` — used by child-table RLS

#### Design Decisions (documented in DATA_MODEL_NOTES.md)
1. **Ability scores live on the `characters` row, not a separate `character_stats` table.** They are strictly 1:1 with a character; a join table would add a query for no benefit. The prompt's `character_stats` was consolidated into `characters`.
2. **The Intelligence column is named `intel`** because `int` is a Postgres reserved keyword. The UI still labels it "INT".
3. **Multiple characters per player per campaign** are supported (more flexible than a 1:1 lock).

#### Phase 1 Bug Fixed
The Phase 1 `campaign_members` SELECT policy queried `campaign_members` from inside its own policy, which Postgres rejects at runtime with *"infinite recursion detected in policy"*. Since the app had not yet been connected to a live Supabase project, this was a latent bug. Migration 002 drops and replaces that policy using the new `is_campaign_member()` SECURITY DEFINER helper.

#### Server Actions
**File:** [`lib/actions/characters.ts`](lib/actions/characters.ts)
- `createCharacter`, `updateCharacter`, `deleteCharacter`
- `updateVitals` (HP/temp — owner or DM)
- `addInventoryItem` / `deleteInventoryItem`
- `addSpell` / `deleteSpell`
- `addAbility` / `deleteAbility`
- `addCondition` / `removeCondition` (owner or DM)

#### Pages Built

| Route | Description |
|---|---|
| `/campaigns/[id]/characters` | Role-aware: DM party dashboard, or player's character list + party roster |
| `/campaigns/[id]/characters/new` | Create character form |
| `/campaigns/[id]/characters/[charId]` | Full character sheet (view) |
| `/campaigns/[id]/characters/[charId]/edit` | Edit form (owner only, redirects others) |

#### Components Built
- `CharacterForm` — create/edit, sectioned cards (identity, combat, ability scores with live modifiers, notes)
- `CharacterSheet` — view with HP control, conditions, stat block, and tabbed inventory/spells/abilities/notes
- `HPControl` — damage/heal/temp HP, color-coded HP bar (owner or DM)
- `ConditionManager` — standard condition quick-pick + custom, removable chips (owner or DM)
- `InventoryTab`, `SpellsTab`, `AbilitiesTab` — list + inline add form + delete
- `DMCharacterDashboard` — quick-glance table (desktop) / cards (mobile)
- New UI primitives: `Tabs`, `Select`, `Checkbox`
- New util: `lib/utils/character.ts` (ability modifiers, HP color helpers)

The campaign dashboard placeholder cards for characters now link to the live feature.

---

### Build Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npm run lint` | ✅ 0 warnings (cleaned up 3 pre-existing warnings) |
| `npm run build` | ✅ Success |
| New routes | 4 character routes added (14 total) |

---

### Permissions Summary

| Actor | Can do |
|---|---|
| Owner | Full edit of their own character + all child records |
| DM | View all characters; edit HP and conditions; sees inventory only when `visible_to_dm = true` |
| Other players | Read-only view of party characters |
| Non-members | No access (RLS denies all) |

---

### Setup Required Before Runtime

In addition to the Phase 1 Supabase setup, run the new migration:
- Supabase SQL editor → paste and run [`supabase/migrations/002_characters.sql`](supabase/migrations/002_characters.sql)
- This migration also fixes the Phase 1 recursion bug, so it must be applied even on an existing Phase 1 database.

---

### Manual Verification Steps (once Supabase is connected)

1. As a player in a campaign, open **My Characters → New Character**, fill the form, save.
2. Confirm the sheet shows correct ability modifiers and HP bar.
3. Add an inventory item, a spell, and an ability — confirm each appears under its tab.
4. Use **Damage/Heal** to change HP; refresh — value persists.
5. Add a condition (standard + custom); confirm chips appear and are removable.
6. Mark an item "hidden from DM"; as the DM, open that character — the item should not appear.
7. As the DM, open **Party Dashboard** — confirm every character's HP/AC/conditions show.
8. As the DM, change a character's HP from the sheet — confirm it persists.
9. As a different player, try to open another player's `/edit` URL — should redirect to the read-only sheet.
10. Resize to mobile width — confirm the dashboard switches to cards and tabs scroll.

---

### Known Limitations / Remaining

| Item | Notes |
|---|---|
| DM HP edit on dashboard | The dashboard is read-only; DM edits HP from the individual sheet. Inline dashboard editing could be added later. |
| Spell slot automation | Intentionally manual (no rules engine) per scope. |
| Character portrait | Not yet implemented (image upload comes with Storage work in Phase 3). |
| Item weight / encumbrance | Omitted to keep entry simple. |
| Realtime sync | HP/condition changes require a refresh for other viewers; live sync is Phase 4. |

---

### Next Recommended Phase

**Phase 3 — Map Upload, Grid, and Token System**
- Set up a private Supabase Storage bucket for map images
- Add `maps` and `tokens` tables with RLS (hidden tokens excluded from player reads)
- Build map upload, grid overlay, and token placement
- Players see only revealed map content

---

## Phase 1 — Auth, Campaigns, and Player Invites

**Date:** 2026-06-06
**Status:** Complete (pending Supabase project connection)

---

### What Was Done

#### Project Initialized
- Next.js 16 (App Router) with TypeScript and Tailwind CSS v4
- Installed: `@supabase/supabase-js`, `@supabase/ssr`, `lucide-react`
- Package name set to `dnd-companion`

#### Database Schema
**File:** [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql)

Tables created (with RLS enabled):
- `profiles` — extends auth.users, auto-created by trigger on signup
- `campaigns` — owned by a DM, with unique auto-generated invite code
- `campaign_members` — join table with role (`dm` or `player`), unique per user+campaign

Database functions:
- `handle_new_user()` — trigger: auto-create profile on signup
- `generate_invite_code()` — random 8-char alphanumeric code (no ambiguous chars)
- `get_campaign_by_invite_code(code)` — SECURITY DEFINER: safe invite lookup
- `regenerate_invite_code(campaign_id)` — SECURITY DEFINER: owner-only
- `update_updated_at()` — trigger: keep `campaigns.updated_at` current

#### Auth
- [`proxy.ts`](proxy.ts) — route protection proxy (Next.js 16 convention)
  - Unauthenticated → redirect to `/login`
  - Authenticated + auth page → redirect to `/dashboard`
  - Root `/` → redirect based on auth state
- [`lib/supabase/client.ts`](lib/supabase/client.ts) — browser client (for Client Components)
- [`lib/supabase/server.ts`](lib/supabase/server.ts) — server client (for Server Components + Actions)
- [`app/auth/callback/route.ts`](app/auth/callback/route.ts) — handles Supabase magic link callback
- [`lib/actions/auth.ts`](lib/actions/auth.ts) — `login`, `register`, `logout` Server Actions

#### Campaign Features
- [`lib/actions/campaigns.ts`](lib/actions/campaigns.ts) — `createCampaign`, `joinCampaign`, `updateCampaign`, `removeMember`, `regenerateInviteCode`

#### Pages Built

| Route | Description |
|---|---|
| `/login` | Email + password sign in |
| `/register` | Register with display name, email, password |
| `/dashboard` | Campaign list, split DM / Player sections |
| `/campaigns/new` | Create campaign form |
| `/campaigns/[id]` | Campaign dashboard — DM view or player view |
| `/campaigns/[id]/settings` | DM-only: edit name/desc, manage members |
| `/join` | Enter invite code to join a campaign |

#### Components Built

**UI primitives:** `Button`, `Input`, `Textarea`, `Card`, `Badge`, `EmptyState`, `Alert`

**Nav:** `Sidebar` (desktop, sticky), `MobileNav` (bottom tab bar for mobile)

**Campaign:** `CampaignCard`, `MemberList`, `InviteCode` (with copy + regenerate)

#### App Design
- Dark theme (zinc palette) with amber/gold DnD accent
- Responsive: sidebar nav on desktop, bottom tab nav on mobile
- DM view: invite code widget, member list, future-phase placeholder cards
- Player view: party list, future-phase placeholder cards

---

### Files Created / Modified

**New files (source):**
```
proxy.ts
lib/supabase/client.ts
lib/supabase/server.ts
lib/types/database.ts
lib/actions/auth.ts
lib/actions/campaigns.ts
components/ui/Button.tsx
components/ui/Input.tsx
components/ui/Card.tsx
components/ui/Badge.tsx
components/ui/EmptyState.tsx
components/ui/Alert.tsx
components/nav/Sidebar.tsx
components/nav/MobileNav.tsx
app/(auth)/layout.tsx
app/(auth)/login/page.tsx
app/(auth)/register/page.tsx
app/(app)/layout.tsx
app/(app)/dashboard/page.tsx
app/(app)/campaigns/new/page.tsx
app/(app)/campaigns/[id]/page.tsx
app/(app)/campaigns/[id]/settings/page.tsx
app/(app)/join/page.tsx
app/auth/callback/route.ts
supabase/migrations/001_initial_schema.sql
.env.example
```

**Modified files:**
```
app/layout.tsx          (metadata, body class)
app/page.tsx            (empty redirect stub)
app/globals.css         (dark theme CSS variables)
package.json            (name → dnd-companion)
docs/PROJECT_SOURCE_OF_TRUTH.md
docs/DATA_MODEL_NOTES.md
docs/ROLE_PERMISSION_NOTES.md
docs/QA_CHECKLIST.md
PHASE_COMPLETION_REPORT.md
```

---

### Build Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npm run build` | ✅ Success, 0 warnings |
| Route count | 10 routes (5 static, 5 dynamic) |
| Next.js version | 16.2.7 (proxy.ts convention used) |

---

### What Requires Setup Before the App Runs

This phase is code-complete but requires a live Supabase project to function. The developer must:

1. **Create a Supabase project** at [supabase.com](https://supabase.com)

2. **Run the migration** in the Supabase SQL editor:
   - Open SQL editor → paste contents of `supabase/migrations/001_initial_schema.sql` → Run

3. **Set environment variables** — copy `.env.example` to `.env.local` and fill in:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ```

4. **Enable Email auth** in Supabase dashboard:
   - Authentication → Providers → Email → Enable

5. **Start the dev server:**
   ```
   npm run dev
   ```

---

### Known Limitations / Remaining Issues

| Item | Notes |
|---|---|
| Email confirmation | Supabase sends a confirmation email by default. Can be disabled in Auth settings for local dev. |
| Campaign delete | Not yet implemented. Will be added in Phase 2 as part of DM settings. |
| Profile avatar | Upload not yet implemented. Placeholder initials shown. |
| Settings page is client component | Uses `useEffect` for loading due to async `params`. Could be converted to a server component in a future cleanup pass. |

---

### Verification Steps (Manual)

Once Supabase is connected and `npm run dev` is running:

1. Navigate to `/` → should redirect to `/login`
2. Register a new account → should redirect to `/dashboard` (empty state)
3. Create a campaign → should appear on dashboard under "Dungeon Master"
4. Open the campaign → should see invite code and member list (just yourself)
5. In a private/incognito window: register a second account
6. Enter the invite code at `/join` → should land on the campaign as a player
7. Return to DM window: refresh campaign page → second user should appear in member list
8. Try `/campaigns/[id]/settings` as the player → should redirect to the campaign page
9. DM: remove the player from settings → player disappears from member list
10. DM: regenerate invite code → new code appears

---

### Next Recommended Phase

**Phase 2 — Character Sheets and DM Dashboard**

Before starting Phase 2:
- Supabase project should be connected and the Phase 1 migration applied
- Test the full Phase 1 flow manually (see verification steps above)
- Add `characters` and `inventory_items` tables to the schema
- Build character sheet create/edit for players
- Build DM view of all characters in a campaign

---

## Phase 0 — Project Foundation

**Date:** 2026-06-06
**Status:** Complete

All documentation files created. No application code written. Framework not yet initialized at that point.

**Files created:**
- `docs/PROJECT_SOURCE_OF_TRUTH.md`
- `docs/ROADMAP.md`
- `docs/FEATURE_SCOPE.md`
- `docs/DATA_MODEL_NOTES.md`
- `docs/ROLE_PERMISSION_NOTES.md`
- `docs/RULES_AND_LICENSING_NOTES.md`
- `docs/QA_CHECKLIST.md`
# Phase 5 - Encounter Manager

**Date:** 2026-06-07
**Status:** Code complete (pending Supabase migration `005_encounters.sql` and runtime verification)

## What Was Done

- Added `supabase/migrations/005_encounters.sql` with `encounters`, `encounter_participants`, `encounter_participant_dm_notes`, and `encounter_conditions`.
- Added RLS policies for DM-managed encounter state and player-visible encounter reads.
- Kept participant DM notes in a separate DM-only table so players never receive private notes on visible participant rows.
- Added `lib/actions/encounters.ts` for create/start/end, participant imports/manual adds, HP/initiative/state updates, conditions, DM notes, and turn navigation.
- Added encounter routes: `/campaigns/[id]/encounters`, `/campaigns/[id]/encounters/new`, and `/campaigns/[id]/encounters/[encounterId]`.
- Added `components/encounters/EncounterManager.tsx` for the DM combat tracker and simplified player view.

## Verification

| Check | Result |
|---|---|
| `npx.cmd tsc --noEmit` | Passed, 0 errors |
| `npm.cmd run lint` | Passed, 0 warnings |
| `npm.cmd run build` | Passed |

## Runtime Setup

Run `supabase/migrations/005_encounters.sql` in Supabase SQL Editor after migrations 001-004.

## Runtime Checklist

1. DM creates an encounter.
2. DM adds a player character, manual enemy, and optional map token.
3. DM sets initiative and starts the encounter.
4. Turn order sorts highest-first.
5. Next turn advances and increments the round after the last participant.
6. Back turn moves to the prior participant.
7. DM updates HP, temp HP, AC, speed, conditions, visibility, and defeated state.
8. Player sees visible encounter state only.
9. Player cannot edit encounter data.
10. Player cannot see hidden participants or DM notes.

## Next Recommended Phase

Phase 6 - Contextual Action Prompts.

---
# Phase 6 - Contextual Action Prompts

**Date:** 2026-06-07
**Status:** Code complete (pending Supabase migration `006_action_intents.sql` and runtime verification)

## What Was Done

- Added `supabase/migrations/006_action_intents.sql`.
- Added token interaction settings: `interaction_range_feet`, `available_actions`, and `hidden_dm_actions`.
- Added `action_intents` for player requests and `action_intent_dm_notes` for private DM notes.
- Added `lib/actions/action-intents.ts` for player submission and DM status/response updates.
- Added `lib/utils/actions.ts` with default action options and map-distance math.
- Added `/campaigns/[id]/actions` for player nearby actions and the DM action queue.
- Added per-token interaction controls in the DM map editor.

## Verification

| Check | Result |
|---|---|
| `npx.cmd tsc --noEmit` | Passed, 0 errors |
| `npm.cmd run lint` | Passed, 0 warnings |
| `npm.cmd run build` | Passed |

## Runtime Setup

Run `supabase/migrations/006_action_intents.sql` in Supabase SQL Editor after migrations 001-005.

## Runtime Checklist

1. DM sets an active map and links a player character to a visible player token.
2. DM places visible NPC/enemy/object/door/trap tokens nearby.
3. Player opens Actions and sees nearby tokens with available actions.
4. Player submits an action intent with an optional message.
5. DM opens Action Queue and sees player name, character, target, action, distance, and message.
6. DM approves, denies, asks for roll, and resolves requests.
7. Player sees updated request status and DM response.
8. Hidden tokens do not show to players.
9. Players cannot submit actions for characters they do not own.
10. Players cannot see DM-only action notes.

## Next Recommended Phase

Phase 7 - Story Tools.

---
