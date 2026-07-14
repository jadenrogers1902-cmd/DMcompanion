# Player Adventure Hub Requirements

## Naming Distinction

- **Player section:** `Adventure`
- **DM section:** `Live Map` / `Map Editor`
- **Cast section:** `Center Screen` / `Cast View`

The shared route is `/campaigns/[id]/live-map`. Player navigation keeps the
stable noun **Adventure** and shows a separate live indicator when a session is
running; it no longer changes the destination name to `Tabletop`.

## Status

Implemented. `PlayerMapView` remains the in-session Adventure hub and now gives
players more visible navigation cues without changing its gameplay model.

## Current Visual Navigation

- The phone and desktop campaign navigation both call the player route
  **Adventure**. The phone bar adds a live dot without renaming it.
- The map has labeled **Character** and **Actions** launchers; the icons remain as
  quick visual recognition aids.
- A compact **Hand / Move / Target / Actions** legend matches the visible controls.
  **Map help** expands to the complete pan, pinch, drag, target, and grid-scale
  instructions.
- The travel and guided-action overlays use the shared accessible modal shell
  with focus trapping, Escape/backdrop close, focus return, and readable mobile
  scrolling.
- Revealed player and Center Screen tokens can display validated token artwork.
  The existing color/initial/icon remains underneath as the failure fallback.

## Preserved Hub Mechanics

- The active revealed map remains the dominant canvas.
- Hand, Move, and Target modes; Fit and center-on-character controls; movement
  preview/confirmation; collision checks; and movement allowance are unchanged.
- Selecting an interactable, player-visible token still shows only DM-authorized
  actions and uses the existing guided request/roll flow.
- Character information, inventory, spells, abilities, conditions, Notes,
  requests, party communication, travel parties, and transport voting remain
  reachable in place.
- No action type, selected-tool behavior, travel option, message flow, roll state,
  or map interaction was removed.

## DM and Cast Boundaries

- DM map navigation, editing tools, token authoring, fog, rooms, walls, grid,
  encounter controls, and cast controls are unchanged.
- Center Screen receives token artwork only from the same sanitized snapshot it
  already consumed and still respects `visible_on_cast`, discovery, and player
  visibility rules.

## Routing, Realtime, and Security

- No route changed. `/campaigns/[id]/live-map` continues to branch by membership
  role and active-map state.
- Player movement still calls the guarded `move_player_token` RPC; action, roll,
  travel, message, and realtime code paths are unchanged.
- Token artwork is presentation-only and accepts local paths or the exact
  configured Supabase origin. Hidden tokens never receive artwork in player or
  Center Screen render data.
- No schema, migration, RLS policy, RPC signature, server action, or query scope
  changed in this pass.

## Verification Boundary

- TypeScript, ESLint, theme, unit-contract, and production-build results belong in
  `docs/QA_Reports/PLAYER_VISUAL_NAVIGATION_QA_2026-07-14.md`.
- Authenticated phone movement, travel, action/roll, two-player realtime, and
  Center Screen visual proof remain pending until disposable player fixtures are
  configured.
