# Adventure Maker — Phase 5 (Token System)

## Status

Implemented (2026-06-09). Prepared-map tokens are now Notion-style database
items: typed, icon-bearing, with audience-split notes, typed resource links,
and four-state visibility rules. Clicking a token (map or list) opens a token
detail panel. Follows `docs/ADVENTURE_MAKER_PHASE4.md`.

## Data model — NO new migration

Tokens remain JSONB on `prepared_maps.tokens` (migration 021), so Phase 5 is
purely a shape extension. `PreparedMapToken` now stores:

- `token_type`: prep vocabulary — `enemy | npc | item | trap | door |
  location | clue | loot | custom` (distinct from the live 16-type set)
- `icon` (emoji glyph rendered on the map), `color`, `size`, `x`, `y`
- `reveal_state`: `dm_only | hidden | visible | revealed`, with
  `visible_to_players` kept in sync (true only for `visible`) so the shared
  canvas styling, preview filter, and deploy all read one source of truth
- `description` (player-safe), `dm_notes` (private), `player_notes`
  (read-aloud; becomes live `public_description` on deploy)
- `links`: `{ id, title, url, type: wiki | dnd_beyond | srd | roll20 | custom }`

The spec's `adventureId/chapterId/mapId` are implicit (tokens live on their
`prepared_maps` row); `createdAt/updatedAt` exist at map level via the row's
trigger. Older Phase 4 tokens are normalized on load
(`normalizePreparedToken`) — no data migration needed.

Server-side sanitization (in `savePreparedMap`) caps and clamps everything:
name 80, icon 8, description/player notes 2000, DM notes 4000, 20 links per
token, color/size/coordinate validation.

## Components

- `components/adventures/token-meta.ts` — single source of token metadata:
  `PREPARED_TOKEN_TYPES` (label/icon/color/default-reveal per type — traps,
  clues, and loot default to `hidden`; the rest to `visible`),
  `REVEAL_STATE_OPTIONS` (labels + hints), `toLiveTokenType()` (deploy
  mapping: item→object, clue→note, location→custom, rest direct),
  `detectLinkType()` (auto-categorizes dndbeyond.com / roll20.net /
  5esrd-5e.tools-wikidot / wiki domains), `normalizePreparedToken()`.
- `components/adventures/TokenDetailPanel.tsx` — NEW Notion-style token page:
  right-side drawer on desktop, bottom sheet on mobile. Inline title with the
  icon chip, properties grid (type — switching re-derives icon/color only if
  the DM hasn't customized them — icon, visibility with per-state hint,
  size, color), Description, Player Notes, DM Notes (visually marked
  private), typed Links with auto-detect and open-link affordance, Remove
  Token. All edits flow into the editor's local state; the editor's single
  Save persists them.
- `components/adventures/PreparedMapEditor.tsx` — token list rows now show
  icon chips + reveal-state tags; the old inline token form is replaced by
  the detail panel; quick add keeps one-click defaults (enemy/⚔️/visible)
  and opens the panel.
- `components/maps/MapCanvas.tsx` — `RenderToken` gains optional `icon`,
  rendered instead of the name/type initial when present (additive; live
  maps unaffected).

## Deploy changes (`sendPreparedMapToLiveMap`)

- Prep types map via `toLiveTokenType`.
- Only `visible` tokens deploy player-visible; `hidden`/`revealed`/`dm_only`
  deploy with `visible_to_players=false` for live reveal. (`revealed`'s
  "after interaction" semantic is a prep-planning hint — live auto-reveal on
  interaction is not wired.)
- `player_notes` (or `description` as fallback) → live `public_description`.
- NEW: per-token `dm_notes` now transfer into the live `token_dm_notes`
  table (unpublished, DM-only) — closing a Phase 4 limitation. Best-effort:
  a notes failure doesn't fail the deploy.

## QA

- `npx tsc --noEmit`, `npx eslint`, `npm run build` — all pass.
- No migration to run — works as soon as 021 is applied (Phase 4 prereq).
- Runtime checklist (add/move/edit/delete tokens, links, visibility toggles,
  save + reload, desktop drawer + mobile sheet interactions) ready once 021
  is in Supabase.
