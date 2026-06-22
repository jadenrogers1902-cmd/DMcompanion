# Project Source of Truth

## App Purpose

A DnD campaign management companion web app that helps Dungeon Masters run campaigns and helps players track their characters during live play sessions.

This is **not** a virtual tabletop replacement. It is a structured workspace that lives alongside the table.

---

## Target Users

### Dungeon Master (DM)
The primary power user. The DM creates and owns campaigns, manages all hidden and revealed content, and controls what players can see at any given moment.

### Player
A player in one or more campaigns. Players manage their own characters and see content the DM has revealed to them. They have no access to hidden DM data.

---

## What This App Is

- A campaign management dashboard for the DM
- A character sheet viewer and editor for players
- A map upload and token placement tool
- A live session tracker (encounter manager, initiative, HP)
- A notes, quest, NPC, and handout organizer
- A shared space where DM-revealed content becomes visible to players
- A lightweight real-time collaboration tool during sessions
- A mobile-ready player companion and tablet/desktop DM dashboard

---

## What This App Is Not

- A full virtual tabletop replacement (no built-in dice physics, animated scenes, 3D rendering)
- A DnD rules engine or automated rules enforcer
- An AI Dungeon Master or story generator
- A repository of copyrighted DnD sourcebook content
- A procedural world or dungeon generator
- A video/audio conferencing tool
- A Notion-powered live engine — **Notion is documentation, not the live engine.** Notion may sync prep/lore/notes into the app-owned Adventure Codex; live gameplay state (token positions, HP, AC, initiative, dice, action approvals, fog/reveal, turns) is always owned by the app and is never controlled by Notion. See `docs/AdventureCodex_NotionBridge.md`.

---

## DM Role

- Creates and manages campaigns
- Invites players via 8-character invite code
- Creates maps, tokens, NPCs, enemies, quests, notes, handouts, and encounters
- Controls what map areas are visible to players
- Runs encounters and tracks initiative, HP, and status
- Has full visibility into all campaign data (including data hidden from players)

## Player Role

- Joins campaigns via invite code at `/join`
- Creates and maintains their own character sheet
- Views maps as revealed by the DM
- Views handouts, quests, and notes shared with them by the DM
- Cannot see hidden DM notes, hidden tokens, or unexplored map regions
- Cannot edit other players' characters

---

## MVP Definition

The MVP is a campaign management tool that lets a DM run a live session with a small group.

**MVP includes:**
- User auth (email/password)
- Campaign creation and player invite system ✅ (Phase 1)
- Basic character sheets (player-created and editable)
- Map upload with basic token placement
- DM notes and hidden/visible toggle
- NPC and quest tracker
- Encounter tracker with initiative and HP
- Phase 8 polish: session navigation, JSON campaign export, PWA manifest, mobile overflow hardening, safe delete confirmations, and offline warning

**MVP does not include:**
- Full automation of DnD 5e rules
- AI features
- Full restore/import from campaign backups
- Offline-first gameplay or conflict resolution

---

## Long-Term Vision

A fully featured campaign management companion that feels fast and clean during real sessions. The DM has a powerful dashboard. Players have a focused character-centric view. Maps, encounters, and story tools are tightly integrated. The app works well on tablets and eventually phones. Data is safely stored per-campaign and per-user. Everything loads fast and stays in sync.

---

## Technical Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Auth | Supabase Auth |
| Database | Supabase Postgres (RLS enforced) |
| File Storage | Supabase Storage |
| Realtime | Supabase Realtime (Phase 4) |
| Package Manager | npm |
| Deployment | Vercel (planned) |

---

## Key Constraints

1. No copyrighted DnD content stored in the database
2. DM hidden data is never exposed to the player API layer
3. Role separation is enforced at the database level (RLS), not just the UI
4. Manual/flexible data entry is preferred over rigid automation
5. Keep the UI clean and session-usable (not cluttered)

---

## Live Session Safety Rules

- Player action requests use hybrid authorization:
  - Attack requires a visible, non-portal, combat-capable or attack-enabled target.
  - Talk, Investigate, and Custom Action may target any visible non-portal token.
  - Interact, Use Item, and Cast Spell require DM-enabled interaction/action settings.
- Center Screen is player-safe display data. It honors token cast visibility and must not send hidden room/token details to the client.
- Reveal all / hide all are temporary map-level overrides. They do not delete painted reveal areas or room masks.
- Realtime subscribers should recover from degraded channel states by refreshing and resubscribing; degraded state should be visible without noisy alert spam.

---

## File Conventions

- Route groups: `(auth)` for unauthenticated pages, `(app)` for authenticated pages
- Server actions in `lib/actions/`
- Supabase clients in `lib/supabase/`
- Shared types in `lib/types/database.ts`
- UI components in `components/ui/`
- Feature components in `components/<feature>/`
- Auth proxy (middleware) in `proxy.ts`
