# DM Layout Requirements

## Status

Implemented as a desktop/laptop-focused layout pass for the DM-facing campaign workspace.

## Layout Priorities

- DM campaign routes should favor laptop and desktop browser use.
- Player routes should remain mobile-first.
- Map editing should receive the largest possible workspace.
- Secondary controls should be available without forcing permanent cramped forms.
- Side navigation and utility panels should be collapsible or compact where possible.

## Implemented DM Shell Behavior

- The authenticated app shell now prevents page-level horizontal overflow and gives the main workspace `min-w-0`.
- Desktop sidebar can collapse from full labels to a compact icon/initial rail.
- Campaign navigation labels now map to session tasks: Dashboard, Map, Players, Requests, Encounters, Story, Settings.
- DM-heavy pages use wider laptop-friendly containers.
- DM campaign dashboard uses an at-a-glance session layout with active map, request count, player count, and character count.
- A collapsible `DMUtilityPanel` is available on DM dashboard, maps list, and action queue pages at desktop widths.

## Map Editor Behavior

- The DM map editor route uses a wide `max-w-[1800px]` workspace.
- Map editor tools are collapsible.
- Map tools only sit beside the map at extra-wide widths; on smaller laptop widths the map keeps priority.
- Token/object editing remains handled by floating context menus and tabbed popups instead of long permanent forms.

## Responsive Targets

Desktop/laptop targets:

- 1024x768
- 1280x720
- 1366x768
- 1440x900
- 1536x864
- 1920x1080

Expected behavior:

- Sidebar remains usable and can be compacted.
- Main workspace avoids horizontal overflow.
- Utility panel appears at `xl` widths and can be collapsed.
- Map editor can hide secondary tools to prioritize the map.

## Known Limitations

- The utility panel currently shows safe session links and aggregate counts, not inline approve/deny buttons.
- Browser viewport screenshots could not be captured in this Windows sandbox.
- Cast-screen-specific layout remains a documented future shell rather than a dedicated route in this codebase.
