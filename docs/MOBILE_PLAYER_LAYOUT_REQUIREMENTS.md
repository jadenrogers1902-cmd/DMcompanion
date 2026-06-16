# Mobile Player Layout Requirements

## Status

Preserved during the DM laptop layout pass.

## Player Layout Priorities

- Player routes remain mobile-first.
- Mobile bottom navigation remains the primary player navigation.
- Player pages keep narrow, readable containers.
- Player map view remains focused on the active revealed map.
- Player action view remains a mobile-friendly stacked workflow.
- Player journal and character screens remain touch-oriented and uncluttered.

## Target Viewports

- 375px mobile
- 390px mobile
- 430px large mobile
- 768px tablet

## Preserved Behavior

- `/campaigns/[id]/maps` still branches to `PlayerMapView` for players.
- `/campaigns/[id]/actions` still branches to `PlayerActions` for players.
- `/campaigns/[id]/characters` still uses the player character card layout for players.
- `/campaigns/[id]/story` still uses the player journal branch for players.
- DM utility panels are only rendered in DM branches.

## Security Notes

- Player pages continue to rely on existing RLS and player-safe selects.
- Hidden tokens remain absent from player map/action views.
- DM-only notes are not fetched by player branches.
- No DM desktop utility component is rendered for player routes.

## Manual Verification Pending

Browser viewport screenshots still need to be captured manually at 375px, 390px, 430px, and 768px.
