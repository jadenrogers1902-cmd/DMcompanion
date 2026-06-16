# Cast View Requirements

## Status

No dedicated cast route was added or redesigned in this layout pass.

## Requirements

Future cast view should:

- Use a fullscreen display shell.
- Avoid DM navigation and utility panels.
- Show only player-safe / public-safe data.
- Never expose hidden tokens, DM notes, private resolver details, or unrevealed handouts.
- Work well at TV-like sizes such as 1920x1080.

## Current Preservation Notes

- Existing player-safe action result fields remain unchanged.
- No layout component added in this pass is mounted globally in a way that would force DM controls onto a future cast route.
- The new `DMUtilityPanel` is only wired into DM campaign pages.

## Manual Verification Pending

A cast route should be verified once implemented. For now, there is no cast route to screenshot.
