# Adventure Codex and Notion Bridge Specification

> **Source data model:** the user's actual Notion campaign structure (entity
> databases + the relationship graph that drives mapping/sync) is documented in
> [docs/Notion_Campaign_Database_Model.md](Notion_Campaign_Database_Model.md).
> Read it before implementing mapping or sync changes.

## Phase 1 Status

Specification only. No database tables, migrations, application code, UI, packages, or Notion API integration have been created in this phase.

## Phase 2 Status

Internal Adventure Codex foundation implemented. Notion API sync is still intentionally out of scope.

Added foundations:

- `campaign_docs`
- `campaign_doc_links`
- `campaign_doc_publications`
- `codex_reveals`
- Player-safe RPC: `get_player_visible_campaign_docs(p_campaign_id UUID)`
- DM dashboard route: `/campaigns/[id]/codex`
- Player revealed-info view on the same route

## Phase 2 Database Implementation

### `campaign_docs`

Stores app-owned Codex records and future synced documentation. This table contains DM-only fields, private source metadata, and sync error state, so players cannot select it directly.

Fields added:

- `id`
- `campaign_id`
- `source`
- `source_page_id`
- `source_url`
- `source_database_id`
- `doc_type`
- `title`
- `dm_summary`
- `player_summary`
- `dm_notes`
- `tags`
- `status`
- `visibility`
- `reveal_state`
- `last_synced_at`
- `sync_status`
- `sync_error`
- `created_by`
- `created_at`
- `updated_at`

### `campaign_doc_links`

Stores Codex-to-Codex links and Codex-to-live/prep object links.

Fields added:

- `id`
- `campaign_id`
- `source_doc_id`
- `target_doc_id`
- `relationship_type`
- `live_object_type`
- `live_object_id`
- `live_object_label`
- `visibility`
- `created_by`
- `created_at`
- `updated_at`

### `campaign_doc_publications`

Safe player-readable projection maintained by trigger from `campaign_docs`.

This table exists because Supabase realtime sends full rows. It contains no DM notes, source page IDs, source URLs, source database IDs, sync errors, or DM-only summaries.

Fields added:

- `doc_id`
- `campaign_id`
- `doc_type`
- `title`
- `player_summary`
- `tags`
- `status`
- `visibility`
- `reveal_state`
- `updated_at`

### `codex_reveals`

Tracks explicit DM reveals.

Fields added:

- `id`
- `campaign_id`
- `doc_id`
- `revealed_to_scope`
- `revealed_to_player_id`
- `revealed_by`
- `revealed_at`
- `reveal_message`
- `reveal_type`

## Phase 2 Security Behavior

RLS rules:

- `campaign_docs`: DM-only all operations.
- `campaign_doc_links`: DM-only all operations.
- `codex_reveals`: DM-only all operations.
- `campaign_doc_publications`: campaign members can select safe published rows only.

Player read path:

- Players do not query `campaign_docs`.
- Players read safe fields through `get_player_visible_campaign_docs`.
- Player realtime refresh listens to `campaign_doc_publications`, not private doc rows.

DM read path:

- DMs can read and mutate full Codex records.
- DMs can manage links and reveals.
- DMs can see source/sync metadata for future Notion integration.

## Phase 2 UI

Added `/campaigns/[id]/codex`.

DM view:

- View Codex records.
- Filter by type.
- Search by title, tag, status, DM summary, player summary, and notes.
- Open a Codex record.
- See DM-only fields.
- See player-safe fields.
- Create a manual Codex record.
- Edit a manual Codex record.
- Set visibility.
- Reveal a record to the party.
- Link two Codex records.
- See linked Codex records.
- See linked live/prep object rows when they exist.

Player view:

- Shows a basic Revealed Info area.
- Reads only player-safe fields.
- Does not show DM notes, source IDs, Notion URLs, sync errors, or raw debug IDs.

Navigation:

- Desktop campaign nav includes Adventure Codex / Revealed Info.
- Mobile campaign nav includes Codex / Info.

## Phase 2 Realtime

Added realtime-safe publication for:

- `campaign_docs` for DM subscribers only through RLS.
- `campaign_doc_links` for DM subscribers only through RLS.
- `codex_reveals` for DM subscribers only through RLS.
- `campaign_doc_publications` for member-safe player refresh.

The Codex workspace uses the existing debounced `useRealtimeRefresh` pattern. Runtime map movement/combat/dice/fog state remains separate and continues to use the live engine tables and hooks.

## Phase 2 Notion Preparation

This phase prepares for Notion sync by adding source metadata fields and sync state:

- `source`
- `source_page_id`
- `source_url`
- `source_database_id`
- `last_synced_at`
- `sync_status`
- `sync_error`

No Notion API calls exist yet. Future sync should write Codex docs only and should never write live gameplay state.

## Phase 3 Status

Live/prep object linking implemented. Live engine objects now link to Adventure Codex records, never directly to Notion.

Added behavior:

- DM live map editor can link Codex docs to the selected live map.
- DM live map editor can link Codex docs to selected tokens and map objects.
- DM prepared map editor can link Codex docs to prepared maps.
- Player live map selected-token/object panel can show only safe published Codex summaries for visible linked objects.
- DM can remove links from live/prep object panels.
- DM can reveal a linked doc summary from a live/prep object panel.

## Phase 3 Live Object Link Rules

Supported link targets now exercised by services/UI:

- Map -> Location or Map Note doc through `live_object_type = 'map'`.
- Prepared map -> Location or Session doc through `live_object_type = 'prepared_map'`.
- Token -> Character, NPC, Boss, or Hostile Enemy doc through `live_object_type = 'token'`.
- Map object -> Item, Loot, Object Note, or Location doc through `live_object_type = 'object'`.

Supported by service/schema for future UI:

- Quest marker -> Quest doc.
- Handout -> Handout doc.
- Character sheet -> Character doc.

## Phase 3 Safe Link Projection

Added `campaign_doc_link_publications`.

This table is a player-safe realtime projection of links between published Codex docs and currently visible live map objects. It intentionally excludes:

- hidden token/object links,
- inactive map links,
- prepared map links,
- DM-only link rows,
- links to unpublished/DM-only docs.

Triggers keep this projection synced when:

- a Codex doc becomes player-safe/revealed or private again,
- a Codex link is inserted/updated/deleted,
- a token is hidden/revealed,
- the active map changes.

## Phase 3 DM Experience

When the DM selects a live map, token, or object, the detail/side panel can show:

- linked Codex docs,
- doc type,
- source,
- DM-only summary,
- DM notes,
- player-safe summary,
- open Codex link,
- reveal summary control,
- remove link control,
- search/attach Codex doc control.

## Phase 3 Player Experience

When a player clicks a visible token/object, the selected-card can show revealed info from linked Codex records.

Players never see:

- DM notes,
- DM-only summaries,
- private source URLs,
- raw Notion IDs,
- source database IDs,
- sync errors,
- links attached to hidden tokens/objects,
- links attached to inactive maps.

## Phase 3 Realtime

DM linking changes update through `campaign_doc_links` and route refresh/realtime.

Player linked-info updates use:

- `campaign_doc_publications`
- `campaign_doc_link_publications`
- existing live map `useRealtimeRefresh`

If the DM links a visible, player-safe/revealed doc to a visible token/object during a live session, the player map route refreshes without manual browser refresh. If the doc or object is private/hidden, no player-safe link projection is published.

## Architecture Principle

The Adventure Codex is an app-owned campaign documentation cache. Notion is an optional upstream writing and prep source. The live gameplay engine remains authoritative for maps, tokens, movement, combat, dice, action approvals, HP, initiative, fog, reveal permissions, and active session state.

Required data flow:

1. DM writes or edits campaign material in Notion.
2. A future Notion sync adapter maps Notion pages into Adventure Codex records.
3. Adventure Codex stores normalized, app-safe documentation in Supabase.
4. Codex records link to app objects such as adventures, chapters, maps, tokens, quests, NPCs, handouts, and encounters.
5. Supabase realtime notifies permitted clients that Codex-linked data changed.
6. DM screens and player-safe revealed panels refresh through the app database layer.

Forbidden data flow:

1. Notion must not write directly to live gameplay tables.
2. Notion must not change token position, HP, AC, initiative, fog, movement, dice, action approvals, or combat state.
3. Raw Notion payloads must not be shown to players.

## Supported Document Types

The Adventure Codex should support these `doc_type` values:

- `adventure`
- `chapter`
- `session`
- `location`
- `sub_location`
- `character`
- `npc`
- `boss`
- `hostile_enemy`
- `faction`
- `rumor`
- `side_quest`
- `main_quest`
- `item`
- `loot`
- `handout`
- `map_note`
- `object_note`

## Core Document Fields

Each Codex document should support:

- Title
- Type
- Source
- Source URL
- Source page ID
- DM-only summary
- Player-safe summary
- Full DM notes
- Tags
- Status
- Related docs
- Linked live objects
- Visibility state
- Reveal state
- Last synced timestamp
- Last sync status
- Sync error state
- Created timestamp
- Updated timestamp

## Database Model

This section defines the planned schema. These tables should be added in a future migration, not in this phase.

### `campaign_docs`

Stores normalized app-safe documentation records for one campaign.

Recommended fields:

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | Generated by app database. |
| `campaign_id` | UUID FK | References `campaigns.id`; required for RLS. |
| `source` | TEXT | `manual`, `notion`, `import`, or future source. |
| `source_page_id` | TEXT | External page id. DM-only in UI. |
| `source_url` | TEXT | External source URL. DM-only unless explicitly made safe. |
| `source_database_id` | TEXT | External database id. DM-only in UI. |
| `doc_type` | TEXT | One supported document type above. |
| `title` | TEXT | Required. |
| `dm_summary` | TEXT | DM-only synopsis. |
| `player_summary` | TEXT | Player-safe synopsis only. |
| `dm_notes` | TEXT | Full private notes. Never player-visible. |
| `tags` | TEXT[] | Search and filtering. |
| `status` | TEXT | Suggested values: `draft`, `ready`, `active`, `archived`, `stale`. |
| `visibility` | TEXT | Suggested values: `dm_only`, `player_safe`, `revealed`. Defaults to `dm_only`. |
| `reveal_state` | TEXT | Suggested values: `unrevealed`, `partially_revealed`, `revealed`, `retracted`. Defaults to `unrevealed`. |
| `last_synced_at` | TIMESTAMPTZ | Last successful source sync for this doc. |
| `sync_status` | TEXT | Suggested values: `never`, `success`, `failed`, `partial`, `conflict`. |
| `sync_error` | TEXT | DM-only sync error summary. |
| `created_at` | TIMESTAMPTZ | Database timestamp. |
| `updated_at` | TIMESTAMPTZ | Database timestamp. |

Important privacy recommendation:

If `campaign_docs` is published to realtime or selectable by players, it should not contain `dm_summary`, `dm_notes`, private source URLs, raw Notion IDs, or sync errors in player-readable rows. The safer design is either:

- split public shell fields from DM-only detail fields, or
- keep `campaign_docs` DM-only and expose a player-safe view/table for revealed content.

The first future migration should decide this explicitly before implementation.

### `campaign_doc_links`

Stores relationships between Codex documents and between Codex documents and live/prep app objects.

Recommended fields:

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | Generated by app database. |
| `campaign_id` | UUID FK | References `campaigns.id`; required for RLS. |
| `source_doc_id` | UUID FK | References `campaign_docs.id`; relationship origin. |
| `target_doc_id` | UUID FK nullable | References another Codex doc. |
| `relationship_type` | TEXT | One relationship type below. |
| `live_object_type` | TEXT nullable | App object kind, such as `map`, `token`, `prepared_map`, `quest`, `npc`, `location`, `handout`, `encounter`, `chapter`, `adventure`. |
| `live_object_id` | UUID nullable | App object id. |
| `visibility` | TEXT | `dm_only`, `player_safe`, `revealed`. Defaults to `dm_only`. |
| `created_at` | TIMESTAMPTZ | Database timestamp. |
| `updated_at` | TIMESTAMPTZ | Database timestamp. |

Relationship types:

- `appears_in`
- `located_in`
- `contains`
- `related_to`
- `member_of`
- `enemy_in`
- `npc_in`
- `rumor_for`
- `quest_hook`
- `loot_in`
- `map_for`
- `object_doc`
- `token_doc`
- `faction_member`
- `session_topic`

Link semantics:

- Doc-to-doc links describe campaign knowledge relationships.
- Doc-to-live links attach documentation to app objects.
- Links must not grant player access by themselves. A player-visible link is only valid if both the link and the target doc/object are player-visible or already revealed.

### `codex_reveals`

Tracks what has been revealed to players. This should be the audit trail for player access decisions.

Recommended fields:

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | Generated by app database. |
| `campaign_id` | UUID FK | References `campaigns.id`. |
| `doc_id` | UUID FK | References `campaign_docs.id`. |
| `revealed_to_scope` | TEXT | `party`, `player`, `group`, or future scope. |
| `revealed_to_player_id` | UUID nullable | Specific user/player reveal. |
| `revealed_to_party_id` | UUID nullable | Future party/group id. |
| `revealed_by` | UUID | DM user id. |
| `revealed_at` | TIMESTAMPTZ | Reveal timestamp. |
| `reveal_message` | TEXT | Optional player-facing reveal note. |
| `reveal_type` | TEXT | Suggested values: `manual`, `map_object`, `handout`, `session`, `sync_safe`. |

Reveal rules:

- A doc can remain DM-only while a player-safe summary is revealed.
- Reveals should expose only `player_summary`, not `dm_summary` or `dm_notes`.
- Retraction should be modeled separately or by a `retracted_at` field in a later design if needed.

### `notion_sync_mappings`

Stores how Notion fields map to Codex fields for a campaign.

Recommended fields:

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | Generated by app database. |
| `campaign_id` | UUID FK | References `campaigns.id`. |
| `notion_database_id` | TEXT | Source database id. |
| `notion_database_name` | TEXT | DM-readable label. |
| `doc_type` | TEXT | Target Codex document type for this database. |
| `title_property` | TEXT | Notion property name for title. |
| `dm_summary_property` | TEXT | Notion property name for DM summary. |
| `player_summary_property` | TEXT | Notion property name for player-safe summary. |
| `tags_property` | TEXT | Notion property name for tags. |
| `status_property` | TEXT | Notion property name for status. |
| `relation_properties` | JSONB | Mapping from Notion relation fields to Codex relationship types. |
| `enabled` | BOOLEAN | Whether sync should use this mapping. |
| `created_at` | TIMESTAMPTZ | Database timestamp. |
| `updated_at` | TIMESTAMPTZ | Database timestamp. |

Mapping guidance:

- All imported documents default to `visibility = dm_only`.
- A Notion checkbox or select may mark content as player-safe, but it should not automatically reveal content unless the DM enables that behavior explicitly.
- Relation mappings must resolve to Codex docs first, then to live object links only when the app can identify a safe target.

### `notion_sync_logs`

Stores sync attempts and results.

Recommended fields:

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | Generated by app database. |
| `campaign_id` | UUID FK | References `campaigns.id`. |
| `source_page_id` | TEXT nullable | Notion page id when page-specific. |
| `source_database_id` | TEXT nullable | Notion database id when database-specific. |
| `sync_type` | TEXT | `manual`, `scheduled`, `webhook`, `backfill`, `page`. |
| `status` | TEXT | `started`, `success`, `failed`, `partial`, `skipped`. |
| `message` | TEXT | DM-only message. Never player-visible. |
| `started_at` | TIMESTAMPTZ | Sync start. |
| `finished_at` | TIMESTAMPTZ | Sync end. |

## UI Areas

### Adventure Codex Dashboard

DM-facing campaign documentation center.

Required capabilities:

- Search by title, type, tag, status, source, and relation.
- Filter by doc type and visibility.
- Show sync status and stale/error indicators.
- Show manual docs and synced Notion docs together.
- Provide safe actions: create manual doc, edit app-owned fields, reveal player summary, link to live object, inspect sync metadata.

### Codex Record Drawer

Contextual drawer for viewing and editing one Codex record.

DM mode should show:

- Title, type, status, tags.
- DM summary.
- Player-safe summary.
- Full DM notes.
- Related docs.
- Linked live/prep objects.
- Source metadata and sync status.
- Reveal controls.

Player mode should show only:

- Title if revealed or player-safe.
- Player-safe summary.
- Revealed relationships.
- Linked visible objects.
- Reveal message, if any.

### Token Linked-Doc Panel

For live and prepared tokens.

DM mode:

- List linked Codex docs.
- Add/remove token-doc links.
- Create object note or token doc from selected token.
- Show hidden linked docs.
- Reveal selected player-safe summary.

Player mode:

- Show only linked docs that are both revealed/player-safe and attached to a visible token/object.
- Never show source URLs, Notion IDs, sync errors, or DM notes.

### Map Linked-Doc Panel

For live maps and prepared maps.

DM mode:

- Link map notes, locations, sub-locations, session topics, loot, and factions.
- Show docs attached to the map or prepared source.
- Reveal safe summaries for visible map areas.

Player mode:

- Show only revealed map/location summaries and content tied to visible/revealed map objects.

### Object Linked-Doc Panel

For doors, traps, notes, chests, loot, levers, portals, and custom map objects.

DM mode:

- Link object notes, loot docs, item docs, rumor docs, and quest hooks.
- Separate object gameplay state from documentation.

Player mode:

- Show only player-safe object description and revealed Codex summary.
- No hidden object docs until the object is visible and explicitly revealed.

### DM Reveal Controls

Reveal controls should be explicit and auditable.

Controls:

- Reveal player summary to party.
- Reveal player summary to one player.
- Mark doc as player-safe but not revealed.
- Retract/hide future display if the model supports retraction.
- Add reveal message.
- Preview exactly what players will see.

### Player Revealed-Info Panel

Player-facing panel for discovered campaign knowledge.

Should include:

- Revealed NPCs, locations, rumors, quests, items, handouts, and map notes.
- Player-safe summaries only.
- No source metadata.
- No raw linked object ids.
- No sync status or errors.

### Codex Search

DM search:

- Full search across title, summaries, DM notes, tags, type, status, and source.

Player search:

- Search only revealed/player-safe title and player summary fields.

### Codex Relationship Graph/List

Initial implementation should prefer a list/table over a visual graph.

DM list:

- Relationship type.
- Source doc.
- Target doc or live object.
- Visibility.
- Last updated.

Future graph:

- Safe for DM only at first.
- Player graph requires strict filtering so hidden relationship existence is not leaked.

### Sync Status Indicators

DM-only indicators:

- Synced.
- Stale.
- Failed.
- Partial.
- Conflict.
- Never synced.

Player UI must never show sync status or API errors.

## Privacy Model

Default:

- Every Codex document defaults to DM-only.
- Every Notion-synced document defaults to DM-only.
- Every relationship/link defaults to DM-only.

Players can see:

- Player-safe summary.
- Revealed handouts.
- Revealed rumors.
- Revealed item, location, NPC, quest, and map summaries.
- Content tied to visible map objects, but only when the Codex doc/link is player-safe or revealed.

Players must never see:

- DM notes.
- DM-only summaries.
- Hidden objects.
- Hidden tokens.
- Private Notion links.
- Raw Notion IDs.
- Source database IDs.
- API errors.
- Sync logs.
- Unrevealed secrets.
- Hidden relationship existence.
- Private map/prep notes.

Recommended enforcement:

- Use Supabase RLS as the primary boundary.
- Do not rely on UI filtering for privacy.
- Do not publish DM-only tables to Supabase realtime.
- Avoid placing DM-only columns on any table that players can select or receive through realtime.
- If a single table contains mixed public and private columns, add a player-safe view or split detail tables before publishing to realtime.

## Realtime Model

Codex updates should flow through the app database layer after sync.

Realtime should update:

- DM Codex dashboard.
- DM Codex record drawer.
- DM map drawers.
- Linked token and object panels.
- Player revealed-info panel, if the doc is already visible.
- Casting/table-safe view, if applicable.

Realtime should not:

- Let Notion directly control gameplay mechanics.
- Update token position from Notion.
- Update HP, AC, initiative, dice, action approvals, combat state, fog, or movement from Notion.
- Broadcast DM-only Codex details.
- Broadcast sync logs or API errors to players.

Recommended realtime pattern:

- Use `useRealtimeRefresh` for Codex dashboard/drawers and linked-doc panels.
- Use existing `useTokenRealtime` only for runtime map state.
- Publish only player-safe Codex shells and link rows if players can subscribe.
- Keep Notion mapping/log/detail rows unpublished and DM-only.

## Future Migration Plan

Phase 2: Internal Codex database

- Add Codex tables or a privacy-split equivalent.
- Add RLS for DM-only, player-safe, and revealed reads.
- Add indexes for campaign/type/status/tag/source lookups.
- Add realtime publication only for safe rows.
- Update generated/manual TypeScript database types.

Phase 3: Internal Codex actions

- Add server actions for manual Codex docs.
- Add relation/link management.
- Add reveal actions and reveal audit logging.
- Add tests for RLS behavior and server action authorization.

Phase 4: DM Codex UI

- Add Adventure Codex dashboard.
- Add Codex record drawer.
- Add search, filters, relationship list, and sync status indicators.

Phase 5: Live object linking

- Add token/map/object linked-doc panels.
- Connect Codex docs to prepared maps and live maps without mutating gameplay fields.
- Add player-safe display for visible/revealed linked docs.

Phase 6: Notion mapping configuration

- Add Notion sync mapping UI.
- Store property mappings.
- Validate mappings before sync.
- Keep all imported docs DM-only by default.

Phase 7: Notion sync adapter

- Pull Notion databases/pages into Codex records.
- Log sync attempts.
- Update Codex docs and links.
- Detect conflicts and stale records.
- Never write to live runtime tables.

Phase 8: Full QA and hardening

- Two-browser privacy QA.
- Realtime QA.
- Sync failure QA.
- Rollback QA.
- Documentation updates and final signoff.

## Phase 4 — Player-Safe Reveal System (Implemented)

Phase 4 makes Codex documentation useful at the table: the DM can push a
player-safe Codex doc to players during a live session and they receive it
instantly, without a manual refresh, while DM-only content stays private.

### Reveal model

A reveal is an append-only `codex_reveals` record plus a player notification.
The reveal never copies DM notes anywhere — players only ever receive the
`player_summary`, the doc title/type, tags, and the DM's optional message.

Two reveal entry points exist, both routed through the same actions:

- From the **Codex dashboard** record panel ("Reveal to Players" section).
- From a **live/prep object** linked-doc panel (map, token, object, prepared
  map) — the per-doc "Reveal player-safe summary" control.

A doc cannot be revealed until it has a non-empty `player_summary`; the control
is disabled and the server action rejects it otherwise.

### Visibility scopes

| Scope | Behaviour |
|-------|-----------|
| **All players** (`party`) | Inserts a party-scope reveal, flips the doc to `visibility = revealed` (which publishes the safe projection to every player via `campaign_doc_publications`), and — for live-object reveals — flips the matching link to `revealed` so it appears in the shared map-object panel. Notifies all players. |
| **One player** (`player`) | Inserts a player-scope reveal targeted at one `revealed_to_player_id`. **Does not** change global doc visibility or publish the doc/link to the party. That player alone gains access via `get_player_visible_campaign_docs` (which matches their reveal row), and only they are notified. |

Scopes deferred until the underlying features exist (documented, not built):

- **Party group / split-party group** — the app has no party-subgroup model
  yet; when added, a `revealed_to_party_id` column + scope value slots in.
- **Casting / table view** — Cast View is not implemented (only
  `docs/CAST_VIEW_REQUIREMENTS.md` + a reserved `tokens.visible_on_cast` flag);
  reveals are cast-safe by construction (player-safe fields only) and will
  surface there automatically once Cast View reads the safe projection.

### Realtime behaviour (no refresh required)

- **Party reveal → all players:** doc visibility flips → publication-sync
  trigger upserts `campaign_doc_publications` (and `campaign_doc_link_publications`
  for visible linked objects) → players subscribed via `useRealtimeRefresh`
  re-run the server query and the Revealed Info panel / map-object panel update.
- **Single-player reveal → one player:** the doc is *not* published. Instead the
  targeted player now receives the `codex_reveals` INSERT over realtime (migration
  025 adds a member-scoped SELECT policy so a player sees party reveals + their
  own targeted reveals), which triggers a refetch of
  `get_player_visible_campaign_docs`.
- **Popup notification:** delivered over the existing `party_messages` pipeline
  with a dedicated `codex_reveal` message type, rendered by the global
  `PartyMessageListener`. Party reveals target all player ids; single-player
  reveals set `recipient_user_id` so RLS limits delivery to that player.
- **Updates to already-revealed docs:** editing a revealed doc's
  `player_summary` re-fires the publication trigger, so player panels update
  live for content they are already allowed to see.
- **DM confirmation:** the DM is the message sender (filtered out of the popup)
  and instead gets inline "Revealed to …" feedback in the reveal control.

### Privacy safeguards

- Notification bodies are generic per-type lines ("New location information is
  available.", "The DM revealed a rumor.", …) plus the DM's optional note —
  never doc ids, Notion ids, relation ids, raw JSON, DM notes, or DB errors.
- `codex_reveals` insert/update/delete stays DM-only; the added SELECT policy is
  scoped so a player can never read another player's targeted reveal, and the
  row carries no DM-secret fields.
- Single-player reveals never touch `campaign_doc_publications`, so a secret
  shared with one PC is not leaked to the party table.
- Notification delivery is best-effort and decoupled from the reveal record, so
  a popup failure never downgrades privacy or blocks the reveal.

## Phase 5 — Manual Notion Link Support (Implemented)

Phase 5 lets the DM attach a Notion reference to a Codex doc **before** the API
sync exists. It is a pure reference: nothing is fetched from Notion. The link
records where the source lives so the future sync phase and the DM both know
which Notion page a doc maps to.

### Stored fields (all on `campaign_docs`, DM-only)

- `source` — flipped to `'notion'` when linked, back to `'manual'` when removed.
- `source_url` — the DM-pasted Notion URL (capped at 2000 chars).
- `source_page_id` — dashed-UUID page id, best-effort parsed from the URL.
- `source_database_id` — set instead of page id when the URL is a database view.
- `source_linked_at` — when the link was last attached/updated (new in 026).

### URL validation rules

A link is accepted when it parses as an `http(s)` URL whose host is `notion.so`,
`notion.site`, any `*.notion.so` subdomain, or any `*.notion.site` subdomain.
The id is the trailing 32-hex run in the path (both compact and dashed-UUID
forms are matched). A `?v=` query parameter marks a database view, so the path
id is stored as `source_database_id` rather than `source_page_id`. Id parsing is
best-effort — a valid Notion URL with no parseable id is still accepted (only the
URL is stored). Anything else is rejected.

Messages:

- Reject → "This does not look like a valid Notion link."
- Save → "Notion link saved."
- Remove → "Notion link removed."
- Duplicate page across docs → "Another Codex record is already linked to this
  Notion page." (the `UNIQUE (campaign_id, source, source_page_id)` guard).

### DM UI

A "Notion Link" section on the Codex record panel shows a linked/not-linked
badge, an **Open in Notion** button (new tab), the last-linked date, a URL input,
and Save/Update + Remove. Raw parsed ids are never rendered — only the URL the DM
entered and a human-readable date.

### Privacy

- All Notion fields live on `campaign_docs`, which is DM-only under RLS.
- None of these fields are in `campaign_doc_publications` or returned by
  `get_player_visible_campaign_docs`, so players never receive a Notion link.
- Revealed player-safe content shows the app-cached `player_summary`, never the
  raw Notion page or URL.
- Links default to DM-only; there is no path to expose them to players.

## Phase 6 — Server-Side Notion API Connection (Implemented)

Phase 6 adds a secure server-side connection to the Notion API. It does not sync
content yet — it establishes the authenticated channel that later phases use.

### Security model

- The Notion integration token is stored in `campaign_notion_connections`, a
  table with RLS **enabled and forced but with no `authenticated`/`anon`
  policies and all privileges revoked**. No browser or cookie-scoped server
  client can read or write any column — including the token.
- The only accessor is the **service-role admin client** (`lib/supabase/admin.ts`,
  using the server-only `SUPABASE_SERVICE_ROLE_KEY`), used exclusively inside
  DM-gated server actions. It bypasses RLS by design.
- The table is intentionally **not** added to the realtime publication.
- The token is never returned to any client. Status reads return only booleans
  and timestamps (`configured`, `enabled`, last test status/time, last error) —
  never `access_token`.
- All Notion API calls run server-side (`lib/notion/client.ts`); the browser
  never talks to Notion and the token is never bundled into client JavaScript.
  (Verified: client chunks contain no token, no `api.notion.com`, and no
  service-role value — only the env-var *name* appears in a UI hint string.)
- Disabling the connection clears the stored token server-side.

### Secret storage

`campaign_notion_connections` (PK `campaign_id`): `access_token` (secret,
server-only), `is_enabled`, `last_test_status` (never/success/failed),
`last_test_error` (clean message), `last_tested_at`, `last_success_at`,
`created_by`, timestamps. Requires `SUPABASE_SERVICE_ROLE_KEY` to be set on the
server; if unset, the feature degrades with a clean "not configured" message and
nothing else in the app is affected.

### Server-side API functions (`lib/notion/client.ts`)

- `testNotionConnection(token)` — `GET /users/me`.
- `fetchNotionPage(token, pageId)` — `GET /pages/{id}`.
- `fetchNotionDatabase(token, databaseId)` — `GET /databases/{id}`.
- `queryNotionDatabase(token, databaseId, body?)` — `POST /databases/{id}/query`.
- `parseNotionTitle(source)` — plain-text title from a page or database.
- `parseNotionProperties(page)` — flattens supported property types to plain JS.
- `normalizeNotionError(status?)` — maps status/transport failures to clean
  messages.

All return a discriminated `NotionResult<T>` (`{ ok: true, data }` or
`{ ok: false, code, message }`) and never throw raw API errors at callers.
Notion-Version `2022-06-28`; 10s timeout; `cache: 'no-store'`.

### Error handling (user-facing messages)

- 401 → "The Notion connection could not be verified."
- 403 → "This page is not shared with the Notion integration."
- 404 → "This Notion page could not be found."
- 429 → "Notion is rate-limiting requests. Try again shortly."
- transport/other → "The Notion connection could not be verified."

Raw Notion error bodies are never surfaced.

### Permissions

`lib/actions/notion-settings.ts` (`saveNotionToken`, `testNotionConnection`,
`disableNotionConnection`, `getNotionConnectionStatus`) each call `requireDM`
before any admin-client access; non-DMs get a clean refusal. The settings UI
lives on the DM-only campaign settings page. Players have no access to
configuration, testing, sync, or DM-only synced fields.

### UI

A "Notion Integration" card on `/campaigns/[id]/settings`: connected/not-connected
badge, write-only token field (cleared on save, never pre-filled), Save/Update,
Test connection, Disable, and a status line (last test status/time, last verified,
last clean error). The token is never displayed after saving.

## Phase 7 — Notion Mapping to Adventure Codex (Implemented)

Phase 7 lets the DM describe how each Notion database maps onto an Adventure
Codex doc type. It configures + previews mappings; it does not import yet (the
sync adapter is the next phase).

### Supported mappings (doc types)

Story/sessions → Session/Story, Locations → Location, Characters → Character/NPC,
Bosses & Hostile Enemies → Boss/Hostile enemy, Rumors → Rumor, Factions →
Faction, Side quests → Side/Main quest, Loot → Item/Loot. Any of the 18 Codex
doc types can be the target.

### Field mapping rules

Per database the DM picks: Notion database (by link/ID), Codex doc type, and the
Notion property feeding each Codex field — **Title**, **DM summary** (DM-only),
**Player-safe summary**, **DM notes** (DM-only), **Tags**, **Status**, optional
**Source URL**, plus any number of **relation properties** → related docs.

Recommended per the campaign's database shape:

- **Locations:** Name→title, What Happens Here?/Atmosphere→DM summary, Loot→DM
  notes, Tags→tags, Characters/Bosses/Rumors/Side Quests→relations, Located in→relation.
- **Characters:** Name→title, Description→DM or player summary (DM's choice),
  Background/Combat Stats→DM notes, Category→status, Faction/Locations→relations,
  Tags→tags.
- **Rumors:** Rumor #→title, Rumor Description→player summary, Session→status,
  Location/Characters/Side Quests→relations.
- **Factions:** Name→title, Lore→DM summary, Motive→DM notes, Hostile→status,
  Characters/Locations→relations, Tags→tags.
- **Bosses & Hostile Enemies:** Name→title, Description→DM summary,
  Background/Combat Stats/Ability Scores→DM notes, Locations/Faction→relations,
  Tags→tags.

### Privacy defaults

- All synced content defaults DM-only (enforced at the doc layer in the sync
  phase; visibility flips only via explicit reveal — see Phase 4).
- A field only becomes player-visible if the DM maps it to **Player-safe
  summary**; everything else (DM summary, DM notes, combat reference) is DM-only.
- The preview clearly separates DM-only from player-safe fields.

### Relation mapping behaviour

Properties flagged as relations are previewed as "N linked" with a small sample
of values. They are not resolved into Codex doc links in this phase — the sync
adapter will resolve related Notion pages to Codex docs once import exists.

### Unsupported / guarded fields

- **Combat stats & ability scores** map to **DM notes only** and are treated as
  DM reference text. Notion never controls live combat, HP, AC, or initiative.
  A structured stat-mapping feature is explicitly deferred.
- Unsupported Notion property types are skipped (never passed through raw).

### Preview / test

"Test mapping" reads one sample record from the database via the server-side
Notion client and renders the resolved title, DM-only fields, player-safe fields,
tags/status, relations, and **warnings** for any mapped property not found on the
record. Missing or renamed properties degrade gracefully (warning, empty value) —
they never throw.

### Permissions & storage

Mappings live in `notion_sync_mappings` (DM-only RLS via `is_campaign_dm`; no
secrets — the token stays in `campaign_notion_connections`). The mapping UI is a
DM-only route, `/campaigns/[id]/codex/notion`; players are redirected away. All
mapping actions re-check DM membership server-side.

## Phase 8 — Manual Sync from Notion to Adventure Codex (Implemented)

Phase 8 implements the first safe sync: DM-triggered manual sync. No webhook /
live sync.

### Manual sync behaviour

Three DM entry points:

- **Sync one Codex doc** — "Sync from Notion" on a Notion-linked record
  (`syncCodexDoc`): fetches that page, re-applies its database mapping, upserts
  the one doc, resolves its relations.
- **Sync one mapped database** — "Sync now" per mapping (`syncNotionDatabase`):
  paginates the database (up to 500 records/run; logs when capped), upserts each
  page, then resolves relations.
- **Sync all** — "Sync all" (`syncAllNotionDatabases`): runs every enabled
  mapping sequentially and aggregates the result.

Each run reads the token via the service-role client, fetches + normalizes via
the server-side Notion client, writes `campaign_docs` / `campaign_doc_links`
through the DM's RLS-scoped client, and records a `notion_sync_logs` row. The DM
sees a result summary ("N created, M updated, …"); raw Notion data/errors are
never surfaced.

### Sync ownership rules

- **Notion wins** for *mapped* documentation fields: title, DM summary, DM notes,
  player-safe summary, tags. A field is only written when its property is mapped
  **and** present on the page.
- **App wins / preserved**: `visibility`, `reveal_state`, live-object links, and
  any **unmapped** field (e.g. DM notes you keep app-side by not mapping them).
  Sync never writes visibility or reveal state.
- New docs are created `visibility = dm_only`, `reveal_state = unrevealed`.
- Upsert key: `(campaign_id, source = 'notion', source_page_id)`.
- Notion **Status** maps to the Codex lifecycle enum when it matches
  (draft/ready/active/archived/stale); otherwise it is recorded as a
  `status:<value>` tag (prior `status:` tags are replaced), since the Codex
  status column is a fixed enum.
- `last_synced_at` / `sync_status` / `sync_error` tracked per doc.

### Conflict behaviour

The mapping itself is the conflict policy: mapped → Notion authoritative,
unmapped/app-owned → preserved. A mapped property that is missing/renamed on the
page is skipped (the existing app value is preserved) and counts as a warning —
sync never throws on schema drift. Detailed per-field conflict diffs are not
recorded (known limitation).

### Realtime update behaviour

- `campaign_docs` upserts fire the Phase 2 publication trigger and the DM Codex
  workspace's `useRealtimeRefresh` subscription, so the DM sees updates without a
  manual refresh.
- Players see updates **only** for docs that are already `player_safe`/`revealed`
  (the safe projection re-publishes the updated `player_summary`). Newly synced
  DM-only content is not pushed to players; nothing is auto-revealed.

### Safety guarantees

- Never writes live gameplay tables (tokens/HP/position/initiative/visibility);
  sync only touches `campaign_docs`, `campaign_doc_links`, `notion_sync_logs`.
- Never exposes raw Notion API data or DM notes to players.
- Never auto-reveals player-safe content — reveal stays a separate explicit DM
  action (Phase 4).

## Phase 9 — Live Codex Updates After Sync (Implemented)

Phase 9 makes Codex changes (manual edits, reveals, and Notion syncs) propagate
to open DM and player sessions live. App-side realtime only — no Notion webhooks.

### Realtime subscription model

The system uses the existing two realtime patterns:

- **`useRealtimeRefresh`** (debounced `router.refresh()`): re-runs the server
  component so RLS is re-applied server-side and fresh props flow down. Used for
  Codex side panels and the player projection. It never trusts the realtime
  payload itself — it only triggers a refetch of data the viewer may already
  query, so the existence of hidden rows is never leaked.
- **`useTokenRealtime`** (fine-grained merge): unchanged; runtime token state.

Per-surface subscriptions (each role only watches tables it can SELECT):

| Surface | Watches | Role |
|---|---|---|
| Codex dashboard (`AdventureCodexWorkspace`, DM) | `campaign_docs`, `campaign_doc_links`, `codex_reveals` | DM |
| Revealed Info (`AdventureCodexWorkspace`, player) | `campaign_doc_publications`, `codex_reveals` | Player |
| Live-map DM editor (`MapEditor`) | `campaign_docs`, `campaign_doc_links` | DM |
| Player map view (`PlayerMapView`) | `campaign_doc_publications`, `campaign_doc_link_publications` | Player |
| Reveal popup (`PartyMessageListener`, global) | `party_messages` | All (recipient-scoped) |

### DM/player permissions

- DM surfaces watch the DM-only source tables (`campaign_docs`,
  `campaign_doc_links`, `codex_reveals`) — RLS guarantees only DMs receive these
  events.
- Player surfaces watch **only** the player-safe projection
  (`campaign_doc_publications`, `campaign_doc_link_publications`) and
  `codex_reveals` (scoped by migration 025 to party reveals + the player's own
  targeted reveals). Players are never subscribed to a DM-only table.

### Live update behaviour

- **DM syncs/edits while a DM Codex panel or token/map/object drawer is open** →
  `campaign_docs`/`campaign_doc_links` change → DM surfaces refetch → panels
  update without refresh.
- **DM reveals a record** → publication trigger + `codex_reveals` insert →
  player Revealed Info / map panels refetch; `party_messages` delivers the popup.
- **Already-revealed content changes** (e.g. a sync updates a revealed doc's
  `player_summary`) → the publication trigger re-publishes the safe row →
  players' panels update live.
- **DM-only / unrevealed content never reaches players** — it is not in any
  player-readable table, and players don't subscribe to the source tables.

### Robustness

- Subscriptions are keyed by stable channel names (role + id), and
  `useRealtimeRefresh` removes its channel on unmount — no duplicate subscriptions.
- `router.refresh()` re-fetches server-side, so deleted/detached docs, stale
  state, and visibility changes are reflected on the next event without manual
  reload. Supabase auto-reconnects channels; the next event resyncs.
- The reveal popup de-dupes by message id (`seenIds`) so a player never sees the
  same reveal notification twice.

## Phase 10 — Optional Notion Webhook Receiver (Implemented)

Phase 10 adds an optional public webhook endpoint so Notion edits can
auto-sync into the Codex. It is **off by default** and only functions when
deployed with a reachable HTTPS URL and the required secret.

### Public endpoint requirement

`POST /api/notion/webhook` (Node.js runtime route handler). Requires a hosted,
publicly reachable deployment (Vercel/serverless). Middleware does not guard
`/api/*`, so the endpoint is reachable without a session — authenticity is
enforced by signature, not cookies. With no secret set, the receiver is disabled.

### Security verification

- Requests are verified with **HMAC-SHA256 over the raw body** using
  `NOTION_WEBHOOK_SECRET` (the verification token Notion issues for the
  subscription), compared with `timingSafeEqual`. Invalid/missing signature → 401.
- The **subscription verification handshake** (Notion posts a `verification_token`
  with no signature) is acked with 200; the token is never echoed or persisted.
- No secret configured → the endpoint acks 200 but does nothing (manual sync
  still works).

### Event handling

- **Routing:** the event's page id is resolved to a campaign + database two ways —
  first by an existing synced Codex doc (`source_page_id`), else by the parent
  database id in the payload. Unroutable events are logged `ignored`.
- **Dedup:** each delivery is inserted into `notion_webhook_events` with a unique
  `event_id` (Notion event id, delivery header, or a body hash). A duplicate hits
  the unique constraint and is skipped.
- **Auto-sync gating:** a matched campaign syncs only if its connection is enabled
  **and** `auto_sync_enabled` is on; otherwise the webhook receipt is recorded but
  no sync runs.
- **Sync:** uses the shared `syncPageCore` (same upsert/ownership/relation rules
  as manual sync) with the service-role client and `actorId = null`.
- **Deleted/unshared page:** the page fetch fails cleanly → event marked `failed`,
  `failed_sync_count` incremented; the cached doc is left intact (a page being
  unshared is not a deletion).
- **Rate limits / bursts:** a Notion 429 surfaces as a failed event (Notion
  retries). There is no internal queue yet (documented limitation).
- **No raw payload** is stored or returned; responses are minimal acks.

### What webhook sync can / cannot modify

- **Can:** synced title, DM summary, player summary, DM notes, tags, status,
  relations, `last_synced_at`, `sync_status` (documentation fields only).
- **Cannot / never touches:** token position, HP, initiative, dice, action
  requests, fog/reveal permissions, combat state, player movement, `visibility`,
  or `reveal_state`. It never auto-reveals content.

### Realtime behaviour

Webhook-driven upserts write `campaign_docs` exactly like manual sync, so the
Phase 9 realtime path applies: the DM's open panels refresh; players see updates
only for already player-safe/revealed docs; DM-only content stays private.

### DM status UI

The campaign settings Notion card gains an **auto-sync** section: on/off toggle
(`setNotionAutoSync`), last webhook received, last auto-sync time + status, failed
sync count, and a **Manual sync now** button (runs `syncAllNotionDatabases`).
Status reads never expose the token or raw events.

## Phase 11 - Notion Sync Dashboard (Implemented)

Phase 11 adds a DM-only sync-health dashboard at
`/campaigns/[id]/codex/sync`. It does not add new tables: health is derived
from `campaign_docs`, `campaign_doc_links`, `notion_sync_mappings`, and
`notion_sync_logs`.

### Dashboard behavior

- Loads even when there is no Notion connection or no mappings. In that state it
  still shows manual Codex docs, visibility counts, live-object linkage, and a
  clear connection badge.
- Shows aggregate health: total Codex docs, Notion-synced docs, manual docs,
  broken Notion links, last sync time, failed sync count, docs needing review,
  player-safe docs, revealed docs, DM-only docs, linked live objects, and
  unlinked docs.
- Subscribes to the same DM-only source tables (`campaign_docs`,
  `campaign_doc_links`, `codex_reveals`) plus `notion_sync_logs` through
  `useRealtimeRefresh`, so sync/reveal/link updates refresh the dashboard.
- Never renders raw Notion API payloads, raw source page/database ids, or raw
  webhook event bodies. The table shows titles, high-level status labels, safe
  timestamps, and clean health messages.

### Sync statuses

The dashboard derives status badges from existing fields:

- **Synced:** Notion doc with successful sync and no newer local edit.
- **Needs sync:** local `updated_at` is newer than `last_synced_at`.
- **Failed:** `sync_status = failed`.
- **Broken link:** Notion source doc is missing its stored page id or URL.
- **Not shared with integration:** clean sync error indicates a Notion sharing
  problem.
- **Mapping missing:** Notion doc has no enabled mapping for its source
  database.
- **DM-only / Player-safe / Revealed:** mirrors the app-owned visibility and
  reveal state.
- **Needs review:** failed/broken/missing/stale docs, or player-visible docs
  missing a player-safe summary.

### Filters and actions

Filters:

- Doc type
- Source
- Sync status
- Visibility
- Reveal state
- Linked/unlinked live-object state
- Broken link state
- Needs-review state
- Text search over title, type, source, tags, and health summary

Actions:

- Sync selected Notion-linked doc.
- Sync selected mapped database.
- Sync all enabled mappings.
- Retry all failed Notion docs.
- Open in Notion when a stored source URL exists.
- Open the Codex doc panel with `?doc=[id]`.
- Jump to Live Map for live-object attachment.
- Review visibility in the Codex doc panel.
- Detach a broken Notion link.

## Phase 12 - Full QA / Regression / Documentation Finalization (Implemented)

Phase 12 is a final QA and documentation pass over the Adventure Codex, Notion
sync, sync dashboard, realtime bridge, and live-map integration.

### Finalized architecture statement

- **Notion is documentation source:** it can provide writing/prep content only.
- **Adventure Codex is the cached app-safe source:** synced content is normalized
  into `campaign_docs` and player-safe projections before app display.
- **Live engine owns gameplay state:** token position, HP, initiative, dice,
  action approvals, fog/reveal, movement, combat, maps, and active session state
  stay app-owned.
- **Player-safe reveal rules are enforced:** players use safe projection tables,
  scoped reveal records, and player-safe RPCs; they do not subscribe to DM-only
  Codex source rows.
- **Notion sync does not directly control combat or map state:** mapped combat
  stats remain DM reference text until a future structured stat-mapping feature
  exists.

### QA results

See `docs/QA_Reports/AdventureCodex_Phase12_Final_QA_Report.md` for the full
report. Static gates passed (`tsc`, lint, build, smoke E2E). Authenticated
multi-session runtime QA remains blocked until DM/player sessions or E2E
credentials are available. Notion runtime QA remains blocked until migrations,
service-role key, Notion token/database sharing, and webhook deployment are
available.

## Rollback Notes

Because Phase 1 is documentation only, rollback is deleting or reverting this spec and the corresponding implementation log entry.

### Phase 12 rollback

- Revert the Phase 12 documentation additions and README update.
- Revert the clean Codex error-message hardening in `lib/actions/codex.ts` only
  if raw Supabase errors are explicitly desired for local debugging.
- No database rollback is required.

### Phase 11 rollback

- Revert `app/(app)/campaigns/[id]/codex/sync/page.tsx`,
  `components/codex/NotionSyncDashboard.tsx`, and the dashboard link/query-param
  support in `AdventureCodexWorkspace`.
- Revert `retryFailedNotionDocs` in `lib/actions/notion-sync.ts`.
- No database rollback is required.

### Phase 10 rollback

- Unset `NOTION_WEBHOOK_SECRET` to disable the receiver instantly (no code change).
- Full revert: remove `app/api/notion/webhook/route.ts`, the auto-sync fields in
  `notion-settings.ts` + `NotionSettingsCard`, and revert migration 030 (drop
  `notion_webhook_events`; drop the added `campaign_notion_connections` columns).
- The `lib/notion/sync-core.ts` extraction can stay (manual sync depends on it);
  only the webhook caller is removed.

### Phase 9 rollback

- No migration. Revert the role-split watch list in `AdventureCodexWorkspace`
  and the `useRealtimeRefresh(campaign_docs, campaign_doc_links)` added to
  `MapEditor`. Behaviour returns to Phase 8 (DM panels need a manual refresh to
  reflect a sync while a drawer is open).

### Phase 8 rollback

- Revert migration 029 (drop `notion_sync_logs`).
- Revert `lib/actions/notion-sync.ts`, the `mapPageToDoc` addition in
  `lib/notion/mapping.ts`, and the sync buttons in `NotionMappingManager` /
  `AdventureCodexWorkspace`.
- Synced `campaign_docs` rows (source = 'notion') can be left in place or deleted
  by the DM; they carry no live gameplay state. Reverting code does not delete
  them.

### Phase 7 rollback

- Revert migration 028 (drop `notion_sync_mappings`).
- Revert `lib/notion/mapping.ts`, `lib/actions/notion-mappings.ts`,
  `components/codex/NotionMappingManager.tsx`, the `/codex/notion` route, the
  `extractNotionId` export, and the dashboard link.

### Phase 6 rollback

- Revert migration 027 (drop `campaign_notion_connections`). This removes all
  stored tokens — coordinate before doing so in production.
- Revert `lib/notion/client.ts`, `lib/actions/notion-settings.ts`,
  `lib/supabase/admin.ts`, the `getServiceRoleConfig` env helper, the
  `NotionSettingsCard`, and its mount in the settings page.
- `SUPABASE_SERVICE_ROLE_KEY` can be left set; nothing else depends on it yet.

### Phase 5 rollback

- Revert migration 026 (drop `campaign_docs.source_linked_at`). Existing
  `source`/`source_url`/`source_page_id`/`source_database_id` values are
  harmless DM-only data and can be left or cleared.
- Revert the `setCampaignDocNotionLink` / `removeCampaignDocNotionLink` actions
  and the `NotionLinkSection` UI. No player-facing surface is affected.

### Phase 4 rollback

- Revert migration 025: restore the `party_messages` message_type CHECK without
  `codex_reveal` and drop the `codex_reveals_select_scoped_member` policy. Any
  rows with `message_type = 'codex_reveal'` must be migrated/removed first or the
  restored CHECK will fail to validate.
- Revert the reveal-action signature changes in `lib/actions/codex.ts` and the
  `CodexRevealControls` wiring; the Phase 2/3 party-only reveal behaviour returns.
- No data migration is required for `codex_reveals` rows themselves.

Future database phases should include explicit rollback guidance:

- Remove realtime publication entries before dropping published tables.
- Drop RLS policies before dropping tables when needed.
- Drop link tables before parent document tables.
- Preserve or export sync logs before destructive rollback in production.
- Never drop live gameplay tables as part of Codex rollback.

---

## Adventure Maker Token Builder Integration

Date: 2026-06-13

### Behavior

Adventure Maker now uses the Adventure Codex cache as its token-building source.
The flow is:

`Notion tables -> Adventure Codex cache -> Adventure Maker Token Builder -> prepared map tokens/objects -> live map engine`

The Token Builder never queries Notion directly. Notion remains documentation;
Adventure Codex remains the app-safe cached source; the live map engine remains
the owner of gameplay state such as token position, HP, initiative, movement,
dice, action approval, combat state, fog, and reveal state.

### Dynamic Tokens

Dynamic tokens are prepared-map tokens created from Adventure Codex records such
as characters, NPCs, bosses, hostile enemies, items, loot, locations, rumors,
quests, and other mapped records. The prepared token stores a clean
`linked_campaign_doc_id` plus a source label (`notion`, `manual`, or `import`),
but it never exposes raw Notion page ids, database ids, relation ids, or API
payloads in the UI.

When a prepared map is sent to the Live Map, each linked prepared token creates a
fresh live token plus a `campaign_doc_links` row for that live token. Link
visibility follows the cached Codex record visibility and remains DM-only unless
the record is already player-safe or revealed.

### Static Tokens

Static tokens are fixed world objects such as doors, chests, levers, buttons,
traps, portals, stairs, signs, loot, light sources, puzzle parts, and hazards.
They are movable by the DM while building the prepared map, but deploy with
player movement locked. Static objects can be interactable and can request DM
approval through the existing live object/action system after deployment.
Any selected token can optionally attach or detach a cached Codex entry from the
token detail drawer; this only changes the prepared-token cache until the map is
saved/deployed and never writes back to Notion.

### Permission and Privacy Rules

- Players cannot access Adventure Maker.
- Players cannot create, edit, or move prepared-map tokens.
- Static objects are not player-movable after deployment.
- DM-only Codex fields remain server-side/DM-only.
- Player-facing Codex information requires player-safe text and explicit reveal
  or player-safe visibility.
- Notion source URLs are shown only in DM token detail context when available.
- No raw Notion ids, raw Supabase errors, API payloads, or JSON debug data are
  rendered.

### Files Changed

- `components/adventures/PreparedMapEditor.tsx`
- `components/adventures/TokenBuilderPanel.tsx`
- `components/adventures/TokenDetailPanel.tsx`
- `components/adventures/token-meta.ts`
- `lib/actions/prepared-maps.ts`
- `lib/types/adventure.ts`

### Database Changes

None. The implementation reuses existing `prepared_maps.tokens` JSONB,
`campaign_docs`, and `campaign_doc_links`.

### Rollback Notes

Revert the files listed above. Existing prepared-map token JSON remains app-owned
cache data; reverting the UI does not delete Codex docs, Notion data, live maps,
or live tokens.
