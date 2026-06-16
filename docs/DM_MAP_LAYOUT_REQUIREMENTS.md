# DM Map Layout Requirements

## Status

Implemented as a fullscreen laptop map-editor layout pass, with a follow-up fix to make the
right-side tool panel scroll independently of the page (see `PHASE_COMPLETION_REPORT.md`).

## Page-Level Scroll Prevention

- The route layout (`app/(app)/layout.tsx`) constrains the app shell to `h-screen overflow-hidden`,
  with the scrollable `<main>` taking the remaining width.
- The map page (`app/(app)/campaigns/[id]/maps/[mapId]/page.tsx`) wraps its content in
  `flex h-full min-h-0 flex-col overflow-hidden`, matching `<main>`'s box exactly.
- `MapEditor`'s root now uses `flex min-h-0 flex-1 flex-col overflow-hidden` (previously `h-full`,
  which double-counted the back-link row's height and caused content to be clipped or the page to
  scroll). Using `flex-1` lets it correctly share height with the `shrink-0` back-link row.
- Net effect: the map route never grows taller than the viewport, so `<main>` has nothing to
  scroll during normal map use.

## Current Layout

- Left sidebar navigation remains outside the map workspace.
- The map editor route fills the authenticated app viewport.
- The center map workspace receives the primary available area.
- Map tools live in a right-side panel instead of below the map on desktop/laptop widths.
- The right-side panel uses task tabs instead of one long permanent form.

## Right-Side Tool Panel

Tabs:

- Token: selected token summary, edit entry point, and movement shortcuts.
- Reveal: reveal whole map, hide/clear, rectangle/circle reveal tools, revealed area list.
- Grid: grid visibility, square size, feet per square, and save.

The right panel is `flex min-h-0 flex-col overflow-hidden`; its content area is
`min-h-0 flex-1 overflow-y-auto p-3`, so only that inner region scrolls. The panel never grows
taller than the grid row it occupies (`h-full` of the grid, which itself is `min-h-0 flex-1
overflow-hidden`), so scrolling it never pushes the map or the page.

## Floating Token Tools

- The floating `+` bubble remains on the map and opens the add-token menu without pushing layout.
- Selecting a token opens the compact context menu near the token.
- Detailed token editing remains in the tabbed floating editor: Basic, Actions, Visibility, Combat, Notes, Advanced.

## Pan And Zoom

- Wheel handling is attached directly to the map viewport with a non-passive listener.
- Wheel events call `preventDefault()` and `stopPropagation()`.
- Zoom uses cursor-relative coordinates so the same world point remains under the cursor after zoom.
- Map pan/zoom is isolated inside `MapCanvas`; page scroll should not move during wheel zoom over the map.

## Responsive Behavior

- Desktop/laptop: right tool panel is visible when tools are open.
- Smaller laptop widths: the tools can be hidden with the toolbar button to restore map width.
- Tablet/mobile DM: layout can stack, but map tools remain accessible and internally organized.
- Player map view is not changed by this DM editor layout.

## Manual Verification Pending

Browser automation could not attach in this Windows sandbox. Manual checks are still required at:

- 1024x768
- 1280x720
- 1366x768
- 1440x900
- 1536x864
- 1920x1080
