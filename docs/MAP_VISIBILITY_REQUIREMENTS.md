# Map Visibility Requirements (Phase 9)

This document describes the live DM-controlled map visibility ("fog of war
v1") system, what it does and does not do, and the manual two-browser test
checklist for verifying it.

## Scope

In scope (implemented):
- DM can reveal or hide the entire active map for players, live.
- DM can draw rectangle and circle "revealed areas" directly on the map canvas
  by dragging.
- DM can toggle any revealed area back to hidden (and re-reveal it later)
  without losing/recreating it, and can delete areas outright.
- Players see an opaque fog overlay over anything not currently revealed, with
  smooth live updates as the DM changes what's revealed (no page refresh).
- Per-token visibility (`tokens.visible_to_players`) remains independent of
  and layered on top of the area-reveal system — both must allow a thing to be
  seen for a player to see it.

Explicitly out of scope (per product direction — do not build):
- Dynamic lighting / line-of-sight calculation.
- Wall collision or vision-blocking geometry.
- Automated fog-of-war ("explored" memory, vision radius from tokens).
- Free-hand fog brush / painting tools (only rectangle/circle/full shapes).
- Any full virtual-tabletop automation.

## Data model

See `DATA_MODEL_NOTES.md` → "Phase 9 Addendum" for the full `map_revealed_areas`
schema. Key points:
- Shapes: `full` (reveal everything), `rectangle` (x, y, width, height),
  `circle` (x, y, radius). World-space coordinates, same space as tokens.
- `visible_to_players` is the live on/off switch — toggling it doesn't delete
  the row, so the DM can blink an area in and out.
- RLS: players can only ever `SELECT` rows that are `visible_to_players = true`
  on the campaign's active map. There is no player write policy at all.

## How visibility is enforced (not just hidden in the UI)

1. **Database-level (RLS)** — the player's Supabase client can only fetch rows
   that already satisfy `visible_to_players = true AND map.is_active = true`.
   A hidden area never reaches the player's browser, so there's nothing to
   "unhide" via devtools or API calls.
2. **Realtime delivery mirrors RLS** — `map_revealed_areas` is in the realtime
   publication with `REPLICA IDENTITY FULL`. When the DM flips an area from
   visible to hidden, the row no longer matches the player's RLS filter, and
   Supabase Realtime delivers that change to the player's subscription as an
   effective delete — the cutout disappears from their fog overlay live, the
   same pattern already used for token visibility toggles.
3. **Rendering** — `MapCanvas` renders an SVG `<mask>`: a white full-canvas
   base with black cutout shapes for every revealed area, then paints a dark
   `rgba(9,9,21,0.92)` rectangle through that mask. Only `fogEnabled` (player
   mode) renders the opaque overlay; DM mode instead renders dashed reference
   outlines so the DM can see exactly what they've revealed without obscuring
   their own view.

## DM UI

Located in the Map Editor (`/campaigns/[id]/maps/[mapId]`) → "Revealed Areas"
panel:
- **Reveal entire map** / **Hide entire map** buttons (`revealEntireMap`,
  `hideEntireMap` server actions — upsert/toggle a `shape_type = 'full'` row).
- **Rectangle** / **Circle** draw-tool toggle buttons — while active, dragging
  on the canvas draws a live amber preview shape; releasing calls
  `addRevealedArea` with rounded world coordinates.
- A scrollable list of all areas for the map with a visibility toggle
  (`setRevealedAreaVisibility`) and a remove button (`deleteRevealedArea`) per
  row.

## Player UI

On `/campaigns/[id]/maps` (active map view):
- The map renders with the fog overlay always on (`fogEnabled`).
- If no areas are revealed at all, an overlay banner reads "The DM has not
  revealed this map yet."
- Selecting a visible token shows its `public_description` and (if not the
  default `visible` state) its `object_state`.

## Manual two-browser test checklist

Setup: two browser sessions/profiles, one signed in as the campaign DM, one as
a player who is a campaign member with a linked character/token on the active
map. Apply migration `008_map_visibility_objects.sql` first.

Visibility:
- [ ] Player sees "The DM has not revealed this map yet." when no areas exist.
- [ ] DM clicks "Reveal entire map" → player's fog disappears immediately, no refresh.
- [ ] DM clicks "Hide entire map" → player's fog returns immediately.
- [ ] DM selects rectangle tool, drags a box → player sees a new clear cutout appear live in roughly the same place.
- [ ] DM selects circle tool, drags a circle → player sees a new circular cutout appear live.
- [ ] DM toggles an area's visibility off → the cutout disappears from the player's view live (without the area being deleted from the DM's list).
- [ ] DM toggles it back on → the cutout reappears live.
- [ ] DM deletes an area → it disappears from both the DM list and the player's fog live.
- [ ] Player cannot find any UI control to reveal, hide, draw, or delete areas.
- [ ] Player's network/devtools show no `map_revealed_areas` rows with `visible_to_players = false`, and no rows for inactive maps.
- [ ] Switching the DM's active map changes which map's areas the player sees (old map's reveal state has no effect on the new active map).
- [ ] DM's own view never shows the opaque fog overlay (dashed outlines only).
- [ ] Per-token visibility still works independently — a hidden token stays hidden even inside a revealed area, and a visible token in a hidden area is still not shown to players (fog wins).
- [ ] Realtime updates keep working across a full session (no stale state after several reveal/hide cycles).
