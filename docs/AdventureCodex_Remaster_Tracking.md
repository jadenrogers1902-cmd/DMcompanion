# Adventure Codex Remaster Tracking

## Purpose

This document tracks every implementation change made during the Adventure Codex + Notion Sync remaster.
The remaster goal is to make the Adventure Codex mirror the user's Notion campaign database structure:

- Each mapped Notion table becomes a top-level Codex card.
- Each Notion table entry becomes an expandable sub-card.
- Notion remains the source of truth for campaign content.
- Companion owns display settings, visibility, live-object links, reveal state, and gameplay state.
- Manual record creation is hidden from normal workflow and only available in advanced/admin-only areas if kept.
- Notion Sync Dashboard becomes a left-nav page.
- Local synced Notion data can be deleted by selected Adventure only.
- Deleting local synced Notion data never deletes or modifies Notion.

---

## Locked Decisions

| Topic | Decision |
|---|---|
| Edit button | Edits Companion display/link/visibility settings only, not Notion content |
| Open in Notion | Separate button for editing real Notion source |
| Delete/wipe behavior | User clicks delete, selects which Adventure to wipe, confirms, then only Companion-side synced/cache data for that Adventure is cleared |
| Notion deletion | Never delete or modify Notion data from local wipe |
| Manual records | Hidden from normal UI; advanced/admin-only if retained |
| Codex cards | Each mapped Notion table = one top-level card |
| Future tables | Future mapped Notion tables should automatically be able to appear as cards |
| Source of truth | Notion owns campaign content; Companion owns live gameplay state and display metadata |

---

## Phase Status Overview

| Phase | Status | Completed Date | Summary |
|---|---|---|---|
| Phase 0 - Discovery | Complete | 2026-06-13 | Audited current Codex/Sync; found flat-list UI, type-from-mapping mislabeling, no Adventure scoping, no delete action, orphaned docs on unmap |
| Phase 1 - UX/Data Spec | Complete | 2026-06-13 | Full spec for table-card Codex, entry sub-cards, edit drawer, left-nav sync dashboard, delete-by-Adventure, manual-record gating, schema visualization; defined required data-model additions |
| Phase 2 - Notion Sync Left Nav | Complete | 2026-06-13 | Added DM-only "Notion Sync" left-nav tab; added Adventure scoping (migration 031) + Adventure filter; added safe per-Adventure "Delete Local Synced Data" flow (confirmation phrase, never touches Notion) |
| Phase 3 - Hide Manual Creation | Complete | 2026-06-13 | Removed "Create Manual Record" from normal Codex; manual create now behind collapsed "Advanced: Local Manual Records"; Notion-first empty states; source badges (Notion / Local Manual) on cards |
| Phase 4 - Table Card Codex | Complete | 2026-06-13 | Flat list → one accordion card per mapped Notion table (generated from mappings) + Unmapped/Stale + Local Manual buckets; entries grouped by table; entity type from the table (fixes mislabeling); per-table Sync / Open Notion / Manage Mapping |
| Phase 5 - Relationship Drawers | Complete | 2026-06-13 | Entry panel rebuilt into a Companion settings drawer: Notion content read-only (+ Open in Notion), Companion-only Display Settings, related records grouped by entity type (open/remove), live-object link pickers (token/object/map), reveal controls retained |
| Phase 6 - Schema Visualization | Complete | 2026-06-13 | Dependency-free Codex Schema view at /codex/schema: SVG node-graph of mapped tables + relationship edges (counts/relations), filters, clickable nodes/edges → linked records, mobile list fallback |
| Phase 7 - Stale/Unmapped Cleanup | Complete | 2026-06-13 | Lifecycle labels formalized; dedicated "Stale / Unmapped Records" section on the Sync Dashboard (explanation + list + delete entry); removed-mapping records already excluded from active Codex cards (Phase 4); per-Adventure wipe clears them |
| Phase 8 - UI/Mobile Polish | Complete | 2026-06-13 | Fixed nav double-highlight (longest-prefix match); aligned empty-state/stale copy to required terms; added mapping-removed + stale banners; confirmed responsive stacking + mobile schema fallback |
| Phase 10 - Auto Discovery & Import | Complete | 2026-06-13 | Notion table discovery (search) + auto-detect type/fields + multi-select + field preview + two-pass relationship import; mappings now carry Adventure (RM-007); "Table" naming |
| Phase 9 - Regression QA | Partial (static PASS; runtime pending) | 2026-06-13 | Final tsc/lint/build PASS; code-level regression confirms remaster blast radius is Codex/nav-scoped (shared changes additive only); live gameplay + two-account/Notion runtime QA pending a live session |

---

## Current Implementation State

_Update this section before and after every phase._

### Current Codex Behavior
- Page: `app/(app)/campaigns/[id]/codex/page.tsx` → `components/codex/AdventureCodexWorkspace.tsx` (now fetches docs, links, **mappings, adventures**). DM sees `DMCodexDashboard`; players see `PlayerRevealedInfo`.
- **Table-card layout (Phase 4):** the left rail is now an accordion of **one card per mapped Notion table** (generated from `notion_sync_mappings`, not hardcoded), plus a **Unmapped / Stale** bucket (Notion docs with no current mapping) and a **Local Manual Records** bucket. Each card header shows icon + table name + entity type + record count + source badge (Notion / Local / Stale); expanding shows a meta row (mapping status, Adventure, last synced, live-link count, record-link count, stale/failed flags), per-table actions (Sync / Open Notion Table / Manage Mapping for mapping cards), and the entries as clickable sub-cards. Clicking an entry opens the right `CodexRecordPanel` (unchanged — reveal/links/notion-sync intact).
- **Entity type is now derived from the table (mapping), not the per-row default**, so records group + label under their real table (characters under Characters, etc.). Search filters entries within cards.
- (Phase 5) `CodexRecordPanel` is now a Companion settings drawer: a header (source table, entity type, source/visibility/status badges, sync status, **Open in Notion**); for **Notion** docs the content (title/summaries/notes) is **read-only** (a "Content from Notion, read-only" section) and only Companion **Display Settings** (visibility, status, display tags) are editable; **manual** docs remain fully editable. Below: reveal controls, **Related Records** grouped by the linked record's entity type (Open / Remove each), and **Linked Live Objects** with a token/object/map link picker + Remove.

### Current Notion Sync Behavior
- Connection: `campaign_notion_connections` (server-only, service-role); settings card in `/campaigns/[id]/settings`.
- Mappings: `notion_sync_mappings` (`/campaigns/[id]/codex/notion`, `NotionMappingManager`). Holds `doc_type` + property mappings + `notion_database_name`, keyed by `campaign_id` + `notion_database_id`.
- Sync: `lib/notion/sync-core.ts` (+ `lib/actions/notion-sync.ts`) upserts by `(campaign, source='notion', source_page_id)`; Notion wins for mapped fields; visibility/reveal/links preserved; relations → `campaign_doc_links`; logged to `notion_sync_logs`. Optional webhook auto-sync (`/api/notion/webhook`).
- Dashboard: `/campaigns/[id]/codex/sync` (`NotionSyncDashboard`, Phase 11). Reached via in-page links only.

### Current Navigation Behavior
- `components/nav/Sidebar.tsx` `campaignNavItems`; DM gets "Adventure Codex" → `/codex` and a DM-only "Notion Sync" → `/codex/sync` (Phase 2). (Phase 8) Active highlighting uses **longest-prefix match**, so `/codex/sync` highlights only "Notion Sync" (not also "Adventure Codex") — RM-008 fixed. `MobileNav` bottom bar is full (6 items); the dashboard stays reachable on mobile via the Codex page's in-page links (deliberate).

### Current Manual Record Behavior
- (Phase 3) The normal Codex no longer shows a top-level "Create Manual Record" card. `CreateDocCard` now lives ONLY inside a collapsed `<details>` "Advanced: Local Manual Records" at the bottom of the DM left column, with an explanation that manual records are local Companion-only. Title relabeled "Create Local Manual Record".
- Empty states are Notion-first ("Manage campaign content in Notion…") with Open Notion Sync + Manage Mappings actions — they no longer suggest manual creation.
- Source badges: list items + record-panel header show **Notion** (player-variant) or **Local Manual** (warning-variant) so the two are never visually confused. `createCampaignDoc` is unchanged and existing manual records still display (now badged).

### Current Stale/Unmapped Record Behavior
- `deleteNotionMapping` now removes the mapping row **and detaches the local synced Codex records for that Notion database**. Detach means: clear Notion source metadata (`source_url`, `source_page_id`, `source_database_id`, `source_linked_at`, `last_synced_at`, `sync_error`), convert the local rows to `source = 'manual'`, reset `sync_status = 'never'`, remove local doc-to-doc relation links touching those rows, and clear matching local sync logs. Companion-side live-object links are preserved. **No Notion API write/delete is called.**
- (Current safety net) `cleanupOrphanedNotionReferences` runs on the DM-only Table Mappings page and cleans any older local orphaned Notion references left behind by previous mapping-removal behavior. It only changes Companion/Supabase cache rows; it never modifies the Notion workspace.
- (Phase 7 legacy path) The Sync Dashboard still has a dedicated **"Stale / Unmapped Records"** card for broken links or older orphaned rows if any remain: it explains "These local records came from a Notion mapping that is no longer active (or have a broken Notion link)", lists each (title · type · lifecycle label) with Open-in-Codex, and offers **Delete Local Synced Data**. A formal `lifecycleLabel` is derived per record: Active mapped / Active synced / Needs sync / Stale / Unmapped / Broken Notion link / Deleted in Notion? / Mapping removed (+ Local manual; "Cleared locally" = post-delete, not rendered).
- **Scoped wipe** (`wipeLocalCodexData`, Phase 2): deletes `campaign_docs` (cascade to links/reveals/publications) for exactly one Adventure bucket (a single `adventure_id`, or the `adventure_id IS NULL` bucket) — this clears both active and stale docs for that bucket. Never deletes mappings, never contacts Notion. Sync logs (`notion_sync_logs`) are **retained** by the wipe (documented choice — they're a small DM-only audit trail and carry no Notion content). Re-syncing the mapping repopulates the cache.

### Current Relationship Display Behavior
- Table cards surface per-table live-link/record-link counts. (Phase 5) The entry drawer shows **Related Records grouped by the linked record's entity type** with Open + Remove, plus **Companion-side live-object links** (token/object/map) with an attach picker + Remove.
- (Phase 6) A **Codex Schema** view at `/campaigns/[id]/codex/schema` (DM-only) renders mapped tables as graph nodes and doc↔doc links as directed edges between tables (with counts + relation-type labels), plus Unmapped/Manual nodes when populated. Filters: focus table, relationship type, live-linked-only, player-visible-only, stale-only. Click a node → its records (Open in Codex); click an edge → the links between those tables. Dependency-free SVG; mobile shows a relationship list fallback. Reached from the Codex dashboard "Schema view" link and each table card's "View Relationships".
- `campaign_doc_links`: doc↔doc (`target_doc_id`) and doc↔live-object (`live_object_type`+`live_object_id`), generic `relationship_type` enum, `visibility`, player-safe projection tables.
- Notion relations are flattened to `related_to` doc↔doc links. No typed Notion-relationship vocabulary (`appears_in_location`, `connects_to_sub_location`, …) and no per-entity relation tables. Live links shown read-only in `CodexRecordPanel`; attach happens in map editor drawers.

---

## Files Changed

_Track every file changed during the remaster._

| File | Phase | Change Summary | Risk Level |
|---|---|---|---|
| docs/AdventureCodex_Remaster_Tracking.md | 0 | Created tracking document (discovery findings) | None (docs only) |
| docs/AdventureCodex_Remaster_Spec.md | 1 | Created full remaster UX/data spec | None (docs only) |
| supabase/migrations/031_codex_adventure_scope.sql | 2 | New: add nullable `adventure_id` to `campaign_docs` + `notion_sync_mappings` (+ indexes) | Medium (additive nullable cols; rollback = drop columns) |
| lib/types/database.ts | 2 | Added `adventure_id` to CampaignDoc + NotionSyncMapping interfaces + Insert/Update | Low |
| lib/notion/sync-core.ts | 2 | `upsertDocCore` stamps `adventure_id` from mapping (create always; update only when set) | Low |
| lib/actions/notion-sync.ts | 2 | New `wipeLocalCodexData` action; import `WIPE_CONFIRMATION_PHRASE` from options | Medium (destructive but scoped + phrase-gated) |
| lib/actions/notion-mappings.ts | 2 | Draft mapping in `testNotionMapping` sets `adventure_id: null` (type compat) | Low |
| lib/codex/options.ts | 2 | Added `WIPE_CONFIRMATION_PHRASE` constant (shared, non-server) | Low |
| components/nav/Sidebar.tsx | 2 | Added DM-only "Notion Sync" → `/codex/sync` nav item | Low |
| app/(app)/campaigns/[id]/codex/sync/page.tsx | 2 | Fetch + pass `adventures` to the dashboard | Low |
| components/codex/NotionSyncDashboard.tsx | 2 | Added Adventure filter + "Delete Local Synced Data" button + confirmation modal | Medium |
| components/codex/AdventureCodexWorkspace.tsx | 3 | Removed always-visible Create Manual Record; moved it into collapsed "Advanced: Local Manual Records"; Notion-first empty states; Notion/Local-Manual source badges; relabeled create card | Low |
| components/codex/AdventureCodexWorkspace.tsx | 4 | Flat list → table-card accordion (`buildGroups` + `CodexTableCard`); groups by mapping/unmapped/manual; entity type from table; per-table Sync/Open-Notion/Manage-Mapping; `docTypeIcon`/`notionDatabaseUrl` helpers; removed the type-filter dropdown | Medium |
| app/(app)/campaigns/[id]/codex/page.tsx | 4 | Also fetch `notion_sync_mappings` + `adventures` (DM only) and pass to workspace | Low |
| components/codex/AdventureCodexWorkspace.tsx | 5 | Rebuilt `CodexRecordPanel` into a Companion settings drawer (Notion content read-only + Open in Notion; Display Settings editable; Related Records grouped by type with Open/Remove); new `LiveObjectLinker` (token/object/map pickers); `LiveObjectOption` type | Medium |
| app/(app)/campaigns/[id]/codex/page.tsx | 5 | Fetch campaign `maps` + `tokens` (DM only) → build `liveObjects` and pass to workspace for live-object link pickers | Low |
| components/codex/CodexSchemaView.tsx | 6 | New: dependency-free SVG schema graph (nodes = mapped tables + Unmapped/Manual; edges = doc↔doc links by table pair) + filters + clickable nodes/edges + mobile list fallback | Low |
| app/(app)/campaigns/[id]/codex/schema/page.tsx | 6 | New DM-only route; fetches docs/links/mappings; reads `?table=` for initial focus | Low |
| components/codex/AdventureCodexWorkspace.tsx | 6 | Added "Schema view" header link + per-table-card "View Relationships" link (→ /codex/schema?table=) | Low |
| components/codex/NotionSyncDashboard.tsx | 7 | Added `lifecycleLabel` helper + a "Stale / Unmapped Records" card (explanation, list, delete entry) shown when removed-mapping/broken-link docs exist | Low |
| components/nav/Sidebar.tsx | 8 | Longest-prefix active match for campaign nav (fixes /codex vs /codex/sync double-highlight, RM-008) | Low |
| components/codex/AdventureCodexWorkspace.tsx | 8 | Empty-state copy aligned to required terms ("Connect a Notion table…", "No records synced yet. Sync this table from Notion."); mapping-removed explanation on Unmapped card; top "stale records" banner | Low |
| lib/notion/client.ts | 10 | New `searchNotionDatabases` (workspace-wide table discovery via /search) + `NotionDatabaseSummary` type | Low |
| lib/notion/auto-map.ts | 10 | New: `detectDocType` (name→type) + `autoMapTable` (fields→roles, confidence, relations) — pure, privacy-first | Low |
| lib/notion/sync-core.ts | 10 | Typed relationship resolution by target type (CHECK-valid); new `syncTablesTwoPass` (multi-table pass1 import → pass2 resolve) | Medium |
| lib/actions/notion-mappings.ts | 10 | `adventure_id` on mappings (RM-007); new `discoverNotionTables` + `autoImportNotionTables` | Medium |
| components/codex/NotionTableDiscovery.tsx | 10 | New: Find Tables → select/recommend → field preview → import UI | Low |
| app/(app)/campaigns/[id]/codex/notion/page.tsx | 10 | Fetch adventures + render `NotionTableDiscovery` above the mapping manager | Low |
| components/nav/Sidebar.tsx · NotionSyncDashboard.tsx · NotionMappingManager.tsx | 10 | "Table" naming (Table Sync / Table Mappings); Codex header links renamed | Low |

---

## Database / Migration Changes

_Track every migration, schema update, RLS change, index, or data behavior change._

| Migration/File | Phase | Change Summary | Rollback Notes |
|---|---|---|---|
| (none) | 0–1 | Documentation only; no schema changes | n/a |
| supabase/migrations/031_codex_adventure_scope.sql | 2 | Adds nullable `adventure_id` (FK → adventures, ON DELETE SET NULL) to `campaign_docs` + `notion_sync_mappings`; adds two indexes. Existing rows = NULL. No data deleted, no RLS change, no realtime change. | `ALTER TABLE campaign_docs DROP COLUMN adventure_id; ALTER TABLE notion_sync_mappings DROP COLUMN adventure_id;` (drops indexes with them). NOT YET APPLIED in Supabase. |

---

## UI Changes

_Track every changed screen/component._

| Screen/Component | Phase | Change Summary | Verification |
|---|---|---|---|
| (none) | 0–1 | Documentation only; no UI changes | n/a |
| Sidebar (desktop nav) | 2 | DM-only "Notion Sync" tab → `/codex/sync` | tsc/lint/build pass; route registered |
| Notion Sync Dashboard | 2 | Adventure filter (All / each adventure / Not linked); "Delete Local Synced Data" button → confirmation modal (adventure select + preview count + Notion-safe notice + phrase `DELETE LOCAL CODEX DATA` + scoped confirm) | tsc/lint/build pass; static reasoning of scope safety (see QA) |
| Adventure Codex (DM) | 3 | Manual-create card removed from normal view → collapsed "Advanced: Local Manual Records"; empty states now Notion-first with Open Notion Sync / Manage Mappings; list + panel show Notion / Local Manual source badges | tsc/lint/build pass |
| Adventure Codex (DM) | 4 | Left rail is now an accordion of table cards (one per mapped Notion table + Unmapped/Stale + Local Manual); entries grouped under their table with correct entity type; per-table Sync/Open-Notion/Manage-Mapping; meta stats per card | tsc/lint/build pass; route builds |
| Codex entry drawer (`CodexRecordPanel`) | 5 | Header w/ source table + sync status + Open in Notion; Notion content read-only; Companion Display Settings (visibility/status/tags); Related Records grouped by entity type (Open/Remove); Live Object link picker (token/object/map) + Remove | tsc/lint/build pass |
| Codex Schema view (`/codex/schema`) | 6 | New SVG relationship graph (table nodes + directed edges w/ counts) + filters (table/relationship/live/player-visible/stale) + node/edge detail lists + mobile fallback; linked from dashboard + table cards | tsc/lint/build pass; `/codex/schema` route registered |
| Notion Sync Dashboard | 7 | New "Stale / Unmapped Records" card (explanation + per-record list w/ lifecycle label + Open + Delete entry) | tsc/lint/build pass |
| Sidebar / Adventure Codex | 8 | Nav longest-prefix active match (RM-008); required-term empty states; mapping-removed + stale banners | tsc/lint/build pass |

---

## Behavior Changes

_Track any behavior changes._

| Behavior | Old Behavior | New Behavior | Phase |
|---|---|---|---|
| Sync dashboard access | Reachable only via in-page links from Codex | DM-only left-nav tab "Notion Sync" (desktop); in-page link retained for mobile | 2 |
| Local synced data deletion | No delete/wipe existed | DM can delete local synced Codex data scoped to one Adventure (or the unassigned bucket), phrase-confirmed; Notion never touched | 2 |
| Synced doc Adventure linkage | Docs had no Adventure association | Sync stamps `adventure_id` from the mapping onto upserted docs (preserves existing on update) | 2 |
| Codex/dashboard Adventure filtering | None | Dashboard rows filterable by Adventure | 2 |
| Manual record creation | Always-visible "Create Manual Record" card; primary-feeling workflow | Hidden behind collapsed "Advanced: Local Manual Records"; not part of normal flow | 3 |
| Codex empty states | "Create a Codex record to begin." (suggests manual) | Notion-first message + Open Notion Sync / Manage Mappings actions | 3 |
| Record source indication | Tiny raw `source` text badge in panel only | Notion / Local Manual badges on list items + panel header | 3 |
| Codex record layout | Flat undifferentiated list of all docs | Accordion of one card per mapped Notion table (+ Unmapped/Stale + Local Manual); entries nested under their table | 4 |
| Record entity type | `doc_type` per row (mislabeled, e.g. character→Location) | Grouped + labeled by the table's mapping; correct table membership | 4 |
| Codex type filter | Single "type" dropdown | Removed (table grouping replaces it); search retained | 4 |
| Editing a Notion record | Full editor wrote title/summaries to the synced cache | Notion content read-only in Companion; only Companion Display Settings (visibility/status/tags) editable; content edited via Open in Notion | 5 |
| Relationship display | Flat "Linked Docs" list (relation label only) | Related Records grouped by linked entity type, with Open + Remove | 5 |
| Live-object linking from Codex | Read-only list; attach only from map editor | Drawer has a token/object/map link picker + Remove (Companion-side only) | 5 |
| Relationship overview | None (only per-record drawer) | Dedicated Codex Schema graph of tables + relationships at /codex/schema | 6 |
| Removed-mapping records | Stayed in the main Codex, mixed with active records | Excluded from active table cards (Phase 4) + surfaced in the dashboard "Stale / Unmapped Records" section with explanation + delete entry (Phase 7) | 7 |
| Record lifecycle | Ad-hoc derived statuses | Formal per-record lifecycle label (Active mapped/synced, Needs sync, Stale, Unmapped, Broken Notion link, Deleted in Notion?, Mapping removed) | 7 |
| Nav active highlighting | `startsWith` (parent + child both highlighted) | Longest-prefix match (only the deepest matching item) | 8 |
| Empty-state / stale copy | Generic strings | Required user-facing terms ("Connect a Notion table…", "No records synced yet. Sync this table from Notion.", mapping-removed + stale-data notices) | 8 |
| Notion import | Paste one DB link → manually pick type + every field → save → sync, one table at a time | Find Tables from Notion → multi-select → auto-detected type + field mapping (preview/adjust) → two-pass import that resolves cross-table relationships | 10 |
| Mapping ↔ Adventure | Mappings had no Adventure (docs always `adventure_id` NULL) | Import/save stamps the chosen Adventure onto the mapping; synced docs inherit it (RM-007) | 10 |
| Relationship type on synced links | Always `related_to` | Derived from the linked record's type (located_in / member_of / rumor_for / quest_hook / enemy_in / npc_in / session_topic) | 10 |
| User-facing naming | "Notion Sync / Notion Mappings / Notion docs" | "Table Sync / Table Mappings / table entries" ("Source: Notion" badge kept) | 10 |

---

## QA / Verification Log

_Track every test run._

| Phase | Test | Result | Notes |
|---|---|---|---|
| 0 | Read-only code/schema audit | Done | No code executed; findings recorded |
| 1 | Spec self-review against locked decisions | Done | Spec covers all locked decisions; flags `adventure_id` gap |
| 2 | `npx.cmd tsc --noEmit` | PASS | After adding `adventure_id` types + wipe action + modal |
| 2 | `npm.cmd run lint` | PASS | 0 warnings |
| 2 | `npm.cmd run build` | PASS | `/campaigns/[id]/codex/sync` route registered |
| 2 | Wipe scope-safety review (static) | PASS | Query always `.eq('campaign_id')` + exactly one of `.eq('adventure_id', id)` or `.is('adventure_id', null)`; no "all adventures" path; phrase checked server-side; no Notion API call in path; mappings untouched |
| 2 | Build error caught + fixed | Fixed | `WIPE_CONFIRMATION_PHRASE` const could not be exported from a `'use server'` file → moved to `lib/codex/options.ts` |
| 2 | Runtime (DM clicks delete, selects adventure, confirms; nav appears) | PENDING | Needs migration 031 applied + a live DM session (browser at /login locally) |
| 3 | `npx.cmd tsc --noEmit` | PASS | After hiding manual create + empty-state/badge changes |
| 3 | `npm.cmd run lint` | PASS | 0 warnings |
| 3 | `npm.cmd run build` | PASS | Codex route builds |
| 3 | No data deleted (existing manual records preserved) | PASS (static) | Only UI changed; `createCampaignDoc` and all reads untouched; manual docs still listed (now badged), no delete/migration in this phase |
| 3 | Runtime (manual create hidden; empty state points to Notion; Notion records still display) | PENDING | Needs a live DM session |
| 4 | `npx.cmd tsc --noEmit` | PASS | After table-card rebuild + page mappings/adventures fetch |
| 4 | `npm.cmd run lint` | PASS | 0 warnings |
| 4 | `npm.cmd run build` | PASS | Codex route builds |
| 4 | Grouping correctness (static) | PASS | Entries grouped by `source_database_id → mapping`; type shown from the table; Unmapped/Stale catches docs with no mapping; Local Manual catches non-notion; future/custom mapped tables render automatically (cards come from mappings, not a hardcoded list) |
| 4 | Runtime (cards render, correct grouping, future table appears, mislabels gone) | PENDING | Needs migration 031 applied + live DM session with real mappings/synced docs |
| 5 | `npx.cmd tsc --noEmit` | PASS | After drawer rebuild + maps/tokens fetch |
| 5 | `npm.cmd run lint` | PASS | 0 warnings (fixed a react-compiler manual-memoization error by dropping a useMemo over a derived array) |
| 5 | `npm.cmd run build` | PASS | Codex route builds |
| 5 | Relationship-by-type + read-only Notion content + no raw IDs (static) | PASS | Related records grouped by linked doc's `doc_type`; Notion content read-only with Open in Notion; link picker shows map/token labels (no raw ids surfaced) |
| 5 | Runtime (drawer relationships, live link controls, Edit=Companion-only, Open in Notion) | PENDING | Needs live DM session + real linked data |
| 6 | `npx.cmd tsc --noEmit` | PASS | After schema view + route |
| 6 | `npm.cmd run lint` | PASS | 0 warnings |
| 6 | `npm.cmd run build` | PASS | `/codex/schema` route registered |
| 6 | Counts/edges correctness + no raw IDs (static) | PASS | Edges aggregated from doc↔doc links by table pair (source→target); counts = link tallies; nodes show record/live counts; UI shows titles/labels only, no ids |
| 6 | Runtime (graph renders, nodes/edges clickable, mobile fallback) | PENDING | Needs live DM session + real mappings/links |
| 7 | `npx.cmd tsc --noEmit` | PASS | After lifecycle helper + stale section |
| 7 | `npm.cmd run lint` | PASS | 0 warnings |
| 7 | `npm.cmd run build` | PASS | Codex sync route builds |
| 7 | Lifecycle/removed-mapping/wipe-scope (static) | PASS | Removed-mapping docs excluded from active cards (Phase 4) + listed in dashboard stale section; per-Adventure wipe deletes campaign_docs only (cascade), never mappings/Notion, scoped to one adventure bucket; re-sync repopulates |
| 7 | Runtime (remove mapping → stale section; wipe selected Adventure; others untouched; Notion untouched; re-sync restores) | PENDING | Needs migration 031 applied + live DM session + real Notion mappings/sync |
| 8 | `npx.cmd tsc --noEmit` | PASS | After nav fix + copy/empty-state polish |
| 8 | `npm.cmd run lint` | PASS | 0 warnings |
| 8 | `npm.cmd run build` | PASS | All routes build |
| 8 | Responsive layout review (static) | PASS | Codex grid stacks below `xl`; dashboard table `overflow-x-auto`; schema has `md:hidden` list fallback; long titles truncate (cards, entries, schema nodes) |
| 8 | Runtime (desktop/tablet/mobile viewports, long names, empty/many records) | PENDING | Needs a live DM session across viewports |
| 9 | `npx.cmd tsc --noEmit` (full app) | PASS | Final pass |
| 9 | `npm.cmd run lint` (full app) | PASS | 0 warnings |
| 9 | `npm.cmd run build` (full app) | PASS | All 30+ routes build incl. live-map/encounters/actions |
| 9 | Code-level regression (blast radius) | PASS | Remaster touched only Codex/nav/migration/types; shared edits (database.ts types, sync-core param) are additive/non-breaking; live-engine components unmodified |
| 9 | Live gameplay regression (map/token/rolls/combat/HP/alerts/whispers/reveal/mobile) | PENDING | Requires a live DM+player session; not executable in this environment |
| 9 | Notion sync runtime (sync all/selected, status, remove-mapping, wipe, re-sync) | PENDING | Requires migration 031 + SUPABASE_SERVICE_ROLE_KEY + a shared Notion DB |
| 9 | Two-account privacy (DM-only, player-safe, revealed, room secrets, no ids/errors to players) | PENDING | Requires live DM+player sessions |
| 10 | `npx.cmd tsc --noEmit` | PASS | After discovery/auto-map/two-pass/import + naming |
| 10 | `npm.cmd run lint` | PASS | 0 warnings (removed an unused import) |
| 10 | `npm.cmd run build` | PASS | All routes build |
| 10 | Auto-detect + privacy + relationship-type (static) | PASS | Name→type + field→role mapping is privacy-first (player-safe only on explicit names; Room Secret/Background/Combat→DM notes); two-pass resolves relations by target type via CHECK-valid enum; no raw ids/payloads surfaced |
| 10 | Runtime (Find Tables, select, preview, import 8 tables, Carp→Characters / Sildar→Bosses / Phandalin→Locations / Conyberry→Sub-Locations, relations resolve, warnings, re-sync, Notion untouched) | PENDING | Requires SUPABASE_SERVICE_ROLE_KEY + a shared Notion workspace + migrations 024–031 |

---

## Open Issues

| ID | Issue | Severity | Phase Found | Status | Notes |
|---|---|---|---|---|---|
| RM-001 | `campaign_docs` and `notion_sync_mappings` have no `adventure_id` | High | 0 | Resolved (Phase 2) | Migration 031 adds nullable `adventure_id` to both; sync stamps it from the mapping. NOTE: until the Manage-Mapping UI can assign an Adventure to a mapping (Phase 4), all rows stay `adventure_id = NULL` → in practice only the "not linked to an Adventure" wipe bucket has data. |
| RM-002 | No delete action exists for `campaign_docs` | High | 0 | Resolved (Phase 2) | `wipeLocalCodexData` added — DM-gated, phrase-confirmed, scoped to one Adventure bucket, cascade-deletes links/reveals/publications, never touches Notion or mappings. |
| RM-007 | Mappings have no UI to assign an Adventure yet, so synced docs are all `adventure_id = NULL` | Medium | 2 | Resolved (Phase 10) | Table Sync auto-import and `saveNotionMapping` now stamp the chosen Adventure onto the mapping; synced docs inherit it → per-Adventure wipe buckets populate. |
| RM-012 | Single-slot field mapping: a table with multiple DM-note-ish fields (e.g. Background + What Happens Here? + Room Secret) maps only the first to DM notes; extras are auto-marked "Ignored" | Low | 10 | Open | Acceptable for v1 (DM can adjust per mapping). A future enhancement could concatenate multiple source fields into DM notes. |
| RM-008 | Sidebar active-state highlights "Adventure Codex" and "Notion Sync" together on `/codex/sync` (pre-existing `startsWith` logic) | Low | 2 | Resolved (Phase 8) | Sidebar now uses longest-prefix matching; only the deepest matching nav item highlights. |
| RM-003 | Type mislabeling: `doc_type` derives only from the mapping's single value; mismapped DBs label every row wrong (character → Location) | High | 0 | Resolved (Phase 4) | Records are now grouped + labeled by their table (mapping `doc_type`), not the per-row default, so a Characters table reads as Characters. Underlying per-row `doc_type` is still the mapping's single value (a per-entity stat mapping remains future work, tracked under the Notion model). |
| RM-004 | Removing a mapping orphans synced docs but leaves them visible/active in main Codex | Medium | 0 | Resolved (Phase 4 + 7 + cleanup follow-up) | Orphaned docs are excluded from active Codex cards (Phase 4 → Unmapped/Stale bucket) and reviewable in the dashboard "Stale / Unmapped Records" section with a delete entry (Phase 7). Current cleanup follow-up detaches removed-mapping docs into local manual records, clears Notion source fields and local sync logs, removes local doc-to-doc relation links, preserves live-object links, and never touches Notion. |
| RM-009 | Card actions "View Relationships" and "Edit Display Settings" are not yet implemented | Low | 4 | Resolved (Phase 5–6) | "View Relationships" now links from each table card to the Codex Schema graph (Phase 6); per-entry Companion display-settings editing lives in the drawer (Phase 5). Table-level friendly-name/icon override remains as RM-010. |
| RM-011 | Schema graph uses a fixed circular SVG layout (no drag/auto-layout); many tables (>~10) or dense edges may overlap | Low | 6 | Open | Acceptable for typical campaigns; a force/drag layout or a graph lib could be added in polish (Phase 8) if needed. Mobile already falls back to a list. |
| RM-010 | Table-level display overrides (friendly name/icon) + per-doc `display_name_override` not implemented | Low | 5 | Open | Optional polish; needs a small schema addition. Defer to Phase 8 (UI polish) or a dedicated mapping-settings pass. |
| RM-005 | Manual create presented as primary workflow; weak source distinction | Medium | 0 | Resolved (Phase 3) | Manual create moved behind collapsed "Advanced: Local Manual Records"; Notion-first empty states; Notion / Local Manual source badges on list + panel. |
| RM-006 | No typed relationship vocabulary mirroring the Notion graph | Low | 0 | Open | Relationship drawers + schema viz (Phase 5–6); may extend `campaign_doc_links` relation set. |

---

## Phase Logs

### Phase 0 - Discovery
Status: Complete (2026-06-13)

#### Completed Work
- Audited the Adventure Codex page, the DM dashboard/editor, the Notion mapping manager, the Notion Sync Dashboard, the sync core/actions, the navigation, and the relevant migrations (024–030).
- Recorded current implementation state (above) and the discovery report (returned to the user).
- Created this tracking document.

#### Findings
- **Codex display** is a flat list in `AdventureCodexWorkspace.tsx` (`DMCodexDashboard`); no per-table/entity grouping; single type dropdown only.
- **Mislabeling root cause:** `doc_type` is a single column; for Notion docs it is set wholesale from `notion_sync_mappings.doc_type` (`sync-core.upsertDocCore`), and manual create defaults to `location`. The displayed label is just `campaignDocTypeLabel(doc.doc_type)`. The human Notion table name lives only on `notion_sync_mappings.notion_database_name`, joined via `doc.source_database_id → mapping.notion_database_id`.
- **Source storage:** `campaign_docs.source` (`manual|notion|import`), `source_page_id`, `source_url`, `source_database_id`. Mapped table name on `notion_sync_mappings.notion_database_name`.
- **Grouping:** none — flat list.
- **Manual record UI:** `CreateDocCard` ("Create Manual Record"), empty-state copy, `createCampaignDoc` action, and the always-editable `CodexRecordPanel`.
- **Sync Dashboard:** `/campaigns/[id]/codex/sync` (DM-only, Phase 11); reached via in-page links, not nav; metrics + sync controls + filter table + row actions; logs fetched (limit 50) but only used for `lastSync`/`failedCount`. Mappings managed separately at `/codex/notion`.
- **Local data lifecycle (Phase 0 baseline, superseded later):** unmap (`deleteNotionMapping`) left orphaned docs visible/active; stale state only derived in dashboard; **no delete/wipe action existed**; docs scoped to `campaign_id` only — **no `adventure_id`** → wipe-by-Adventure not possible at that point. Current behavior is recorded above in "Current Stale/Unmapped Record Behavior".
- **Relationship model:** `campaign_doc_links` (doc↔doc + doc↔live-object), generic `relationship_type`, player-safe projections; Notion relations flattened to `related_to`; no typed Notion vocabulary, no per-entity tables.
- **Navigation:** Sidebar `campaignNavItems` (DM → Adventure Codex); no sync entry; add a DM-only "Notion Sync" item there + mirror in `MobileNav`.

#### Files Changed
- `docs/AdventureCodex_Remaster_Tracking.md` (created). No application code/schema changes.

#### QA / Verification
- Read-only audit; no commands run against the app. Findings cross-checked against migrations 024–030 and the current components.

#### Remaining Work
- None for Phase 0. Proceed to Phase 1 (spec).

---

### Phase 1 - UX/Data Spec
Status: Complete (2026-06-13)

#### Pre-Phase Review
- **Already completed:** Phase 0 discovery + this tracking document.
- **Unfinished before this phase:** all implementation (Phases 2–9).
- **What this phase did:** authored the full UX/data spec for the remaster (no code/UI/schema changes).
- **Risks carried in:** RM-001 (no `adventure_id`), RM-002 (no delete action), RM-003 (type mislabeling) — all addressed in the spec's data-model section.

#### Completed Work
- Wrote `docs/AdventureCodex_Remaster_Spec.md` covering: table-card Codex home, entry sub-cards (with correct entity type), the Companion-only edit drawer, the left-nav Notion Sync Dashboard, the delete-local-synced-data flow, manual-record gating, and the schema/relationship visualization (with mobile fallback).
- Defined the **required data-model additions** that future phases must implement (see Decisions below).

#### Decisions Made
- **Codex cards:** group by mapped Notion table. Card identity = `notion_sync_mappings` row (`notion_database_id`); title = `notion_database_name`; entity type/icon = mapping `doc_type`. Plus two synthetic buckets: **"Unmapped / Stale"** (Notion docs whose `source_database_id` has no mapping) and an Advanced **"Local Manual Records"** bucket.
- **Entry sub-cards:** entity type comes from the *table card* (the mapping), not the per-row `doc_type` default, so rows can no longer mislabel as the create-form default. Each shows source/visibility/sync badges, link counts, Open in Notion, Edit Display Settings, View Relationships.
- **Edit drawer:** Companion-only metadata (display-name override, visibility, reveal scope, live-object/map/token/object/room links, tags, Companion notes, advanced locals) + a separate **Open in Notion**. Never edits Notion content. Story-content fields (title/summaries) become read-only mirrors for Notion docs.
- **Sync Dashboard:** promoted to a DM-only left-nav page with an Adventure selector, mapped-table list, stale/broken sections, logs, and the delete flow.
- **Delete/wipe:** Dashboard → pick Adventure → preview counts → "Notion is not touched" notice → type `DELETE LOCAL CODEX DATA` → clears only Companion cache for that Adventure.
- **Required schema additions (future phases, not now):** add `adventure_id` (nullable FK → `adventures`) to `campaign_docs` and `notion_sync_mappings` so cards show the Adventure and wipe can scope by it (resolves RM-001); add a DM-gated wipe action/RPC (resolves RM-002). Until `adventure_id` exists, the spec's interim scope is per-campaign or per-mapped-database, clearly labeled.

#### Files Changed
- `docs/AdventureCodex_Remaster_Spec.md` (created), `docs/AdventureCodex_Remaster_Tracking.md` (updated). No application code/schema changes.

#### Database Changes
- None in this phase. Spec records the **planned** additions (`adventure_id` on `campaign_docs` + `notion_sync_mappings`, wipe action) for later phases.

#### UI Changes
- None in this phase (spec only).

#### QA / Verification
- Spec reviewed against every locked decision; confirmed all are covered and the `adventure_id` dependency is explicitly flagged.

#### Issues Found
- Reconfirmed RM-001/RM-002/RM-003 as prerequisites; no new issues.

#### Remaining Work
- Begin Phase 2 (Notion Sync left-nav page) per the spec.

---

### Phase 2 - Notion Sync Left Nav
Status: Complete (2026-06-13)

#### Pre-Phase Review
- **Already completed:** Phase 0 (discovery + tracking doc) and Phase 1 (spec). Nav/sync-dashboard files were NOT yet changed.
- **Open issues reviewed:** RM-001 (no `adventure_id`) and RM-002 (no delete action) both gate the Adventure-scoped wipe this phase requires.
- **What this phase did:** add the left-nav tab AND, to make the "delete by Adventure" requirement genuinely safe, resolve RM-001/RM-002 (migration 031 + wipe action) rather than ship a campaign-wide wipe mislabeled as per-Adventure.
- **Risks carried in:** destructive delete path (mitigated by phrase + strict scoping); migration not applied in this environment (runtime QA deferred).

#### Completed Work
- Added a DM-only **"Notion Sync"** item to the desktop Sidebar → `/campaigns/[id]/codex/sync`.
- Migration **031** adds nullable `adventure_id` to `campaign_docs` and `notion_sync_mappings`.
- `sync-core.upsertDocCore` now stamps `adventure_id` from the mapping (create always; update only when the mapping has one, never clobbering an existing value).
- New `wipeLocalCodexData(campaignId, { adventureId, confirmationPhrase })` — DM-gated, phrase-gated (`DELETE LOCAL CODEX DATA`), scoped to exactly one Adventure bucket (`adventure_id = id`) or the unassigned bucket (`adventure_id IS NULL`). Cascade-deletes links/reveals/publications. Never calls Notion; never deletes mappings.
- Dashboard: Adventure filter + header **Delete Local Synced Data** button + confirmation modal (adventure select with per-bucket counts, preview, "Notion is NOT touched" notice, phrase input, scoped confirm).
- Dashboard page fetches + passes `adventures`.

#### Files Changed
- See Files Changed table (Phase 2 rows): migration 031, `database.ts`, `sync-core.ts`, `notion-sync.ts`, `notion-mappings.ts`, `options.ts`, `Sidebar.tsx`, `codex/sync/page.tsx`, `NotionSyncDashboard.tsx`.

#### Database Changes
- Migration 031 (additive nullable `adventure_id` on `campaign_docs` + `notion_sync_mappings`, 2 indexes). No RLS/realtime change. **Not yet applied in Supabase.**

#### UI Changes
- Sidebar "Notion Sync" tab; dashboard Adventure filter + delete button + confirmation modal.

#### QA / Verification
- `tsc --noEmit`, `eslint` (0 warnings), `next build` all PASS; `/codex/sync` route registered.
- Static scope-safety review of the wipe (always campaign-scoped + single adventure bucket; no global path; phrase checked server-side; no Notion call; mappings preserved).
- Caught + fixed: `WIPE_CONFIRMATION_PHRASE` cannot be a const export from a `'use server'` file → moved to `lib/codex/options.ts`.
- Runtime DM/browser verification PENDING (needs migration 031 applied + a live DM session; local browser sits at `/login`).

#### Issues Found
- RM-007 (mappings can't be assigned to an Adventure yet → all docs `adventure_id NULL`), RM-008 (cosmetic nav double-highlight). Both logged Open.

#### Remaining Work
- Apply migration 031 + run the live DM verification checklist.
- Phase 4 will add Adventure assignment to mappings (closes RM-007) so per-Adventure wipe buckets populate.

#### Rollback Notes
- Drop migration 031 columns (see Database/Migration Changes). Revert the Sidebar item, the dashboard delete UI/filter, `wipeLocalCodexData`, the `adventure_id` stamping in `sync-core`, and the `WIPE_CONFIRMATION_PHRASE` constant. No data is destroyed by reverting (the wipe is user-invoked only).

---

### Phase 3 - Hide Manual Creation
Status: Complete (2026-06-13)

#### Pre-Phase Review
- **Already completed:** Phases 0–2. Phase 2 put the Notion Sync dashboard in the DM left nav and added the per-Adventure wipe.
- **Manual UI locations (from Phase 0):** `CreateDocCard` ("Create Manual Record"), the right-panel empty state, the left-list empty state, `createCampaignDoc`. Not yet changed before this phase.
- **What this phase did:** make the Codex Notion-first — hide manual creation from normal use (keep it advanced-only), Notion-first empty states, clear source badges. Targets RM-005.
- **Risks:** must not delete existing manual records (UI-only change; no data touched).

#### Completed Work
- Removed the always-visible `CreateDocCard` from the DM left column.
- Added `AdvancedManualRecords`: a collapsed `<details>` "Advanced: Local Manual Records" containing the (relabeled "Create Local Manual Record") form + the explanation "Manual records are local Companion-only records. Notion remains the main source for campaign content."
- Added `NotionFirstEmptyState` (message: "Campaign records are managed in Notion. Sync your mapped Notion tables to update the Adventure Codex.") with **Open Notion Sync** + **Manage Mappings** actions; used for both the no-records list state and the right-panel empty state.
- Added `sourceBadge` (Notion / Local Manual) shown on left-list items and the record-panel header.

#### Files Changed
- `components/codex/AdventureCodexWorkspace.tsx` (only file changed this phase).

#### Database Changes
- None.

#### UI Changes
- See UI Changes table (Phase 3 row).

#### QA / Verification
- `tsc --noEmit`, `eslint` (0 warnings), `next build` all PASS.
- No-data-loss verified statically: only presentation changed; `createCampaignDoc` and all doc reads/queries are unchanged; manual docs remain in the list (now badged). No delete/migration in this phase.
- Runtime DM verification PENDING (live session): confirm manual-create is hidden, empty state points to Notion, Notion records still display, manual records badged.

#### Issues Found
- None new. (RM-005 resolved.)

#### Remaining Work
- Live DM runtime check (deferred with the standing migration/QA backlog).
- Phase 4 (table-card Codex) will further restructure this screen; the Advanced section + badges should carry forward.

#### Rollback Notes
- Single-file revert of `AdventureCodexWorkspace.tsx`: restore the always-visible `CreateDocCard`, the old empty-state strings, and the prior `doc.source` badge. No data implications.

---

### Phase 4 - Table Card Codex
Status: Complete (2026-06-13)

#### Pre-Phase Review
- **Already completed:** Phases 0–3. Phase 3 hid manual creation; Phase 2 added Adventure scoping + Notion Sync nav.
- **Grouping by source table did NOT exist** — the Codex was a flat list (confirmed in Current State / Phase 0).
- **Open issues addressed:** RM-003 (mislabeling) via table grouping; RM-004 (orphaned docs) via a visible Stale bucket.
- **What this phase did:** replace the flat list with a mapping-driven table-card accordion; keep the right detail panel intact.

#### Completed Work
- `buildGroups(docs, mappings)`: one group per `notion_sync_mappings` row (card title = `notion_database_name` || type label; entity type = mapping `doc_type`), plus a synthetic **Unmapped / Stale** group (Notion docs whose `source_database_id` has no current mapping) and a **Local Manual Records** group (non-notion docs). Cards are generated from mappings, so any future/custom mapped table appears automatically.
- `CodexTableCard`: collapsible card (auto-expanded if it contains the selected doc) showing icon, table name, entity type, record count, source badge; expanded meta row (mapping status, Adventure name, last synced, live-link count, record-link count, stale/failed flags); per-table actions **Sync** (`syncNotionDatabase`), **Open Notion Table** (best-effort URL from db id), **Manage Mapping**; and entries as clickable sub-cards that open the right `CodexRecordPanel`.
- Entity type is shown from the table grouping, fixing the "everything looks like Location" problem. Search filters entries within cards and hides non-matching cards.
- Codex page now fetches `notion_sync_mappings` + `adventures` (DM only) and passes them through; removed the redundant type-filter dropdown.

#### Files Changed
- `components/codex/AdventureCodexWorkspace.tsx`, `app/(app)/campaigns/[id]/codex/page.tsx`.

#### Database Changes
- None (reuses migration 031's `adventure_id` and existing tables).

#### UI Changes
- See UI Changes table (Phase 4 rows).

#### QA / Verification
- `tsc --noEmit`, `eslint` (0 warnings), `next build` all PASS; Codex route builds.
- Grouping correctness reasoned statically (mapping-driven cards; Unmapped/Stale + Local Manual buckets; future tables render automatically). Examples that will group correctly once synced: Characters → Characters card, Bosses & Hostile Enemies → its card, Locations - Phandalin → Locations card, Sub-Locations → their own card, Rumors / Side Quests / Factions likewise.
- Runtime DM verification PENDING (needs migration 031 applied + a live session with real mappings + synced docs).

#### Issues Found
- RM-009 (card actions View Relationships + Edit Display Settings deferred to Phase 5/6). RM-004 now partially addressed (Stale bucket; bulk cleanup = Phase 7).

#### Remaining Work
- Phase 5: Companion edit/settings drawer + relationship drawers (adds Edit Display Settings + View Relationships card actions; also the Adventure-assignment control on mappings that closes RM-007).
- Live DM runtime check.

#### Rollback Notes
- Revert `AdventureCodexWorkspace.tsx` (restore flat list + type filter) and the page's extra `mappings`/`adventures` fetch. No data/schema implications (no migration this phase).

---

### Phase 5 - Relationship Drawers
Status: Complete (2026-06-13)

#### Pre-Phase Review
- **Already completed:** Phases 0–4. Table cards + entry sub-cards working (Phase 4); the right `CodexRecordPanel` opened on entry click.
- **Relationship model / existing UI:** `campaign_doc_links` (doc↔doc + doc↔live-object); the old panel had a flat "Linked Docs" + read-only "Linked Live Objects" list and the reveal/notion-link sections.
- **What this phase did:** turn the panel into a relationship-aware Companion settings drawer; group relationships by entity type; add live-object link controls; enforce Notion-content-read-only.

#### Completed Work
- Header now shows source table name, entity type, source/visibility/status badges, sync status, and a prominent **Open in Notion** button.
- **Edit = Companion settings only:** for Notion docs, content (title/summaries/notes) is read-only (rendered in a "Content from Notion, read-only" section); only **Display Settings** (visibility, status, display tags) are editable. Manual docs remain fully editable. `saveSettings` sends only Companion fields for Notion docs.
- **Related Records grouped by entity type:** linked docs are grouped under their `doc_type` heading (Location, Faction, Rumor, …), each with **Open** (selects that record) and **Remove** (Companion-side link). The add-relationship control is retained (Companion-side doc↔doc link; does not touch Notion).
- **Live object links:** new `LiveObjectLinker` with a type picker (Token / Map object / Map) + a target picker populated from the campaign's maps & tokens; attaches via `linkCampaignDocToLiveObject`. Existing links list each with **Remove**.
- Codex page fetches `maps` + `tokens` (DM only) → `liveObjects`; new exported `LiveObjectOption` type.

#### Files Changed
- `components/codex/AdventureCodexWorkspace.tsx`, `app/(app)/campaigns/[id]/codex/page.tsx`.

#### Database Changes
- None.

#### UI Changes
- See UI Changes table (Phase 5 row).

#### QA / Verification
- `tsc --noEmit`, `eslint` (0 warnings), `next build` all PASS.
- Per-type relationship grouping + Notion-read-only + no-raw-ids reasoned statically. Entity types that now show grouped relationships: Character, Boss/Hostile Enemy, Location, Sub-Location, Rumor, Side Quest, Faction (any linked records appear grouped under the linked record's type).
- Caught + fixed: a React Compiler `preserve-manual-memoization` error (useMemo over a derived array) — replaced with a plain computed value.
- Runtime DM verification PENDING (live session + real linked data + migration 031).

#### Issues Found
- RM-009 now partially resolved (relationship view + Companion settings per entry). RM-010 added (table-level display overrides / `display_name_override` deferred).
- RM-007 (Adventure-assignment UI on mappings) was NOT in Phase 5's entry-drawer scope and remains open; retarget to a mapping-settings pass / Phase 7.

#### Remaining Work
- Phase 6: schema/relationship visualization (graph + mobile fallback) — the card-level "View Relationships".
- Live DM runtime check of the drawer relationships + link controls.

#### Rollback Notes
- Revert `AdventureCodexWorkspace.tsx` (restore the prior `CodexRecordPanel`) and the page's `maps`/`tokens`→`liveObjects` fetch. No schema/data implications.

---

### Phase 6 - Schema Visualization
Status: Complete (2026-06-13)

#### Pre-Phase Review
- **Already completed:** Phases 0–5. Relationship drawers exist (Phase 5); relationships = `campaign_doc_links` (doc↔doc + doc↔live-object); tables = `notion_sync_mappings`.
- **Graph deps:** none installed (no react-flow/d3). Decision: build a **dependency-free** SVG graph + mobile list fallback (no new packages).
- **What this phase did:** add a Codex Schema view + wire links from the dashboard and table cards.

#### Completed Work
- `CodexSchemaView` (client): builds nodes from mappings (+ Unmapped/Manual buckets when populated) and edges by aggregating doc↔doc links per directed table pair (with per-edge counts + relation-type set); self-links shown as a node "↻N" badge. Deterministic circular SVG layout (no `Date`/`random`). Nodes show record count, live-object count, and a status dot (green enabled / red failed-sync / grey). Clickable nodes (→ that table's records) and edges (→ the links between the two tables); records/links link to `…/codex?doc=<id>`.
- Filters: focus table, relationship type (filters edges + detail), live-object-linked-only, player-visible/revealed-only, stale/unmapped-only.
- Mobile fallback: SVG is `hidden md:block`; a tables + relationships **list** renders `md:hidden`.
- New DM-only route `/campaigns/[id]/codex/schema` (reads `?table=` for initial focus).
- Dashboard header "Schema view" link + per-table-card "View Relationships" link (→ `?table=<dbId>`), resolving RM-009.

#### Files Changed
- `components/codex/CodexSchemaView.tsx` (new), `app/(app)/campaigns/[id]/codex/schema/page.tsx` (new), `components/codex/AdventureCodexWorkspace.tsx`.

#### Database Changes
- None.

#### UI Changes
- See UI Changes table (Phase 6 row).

#### QA / Verification
- `tsc --noEmit`, `eslint` (0 warnings), `next build` all PASS; `/codex/schema` route registered.
- Counts/edges + no-raw-ids reasoned statically (edges = link tallies by table pair; node counts from docs/links; UI shows titles/labels only).
- Runtime DM verification PENDING (live session + real mappings/links).

#### Known Limitations / Future Improvements
- RM-011: fixed circular layout (no drag/auto-layout); dense graphs (>~10 tables or many edges) may overlap — fine for typical campaigns; mobile already lists. A force/drag layout is optional polish (Phase 8).
- Edges reflect Companion `campaign_doc_links`; until Notion relation sync resolves more links, the graph is as rich as the linked data.

#### Issues Found
- RM-011 added (layout density). RM-009 resolved.

#### Remaining Work
- Phase 7 (stale/unmapped cleanup) and the standing live runtime QA.

#### Rollback Notes
- Delete `CodexSchemaView.tsx` + the `/codex/schema` route; revert the two links in `AdventureCodexWorkspace.tsx`. No schema/data implications.

---

### Phase 7 - Stale/Unmapped Cleanup
Status: Complete (2026-06-13)

#### Pre-Phase Review
- **Already completed:** Phases 0–6. Phase 4 already excludes removed-mapping docs from active Codex cards (Unmapped/Stale bucket). Phase 2 added the per-Adventure `wipeLocalCodexData`.
- **Records scoped to Adventure:** `campaign_docs.adventure_id` (migration 031), stamped from the mapping at sync time. Until mappings get an Adventure-assignment UI (RM-007) most synced docs have `adventure_id = NULL` → they live in the wipe's "not linked to an Adventure" bucket.
- **What this phase did:** formalize lifecycle labels and add a dedicated stale/unmapped review section on the dashboard; confirm removed-mapping behavior + the Adventure-level clear path.

#### Completed Work
- `lifecycleLabel(doc, hasMapping)` — one human state per record (Active mapped / Active synced / Needs sync / Broken Notion link / Mapping removed / Unmapped / Deleted in Notion? / Sync failed / Local manual record). "Cleared locally" is the post-delete state (row gone) — documented, not rendered.
- **"Stale / Unmapped Records"** card on the Sync Dashboard (only when such docs exist): the required explanation ("These local records came from a Notion mapping that is no longer active…"), a list of each record (title · type · lifecycle label) with **Open in Codex**, and a **Delete Local Synced Data** button that opens the existing per-Adventure wipe modal.
- Confirmed removed-mapping records no longer appear in active Codex table cards (Phase 4) and are reviewable here; the per-Adventure wipe clears active + stale docs for the chosen bucket via cascade, never touching Notion or mappings; re-sync restores.
- Follow-up cleanup now makes removed mappings more aggressive locally: `deleteNotionMapping` detaches affected synced docs into local manual Codex records, clears Notion source metadata and matching sync logs, removes local doc-to-doc relation links for those detached docs, and preserves Companion live-object links. `cleanupOrphanedNotionReferences` performs the same local cleanup for older orphaned rows when the DM opens Table Mappings. Neither path modifies Notion.

#### Files Changed
- `components/codex/NotionSyncDashboard.tsx`.
- Follow-up cleanup: `lib/actions/notion-mappings.ts`, `app/(app)/campaigns/[id]/codex/notion/page.tsx`, `components/codex/NotionMappingManager.tsx`.

#### Database Changes
- None (reuses migration 031 + the existing cascade FKs from 024).

#### UI Changes
- See UI Changes table (Phase 7 row).

#### Lifecycle / removed-mapping / clear rules (recorded)
- **Removed mapping:** current behavior detaches local synced docs from the removed Notion database into local manual Codex records, clears Notion source fields, removes local doc-to-doc relation links for those detached docs, clears matching local sync logs, and preserves Companion live-object links. Review stale/broken rows only if older orphaned data remains. Notion is untouched.
- **Broken Notion link:** notion doc missing `source_page_id`/`source_url` → "Broken Notion link" lifecycle + listed in the stale section.
- **Adventure-level clear:** `wipeLocalCodexData` deletes `campaign_docs` for one Adventure bucket (cascade to links/reveals/publications). Active cards for that bucket empty until re-sync; stale docs in that bucket removed; **sync logs retained**; Notion untouched; other Adventures untouched.

#### QA / Verification
- `tsc --noEmit`, `eslint` (0 warnings), `next build` all PASS.
- Static review confirms: active cards exclude removed-mapping docs; stale section lists them; wipe is cascade-only + scoped + Notion-safe; re-sync repopulates.
- Follow-up cleanup verification: `npx.cmd tsc --noEmit` PASS; `npm.cmd run lint` PASS; service-role data sanity for the current campaign showed `mappings=0`, `notionDocs=0`, `docsWithSourceDatabase=0`, `syncLogs=0` after cleanup. Full browser runtime verification (remove mapping → detach local cache; re-sync restores; other Adventures/Notion untouched) still needs a live DM session + applied migrations.

#### Issues Found
- None new. RM-004 resolved. RM-007 still open (mapping Adventure-assignment UI) — without it, per-Adventure precision is limited to the "unassigned" bucket; not blocking.

#### Remaining Work
- Phase 8 (UI/mobile polish) + Phase 9 (regression QA); live runtime QA backlog.

#### Rollback Notes
- Revert `NotionSyncDashboard.tsx` (remove `lifecycleLabel` + the stale section). No schema/data implications.

---

### Phase 8 - UI/Mobile Polish
Status: Complete (2026-06-13)

#### Pre-Phase Review
- **Already completed:** Phases 0–7. Open UI issues: RM-008 (nav double-highlight), RM-011 (schema graph density), RM-010 (display-name overrides, optional).
- **What this phase did:** fix RM-008, align all empty-state/stale copy to the required user-facing terms, add discoverable stale notices, and confirm responsive behavior. No behavior/schema changes.

#### Completed Work
- **Nav (RM-008):** Sidebar campaign nav now computes the active item by **longest-prefix match**, so `/codex/sync` highlights only "Notion Sync", `/codex` (and `/codex/notion`, `/codex/schema`) highlight "Adventure Codex".
- **Copy / empty states (required terms):**
  - No mapped tables → "Connect a Notion table to start building this Adventure Codex. …"
  - Table with no records → "No records synced yet. Sync this table from Notion."
  - Mapping removed (Unmapped/Stale card) → "This table is no longer mapped. Its old local records are hidden from the active Codex. …"
  - Stale records present → a top banner: "Some local records came from mappings that are no longer active. Review or delete them from the Notion Sync Dashboard."
- Kept user-facing vocabulary (Notion source, Adventure, Table, Entry, Linked records/live object, DM only / Player safe / Revealed, Needs sync, Not mapped, Broken link, Stale local data); no raw column names / ids / API-error text surfaced.
- **Responsive:** confirmed the Codex grid stacks below `xl`, the dashboard table scrolls (`overflow-x-auto`), the schema view has a `md:hidden` list fallback, and long titles truncate across cards/entries/schema nodes.

#### Files Changed
- `components/nav/Sidebar.tsx`, `components/codex/AdventureCodexWorkspace.tsx`.

#### Database Changes
- None.

#### UI / Copy / States
- Copy: required empty-state + stale strings (above). Loading: server-rendered routes (no client spinners needed). Error: existing inline action errors retained (clean messages, no raw API/DB text). Mobile/tablet: responsive stacking + schema list fallback confirmed.

#### QA / Verification
- `tsc --noEmit`, `eslint` (0 warnings), `next build` all PASS.
- Responsive/copy reviewed statically; live multi-viewport check pending a DM session.

#### Remaining UI Debt
- RM-011 (schema graph fixed circular layout can crowd with many tables) — optional force/drag layout later.
- RM-010 (table/doc friendly-name + icon override) — optional, needs a small schema add; not done.
- Live multi-viewport runtime verification (375/768/1024/1440) pending a session.

#### Issues Found
- RM-008 resolved. No new issues.

#### Remaining Work
- Phase 9 regression QA.

#### Rollback Notes
- Revert `Sidebar.tsx` (restore prior `isActive`) and the copy/banner edits in `AdventureCodexWorkspace.tsx`. No schema/data implications.

---

### Phase 10 - Automated Table Discovery, Auto-Mapping & Relationship Import
Status: Complete (2026-06-13)

#### Pre-Phase Review
- **Already completed:** Phases 0–9. Found the codebase had advanced beyond prior tracking — a parallel session added `findChildNotionDatabases`, `cleanupOrphanedNotionReferences`, child-DB discovery in `loadNotionDatabaseSchema`, and `detachLocalNotionDocs`. Reviewed those before adding anything to avoid duplication.
- **What this phase did:** add workspace-wide table discovery, auto-detection of table type + field mapping, multi-select preview/import, and a two-pass relationship import; renamed user-facing labels to "Table…". Reused the existing relationship plumbing (no migration) and extended mappings with `adventure_id` (closes RM-007).

#### Completed Work
- **Discovery:** `searchNotionDatabases` (Notion `/search`, paginated/capped) → `discoverNotionTables` action returns clean per-table summaries (title, field count, imported flag, auto-detected type + field plan). No raw payloads/ids beyond the opaque db id.
- **Auto-detection (`lib/notion/auto-map.ts`, pure):** `detectDocType` (name → Codex type, case-insensitive; sub-location before location; unknown → Needs Review) and `autoMapTable` (per-property role: title/dm_summary/player_summary/dm_notes/tags/status/relation, with confidence). **Privacy-first:** player-safe only from explicit player-safe names; Background/What Happens/Room Secret/Motive/Lore/Combat/Ability → DM notes; relations collected for two-pass.
- **Two-pass import (`syncTablesTwoPass` in sync-core):** Pass 1 upserts every entry of every selected table (so targets exist); Pass 2 resolves all relation references at once. Unresolved relations (target table not imported) are counted and surfaced as a clean warning, never fatal. Relationship type now derived from the linked record's type (CHECK-valid enum).
- **Import action:** `autoImportNotionTables(adventureId, tables)` saves each mapping (stamped with the Adventure), runs the two-pass sync, logs one summary row.
- **UI:** `NotionTableDiscovery` (Find Tables → Select all / Select recommended / Clear → per-table type select + field preview table → Import Selected Tables) on the Table Mappings page, with an Adventure selector and the "imports a synced copy; does not modify Notion" assurance.
- **Naming:** Notion Sync → **Table Sync**, Notion Mappings → **Table Mappings**, Codex header links renamed; "Source: Notion" badge kept.
- **RM-007 resolved:** mappings carry `adventure_id`; saved/auto-imported docs inherit it.

#### Files Changed
- See Files Changed table (Phase 10 rows).

#### Database Changes
- None. Reuses migration 031 (`adventure_id`) and the existing `campaign_doc_links` relationship CHECK set (the richer relationship vocabulary in the prompt maps onto these existing values — documented as RM-013 future enhancement if a fuller vocabulary is wanted).

#### UI / Behavior / Privacy / Errors
- UI: discovery + auto-map + preview + multi-import on Table Mappings; "Table" naming.
- Behavior: see Behavior Changes table (Phase 10 rows).
- Privacy: imports default DM-only; only explicit player-safe field names map to `player_summary`; Room Secret/Background/Combat → DM notes; nothing auto-revealed.
- Errors: clean messages ("No tables found. Make sure your Notion page or database is shared…", "Connect a Notion token…", unresolved-relation note); no raw API/DB/JSON/ids.

#### QA / Verification
- `tsc --noEmit`, `eslint` (0 warnings), `next build` all PASS.
- Auto-detection, privacy defaults, and two-pass relationship logic verified statically. Live runtime (real Notion workspace + the 8 example tables + relationship resolution) PENDING the service-role key + a shared Notion workspace.

#### Issues Found
- RM-007 resolved. New RM-012 (single-slot field mapping ignores extra DM-note fields — minor). The prompt's full relationship-type vocabulary is mapped onto the existing CHECK set rather than expanding the enum (deliberate, no-migration; note as potential future RM-013).

#### Remaining Work
- Live runtime QA of discovery/import against a real Notion workspace; optional richer relationship-type vocabulary + multi-field DM-notes concatenation.

#### Rollback Notes
- Revert `lib/notion/auto-map.ts` (new), `searchNotionDatabases` in client.ts, `syncTablesTwoPass` + typed-relation change in sync-core, `discoverNotionTables`/`autoImportNotionTables`/`adventure_id` in notion-mappings.ts, `NotionTableDiscovery.tsx` (new), the mappings-page wiring, and the naming string edits. No schema/data implications.

---

### Phase 9 - Regression QA
Status: Partial — static/code regression PASS; live runtime QA PENDING (2026-06-13)

#### Pre-Phase Review
- **Reviewed:** all phase logs (0–8), the Files Changed / Behavior Changes / Open Issues tables. Built the regression checklist from them.
- **Open issues going in:** RM-007 (mapping Adventure-assignment UI), RM-010 (display-name overrides), RM-011 (schema graph density) — all non-blocking enhancements.
- **Constraint:** this environment has no live Supabase/Notion/auth session, so runtime gameplay/sync/privacy checks can't be executed; they are recorded as PENDING with their prerequisites.

#### Build Verification
- `tsc --noEmit` PASS · `eslint` PASS (0 warnings) · `next build` PASS (all routes, incl. `/codex`, `/codex/notion`, `/codex/sync`, `/codex/schema`, and every live-map/encounter/action route).

#### Codex UI results (static)
- Table-card layout, entry sub-cards, table-based grouping, correct entity type (from mapping, not per-row default), relationship drawer (grouped-by-type), schema view, Edit=Companion-settings-only (Notion content read-only) + separate Open in Notion, hidden manual creation (Advanced section retained), stale/unmapped excluded from active cards — all present in code and building. Visual/runtime confirmation pending a session.

#### Notion Sync results (static)
- Dashboard in left nav; Sync all / Sync selected / per-table Sync wired to existing actions; status/mapping/lifecycle derivations present; removed-mapping records routed to stale section; `wipeLocalCodexData` scoped per-Adventure, cascade-only, never calls Notion, preserves mappings; re-sync path intact. Live sync behavior pending the service-role key + a shared Notion DB.

#### Privacy verification (static)
- DM-only `campaign_docs` (RLS); players read only the safe projection/RPC; reveals explicit (Phase 4); Notion content read-only in Companion; Notion token server-only; no raw ids/JSON/API-error text in any Codex UI surface (titles/labels only). Two-account runtime confirmation pending.

#### Live Engine regression (code-level)
- The remaster (phases 0–8) modified only: `docs/*`, migration 031, `lib/types/database.ts` (additive `adventure_id` + Notion types), `lib/notion/sync-core.ts` (codex sync), `lib/actions/notion-sync.ts` / `notion-mappings.ts`, `lib/codex/options.ts`, `components/nav/Sidebar.tsx` (active-match only), `components/codex/*`, and `app/(app)/campaigns/[id]/codex/*`.
- **No live-engine components were modified** (MapEditor, MapCanvas, PlayerMapView, ActionCenter/DM queue/roll popups, encounters, party-messages, useTokenRealtime). Shared edits are additive (new nullable columns/types) and the full app type-checks + builds. → No expected regression to map loading, token movement, action requests, DM approvals/denials, dice/manual rolling, roll results, combat/initiative/HP, party alerts, whispers, map reveal/hide, or mobile menus. Runtime confirmation still requires a live session.

#### Acceptance Criteria assessment
Met (verified statically / by construction): Codex no longer a flat list; one card per mapped table; entries under the correct table; future mapped tables appear automatically; characters not mislabeled as Locations; manual creation hidden (advanced-only retained); Notion Sync in left nav; delete requires selecting an Adventure; delete never touches Notion; removed mappings don't leave records in active Codex; relationship links obvious; schema visualization present; Edit = Companion settings only; Open in Notion separate; DM-only/player-safe/revealed states clear; tracking doc created + updated every phase; docs updated; build/lint/typecheck pass.
Pending runtime: "existing live gameplay features still work" — code-level no-regression confirmed; live playtest outstanding.

#### Files Changed
- None in Phase 9 (QA only) beyond this tracking document.

#### Issues Found
- No new issues. RM-007 / RM-010 / RM-011 remain open as non-blocking enhancements.

#### Remaining Work / Recommendations
1. Apply migrations 024–031 in Supabase; set `SUPABASE_SERVICE_ROLE_KEY`; connect a Notion integration + share the campaign databases.
2. Run the live checklist: DM+2 players across desktop/tablet/mobile — Codex grouping, drawers, schema, reveals, per-Adventure wipe + re-sync, and the full live-engine flow.
3. Optional follow-ups: RM-007 (Adventure-assignment on mappings → populates per-Adventure wipe buckets), RM-010 (display-name/icon overrides), RM-011 (richer schema layout).

#### Rollback Notes
- No code changed in Phase 9; nothing to roll back.
