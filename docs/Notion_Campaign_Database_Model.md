# Notion Campaign Database Model

This is the canonical, durable record of how the user's Notion campaign is
structured and how it should map into the DnD Companion app's Adventure Codex.
It is documentation only — no app behavior, schema, or migration is defined here.

The user's Notion campaign ("Lost Mine of Phandelver") is **not a notes page —
it is a relational campaign knowledge graph.** Each major entity type has its own
Notion database, and entities link to each other via Notion relations. The app
must treat Notion as a campaign relationship graph, not as flat imported text.

> **Architecture invariant (do not violate):** Notion / Adventure Codex is the
> source of truth for *documentation* (lore, notes, secrets, rumors, quests,
> factions, session prep, player-safe descriptions). The **live engine** is the
> source of truth for *gameplay state* (token position, HP, initiative,
> movement, dice, action requests, DM approvals, combat state, fog/reveal,
> notifications). Notion never controls combat or map state.

---

## Entity tables

### Characters
Friendly / neutral / social / story / player-facing people: NPCs, PC contacts,
shopkeepers, mentors, quest givers, story characters.

- Appear in Locations and Sub-Locations.
- Belong to Factions.
- Know or are the subject of Rumors.
- Involved in Side Quests.
- Link to other Characters (family, allies, mentors, contacts).
- Reference weapons / wares / inventory / creatures / combat reference text.

**App type:** `character` or `npc`.
Relationships: `appears_in_location`, `appears_in_sub_location`,
`member_of_faction`, `knows_rumor`, `rumor_about_character`, `involved_in_quest`,
`related_character`, `uses_weapon`, `based_on_creature`.

### Bosses & Hostile Enemies
Hostile NPCs, bosses, monsters, villains, enemy groups, lieutenants.

- Appear in Locations and Sub-Locations.
- Belong to Factions.
- Targets/obstacles of Side Quests.
- Hinted at by Rumors.
- Carry combat reference text, ability scores, weapons, creatures, loot,
  background, description.

**App type:** `hostile_enemy`, `boss`, or `monster`.
Relationships: `enemy_in_location`, `enemy_in_sub_location`, `member_of_faction`,
`quest_enemy`, `rumor_target`, `linked_to_live_token`.

> **Combat rule:** Notion combat stats / ability scores are **DM reference text
> first**, never automatic live combat logic. Notion must never directly control
> HP, initiative, token position, combat turns, dice rolls, or live combat state.
> A structured stat-mapping feature is deferred to a future phase.

### Locations - Phandalin
Major locations in/touching/related to Phandalin: buildings, town places,
map-level locations, taverns, shops, faction HQs, neighborhoods, landmarks,
regional places.

- Contain Sub-Locations; may be located inside other Locations.
- Have Characters, Bosses & Hostile Enemies, Rumors, Side Quests.
- Connect to Main Story / Sessions.
- Include loot notes, atmosphere notes, "What Happens Here?" notes.
- May include files/media as reference, but **battle maps remain app-owned.**

**App type:** `location`.
Relationships: `located_in`, `contains_sub_location`, `has_character`,
`has_enemy`, `has_rumor`, `quest_location`, `appears_in_story`,
`contains_loot_note`, `linked_to_live_map`.

### Sub-Locations
Smaller areas within a major Location: rooms, chambers, caves, shops, inner
spaces, encounter zones, secret rooms, map nodes, player-navigation points.

- Belong to a parent Location; connect to other Sub-Locations.
- Contain Characters, Bosses & Hostile Enemies, Rumors/clues.
- Connect to Side Quests and Main Story / Sessions.
- Include Loot and **Room Secrets**.

**App type:** `sub_location` or `room`.
Relationships: `located_in`, `connects_to_sub_location`, `has_character`,
`has_enemy`, `contains_rumor`, `quest_objective_location`, `appears_in_story`,
`contains_loot_note`, `has_dm_secret`, `linked_to_map_node`.

> **Room Secrets are DM-only by default** and must never be shown to players
> unless explicitly revealed.
>
> **Design note:** the Sub-Location connection graph
> (`connects_to_sub_location`) is meant to power future room-to-room game
> progression — map navigation, room buttons, linked map nodes.

### Storylines / Sessions
Campaign story structure, session prep, narrative planning;
not-started / active / resolved story sections.

- Involve Characters; take place at Locations.
- Include Rumors, Side Quests, Loot notes.
- Carry atmosphere, story overview, tags, status.

**App type:** `storyline`, `session`, or `chapter`.
Relationships: `session_character`, `session_location`, `session_rumor`,
`session_quest`, `session_loot_note`, `story_section`.

### Rumors
Small pieces of campaign info: clues, gossip, hints, quest hooks, player-facing
information that may be unused / coming up / used.

- Known by Characters; about Characters.
- Found at Locations; tied to Sub-Locations.
- Start or update Side Quests.
- Belong to a session/status flow.

**App type:** `rumor`.
Relationships: `known_by_character`, `about_character`, `rumor_location`,
`rumor_sub_location`, `quest_hook`, `scheduled_for_session`,
`revealed_to_players`.

> **Design note:** Rumors are the strongest candidate for live player-safe
> reveals. When the DM clicks an NPC / token / location, the app should
> eventually surface that entity's linked rumors and let the DM reveal
> player-safe rumor text live (this is the Phase 4 reveal system applied to
> synced rumor docs).

### Side Quests
Optional quests, hooks, requests, rewards, motives, objectives, related
characters/enemies, statuses.

- Involve Characters and Bosses & Hostile Enemies.
- Have a Location "Where to go" and a Location "To Get."
- Connect to Storylines; link to related Side Quests.
- Carry request / reward / motive / "What Happens" text.
- Status values such as **Undiscovered, Discovered, Resolved**.

**App type:** `side_quest` or `quest`.
Relationships: `quest_character`, `quest_enemy`, `quest_destination`,
`quest_objective_location`, `quest_storyline`, `related_quest`, `quest_reward`,
`quest_request`.

### Factions
Organizations, religions, noble houses, institutions, hostile groups, power
structures, social/political groups.

- Have Characters and Locations.
- Bosses & Hostile Enemies may belong to them.
- Carry lore, motive, hostile status, tags.
- Can be friendly / neutral / hostile / institutional / religious / noble /
  disbanded.

**App type:** `faction`.
Relationships: `has_member`, `faction_location`, `hostile_member`,
`faction_motive`, `faction_lore`.

---

## Full relationship matrix

| Source Table | Related Table | Meaning | Suggested App Relationship |
| --- | --- | --- | --- |
| Characters | Locations | Character appears at a location | `appears_in_location` |
| Characters | Sub-Locations | Character appears in a specific room/area | `appears_in_sub_location` |
| Characters | Factions | Character belongs to faction | `member_of_faction` |
| Characters | Rumors | Character knows/is tied to rumor | `knows_rumor` / `rumor_about_character` |
| Characters | Side Quests | Character gives/receives/is involved in quest | `involved_in_quest` |
| Characters | Characters | Character knows/is related to another character | `related_character` |
| Characters | Weapons | Character uses/sells/owns weapon | `uses_weapon` |
| Characters | Creatures | Character references creature/stat block | `based_on_creature` |
| Bosses & Hostile Enemies | Locations | Enemy appears at location | `enemy_in_location` |
| Bosses & Hostile Enemies | Sub-Locations | Enemy appears in specific room/encounter | `enemy_in_sub_location` |
| Bosses & Hostile Enemies | Factions | Enemy belongs to hostile group/faction | `member_of_faction` |
| Bosses & Hostile Enemies | Side Quests | Enemy is target/obstacle of quest | `quest_enemy` |
| Bosses & Hostile Enemies | Rumors | Enemy is hinted at by rumor | `rumor_target` |
| Locations | Locations | Location is inside/related to another location | `located_in` |
| Locations | Sub-Locations | Location contains rooms/sub-areas | `contains_sub_location` |
| Locations | Characters | Location has NPCs/characters | `has_character` |
| Locations | Bosses & Hostile Enemies | Location has enemies/bosses | `has_enemy` |
| Locations | Rumors | Location has rumors/clues | `has_rumor` |
| Locations | Side Quests | Location starts/contains quest content | `quest_location` |
| Locations | Storylines/Sessions | Location appears in story/session | `appears_in_story` |
| Locations | Loot | Location contains loot note | `contains_loot_note` |
| Sub-Locations | Locations | Sub-location belongs to parent location | `located_in` |
| Sub-Locations | Sub-Locations | Room connects to another room | `connects_to_sub_location` |
| Sub-Locations | Characters | Room contains NPC/character | `has_character` |
| Sub-Locations | Bosses & Hostile Enemies | Room contains enemy/boss | `has_enemy` |
| Sub-Locations | Rumors | Room contains clue/rumor | `contains_rumor` |
| Sub-Locations | Side Quests | Room contains quest objective | `quest_objective_location` |
| Sub-Locations | Storylines/Sessions | Room appears in story/session | `appears_in_story` |
| Storylines/Sessions | Characters | Session involves characters | `session_character` |
| Storylines/Sessions | Locations | Session takes place at locations | `session_location` |
| Storylines/Sessions | Rumors | Session includes rumors | `session_rumor` |
| Storylines/Sessions | Side Quests | Session includes side quests | `session_quest` |
| Storylines/Sessions | Loot | Session includes loot notes | `session_loot_note` |
| Rumors | Characters | Rumor is known by/about character | `known_by_character` / `about_character` |
| Rumors | Locations | Rumor is found at/about location | `rumor_location` |
| Rumors | Sub-Locations | Rumor/clue is in a specific room | `rumor_sub_location` |
| Rumors | Side Quests | Rumor starts/updates quest | `quest_hook` |
| Rumors | Sessions | Rumor belongs to session/status flow | `scheduled_for_session` |
| Side Quests | Characters | Quest involves NPC/character | `quest_character` |
| Side Quests | Bosses & Hostile Enemies | Quest involves enemy/boss | `quest_enemy` |
| Side Quests | Locations | Quest destination/objective location | `quest_location` |
| Side Quests | Storylines | Quest belongs to story/session | `quest_storyline` |
| Side Quests | Side Quests | Quest chain/follow-up/related quest | `related_quest` |
| Factions | Characters | Faction has members/contacts | `has_member` |
| Factions | Locations | Faction has HQ/influence location | `faction_location` |
| Factions | Bosses & Hostile Enemies | Hostile enemy belongs to faction | `hostile_member` |

---

## App design interpretation

Treat Notion as a campaign relationship graph. **Do not flatten it into simple
links.**

### Entity records
Future Adventure Codex entity types should include: `character`,
`hostile_enemy`, `boss`, `location`, `sub_location`, `storyline`, `session`,
`rumor`, `side_quest`, `faction`, `loot`, `item`, `handout`, `map_note`.

> Mapping note vs. the *current* schema (migrations 024–030): `campaign_docs`
> already has most of these `doc_type` values, but uses `main_quest`/`object_note`
> rather than `storyline`/`monster`. The names above are the desired conceptual
> model; reconcile to the actual `doc_type` CHECK list when implementing, or
> extend it. This doc records intent, not a schema change.

### Relationship records
Use a flexible relationship model rather than hardcoding every relation into
every entity table. Recommended shape:

- `source_entity_id`
- `source_entity_type`
- `target_entity_id`
- `target_entity_type`
- `relationship_type`
- `visibility`
- `notes`

> This maps onto the existing `campaign_doc_links` table (doc↔doc + doc↔live
> object, with `relationship_type` + `visibility`). The richer
> `relationship_type` vocabulary above would extend that table's existing
> relation set.

Example relationships:

- Elmar Barthen → `appears_in_location` → Barthen's Provisions
- Barthen's Provisions → `located_in` → Phandalin
- Sister Garaele → `member_of_faction` → Harpers
- The Banshee's Bargain → `quest_character` → Sister Garaele
- The Banshee's Bargain → `quest_destination` → Conyberry
- Cave Entrance → `connects_to_sub_location` → Goblin Blind
- Klarg → `enemy_in_sub_location` → Cragmaw Hideout boss room

### Live engine linkage (future)
The live map should link map objects to Codex entities:

- Live map token → Character Codex entity
- Live enemy token → Hostile Enemy Codex entity
- Live map object → Item / Loot / Room Codex entity
- Live map / room → Location or Sub-Location Codex entity
- Quest UI → Side Quest Codex entity
- NPC interaction → Character + linked Rumors

The live engine remains the source of truth for token position, HP, initiative,
movement, dice rolls, action requests, DM approvals, combat state, fog/reveal
state, and player notifications. Notion / Adventure Codex remains the source of
truth for lore, NPC/enemy/location/sub-location notes, room secrets, rumors,
quests, factions, session prep, and player-safe descriptions.

---

## Privacy rule

- All imported/synced Notion content **defaults to DM-only.**
- Player-visible content must be **explicitly** marked player-safe or revealed.
- **Room Secret** fields are always DM-only by default.
- Never expose raw Notion IDs, database IDs, relation IDs, API errors, JSON, or
  debug fields to players.

This matches the implemented Adventure Codex privacy model (migrations 024–030):
`campaign_docs` is DM-only under RLS; players reach only the player-safe
projection / RPC; reveals are explicit (Phase 4); Notion tokens/IDs are
server-only.

---

## Assumptions & missing information

- **Exact Notion property names per database are not yet captured** (e.g. the
  precise column names for title, summary, status, tags, relation properties).
  The Phase 7 mapping UI is where the DM binds real property names to Codex
  fields; this doc records the *entity/relationship* model, not the literal
  property schema.
- **Loot, Item, Weapon, and Creature** are referenced as related tables but their
  standalone table structure (if any) is inferred — they may be properties/
  sub-notes rather than full databases.
- Status vocabularies are partially known (Side Quests:
  Undiscovered/Discovered/Resolved; Sessions: not-started/active/resolved) and
  may need reconciliation with `campaign_docs.status`
  (draft/ready/active/archived/stale) at mapping time.
- The desired `doc_type` names here (`storyline`, `monster`, `room`) differ from
  the current schema's enum; treat as conceptual intent until implemented.
