# Live Map / Adventure Maker — Phase 1 (Rename + Separation)

## Status

Phase 1 implemented (2026-06-09). The existing map feature is now **Live Map** —
the DM's active session dashboard. **Adventure Maker** (prep tool) is named and
scaffolded but not yet built.

## Vocabulary

| Term | Meaning | Code home |
|---|---|---|
| **LiveMap** | The active-session surface: active map, live tokens, fog reveals, movement, interaction menus. Route: `/campaigns/[id]/live-map`. | `app/(app)/campaigns/[id]/live-map/`, `components/maps/` |
| **AdventureMaker** | Future prep surface (slides/Notion-style) where the DM authors adventures before play. | Not yet built |
| **Adventure** | A prepared module: ordered chapters authored before the session. | `lib/types/adventure.ts` (forward declaration) |
| **Chapter** | One slide/section of an Adventure; stages prepared maps, encounters, notes. | `lib/types/adventure.ts` (forward declaration) |
| **PreparedMap** | Reusable map template (image + grid settings + pre-placed token layout). Deploying creates a live `GameMap` without mutating the original. | `lib/types/adventure.ts` (forward declaration) |
| **Token** | A live, realtime token on the active map (`tokens` table). Prepared placements are `PreparedTokenPlacement`, instantiated as Tokens on deploy. | `lib/types/database.ts` |

## What changed in Phase 1

### Route rename

- `app/(app)/campaigns/[id]/maps/` → `app/(app)/campaigns/[id]/live-map/`
  (including `new/` and `[mapId]/` subroutes).
- `next.config.ts` adds a redirect: `/campaigns/:id/maps/:path*` →
  `/campaigns/:id/live-map/:path*` (temporary 307) so old bookmarks keep working.

### Reference/label updates

- `components/nav/Sidebar.tsx` — DM nav label `Map` → `Live Map`; href updated.
  Player label stays `Adventure` (it was never "Map" and is the player-facing
  name for the same live surface).
- `components/nav/MobileNav.tsx` — same label/href change.
- `components/nav/DMUtilityPanel.tsx` — quick link `Go to Map` → `Go to Live Map`.
- `app/(app)/campaigns/[id]/page.tsx` — Session Control card `Go to Map` →
  `Go to Live Map`; "Active map" metric + player Adventure card hrefs updated.
- `app/(app)/campaigns/[id]/live-map/page.tsx` — DM heading `Maps` → `Live Map`,
  description now reads as the live session dashboard.
- `app/(app)/campaigns/[id]/live-map/[mapId]/page.tsx`,
  `.../live-map/new/page.tsx` — back links `Back to maps` → `Back to Live Map`.
- `lib/actions/maps.ts`, `lib/actions/state-updates.ts` — all
  `revalidatePath`/`redirect` targets moved to `/live-map`.
- `components/maps/MapUploader.tsx` — post-upload `router.push` target updated.

### New scaffolding

- `lib/types/adventure.ts` — forward declarations for `Adventure`, `Chapter`,
  `PreparedMap`, `PreparedTokenPlacement`, with doc comments separating
  prep-side types from the live `GameMap`/`Token` runtime types.

## Live Map vs Adventure Maker — current file inventory

### Stays in Live Map (runtime/session)

- `components/maps/PlayerMapView.tsx` — player live view: movement, guided
  action prompts, interaction (hand) menu, party messages entry points.
- `components/maps/MapCanvas.tsx` — shared renderer (pan/zoom, grid, fog,
  tokens, drag). Will be REUSED by Adventure Maker for prep-time placement —
  keep it presentation-only, no session logic.
- `lib/hooks/useTokenRealtime.ts`, `lib/hooks/useRealtimeRefresh.ts` — realtime
  sync, live-only.
- `lib/actions/maps.ts` — live map CRUD + `movePlayerToken` + settings autosave.
  CRUD parts (create/grid settings) will be shared with prep later.
- Fog/reveal areas, interactable objects, action intents/rolls, party messages —
  all session runtime.

### Splits later (live + prep mix today)

- `components/maps/MapEditor.tsx` — currently both prep (upload, grid config,
  token placement, DM notes) and live (movement locks, reveal tools, active-map
  switch). The prep half is the seed of Adventure Maker's map editor; the live
  half stays as the Live Map DM dashboard.
- `components/maps/MapUploader.tsx` — map upload/creation; Adventure Maker will
  want the same flow targeting PreparedMaps.
- `app/(app)/campaigns/[id]/live-map/page.tsx` DM branch — today it's a map
  *library* list. Once Adventure Maker exists, the library/prep aspect moves
  there and this page should center on the *active* session map.

### Future Adventure Maker (not yet built)

- Routes (suggested): `/campaigns/[id]/adventures`, `/adventures/[advId]`,
  chapter editor inside.
- New tables: `adventures`, `chapters`, `prepared_maps` (see
  `lib/types/adventure.ts`), plus a "deploy to Live Map" action that
  instantiates a `GameMap` + `tokens` from a `PreparedMap`.

## Cleanup for a later phase

- `components/maps/` directory name and `MapEditor`/`MapUploader` component
  names are unchanged (kept to avoid churn); rename or split when Adventure
  Maker lands (e.g. `components/live-map/`, `components/adventure-maker/`).
- `lib/actions/maps.ts` is a grab-bag of prep CRUD + live actions; split when
  prep moves out.
- Docs/QA files still say "Maps page" in places; update opportunistically.
- The DM live-map page is still a map list, not a true dashboard; revisit in
  the Adventure Maker phase.

## Risks found

- Old `/campaigns/[id]/maps` URLs are covered by the next.config redirect, but
  server actions now revalidate only `/live-map` paths — any tab still sitting
  on an old URL after deploy won't refresh; it will redirect on next
  navigation. Low impact.
- Playwright tests in `tests/` had no `/maps` route references (verified).
- No DB or storage changes — the `maps` table, `maps` storage bucket, and all
  RLS are untouched. Only the Next.js route segment and UI copy changed.

## QA run for this phase

- `npx tsc --noEmit` — pass
- `npx eslint` (changed files) — pass
- `npm run build` — pass (routes `/campaigns/[id]/live-map`, `/live-map/new`,
  `/live-map/[mapId]` present; no `/maps` route emitted)
- Manual: DM + player navigation, map editor, token render/movement — to be
  verified in the next runtime session.
