# Map Editor UI Requirements

## Status

Implemented as a focused token/object editing UX pass.

## Current Token Editing Model

- Token creation is handled from a floating `+` bubble on the map canvas.
- Selecting a token opens a compact context menu near the selected token.
- Detailed token editing opens in a floating tabbed editor instead of the old long right-side form.
- The right side panel is reserved for compact map-level tools such as token summary, reveal areas, and grid settings.
- Map editing tools should not render as full-width panels below the map during desktop/laptop use.

## Floating Add Menu

- The add menu is anchored to the lower-left of the map canvas (`absolute bottom-4 left-4 z-20`).
- It uses the same fully opaque `bg-zinc-950` fill, `zinc-700` border, and `shadow-2xl` as the
  context menu so it reads clearly against the map and never blends in, and caps its own height
  (`max-h-[calc(100%-1.5rem)] overflow-y-auto`) so it cannot force page scroll.
- It supports all current token types from `TOKEN_TYPES`.
- New tokens are still created through the existing `addToken` server action.
- Newly created tokens are selected immediately and open the quick menu.

## Token Context Menu

The selected-token context menu includes:

- Edit Details
- Actions
- Visibility
- Health
- Notes
- Advanced
- Reset movement
- Reset position
- Lock/unlock token
- Allow/block movement override
- Delete token

The menu is positioned from token map coordinates and clamped inside the canvas area
(`clamp(...)` left/top so it cannot drift outside the map workspace, and therefore cannot land
behind the right-side tool panel). It uses a fully opaque `bg-zinc-950` fill with a `zinc-700`
border and `shadow-2xl` for strong contrast against the map, sits at `z-30` (above the canvas and
add bubble), and caps its own height (`max-h-[calc(100%-1.5rem)] overflow-y-auto`) so it scrolls
internally rather than spilling out of the viewport on short screens.

## Right-Side Map Tool Panel

The desktop/laptop map editor uses a right-side tool panel with task tabs:

- Token
- Reveal
- Grid

The panel scrolls internally if needed. The page itself should remain stable during normal map use.

## Tabbed Token Editor

Tabs:

- Basic: name, type, size, linked character, object state.
- Actions: interactable, approval requirement, interaction range, allowed actions, hidden DM-only actions, resolver type.
- Visibility: player visibility, cast visibility, player-visible note, public description.
- Combat: AC, max HP, current HP, temp HP, defeated.
- Notes: private DM note.
- Advanced: movement summary and guidance for quick-menu movement controls.

The editor uses Save/Cancel behavior. Draft changes are saved through the existing token update action, while DM notes continue to save through the private `token_dm_notes` path.

## Mobile Handling

- The token editor becomes a fixed bottom sheet on small screens.
- Tabs horizontally scroll to avoid squeezed labels.
- Add menu width is constrained to the viewport.
- Context and editor controls use compact, touch-friendly buttons.
- On non-desktop widths, tools may stack, but they remain organized by the same task groups.

## Realtime And Security

- Token movement and updates still use the existing map server actions.
- Token realtime still flows through `useTokenRealtime`.
- Hidden tokens remain filtered from player map/action views by existing queries and RLS.
- DM notes remain separate from token rows and are not part of player realtime payloads.
- No new permissions or player mutation paths were introduced.

## Pan / Zoom

- Map wheel zoom is cursor-focused.
- The wheel listener is non-passive so `preventDefault()` works.
- Wheel zoom is isolated to the map viewport and should not scroll the page.

## Known Limitations

- Duplicate token is not implemented yet.
- The context menu position is based on token map coordinates, so heavy pan/zoom may make it approximate rather than perfectly attached to the rendered token.
- Browser viewport screenshots still need manual verification in this Windows sandbox.
