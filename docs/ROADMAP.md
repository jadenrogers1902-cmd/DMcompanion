# Roadmap

## Phase 8 - Polish, Mobile Readiness, Permissions, Backups, and QA - CODE COMPLETE
**Goal:** Make the MVP usable for a real play-session test.

Deliverables:
- Campaign-scoped session navigation added to desktop sidebar and mobile bottom nav.
- PWA readiness added via manifest, app metadata, mobile theme color, and install icon placeholder.
- DM-only JSON campaign export added at `/campaigns/[id]/export`.
- Offline/connection warning added.
- Loading skeleton added for authenticated app routes.
- Safe delete confirmations added to Story Tools and map token deletion.
- Mobile overflow hardening added for long names and card text.
- Mobile readiness, permission audit, final QA, and phase reports created.

Remaining manual verification:
- Browser viewport screenshots at 375, 430, 768, 1024, and 1440 px.
- Two-account runtime permission checks against a migrated Supabase project.
- Realtime movement smoke test with two browser sessions.

---

## Phase 7 - Story Tools, Quests, NPCs, Notes, Handouts, and Recaps - CODE COMPLETE
**Goal:** Help DMs manage non-combat adventure content and give players a readable shared journal.

Deliverables:
- Story schema for quests, NPCs, locations, notes, handouts, and session recaps complete.
- Private handout storage bucket with campaign-folder access policies complete.
- DM Story Tools dashboard at `/campaigns/[id]/story` complete.
- Player Party Journal at `/campaigns/[id]/story` complete.
- DM can create story content, reveal/share/hide it, delete it, and upload handouts.
- Players receive only visible/revealed/shared rows in the journal; DM-only fields are omitted from player queries.
- AI recap generation, complex relationship graphs, public sharing, and content packs remain deferred.

---

## Phase 0 — Project Foundation
**Goal:** Set up documentation, planning docs, and project guardrails. No major app features.

Deliverables:
- docs/PROJECT_SOURCE_OF_TRUTH.md
- docs/ROADMAP.md
- docs/FEATURE_SCOPE.md
- docs/DATA_MODEL_NOTES.md
- docs/ROLE_PERMISSION_NOTES.md
- docs/RULES_AND_LICENSING_NOTES.md
- docs/QA_CHECKLIST.md
- PHASE_COMPLETION_REPORT.md

---

## Phase 1 — Auth, Campaigns, and Player Invites ✅ COMPLETE
**Goal:** Working auth system, campaign creation, and player invite flow.

Deliverables:
- Supabase project setup and schema bootstrap ✅
- Email auth via Supabase Auth ✅
- Campaign CRUD (create, list, view; delete deferred) ✅
- Campaign invite system (invite code) ✅
- DM and Player role assignment per campaign ✅
- Protected routes (DM-only vs player-accessible) ✅
- Basic nav shell (sidebar + mobile bottom nav) ✅

---

## Phase 2 — Character Sheets and DM Dashboard ✅ COMPLETE
**Goal:** Players can create and edit characters. DM has a campaign dashboard.

Deliverables:
- Character sheet create / edit / view / delete for players ✅
- Multiple characters per player per campaign ✅
- Full fields: identity, combat stats, ability scores, notes ✅
- Inventory, spells, abilities, and conditions (tabbed) ✅
- HP control (damage/heal/temp) usable by owner and DM ✅
- DM party dashboard with quick-glance stats table ✅
- DM can view any character; can edit HP/conditions ✅
- Players can only edit their own characters (RLS enforced) ✅

---

## Phase 3 — Map Upload, Grid, and Token System ✅ COMPLETE
**Goal:** DM can upload maps and place tokens. Players can view revealed areas.

Deliverables:
- Map image upload via a private Supabase Storage bucket + signed URLs ✅
- Grid overlay with configurable square size and feet-per-square ✅
- Custom pan/zoom canvas (HTML/SVG + pointer events — no heavy canvas lib) ✅
- Token placement and DM drag-to-move with persisted positions ✅
- Token types: player, NPC, enemy, object, trap, door ✅
- Per-token visibility toggle; enemies/traps/doors hidden by default ✅
- Active-map selection for the player view ✅
- Players see only the active map and only visible tokens; no DM notes ✅
- Fog-of-war regions: deferred (out of scope this phase)

---

## Phase 4 — Live Multiplayer Movement and DM Controls ✅ COMPLETE
**Goal:** Real-time token movement visible to all players in session.

Deliverables:
- Supabase Realtime on `tokens` + `maps`; RLS-filtered per subscriber ✅
- DM can move any token; moves sync live to all clients ✅
- Players move their own controlled tokens (drag), gated by locks + speed ✅
- Speed limit from the linked character (Chebyshev squares → feet) ✅
- DM controls: lock/unlock all, lock individual token, allow over-speed, reset movement, reset position ✅
- `move_token` SECURITY DEFINER RPC enforces all rules server-side ✅
- DM notes moved to a non-published `token_dm_notes` table (realtime privacy fix) ✅
- Optimistic drag + revert with an over-speed/lock warning ✅

---

## Phase 5 — Encounter Manager
**Goal:** DM can run structured combat encounters with initiative and HP tracking.

Deliverables:
- Encounter creation with optional linked map ✅
- Add player characters, map tokens, and manual NPC/enemy rows ✅
- Initiative order sorted manually by initiative ✅
- HP, temp HP, AC, speed, visibility, and defeated tracking per participant ✅
- Conditions as simple manual tags, including custom conditions ✅
- Round counter and current-turn tracker with next/back controls ✅
- Player view excludes hidden participants and DM notes ✅

---

## Phase 6 — Contextual Action Prompts
**Goal:** Help DM surface relevant info during encounters without being a rules engine.

Deliverables:
- Quick-reference ability descriptions (user-entered, not auto-rules)
- Combatant stat blocks (manual entry)
- DM notes attached to specific encounters or NPCs
- Search across campaign notes during session

---

## Phase 7 — Story Tools
**Goal:** Quest tracker, NPC manager, handout sharing, session notes.

Deliverables:
- Quest log (active, completed, failed)
- NPC list with notes (DM-only and shared)
- Handout creation and player reveal
- Session notes per campaign session
- Timeline or chapter markers

---

## Phase 8 — Polish, Mobile Readiness, Permissions, and QA
**Goal:** The app is stable, accessible, and works well on tablet/mobile.

Deliverables:
- Full responsive layout audit
- PWA manifest + service worker (optional)
- RLS policy audit across all tables
- Accessibility pass (keyboard nav, contrast, ARIA)
- Performance audit (image optimization, loading states)
- End-to-end QA pass per QA_CHECKLIST.md
- Final permission model review
# Phase 6 Addendum - Contextual Action Prompts Complete

Implemented:
- Player nearby-action view on active maps.
- DM action queue.
- `action_intents` request/status workflow.
- Per-token interaction range and available-action overrides.
- DM-only action notes separated from player-visible responses.

---
