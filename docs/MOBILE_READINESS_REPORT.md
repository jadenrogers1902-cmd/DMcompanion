# Mobile Readiness Report

## Phase 8 Summary

Status: Code polish complete; manual viewport screenshot pass still needed.

The app now has campaign-aware mobile navigation, install-friendly PWA metadata, a manifest, an app icon placeholder, an app loading state, and global overflow protection for long campaign/story text. These changes target the common live-session problem: players need to reach character sheets, maps, actions, and the journal quickly on a phone.

## Implemented Improvements

- Mobile bottom nav switches to campaign session shortcuts when inside `/campaigns/[id]`.
- Current campaign shortcuts: Home, Sheet, Map, Act, Journal.
- Desktop sidebar shows Current Campaign shortcuts while inside campaign routes.
- Bottom nav respects safe-area inset for mobile browsers.
- Long text wraps instead of forcing horizontal overflow.
- App loading skeleton added for protected routes.
- Offline warning added when `navigator.onLine` reports a lost connection.
- PWA manifest added at `/manifest.webmanifest`.
- Install icon placeholder added at `/app-icon.svg`.

## Viewport Checklist

Browser automation could not attach in this Windows sandbox, so these remain manual checks:

- 375 px mobile: verify bottom nav labels fit and campaign cards do not overflow.
- 430 px large mobile: verify maps/actions/story pages remain readable.
- 768 px tablet: verify player map and journal layouts are comfortable.
- 1024 px laptop: verify DM dashboard and story tabs are usable.
- 1440 px desktop: verify DM map/encounter/story workflows have enough density.

## Known Mobile Risks

- Map editing is still best on tablet/desktop; phone map editing may be cramped.
- Player map view depends on image dimensions and token density; very large maps may require additional control polish later.
- Full offline play is not supported. The app only warns when the browser reports offline status.

## Recommendation

The player-facing mobile experience is ready for a real play-session test after manual viewport review. DM use should prefer laptop/tablet for map editing and encounter management.
