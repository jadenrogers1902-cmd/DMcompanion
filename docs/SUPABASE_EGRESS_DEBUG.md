# Supabase Egress Debug Guide

Use this when live-map usage looks too high in Supabase.

## What to Check First

- Supabase Usage dashboard: compare `Egress` vs `Cached Egress`.
- Confirm whether the spike is mostly Storage or Database egress.
- Focus first on the `DnD Companion` project and the current billing window.

## Expected Healthy Behavior After The Live-Map Fix

- Token movement should not change the rendered map image URL.
- Center-screen and player map should update from realtime state, not route refreshes.
- Cached egress should improve because live map images now use stable private URLs.
- Storage egress should grow much more slowly during normal tabletop play.

## Fast QA Loop

1. Open player live map, DM live map, and center-screen for the same map.
2. In browser dev tools, watch the Network panel for the map image request.
3. Move tokens, reveal fog, update room state, and change travel-party state.
4. Confirm the map image request is not re-fired for each gameplay update.
5. Hard refresh once and confirm the image URL stays on the app route:
   `/api/campaigns/:campaignId/maps/:mapId/image?v=...`

## Useful App-Side Signals

- Dev logs from live map routes should show they are using the stable private map image URL path.
- Dev logs from player/center-screen components should show the current image URL only when it actually changes.
- Route refreshes are still acceptable for true page-identity changes, like switching the active map.

## If Egress Is Still High

- Check for repeated full-page refreshes on live routes.
- Check whether multiple browser tabs/screens are all requesting the same map image.
- Check for unusually large map files even after client-side compression.
- Check whether database egress is being driven by broad `select('*')` queries on live routes.
- Compare Storage egress to Database egress before assuming the image path is still the main issue.
