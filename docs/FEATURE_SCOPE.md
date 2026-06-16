# Feature Scope

## MVP — Build This First

These features define the minimum viable product for a functional campaign management session.

- User registration and login (email/password and magic link)
- Campaign creation, listing, and deletion
- Campaign invite system (link or code-based)
- DM and Player role separation per campaign
- Character sheet create and edit (player-owned)
- DM dashboard: view all characters in a campaign
- Map upload (image file)
- Basic token placement on a map
- Fog of war: DM reveals/hides map regions
- Token types: player, NPC, enemy, object
- DM notes (hidden and shared variants)
- NPC list with notes
- Quest tracker (active, completed, failed)
- Encounter tracker: combatant list, initiative order, HP
- Turn tracker for combat
- Handout creation and player reveal
- Protected routes by role
- Basic responsive layout (desktop-first, tablet-acceptable)

---

## Later — Build After MVP

These features enhance the MVP experience but are not required for initial launch.

- Real-time token movement (Supabase Realtime)
- Live session sync (all clients update simultaneously)
- Status condition tags on combatants (blinded, stunned, etc.)
- Session notes and session history log
- Timeline or chapter markers for campaigns
- Inline search across campaign notes
- Quick-reference ability/spell descriptions (user-entered)
- Player token movement controls (DM-gated)
- Grid overlay toggle on maps
- Multiple maps per campaign
- Map layers (floor, ceiling, etc.)
- Responsive mobile layout
- PWA manifest
- Dark/light theme toggle
- Keyboard shortcuts for DM during session
- Export campaign data as JSON or PDF

---

## Do Not Build Yet

These are explicitly out of scope for the current development cycle. Do not begin work on these without a deliberate phase decision.

- **Full DnD 5e rules engine** — automated spell slots, spell effects, damage types, condition immunity, action economy tracking
- **Full character automation** — auto-calculated stats, level-up automation, feature/trait lookups from books
- **AI Dungeon Master** — generative story narration, AI-run combat, NPC AI dialogue
- **AI adventure/encounter generation** — procedurally generated quests, rooms, or enemy groups
- **Procedural map generation** — auto-generated dungeon rooms, wilderness areas
- **3D or animated gameplay** — any rendering beyond a 2D overhead map view
- **Video or voice conferencing** — this app is not a communication platform
- **Copyrighted sourcebook content** — no storing or serving DnD rulebook text, monster stat blocks, or spell lists from official books
- **Full virtual tabletop engine** — physics-based dice, lighting simulation, animated fog of war
- **Marketplace or content store** — no selling or trading of in-app assets
- **Mobile-native app** — iOS or Android app build (web-first only for now)
