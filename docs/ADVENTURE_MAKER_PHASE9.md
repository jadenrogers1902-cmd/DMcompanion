# Adventure Maker Phase 9 - Send Prepared Maps to Live Map

## Status

Code complete; `tsc`, `lint`, and `build` all pass; server boots and unauthenticated
routes redirect correctly. Full happy-path runtime QA requires **migration 023 applied**
and a signed-in DM session.

## Scope

Turns the single "Send to Live Map" action into a deliberate prep→live bridge with
three modes, source tracking, and an overwrite guard — without ever mutating the prep
version and without exposing DM-only content to players.

## Migration

`supabase/migrations/023_live_map_source_tracking.sql` adds
`maps.source_prepared_map_id UUID REFERENCES prepared_maps(id) ON DELETE SET NULL`
(+ index). `ON DELETE SET NULL` means deleting the prep never breaks a deployed live
map. `maps` is realtime-published, so this is an **opaque reference id only** — no
DM-private content lives on the live row; prep content stays behind DM-only RLS.

## Files Changed

- `supabase/migrations/023_live_map_source_tracking.sql` *(new)*
- `lib/types/database.ts` — `maps` Row/Insert/Update + `GameMap` gain `source_prepared_map_id`.
- `lib/actions/prepared-maps.ts` — `sendPreparedMapToLiveMap` now takes a `{ mode }`
  option (`next_scene` | `duplicate` | `replace_active`), sets `source_prepared_map_id`,
  and activates atomically via `set_active_map` for replace. New `getLiveMapDeployContext`
  (active map name + existing deploy count). New exported `DeployMode` type.
- `components/adventures/SendToLiveMapDialog.tsx` *(new)* — `SendToLiveMapButton`: the
  three-mode dialog with a two-step confirm for "Replace current Live Map".
- `components/adventures/PreparedMapEditor.tsx` — uses the dialog; removed the old
  single-button send flow, its state, and the inline banner.
- `app/(app)/campaigns/[id]/live-map/[mapId]/page.tsx` — DM-only "Prep source" link
  back to the originating prepared map (where pinned DM notes & links live).

## Copy / Sync Behavior

| Mode | Effect |
|---|---|
| **Add as next scene** (default) | New **inactive** live map. Players keep seeing the current active map. |
| **Duplicate into Live Map** | New inactive live map named `"… (Copy)"`. For deploying the same prep independently more than once; shows how many times it's already been deployed. |
| **Replace current Live Map** | New live map created, then made active via `set_active_map` (the prior active map is deactivated, **not deleted**). Two-step confirm in the UI, naming the map being replaced. |

Every deploy: copies the image to an independent path in the `maps` bucket, creates a
fresh `maps` row (with `source_prepared_map_id`), copies prepared grid settings, and
instantiates prepared tokens as live `tokens` rows. Prep-only token types collapse to
live types (`item`→`object`, `clue`→`note`, `location`→`custom`).

## How Prepared Maps Are Protected From Live-Session Edits

Deploy only ever **reads** the prepared map and **writes new** independent rows
(`maps`, `tokens`, `token_dm_notes`) plus a copied image. Nothing writes back to
`prepared_maps`. Live-session edits therefore can't mutate prep, and the same prep can
be deployed repeatedly. The link is one-directional: `maps.source_prepared_map_id`
points at the prep, with `ON DELETE SET NULL` so neither side's deletion corrupts the
other.

## How Token Visibility Is Preserved

`reveal_state` collapses through `revealStateIsPlayerVisible()` — **only `visible`**
deploys as `visible_to_players = true`. `hidden`, `revealed`, and `dm_only` tokens
deploy unseen and are revealed live from the Live Map. Player-facing text
(`player_notes` → falls back to `description`) becomes the token's `public_description`.

## How DM-Only Content Stays Hidden

- Per-token DM notes are written to the **DM-only `token_dm_notes`** table (unpublished,
  not broadcast over realtime) — never to the published `tokens` row.
- Map-level **pinned DM notes and important links are never copied onto the published
  live map** (that row reaches players when active). They stay in the DM-only prep
  tables, reachable by the DM via the new "Prep source" link on the live map page.
- `source_prepared_map_id` is an opaque id; prep rows remain behind DM-only RLS, so a
  player receiving the active map's id gains nothing.

## Manual QA Results

- [x] `npx.cmd tsc --noEmit` passes.
- [x] `npm.cmd run lint` passes.
- [x] `npm.cmd run build` passes.
- [x] Server boots; `/login` 200; unauthenticated `/campaigns/*/live-map/*` → 307 to `/login`.
- [ ] (needs migration 023 + DM session) Add as next scene → new inactive map appears.
- [ ] Duplicate → independent `"(Copy)"` map; deploy count increments.
- [ ] Replace → two-step confirm; new map becomes active; prior active map deactivated, not deleted.
- [ ] Hidden/revealed/dm_only tokens deploy unseen; visible tokens are player-visible.
- [ ] Player view never shows DM-only token notes after deploy.
- [ ] "Prep source" link appears for deployed maps (DM) and routes to the prep editor.
- [ ] Editing the deployed live map leaves the prepared map unchanged.

## Out Of Scope (per the brief)

No action-request remaster, no roll-logic rebuild, no nudge rebuild, no DM-only data
exposed to players, and Live Map edits do not write back to Adventure Maker prep.

## Known Limitations

- Map-level pinned DM notes/links are surfaced via the prep back-link rather than copied
  onto the live map (intentional, to avoid leaking DM content onto the realtime-published
  `maps` row).
- Map-level prepared `links` still don't transfer as live link objects (no live column);
  the back-link covers DM access.
- Token coordinates remain in image-pixel space across image replacement (pre-existing).
- Runtime QA blocked until migration 023 is applied in Supabase (same pattern as 015–022).

## Recommended Next Phase

The deferred **Live Map action/roll remaster**: fix the roll button, add visual dice +
manual roll entry, share roll state across screens, stacked DM action cards, wire Nudge
DM highlighting to the related card, and the Dominoes-style action tracker.
