# Adventure Codex + Notion Sync — Remaster UX/Data Spec (Phase 1)

Specification only. No app behavior, UI, code, or schema is changed by this
document. It is the blueprint for Phases 2–9. Tracking lives in
[AdventureCodex_Remaster_Tracking.md](AdventureCodex_Remaster_Tracking.md); the
Notion source model is [Notion_Campaign_Database_Model.md](Notion_Campaign_Database_Model.md).

## Principles (locked)

- **Notion owns campaign content** (Characters, Bosses & Hostile Enemies,
  Locations, Sub-Locations, Storylines/Sessions, Rumors, Side Quests, Factions,
  Items/Loot, future tables). Companion never edits Notion content.
- **Companion owns** synced display cache, display settings, visibility,
  player-safe/revealed state, live-object links, and all live gameplay state.
- **Each mapped Notion table = one top-level Codex card.** Each record = one
  expandable sub-card. New mapped tables appear as new cards with no redesign.
- Manual creation is hidden from the normal UI (advanced/admin only if kept).
- Local synced data can be deleted **by selected Adventure only**, never
  touching Notion.

---

## Required data-model additions (implemented in later phases, NOT Phase 1)

These are prerequisites the spec depends on; they are recorded here and tracked
as RM-001/RM-002. No migration is written in Phase 0/1.

1. **`campaign_docs.adventure_id`** — nullable `UUID REFERENCES adventures(id) ON DELETE SET NULL`, indexed. Lets a synced record belong to an Adventure so cards can show the Adventure and the wipe can scope by it.
2. **`notion_sync_mappings.adventure_id`** — same, so a mapped table (and the docs it syncs) is associated with an Adventure. Sync stamps `adventure_id` onto upserted docs from the mapping.
3. **Wipe action** — a DM-gated server action `wipeLocalCodexData(campaignId, adventureId, confirmationPhrase)` that deletes only `campaign_docs` (cascades to `campaign_doc_links` / publications) for that `(campaign, adventure)` and the related `notion_sync_logs`/`notion_sync_mappings` cache rows if chosen. Never calls Notion. Requires the exact confirmation phrase server-side.
4. **Optional `campaign_docs.display_name_override`** (nullable text) — Companion-side display name without touching the synced Notion title.

**Interim behavior until `adventure_id` exists:** cards group by mapped database;
the Adventure selector and wipe operate at **campaign scope** (or per mapped
database), clearly labeled "whole campaign" until Adventure scoping ships. The
delete flow must not be enabled in a way that implies Adventure precision it
can't yet deliver.

---

## 1. Adventure Codex home (table-card)

Card-based home. **One top-level card per mapped Notion table** (one
`notion_sync_mappings` row), plus two synthetic cards:

- **Unmapped / Stale** — Notion-sourced docs whose `source_database_id` has no
  current mapping (orphaned after a mapping was removed).
- **Local Manual Records** (Advanced/Admin only) — `source='manual'` docs.

### Table card contents
- Notion table name (`notion_database_name`)
- Friendly display name (Companion-side, editable in Manage Mapping)
- Icon (by entity type / `doc_type`)
- `Source: Notion` badge
- Adventure name (from `adventure_id` once available; else "Whole campaign")
- Mapping status (Mapped / Disabled / Missing)
- Last synced timestamp (max `last_synced_at` of its docs / last log)
- Number of synced records
- Number of stale/unmapped records (for the synthetic card)
- Number of linked live objects
- Number of player-safe records
- Number of revealed records
- Sync status (Synced / Needs sync / Failed / Partial)
- Error state (clean message) if applicable

### Table card actions
- View Entries / Expand / Collapse
- Sync Table (`syncNotionDatabase`)
- Open in Notion (the database URL)
- Manage Mapping (→ `/codex/notion`, or inline drawer)
- View Relationships (→ schema view filtered to this table)
- Edit Display Settings (friendly name, icon, card visibility)

`Edit` / display settings never edit Notion content.

---

## 2. Entry sub-cards

Expanding a table card lists its records as sub-cards.

Each entry sub-card shows:
- Record title (display-name override if set, else synced title)
- **Correct entity type** — derived from the owning table card's mapping
  `doc_type`, NOT the per-row create-form default. This fixes the
  character-shows-as-Location class of bugs.
- Source badge (Notion / Local Manual)
- Visibility badge (DM-only / Player-safe / Revealed)
- Sync status badge (Synced / Needs sync / Failed / Broken link)
- Linked records count (doc↔doc)
- Linked live object count (doc↔live-object)
- Open in Notion button
- Edit Display Settings button (opens the Companion drawer)
- View Relationships button

Entity-type rule: Characters never render as Location, Locations never as
Character, Sub-Locations under their own table card only.

---

## 3. Edit drawer (Companion settings only)

Opening Edit on a card/sub-card opens a right-side Companion settings drawer.
It edits Companion metadata only:

- Display name override
- Visibility mode (DM-only / Player-safe / Revealed)
- Player-safe / revealed status + reveal scope (reuse Phase 4 reveal controls)
- Linked live map object
- Linked map
- Linked token
- Linked map object
- Linked room / sub-location node
- Linked quest marker
- Tags / display badges
- Companion-only notes (if allowed)
- Advanced/admin-only metadata (source ids shown read-only here only)

Must include a separate **Open in Notion** button. For Notion-sourced docs,
title/summaries are shown read-only (mirrors of the synced content) with a note
that they are edited in Notion. Saving writes only Companion columns
(`visibility`, `reveal_state`, `display_name_override`, links) — never the synced
content fields, never Notion.

---

## 4. Notion Sync Dashboard (left-nav page)

Promote the existing `/campaigns/[id]/codex/sync` to a **DM-only left-nav item**
("Notion Sync"). It shows:

- Adventure selector (once `adventure_id` exists; else campaign scope label)
- Sync status + connection state
- Mapped tables (with per-table sync + status)
- Unmapped / stale local records
- Broken Notion links
- Sync logs (`notion_sync_logs`, recent N)
- Last sync times
- Failed sync count
- **Delete local synced data** button (opens the wipe flow)
- Sync all mapped tables / Sync selected table
- Manage mappings (→ `/codex/notion`)

Players never reach this page (DM-only route + nav gate).

---

## 5. Delete local synced data flow

Starts from the Sync Dashboard. Steps:

1. Click **Delete local synced Notion data**.
2. Modal asks **which Adventure** to wipe (selector; "Whole campaign" only while
   `adventure_id` is unavailable, clearly labeled).
3. Preview **exactly what will be deleted locally** (counts: synced docs, links,
   reveals, logs) for the selection.
4. Explicit notice that **Notion will not be touched**.
5. Require the confirmation phrase **`DELETE LOCAL CODEX DATA`** (checked
   server-side).
6. On confirm, delete only Companion-side synced/cache data for that selection.
7. Leave the Notion database untouched.

### Modal copy
- **Title:** Delete local synced Notion data?
- **Body:** Choose which Adventure you want to clear from the Companion app. This
  only removes local synced Codex/cache records for that Adventure. It does not
  delete or modify anything in Notion.
- **Confirmation phrase:** `DELETE LOCAL CODEX DATA`

Server rules: DM-only; phrase must match exactly; scope strictly to the selected
`(campaign[, adventure])`; no Notion API call of any kind in this path.

---

## 6. Manual record handling

- Remove/hide manual creation from the normal Codex screen (`CreateDocCard`).
- If retained, only under: Advanced/Admin-only tools, emergency session notes,
  legacy local-data review, or migration/debug area.
- Manual records carry a clear **Local Manual Record** badge everywhere and live
  in their own card/bucket — never silently mixed with Notion records.

---

## 7. Schema / relationship visualization

A Supabase-style schema view (DM-only):

- Tables as nodes/cards (mapped Notion tables + synthetic buckets)
- Relations as lines/arrows between nodes
- Relationship names (from `campaign_doc_links.relationship_type`; richer Notion
  vocabulary if added later)
- Record counts per table
- Mapping status
- Source table (Notion DB name)
- Companion entity type (`doc_type`)
- Live object link counts

Built from mapped Notion tables + Companion relationship records
(`campaign_doc_links`). **Mobile fallback:** a grouped table/list (tables with
their relationship rows) instead of the graph.

---

## Phase-by-phase mapping (how this spec lands)

- **Phase 2** — add the DM-only "Notion Sync" left-nav item (Sidebar + MobileNav) pointing at the existing dashboard route.
- **Phase 3** — hide/gate `CreateDocCard`; add Local Manual Record badges; source badges on cards.
- **Phase 4** — table-card Codex home + entry sub-cards; fetch mappings alongside docs; group by `source_database_id`; entity type from the table card; Unmapped/Stale + Local Manual buckets. Likely the migration adding `adventure_id` (+ `display_name_override`).
- **Phase 5** — Companion edit drawer (settings/links/visibility) with Open in Notion; relationship view per entry.
- **Phase 6** — schema/relationship visualization + mobile fallback.
- **Phase 7** — stale/unmapped cleanup + the delete-by-Adventure wipe action and flow.
- **Phase 8** — UI/mobile polish.
- **Phase 9** — full regression QA.

Each phase must follow the pre-/post-phase tracking rules in the tracking doc.
