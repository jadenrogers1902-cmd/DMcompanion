@AGENTS.md

# Notion Campaign Database Model

The user's Notion campaign ("Lost Mine of Phandelver") is a **relational campaign
knowledge graph**, not a notes page. Each entity type is its own Notion database,
and entities link to each other. The app must treat Notion as a relationship
graph, not flat imported text. **Full model: [docs/Notion_Campaign_Database_Model.md](docs/Notion_Campaign_Database_Model.md).**

Entity databases → Adventure Codex `doc_type`:
- **Characters** (friendly/neutral/social NPCs) → `character` / `npc`
- **Bosses & Hostile Enemies** → `hostile_enemy` / `boss` / `monster`
- **Locations - Phandalin** (town/region/map-level places) → `location`
- **Sub-Locations** (rooms/areas within a Location; hold **Room Secrets**) → `sub_location` / `room`
- **Storylines / Sessions** (story structure, session prep) → `storyline` / `session` / `chapter`
- **Rumors** (clues/hooks; best candidate for live player-safe reveals) → `rumor`
- **Side Quests** (status: Undiscovered/Discovered/Resolved) → `side_quest` / `quest`
- **Factions** (orgs/religions/groups) → `faction`

Relationships are first-class: every entity can link to many others (e.g.
`appears_in_location`, `member_of_faction`, `knows_rumor`, `quest_enemy`,
`connects_to_sub_location`). The Sub-Location `connects_to_sub_location` graph is
intended to power future room-to-room map navigation. Model these as flexible
relationship records (source/target entity + type + visibility), mapping onto the
existing `campaign_doc_links` table — do **not** hardcode every relation per table.

**Invariants (do not violate):**
- **Notion / Adventure Codex = documentation source of truth** (lore, NPC/enemy/
  location/room notes, room secrets, rumors, quests, factions, session prep,
  player-safe descriptions).
- **Live engine = gameplay source of truth** (token position, HP, initiative,
  movement, dice, action requests, DM approvals, combat state, fog/reveal,
  notifications). Notion never controls combat or map state.
- Combat stats / ability scores from Notion are **DM reference text only** until a
  future structured stat-mapping feature.
- All synced Notion content **defaults DM-only**; player visibility is explicit.
  Room Secrets are always DM-only. Never expose raw Notion IDs/DB IDs/relation
  IDs/API errors/JSON to players.

This is the target model for the future Notion integration; it is documentation
only and changes no current app behavior, schema, or migrations.
