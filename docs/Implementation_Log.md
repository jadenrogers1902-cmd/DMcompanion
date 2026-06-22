# Implementation Log

## Live Map Remediation Pass

Date: 2026-06-22

Status: Implementation in progress; static verification started.

## What Changed

- Added `party_messages.action_intent_id` for action-specific DM nudges.
- Added `maps.reveal_override` for temporary reveal-all/hide-all without deleting painted reveals or room masks.
- Implemented shared hybrid player action authorization.
- Updated player action target filtering to match the server-side authorization rule.
- Updated DM action nudge derivation and acknowledgement to use exact action ids.
- Made center-screen token and room data player-safe and cast-visibility aware.
- Added realtime degraded-state refresh/resubscribe behavior.
- Added `docs/QA_Reports/LiveMap_Remediation_QA.md`.

## Why It Changed

The QA review found confusing or unsafe edges in the live-session flow: broad
guided action targeting, sender-wide nudge highlights, cast visibility mismatch,
destructive reveal-all behavior, and realtime channels that only reported raw
status. This pass moves those systems toward DM-controlled, player-safe,
session-reliable behavior.

## QA Performed

- `npx.cmd tsc --noEmit` passed.
- Lint/build and authenticated browser QA status should be recorded in the final handoff for this pass.

## Known Risks

- Production Supabase must receive the new migration before action-specific
  nudge persistence and reveal override persistence work in deployed runtime.
- Authenticated two-browser DM/player QA is still required to prove realtime
  behavior beyond static checks.

## Phase 1 - Adventure Codex Architecture Spec

Date: 2026-06-12

Status: Documentation complete. No executable implementation performed.

## What Changed

- Created `docs/AdventureCodex_NotionBridge.md`.
- Documented the planned internal Adventure Codex architecture.
- Documented proposed database tables:
  - `campaign_docs`
  - `campaign_doc_links`
  - `codex_reveals`
  - `notion_sync_mappings`
  - `notion_sync_logs`
- Documented planned UI areas:
  - Adventure Codex dashboard
  - Codex record drawer
  - Token linked-doc panel
  - Map linked-doc panel
  - Object linked-doc panel
  - DM reveal controls
  - Player revealed-info panel
  - Codex search
  - Codex relationship graph/list
  - Sync status indicators
- Documented privacy, realtime, migration, and rollback plans.

## Why It Changed

The app needs an internal Adventure Codex layer before any Notion API integration. This keeps Notion as a writing and prep source while preserving the DnD Companion app as the owner of live gameplay state.

## Files Changed

- `docs/AdventureCodex_NotionBridge.md`
- `docs/Implementation_Log.md`

## Database Changes

None. No migrations or schema changes were created in this phase.

## Realtime Changes

None. Realtime behavior was specified only.

## QA Performed

- Verified the target documentation files did not already exist before creation.
- Kept this phase documentation-only.
- Did not run application tests because no application code or schema changed.

## Known Risks

- The proposed `campaign_docs` table includes both DM-only and player-safe fields in the same conceptual table. Before implementation, the migration should either split private details into a DM-only table or expose players through a safe view/table to avoid realtime full-row leaks.
- Relationship visibility must be enforced by RLS, not by client filtering.
- Notion property mappings may vary by campaign and need validation before sync.

## Rollback Notes

Rollback for this phase is documentation-only:

- Revert or delete `docs/AdventureCodex_NotionBridge.md`.
- Revert the Phase 1 entry in `docs/Implementation_Log.md`.

No database or application rollback is required.

## Next Phase Recommendation

Phase 2 should design the exact migration with a privacy-first schema. Strongly consider splitting:

- player-safe Codex shell rows,
- DM-only Codex details,
- reveal audit records,
- sync mapping and log tables.

Do not add Notion API integration until internal Codex CRUD, linking, reveal controls, RLS, and realtime refresh behavior are in place.

## Phase 2 - Internal Adventure Codex Foundation

Date: 2026-06-12

Status: Implemented. Notion sync remains out of scope.

## What Changed

- Added Supabase migration `supabase/migrations/024_adventure_codex_foundation.sql`.
- Added Codex domain types and Supabase table/RPC type entries in `lib/types/database.ts`.
- Added Codex option/label helpers in `lib/codex/options.ts`.
- Added Codex server actions/services in `lib/actions/codex.ts`.
- Added DM/player Codex workspace in `components/codex/AdventureCodexWorkspace.tsx`.
- Added campaign route `app/(app)/campaigns/[id]/codex/page.tsx`.
- Added Codex navigation entries in desktop and mobile campaign nav.
- Updated `docs/AdventureCodex_NotionBridge.md`.
- Updated this implementation log.

## Why It Changed

Phase 2 creates the app-native Adventure Codex foundation that future Notion sync can target. The foundation keeps campaign documentation separate from live gameplay mechanics and preserves database-side privacy.

## Tables Added

- `campaign_docs`
- `campaign_doc_links`
- `campaign_doc_publications`
- `codex_reveals`

## Fields Added

`campaign_docs` includes title/type/source metadata, DM-only summaries and notes, player-safe summary, tags, status, visibility, reveal state, sync timestamps/status/error, and create/update timestamps.

`campaign_doc_links` includes doc-to-doc relationships and doc-to-live/prep object references.

`campaign_doc_publications` includes only player-safe fields for member-visible realtime and reads.

`codex_reveals` includes reveal scope, reveal actor, timestamp, message, and reveal type.

## RLS And Security Behavior

- `campaign_docs` is DM-only because it contains private fields.
- `campaign_doc_links` is DM-only because hidden relationship existence can be sensitive.
- `codex_reveals` is DM-only as an audit/control table.
- `campaign_doc_publications` is member-readable and contains only safe fields.
- Players fetch revealed Codex data through `get_player_visible_campaign_docs`, which returns only safe columns.
- DM notes, private source URLs, raw Notion IDs, source database IDs, and sync errors are not returned in the player UI.

## UI Added

- DM Adventure Codex dashboard at `/campaigns/[id]/codex`.
- Player Revealed Info view at `/campaigns/[id]/codex`.
- Desktop and mobile navigation entries.

DM capabilities:

- View records.
- Filter by type.
- Search by title/tag/status/content.
- Create manual records.
- Edit records.
- Set visibility.
- Reveal records.
- Link records to other records.
- See linked docs and linked live objects when present.

Player capabilities:

- View player-safe/revealed Codex summaries only.
- Search revealed info.

## Realtime Changes

- Added Codex tables to Supabase realtime publication.
- Added `campaign_doc_publications` specifically so player-visible Codex updates can refresh without exposing private doc rows.
- UI uses existing `useRealtimeRefresh` pattern.

## How Codex Docs Work

DMs create manual Codex records in the app. Each record has a type, status, visibility, private DM fields, and player-safe summary. Links can connect records to other records and, through services, to live/prep objects.

Future Notion sync should upsert into `campaign_docs` and `campaign_doc_links`; it should not touch live map/combat/action state.

## How Visibility Works

- `dm_only`: private to DM.
- `player_safe`: publishes only the safe projection if a player summary exists.
- `revealed`: records explicit reveal state and publishes the safe projection if a player summary exists.

The trigger-maintained `campaign_doc_publications` table is the player-safe realtime/read projection.

## QA Performed

Completed verification:

- `npx.cmd tsc --noEmit` passes.
- `npm.cmd run lint` passes.
- `npm run build` passes.
- Build output includes the new `/campaigns/[id]/codex` route.
- Code review check: player route receives only `get_player_visible_campaign_docs` data.
- Code review check: player route does not query `campaign_docs` directly.
- Code review check: normal Codex UI does not render raw record IDs, raw Notion IDs, source database IDs, or sync errors.

Runtime QA still needed after migration 024 is applied in Supabase:

- DM can create Location, Character/NPC, Rumor, Faction, and Boss/Enemy docs through the create form.
- DM can search/filter docs.
- DM can link two docs.
- Player cannot see DM-only docs.
- Player can see only explicitly revealed/player-safe docs.

## Known Risks

- Live object linking service exists, but the Phase 2 UI only displays existing live object links; object pickers should be added in a later phase.
- Player-specific reveals are represented in schema but the Phase 2 UI reveals to the party only.
- Full runtime QA requires applying migration 024 in Supabase and testing with DM/player sessions.
- Search is currently client-side for the dashboard dataset; large campaigns may need server-side indexed search later.

## Rollback Notes

Rollback code changes:

- Remove `/campaigns/[id]/codex`.
- Remove `components/codex/AdventureCodexWorkspace.tsx`.
- Remove `lib/actions/codex.ts`.
- Remove `lib/codex/options.ts`.
- Revert `lib/types/database.ts` Codex additions.
- Revert nav entries.

Rollback database changes:

- Remove realtime publication entries for Codex tables.
- Drop `campaign_doc_publications`.
- Drop `codex_reveals`.
- Drop `campaign_doc_links`.
- Drop `campaign_docs`.
- Drop `get_player_visible_campaign_docs`.

Do not drop or mutate live gameplay tables during Codex rollback.

## Next Phase Recommendation

Phase 3 should add object-specific linking UI inside live map token/object/map drawers and prepared map token panels. After object linking and reveal QA are solid, add Notion mapping configuration, then Notion sync.

## Phase 3 - Link Adventure Codex Docs To Live Map Objects

Date: 2026-06-12

Status: Implemented. Notion sync remains out of scope.

## What Changed

- Extended migration `024_adventure_codex_foundation.sql` with safe link projections and triggers.
- Added `CampaignDocLinkPublication` types in `lib/types/database.ts`.
- Added `removeCampaignDocLink` and `revealCampaignDocForLiveObject` actions in `lib/actions/codex.ts`.
- Added shared linked-doc UI in `components/codex/CodexLinkedDocsPanel.tsx`.
- Added DM Codex linking panels to `components/maps/MapEditor.tsx`.
- Added player safe linked-info display to `components/maps/PlayerMapView.tsx`.
- Updated live map routes to fetch Codex docs/links and safe player Codex projections.
- Added prepared map Codex linking in `components/adventures/PreparedMapEditor.tsx`.
- Updated prepared map route to provide Codex docs/links.
- Updated `docs/AdventureCodex_NotionBridge.md`.
- Updated this implementation log.

## Database Changes

Added `campaign_doc_link_publications`, a safe projection table for player-readable links between Codex docs and live objects.

Added triggers/functions:

- `sync_campaign_doc_link_publication`
- `refresh_campaign_doc_link_publications_for_token`
- `refresh_campaign_doc_link_publications_for_map`

These keep player-safe link rows in sync with document visibility, link visibility, token visibility, and active map state.

## Privacy Rules

- Live objects link to Codex records, never to Notion directly.
- `campaign_doc_links` remains DM-only.
- Players only receive `campaign_doc_link_publications`.
- Hidden token/object links are not published.
- Inactive map links are not published.
- Prepared map links are DM-only.
- Player UI renders only `PlayerVisibleCampaignDoc.player_summary`.
- Player UI does not render raw database IDs, raw Notion IDs, private source URLs, source database IDs, sync errors, DM summaries, or DM notes.

## UI Added

DM live map:

- Map-level Codex linked docs panel.
- Selected token/object Codex linked docs panel.
- Search Codex docs.
- Attach selected Codex doc.
- Remove attached Codex doc.
- Open Codex.
- View DM summary, DM notes, player-safe summary, source, type, relationship.
- Reveal player-safe summary.

Prepared map:

- Map-level Codex linked docs panel.

Player live map:

- Selected visible token/object card shows revealed/player-safe linked Codex summaries only.

## Realtime Behavior

- DM actions call server actions and refresh current route state.
- Other DM sessions can refresh from private `campaign_doc_links` realtime events.
- Players subscribe to safe `campaign_doc_publications` and `campaign_doc_link_publications`.
- Player map updates require no manual browser refresh when a newly linked doc is both player-visible and attached to a visible object.
- Notion still cannot affect gameplay mechanics.

## Files Changed

- `supabase/migrations/024_adventure_codex_foundation.sql`
- `lib/types/database.ts`
- `lib/actions/codex.ts`
- `components/codex/CodexLinkedDocsPanel.tsx`
- `components/maps/MapEditor.tsx`
- `components/maps/PlayerMapView.tsx`
- `app/(app)/campaigns/[id]/live-map/page.tsx`
- `app/(app)/campaigns/[id]/live-map/[mapId]/page.tsx`
- `components/adventures/PreparedMapEditor.tsx`
- `app/(app)/campaigns/[id]/adventures/[adventureId]/chapters/[chapterId]/maps/[preparedMapId]/page.tsx`
- `docs/AdventureCodex_NotionBridge.md`
- `docs/Implementation_Log.md`

## QA Performed

Completed verification:

- `npx.cmd tsc --noEmit` passes after Phase 3 changes.
- `npm.cmd run lint` passes after Phase 3 changes.
- `npm.cmd run build` passes after Phase 3 changes.

Runtime QA still needed after migration 024 is applied in Supabase:

- Link Location doc to map.
- Link Character doc to token.
- Link Boss/Enemy doc to enemy token.
- Link Loot/Item doc to map object.
- Link Rumor doc to NPC.
- Remove doc link.
- Replace doc link.
- Player sees only revealed/player-safe linked content.
- Hidden token docs do not leak.
- Realtime updates work without manual refresh.
- Full build passes.

## Known Issues

- Quest marker, handout, and character sheet object pickers are supported by the service/schema shape but do not yet have dedicated UI panels.
- Prepared map token-level Codex links are not yet shown; Phase 3 covers prepared map-level links.
- `Open Codex` currently routes to the Codex dashboard rather than deep-linking to a specific record.

## Next Phase Recommendation

Finish dedicated link panels for quest markers, handouts, character sheets, and prepared-map tokens. Then add Notion mapping configuration. Notion sync should wait until object linking and reveal QA pass in a two-browser DM/player test.

---

## Phase 4 - Player-Safe Reveal System

Date: 2026-06-11

Status: Implemented. Static gates pass. Runtime QA pending Supabase migrations 024 + 025.

### What Changed

- DM can reveal a player-safe Codex doc to **all players** or **one player**, with an optional note.
- Players receive a live popup over the existing notification pipeline and the revealed content appears in their Revealed Info panel / linked map-object panel without a manual refresh.
- DM-only fields (DM notes, private source metadata, raw ids) are never sent to players.

### Why It Changed

Phase 2/3 built the Codex and its links but reveal was party-only and silent. Phase 4 turns documentation into a live-session tool with explicit, scoped, privacy-safe reveals.

### Files Changed

- `supabase/migrations/025_codex_reveal_notifications.sql` (new) — `codex_reveal` party-message type + member-scoped SELECT policy on `codex_reveals`.
- `lib/types/database.ts` — `PartyMessageType` gains `'codex_reveal'`.
- `lib/actions/codex.ts` — `revealCampaignDoc` / `revealCampaignDocForLiveObject` take `scope` + `playerId`; party flips visibility, single-player does not; added `notifyCodexReveal`, `revealNoticeFor`, `resolveRevealScope`, `playerIdsFor`, and exported `fetchCampaignPlayers` + `CodexPlayer`.
- `components/codex/CodexRevealControls.tsx` (new) — shared scope selector + message + reveal button with inline confirmation.
- `components/codex/AdventureCodexWorkspace.tsx` — "Reveal to Players" section in the record panel; `players` prop threaded; old inline reveal button removed.
- `components/codex/CodexLinkedDocsPanel.tsx` — per-doc reveal control with scope; `players` prop.
- `components/party/PartyMessageListener.tsx` — renders the `codex_reveal` popup (player-facing, DM excluded as sender).
- `components/maps/MapEditor.tsx`, `components/adventures/PreparedMapEditor.tsx` — `players` prop threaded to the linked-doc panels.
- `app/(app)/campaigns/[id]/codex/page.tsx`, `app/(app)/campaigns/[id]/live-map/[mapId]/page.tsx`, `app/(app)/campaigns/[id]/adventures/[adventureId]/chapters/[chapterId]/maps/[preparedMapId]/page.tsx` — fetch + pass `players` (DM only).

### Database Changes

- Migration 025 only. Extends the `party_messages` message_type CHECK and adds `codex_reveals_select_scoped_member` (SELECT) so single-player reveals propagate over realtime. No new tables/columns. `codex_reveals` is already in the realtime publication with REPLICA IDENTITY FULL (from 024).

### Realtime Changes

- New `codex_reveal` message type flows through the already-published `party_messages` table → global popup.
- Party reveals continue to push via `campaign_doc_publications` / `campaign_doc_link_publications` (Phase 2/3 triggers).
- Single-player reveals now push via `codex_reveals` (newly player-readable, scoped) → RPC refetch.

### QA Performed

- `npx.cmd tsc --noEmit` passes.
- `npm.cmd run lint` passes (0 warnings).
- `npm.cmd run build` passes.

### Known Risks

- Migrations 024 + 025 must be applied in Supabase before any of this works at runtime; until then reveal actions will error on the missing tables/constraint (the notification layer degrades gracefully if only 025 is missing, but the reveal record write needs 024).
- Single-player reveal from a live object intentionally does not populate the shared party-wide map-object panel (that panel is party-scoped); the targeted player sees it on their Revealed Info page instead.
- Notification delivery is best-effort; a delivery failure leaves the reveal recorded but may skip the popup.

### Rollback Notes

See "Phase 4 rollback" in `docs/AdventureCodex_NotionBridge.md`.

### Next Phase Recommendation

Run the two-browser DM/player reveal QA in `docs/QA_Reports/AdventureCodex_QA.md` after applying 024 + 025, then proceed to Notion mapping configuration (Phase 6 in the architecture roadmap).

---

## Phase 5 - Manual Notion Link Support

Date: 2026-06-11

Status: Implemented. Static gates pass. Runtime QA pending migrations 024–026.

### What Changed

- DM can attach / update / remove a Notion URL on a Codex doc, and open the linked Notion page in a new tab.
- The doc shows whether it is Notion-linked. No Notion content is fetched — this is a manual reference only.

### Why It Changed

Bridges to the future API sync: docs can record their Notion source now so the sync phase has a mapping, and the DM gets a quick jump-to-source link.

### Files Changed

- `supabase/migrations/026_codex_notion_manual_link.sql` (new) — adds `campaign_docs.source_linked_at`.
- `lib/types/database.ts` — `source_linked_at` on `CampaignDoc` + campaign_docs Insert/Update.
- `lib/actions/codex.ts` — `parseNotionLink` (internal), `setCampaignDocNotionLink`, `removeCampaignDocNotionLink`.
- `components/codex/AdventureCodexWorkspace.tsx` — `NotionLinkSection` in the record panel.

### Database Changes

- Migration 026 only: one nullable column `source_linked_at`. The other Notion fields already existed (024). No projection/RLS change — `campaign_docs` is DM-only and no Notion field is in the player-safe projection or RPC.

### Realtime Changes

- None. Linking updates `campaign_docs`, which the DM Codex workspace already refetches via `useRealtimeRefresh`; nothing player-facing changes.

### QA Performed

- `npx.cmd tsc --noEmit` passes.
- `npm.cmd run lint` passes (0 warnings).
- `npm.cmd run build` passes. (Caught + fixed: `parseNotionLink` cannot be a non-async export from a `'use server'` module — made it module-private.)

### Known Risks / Issues

- Migration 026 must be applied before the link UI works at runtime (writes `source_linked_at`).
- Id parsing is best-effort; unusual Notion URL shapes may store the URL without a parsed page/database id. This is intentional and harmless for a manual reference.
- `Open in Notion` requires the DM to be authenticated in Notion in their browser; the app does not proxy Notion auth.

### Rollback Notes

See "Phase 5 rollback" in `docs/AdventureCodex_NotionBridge.md`.

### Next Phase Recommendation

Notion mapping configuration (property → Codex field mappings) and then the read-only API sync adapter, importing into DM-only Codex docs.

---

## Phase 6 - Server-Side Notion API Connection

Date: 2026-06-11

Status: Implemented. Static gates pass. Requires `SUPABASE_SERVICE_ROLE_KEY` + migration 027 to function at runtime.

### What Changed

- Added a DM-only Notion integration settings card (save/update token, test connection, disable, status display).
- Added a secure server-side Notion API client and a server-only secret store. No content is synced yet; this is the authenticated channel for later phases.

### Why It Changed

Establishes a secure, server-only Notion connection so future phases can read Notion content without ever exposing the integration token to the browser or players.

### Files Changed

- `supabase/migrations/027_campaign_notion_connections.sql` (new) — RLS-locked secret store (no authenticated policies; service-role only; not realtime-published).
- `lib/supabase/env.ts` — `getServiceRoleConfig()` (server-only key).
- `lib/supabase/admin.ts` (new) — service-role client (returns null when unset).
- `lib/notion/client.ts` (new) — `testNotionConnection`, `fetchNotionPage`, `fetchNotionDatabase`, `queryNotionDatabase`, `parseNotionTitle`, `parseNotionProperties`, `normalizeNotionError`.
- `lib/actions/notion-settings.ts` (new) — `saveNotionToken`, `testNotionConnection`, `disableNotionConnection`, `getNotionConnectionStatus` (all DM-gated; token never returned).
- `lib/types/database.ts` — `CampaignNotionConnection` + table types.
- `components/settings/NotionSettingsCard.tsx` (new) — DM settings UI.
- `app/(app)/campaigns/[id]/settings/page.tsx` — mounts the card.
- `.env.example` — documents `SUPABASE_SERVICE_ROLE_KEY` (server-only).

### Database Changes

- Migration 027 only: `campaign_notion_connections`. RLS enabled + forced, privileges revoked from authenticated/anon, no policies → only the service-role client touches it. Not added to realtime.

### Realtime Changes

- None. The connection table is deliberately excluded from realtime; the settings card refetches status on demand.

### QA Performed

- `npx.cmd tsc --noEmit` passes.
- `npm.cmd run lint` passes (0 warnings; resolved a `react-hooks/set-state-in-effect` flag by moving the status fetch into an inline async callback).
- `npm.cmd run build` passes.
- Client-bundle scan: no token, no `api.notion.com`, no service-role value in `.next/static` — only the env-var name in a UI hint string.

### Known Risks

- Requires `SUPABASE_SERVICE_ROLE_KEY` configured server-side; without it the feature shows a clean "not configured" notice and stays inert (rest of app unaffected).
- The service-role client bypasses RLS — it is only ever imported by `'use server'` modules and only used after a DM authorization check.
- The token is stored at rest in plaintext (server-only, RLS-locked). A future hardening pass could encrypt it with a KMS-managed key.

### Rollback Notes

See "Phase 6 rollback" in `docs/AdventureCodex_NotionBridge.md`.

### Next Phase Recommendation

Notion mapping configuration (Notion DB/property → Codex field mappings) using these server functions, then the read-only sync adapter writing DM-only Codex docs.

---

## Phase 7 - Notion Mapping to Adventure Codex

Date: 2026-06-11

Status: Implemented. Static gates pass. Runtime QA pending migrations 024–028 + SUPABASE_SERVICE_ROLE_KEY + a shared Notion database.

### What Changed

- DM can map each Notion database onto a Codex doc type, choosing which Notion property feeds each Codex field (title, DM summary, player-safe summary, DM notes, tags, status, source URL) plus relation properties.
- DM can load a database's property list, preview a sample record (DM-only vs player-safe vs relations, with warnings), and save/edit/delete mappings.

### Why It Changed

Turns the raw Notion connection into a structured, previewable mapping so the upcoming sync adapter knows how to write DM-only Codex docs from the DM's existing campaign database shape.

### Files Changed

- `supabase/migrations/028_notion_sync_mappings.sql` (new) — DM-only mapping table.
- `lib/notion/client.ts` — `extractNotionId` (URL/id → dashed UUID).
- `lib/notion/mapping.ts` (new) — `applyMapping(page, mapping)` → preview + warnings (pure, graceful).
- `lib/actions/notion-mappings.ts` (new) — `getNotionMappings`, `loadNotionDatabaseSchema`, `saveNotionMapping`, `deleteNotionMapping`, `testNotionMapping` (all DM-gated).
- `lib/types/database.ts` — `NotionSyncMapping` + table types.
- `components/codex/NotionMappingManager.tsx` (new) — mapping UI + sample preview.
- `app/(app)/campaigns/[id]/codex/notion/page.tsx` (new) — DM-only route.
- `components/codex/AdventureCodexWorkspace.tsx` — "Notion mappings" link.

### Database Changes

- Migration 028 only: `notion_sync_mappings` (DM-only RLS, no secrets, not realtime-published).

### Realtime Changes

- None. Mapping config refreshes via `router.refresh()` after save/delete.

### QA Performed

- `npx.cmd tsc --noEmit` passes.
- `npm.cmd run lint` passes (0 warnings).
- `npm.cmd run build` passes; `/campaigns/[id]/codex/notion` route registered.

### Known Risks / Issues

- No content is imported yet — mappings only configure + preview. Relations are previewed, not resolved into Codex links until the sync phase.
- Combat stats/ability scores are DM-notes reference text only by design; no structured stat mapping.
- Requires the Phase 6 connection (token + service-role key) for Load/Test; without it the UI shows a "not connected" notice and disables those actions.

### Rollback Notes

See "Phase 7 rollback" in `docs/AdventureCodex_NotionBridge.md`.

### Next Phase Recommendation

Build the read-only sync adapter: for each enabled mapping, query the Notion database, `applyMapping` per page, upsert DM-only Codex docs keyed by `(campaign, source='notion', source_page_id)`, resolve relation properties into `campaign_doc_links`, and log attempts in a sync-log table. Never write live runtime tables.

---

## Phase 8 - Manual Sync from Notion to Adventure Codex

Date: 2026-06-11

Status: Implemented. Static gates pass. Runtime QA pending migrations 024–029 + SUPABASE_SERVICE_ROLE_KEY + a shared, mapped Notion database.

### What Changed

- DM can manually sync: one Notion-linked Codex doc, one mapped database, or all enabled mappings.
- Sync upserts `campaign_docs` by Notion page id, resolves relations into `campaign_doc_links`, preserves app-owned fields, tracks per-doc sync metadata, and logs each run.

### Why It Changed

First safe import path (no webhooks). Brings Notion documentation into the app-owned Codex while keeping gameplay state and player visibility under app control.

### Files Changed

- `supabase/migrations/029_notion_sync_logs.sql` (new) — DM-only sync audit log.
- `lib/notion/mapping.ts` — `mapPageToDoc(page, mapping)` (upsert-ready fields; undefined = preserve).
- `lib/actions/notion-sync.ts` (new) — `syncCodexDoc`, `syncNotionDatabase`, `syncAllNotionDatabases` + upsert/relation/log helpers (DM-gated; service-role token read; campaign_docs writes via RLS client).
- `lib/types/database.ts` — `NotionSyncLog` + table types.
- `components/codex/NotionMappingManager.tsx` — per-mapping "Sync now" + "Sync all".
- `components/codex/AdventureCodexWorkspace.tsx` — "Sync from Notion" + last-synced status on a Notion-linked doc.

### Database Changes

- Migration 029 only: `notion_sync_logs` (DM-only RLS). Sync writes existing tables (`campaign_docs`, `campaign_doc_links`); no schema change to those.

### Realtime Changes

- None added. Upserts ride the existing `campaign_docs` / publication realtime; DM workspace refreshes automatically; players only get already-player-safe/revealed updates.

### QA Performed

- `npx.cmd tsc --noEmit` passes.
- `npm.cmd run lint` passes (0 warnings).
- `npm.cmd run build` passes.

### Known Risks

- Per-run cap of 500 records per database (5 × 100). Larger databases need repeated syncs; the result message and log flag when capped.
- No per-field conflict diff is recorded — the ownership model (Notion wins for mapped, app preserves the rest) is the conflict policy.
- Cross-database relations only link once both target docs exist; re-sync resolves stragglers.
- Notion status that isn't a Codex lifecycle value is stored as a `status:` tag rather than the status column.
- Requires the Phase 6 connection + Phase 7 mappings; without them sync returns a clean error.

### Rollback Notes

See "Phase 8 rollback" in `docs/AdventureCodex_NotionBridge.md`.

### Next Phase Recommendation

Optional: surface recent `notion_sync_logs` in the mapping UI; add a per-record "synced from Notion" badge + conflict preview; only then consider webhook/live sync (out of current scope).

---

## Phase 9 - Live Codex Updates After Sync

Date: 2026-06-11

Status: Implemented. Static gates pass. Runtime QA pending migrations 024–029 (multi-session test).

### What Changed

- Codex changes (manual edit, reveal, Notion sync) now update open DM and player sessions live, including the live-map DM editor's linked-doc drawers.
- Player Codex realtime no longer subscribes to DM-only tables — players watch only the player-safe projection + their scoped reveals.

### Why It Changed

Phases 2–8 wired most Codex realtime, but the live-map DM editor's Codex panels did not refresh on sync (stale until manual reload), and the player Codex view subscribed to DM-only tables (no leak, but wasteful and against the privacy model).

### Files Changed

- `components/codex/AdventureCodexWorkspace.tsx` — role-split realtime watch list (DM: docs/links/reveals; player: publications + reveals only).
- `components/maps/MapEditor.tsx` — `useRealtimeRefresh(campaign_docs, campaign_doc_links)` so DM drawers update live on sync/edit.

### Database Changes

- None. Reuses the realtime publications + RLS established in 024 and 025.

### Realtime Changes

- DM live-map editor now refetches Codex props on `campaign_docs`/`campaign_doc_links` changes.
- Player Codex subscriptions narrowed to player-safe tables only.
- No new tables published; no duplicate subscriptions (stable per-role/per-map channel names, cleaned up on unmount).

### QA Performed

- `npx.cmd tsc --noEmit` passes.
- `npm.cmd run lint` passes (0 warnings).
- `npm.cmd run build` passes.

### Known Risks

- `router.refresh()` is debounced (200ms); a burst of sync upserts coalesces into one refetch (intended). Very frequent edits could cause repeated refetches, but Codex changes are low-frequency.
- Reconnect resync relies on Supabase auto-reconnect delivering the next event; there is no explicit "refetch on reconnect" beyond that. Acceptable for this data; could be added later.
- The DM editor refetch re-runs the live-map server component; client canvas/selection state is preserved (token state is seeded once, codex props are read directly), so it is non-disruptive.

### Rollback Notes

See "Phase 9 rollback" in `docs/AdventureCodex_NotionBridge.md`.

### Next Phase Recommendation

The documentation→cache→sync→live-update arc is complete. Remaining optional work: sync-log UI, synced badges, and (only if desired) webhook/live sync — explicitly out of the current safe-sync scope.

---

## Phase 10 - Optional Notion Webhook Receiver

Date: 2026-06-13

Status: Implemented. Static gates pass. OFF by default (requires hosted HTTPS + `NOTION_WEBHOOK_SECRET` + DM auto-sync toggle). Runtime QA pending a real deployment + Notion subscription.

### What Changed

- Added a public webhook endpoint so Notion edits can auto-sync into the Codex.
- Added DM auto-sync controls + status (last webhook, last auto-sync, failed count, manual retry) on the settings Notion card.
- Extracted a client-agnostic sync core so the webhook (no user session) reuses the exact manual-sync logic.

### Why It Changed

Completes the optional auto-sync path: Notion edits propagate to the Codex without a manual click, while keeping all live gameplay state and player visibility app-owned.

### Files Changed

- `supabase/migrations/030_notion_webhooks.sql` (new) — `notion_webhook_events` (admin-only, dedup) + auto-sync status columns on `campaign_notion_connections`.
- `lib/notion/sync-core.ts` (new) — client-agnostic `upsertDocCore` / `resolveRelationsCore` / `syncDatabaseCore` / `syncPageCore` + `SyncSummary`.
- `lib/actions/notion-sync.ts` — refactored to thin wrappers over the core.
- `app/api/notion/webhook/route.ts` (new) — signed, deduped, gated webhook receiver.
- `lib/actions/notion-settings.ts` — `setNotionAutoSync` + auto-sync status fields; disable clears auto-sync.
- `components/settings/NotionSettingsCard.tsx` — auto-sync toggle, status, manual retry.
- `lib/types/database.ts` — `NotionWebhookEvent`, auto-sync columns.
- `.env.example` — documents `NOTION_WEBHOOK_SECRET` (optional, server-only).

### Database Changes

- Migration 030: new admin-only `notion_webhook_events` (RLS forced, no policies, not realtime); 5 new columns on `campaign_notion_connections`.

### Realtime Changes

- None added. Webhook upserts ride the existing `campaign_docs` realtime (Phase 9), so DM panels refresh and players see only already-revealed updates.

### Security

- HMAC-SHA256 signature verification over the raw body with `NOTION_WEBHOOK_SECRET`, `timingSafeEqual`. Verification handshake acked without persisting the token. Disabled (200 no-op) when the secret is unset. Endpoint reachable without a session (middleware does not guard `/api/*`); authenticity is signature-based.

### QA Performed

- `npx.cmd tsc --noEmit` passes.
- `npm.cmd run lint` passes (0 warnings).
- `npm.cmd run build` passes; `/api/notion/webhook` route registered.

### Known Risks

- Event routing depends on either an already-synced page or a parent database id in the payload; brand-new pages with no parent info in the event are logged `ignored` (re-sync the database manually). Documented.
- No internal queue/backoff yet — bursts and 429s rely on Notion's own retries.
- A single global `NOTION_WEBHOOK_SECRET` verifies all integrations (fits single-deployment/self-host); multi-tenant per-integration secrets would need a follow-up.
- Webhook auto-sync requires the service-role key (Phase 6); without it the endpoint no-ops.

### Rollback Notes

See "Phase 10 rollback" in `docs/AdventureCodex_NotionBridge.md`. Fastest kill switch: unset `NOTION_WEBHOOK_SECRET`.

### Next Phase Recommendation

The full Notion bridge (manual + webhook) is complete. Optional polish: surface `notion_sync_logs` / recent webhook events in the DM UI, a per-record "synced from Notion" badge, and an internal retry queue for rate-limited bursts.

---

## Phase 11 - Notion Sync Dashboard

Date: 2026-06-13

Status: Implemented. Static gates pass. Runtime browser QA reached `/login`; authenticated dashboard interaction still needs a live DM session.

### What Changed

- Added a DM-only Notion Sync Dashboard at `/campaigns/[id]/codex/sync`.
- Added health metrics for docs, Notion/manual source split, broken links, last sync, failed syncs, review flags, visibility, reveals, and live-object linkage.
- Added dashboard filters for doc type, source, sync status, visibility, reveal state, linked/unlinked, broken links, needs review, and search.
- Added triage actions: sync selected doc, sync mapped database, sync all, retry failed docs, open in Notion, open Codex doc, jump to Live Map for attachment, review visibility, and detach broken Notion links.
- Added `?doc=` support to the Codex workspace so dashboard links can open the intended record.

### Why It Changed

Gives the DM a single operational view for Adventure Codex sync health without exposing Notion internals or player-private data. It keeps sync management in the app-owned Codex layer rather than the live gameplay engine.

### Files Changed

- `app/(app)/campaigns/[id]/codex/sync/page.tsx` (new) - DM-only route and server-side data load.
- `components/codex/NotionSyncDashboard.tsx` (new) - metrics, filters, statuses, and actions.
- `components/codex/AdventureCodexWorkspace.tsx` - dashboard link and `?doc=` record selection.
- `lib/actions/notion-sync.ts` - `retryFailedNotionDocs`.
- `docs/AdventureCodex_NotionBridge.md`
- `docs/Implementation_Log.md`
- `docs/ChangeLog.md`
- `docs/QA_Reports/AdventureCodex_QA.md`

### Database Changes

- None. Phase 11 derives health from existing Phase 6-10 tables.

### Realtime Changes

- Dashboard uses `useRealtimeRefresh` on `campaign_docs`, `campaign_doc_links`, `codex_reveals`, and `notion_sync_logs` for DM-only live refresh.

### Security and Privacy

- Route redirects non-DMs back to `/campaigns/[id]/codex`.
- Player sessions never receive the dashboard component or DM-only table reads.
- UI does not render raw Notion payloads, source page ids, source database ids, webhook payloads, or raw API bodies.

### QA Performed

- `npx.cmd tsc --noEmit` passes.
- `npm.cmd run lint` passes (0 warnings).
- `npm.cmd run build` passes; `/campaigns/[id]/codex/sync` route registered.
- HTTP check for the new route returned through auth as expected when no request cookies were present.
- In-app browser is currently at `/login`, so authenticated dashboard interaction is pending a live DM session.

### Known Risks

- "Attach to live object" opens the Live Map; final object selection still happens in existing live-map drawers.
- Status derivation is intentionally conservative. Local edits after sync are labeled "Needs sync" even if the edit was app-owned and harmless.
- Failed sync count combines failed docs and recent failed sync logs, so it is an operational signal rather than a unique failure id count.

### Rollback Notes

See "Phase 11 rollback" in `docs/AdventureCodex_NotionBridge.md`.

---

## Phase 12 - Full QA / Regression / Documentation Finalization

Date: 2026-06-13

Status: Implemented. Static gates pass. Full authenticated multi-session runtime QA remains blocked by missing DM/player sessions or E2E credentials.

### What Changed

- Performed final static/regression QA over Adventure Codex, Notion bridge, realtime subscriptions, live-map linked-doc privacy, and webhook disabled mode.
## Adventure Maker + Codex Token Builder Rebuild

Date: 2026-06-13

Status: Implemented with static verification; authenticated browser QA pending.

### What Changed

- Rebuilt the prepared-map editor layout around a left-side **Map Builder Tokens**
  panel, center map canvas, and right-side map options/details panel.
- Replaced the old standalone **Tokens** and **Linked Codex Docs** page cards with
  the new Token Builder workflow and token-detail Codex entry panel.
- Added dynamic linked-token creation from cached Adventure Codex records.
- Added static object quick-add buttons for doors, chests, levers, buttons,
  traps, portals, stairs, signs, loot, lights, puzzles, hazards, and custom
  objects.
- Added prepared-token metadata for linked Codex docs, source label,
  dynamic/static behavior, movement locking, combat eligibility, interaction
  eligibility, and object state.
- Added per-token Codex attach/detach controls in the token detail drawer so
  static objects can optionally link to cached Codex entries too.
- Updated Live Map deployment so linked prepared tokens create live
  `campaign_doc_links` rows for the newly-created live tokens.

### Why It Changed

Adventure Maker is the DM's map-building workspace. It now consumes the
Adventure Codex cache directly, so Notion-synced campaign documentation can
become map tokens without making the live map depend on Notion.

### Architecture

`Notion tables -> Adventure Codex cache -> Adventure Maker linked token picker -> prepared map token/object -> live map engine`

Notion remains documentation. Adventure Codex remains the cached app-safe source.
The live engine still owns gameplay state.

### Files Changed

- `components/adventures/PreparedMapEditor.tsx`
- `components/adventures/TokenBuilderPanel.tsx`
- `components/adventures/TokenDetailPanel.tsx`
- `components/adventures/token-meta.ts`
- `lib/actions/prepared-maps.ts`
- `lib/types/adventure.ts`
- `docs/AdventureCodex_NotionBridge.md`
- `docs/Implementation_Log.md`
- `docs/ChangeLog.md`
- `docs/QA_Reports/AdventureMaker_Codex_TokenBuilder_QA.md`

### Database Changes

- None. Existing `prepared_maps.tokens` JSONB and `campaign_doc_links` are reused.

### QA Performed

- `npx.cmd tsc --noEmit` passes.
- `npm.cmd run lint` passes.
- `npm.cmd run build` passes.
- `npm.cmd run test:e2e` passes (2 smoke tests passed, 3 authenticated tests
  skipped because DM e2e credentials are unset).
- Full build/browser results are recorded in
  `docs/QA_Reports/AdventureMaker_Codex_TokenBuilder_QA.md`.

### Known Issues

- Drag-and-drop from the Codex mini table to the map is not implemented; click
  to add is the supported placement workflow.
- Full authenticated DM/player/browser QA still requires a live session.

### Rollback Notes

Revert the files listed above. No migration rollback is required, and reverting
does not modify Notion data.

---

- Added `docs/QA_Reports/AdventureCodex_Phase12_Final_QA_Report.md`.
- Replaced the default README with Companion-specific architecture, verification, and documentation guidance.
- Hardened Codex server actions to return clean user-facing errors instead of raw Supabase messages.

### Why It Changed

Phase 12 closes the documentation loop and records what is actually verified versus what still requires a live authenticated environment. It also reinforces the central invariant: Notion is documentation, Adventure Codex is the app-safe cache, and the live engine owns gameplay state.

### Files Changed

- `README.md`
- `lib/actions/codex.ts`
- `docs/AdventureCodex_NotionBridge.md`
- `docs/Implementation_Log.md`
- `docs/ChangeLog.md`
- `docs/QA_Reports/AdventureCodex_QA.md`
- `docs/QA_Reports/AdventureCodex_Phase12_Final_QA_Report.md`

### Database Changes

- None.

### QA Performed

- `npx.cmd tsc --noEmit` passes.
- `npm.cmd run lint` passes (0 warnings).
- `npm.cmd run build` passes.
- `npx.cmd playwright test tests/e2e/app-smoke.spec.ts` passes (2 tests).
- `npx.cmd playwright test tests/e2e/dm-action-queue.auth.spec.ts` skipped 3 tests because `E2E_DM_EMAIL`, `E2E_DM_PASSWORD`, and `E2E_CAMPAIGN_ID` are unset.
- Unauthenticated protected routes redirect to `/login`.
- `POST /api/notion/webhook` returns disabled no-op when `NOTION_WEBHOOK_SECRET` is unset.

### Bugs Found and Fixed

- ACQA-001: Codex actions returned raw Supabase error messages in some paths. Replaced them with clean action-specific messages.

### Known Risks

- Authenticated DM/player runtime QA is still pending.
- Notion runtime QA is still pending real service-role/Notion setup.
- Existing live-engine gaps from prior QA still apply: cast route not built, critical hit/miss handling missing, and no DM manual override for stuck attack resolution.

### Rollback Notes

See "Phase 12 rollback" in `docs/AdventureCodex_NotionBridge.md`.

---

## Documentation - Notion Campaign Database Model

Date: 2026-06-13

Status: Documentation only. No app behavior, schema, migrations, or code changed.

### What Changed

- Captured the user's actual Notion campaign structure ("Lost Mine of Phandelver")
  as a relational knowledge graph: entity databases (Characters, Bosses & Hostile
  Enemies, Locations - Phandalin, Sub-Locations, Storylines/Sessions, Rumors, Side
  Quests, Factions), per-table behavior, the full cross-table relationship matrix,
  the entity/relationship app-mapping model, live-engine linkage intent, and the
  privacy rule.

### Files Changed

- `docs/Notion_Campaign_Database_Model.md` (new) — full canonical model.
- `CLAUDE.md` — added a concise "Notion Campaign Database Model" section pointing
  to the full doc.
- `docs/AdventureCodex_NotionBridge.md` — added a pointer to the model doc.
- `docs/Implementation_Log.md` — this entry.

### Notes

- This records the *target* conceptual model for the future Notion integration.
  Some desired `doc_type` names (`storyline`, `monster`, `room`) and the richer
  relationship vocabulary differ from the current `campaign_docs` /
  `campaign_doc_links` schema (migrations 024–030); reconcile at implementation
  time. No schema was changed here.
- Exact Notion property names per database are not yet captured (the Phase 7
  mapping UI binds real property names to Codex fields).
