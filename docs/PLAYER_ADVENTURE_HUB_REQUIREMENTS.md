# Player Adventure Hub Requirements

## Naming Distinction (must not be mixed)

- **Player section**: `Adventure`
- **DM section**: `Map` / `Map Editor` / `Live Map`
- **Cast section**: `Cast View` / `Table View` / `Live Display`

The underlying route is unchanged (`/campaigns/[id]/maps`); only the player-facing label changes
to `Adventure`. DM-facing labels for the same route stay `Map` / `Maps` / `Active map`.

## Status

Implemented. The player map screen (`PlayerMapView`) is now framed as the in-session Adventure
hub: contextual action menus open directly on tapped tokens, and a floating quick-access button
opens slide-up sheets to Character, Quests/Journal, and Requests — all without navigating away
from the map.

## What Changed

- Renamed player-facing "Map" labels to "Adventure":
  - `components/nav/MobileNav.tsx` — bottom nav label (player role only).
  - `components/nav/Sidebar.tsx` — desktop campaign nav label (player role only).
  - `app/(app)/campaigns/[id]/maps/page.tsx` — empty-state `<h1>` and an "Adventure" eyebrow
    above the active map's name.
  - `app/(app)/campaigns/[id]/page.tsx` — player dashboard `FeatureCard` renamed from
    "Map View" to "Adventure".
- Added `lib/hooks/useCampaignRole.ts` — a small client-side hook that looks up the current
  user's `campaign_members.role` for the active campaign (cached per campaign+user) so the nav
  components can render `Adventure` for players and `Map` for DMs from the same shared
  components. `app/(app)/layout.tsx` now passes `profile` to `MobileNav` so it can resolve role.
- Reworked `components/maps/PlayerMapView.tsx`:
  - The previously passive selected-token panel now shows a **contextual action menu** —
    only the actions the DM allowed via `available_actions` / token-type defaults
    (`actionsForToken`), filtered to interactable + player-visible targets, with a live
    distance check against the player's nearest controlled token (`distanceFeet`). Submitting
    calls the existing `submitActionIntent` server action — no new resolver logic.
  - Added a floating **Quick access** button (top-right of the map) that opens a slide-up
    bottom sheet with: Character (sheet/inventory/spells), Quests & Journal, My Requests, and
    full Actions/Requests — closing returns directly to the map.
- `app/(app)/campaigns/[id]/maps/page.tsx` now also fetches the player's own characters
  (`id, name, user_id`, scoped to `user_id = auth.uid()`) and passes them to `PlayerMapView`
  as `myCharacters` so contextual actions can resolve an actor character without leaving the
  map.

## Intentionally Left Unchanged (DM-facing)

- `app/(app)/campaigns/[id]/maps/page.tsx` DM branch heading (`<h1>Maps</h1>`).
- `app/(app)/campaigns/[id]/page.tsx` DM `SessionMetric`/`FeatureCard` labels: "Active map",
  "Go to Map".
- `components/nav/DMUtilityPanel.tsx` "Go to Map" quick link.
- `components/nav/MobileNav.tsx` / `Sidebar.tsx` labels for users whose role resolves to `dm`.
- The DM Map Editor route, components, and all "Map Editor" / "Live Map" copy.

## Hub Mechanics

- **Map stays the visual focus.** No new persistent chrome was added to the canvas — only one
  small floating round button (top-right) and the existing token-detail panel (now with an
  action menu appended when relevant).
- **Contextual menu**: tapping an interactable, player-visible token/object that the player
  doesn't control shows only the DM-allowed actions for that target as compact buttons, plus an
  optional message field — mirroring the existing `PlayerActions` flow in `ActionCenter.tsx`
  but inline on the map.
- **Quick access sheet**: a single floating button opens an overlay with cards to Character,
  Quests/Journal, My Requests, and Actions. The overlay is dismissible by tapping the
  backdrop, the close button, or any link — always returning to the map.

## Routing

No routing changes. `/campaigns/[id]/maps` remains the route for both roles; the default
landing behavior (`/dashboard` → campaign → role-based branch) is untouched. This was a
labeling and in-place UI enhancement, not a routing overhaul.

## Realtime & Security

- `useTokenRealtime` / `useRealtimeRefresh` wiring is unchanged — token, area, and map-lock
  updates still merge live with no refresh.
- All new data flows through existing player-safe queries: `myCharacters` is fetched with
  `.eq('user_id', user.id)`, contextual actions only ever appear for tokens already present
  in the RLS-filtered `tokens` select (`visible_to_players` is enforced server-side), and
  action submission goes through the existing `submitActionIntent` server action — no new
  client-side writes to `tokens` or DM-only fields.

## Known Limitations / Next Improvements

- The "Character" and "Quests & Journal" quick-access cards link to their full pages rather
  than rendering an embedded mini-view; a future pass could embed compact HP/inventory and
  active-quest summaries directly in the sheet for a true no-navigation experience.
- "My Requests" inside the sheet currently points to the full Actions page rather than showing
  a live mini-list; embedding the existing `intents` summary would close that gap.
