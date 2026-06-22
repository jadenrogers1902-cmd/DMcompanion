# Live Map Remediation QA

Use this checklist for the hybrid action authorization, action nudges, player-safe cast view, non-destructive reveal override, and realtime recovery work.

## Static Gates

- `npx.cmd tsc --noEmit`
- `npm.cmd run lint`
- `npm.cmd run build`

## DM / Player Action Flow

- Player can submit Talk against any visible non-portal token.
- Player can submit Investigate against any visible non-portal token.
- Player can submit Custom Action against any visible non-portal token.
- Player cannot Attack scenery, portals, or non-combat tokens unless the DM enables Attack/combat behavior.
- Player cannot Interact, Use Item, or Cast Spell against a target unless the DM enables that action or interaction path.
- A stale client submission returns a specific server-side error instead of creating an invalid action request.
- DM queue labels are phase-specific: Approve, Request Roll, Request Another Roll, Resolve Result, Apply & Reveal, Deny.

## Action Nudges

- Player nudges one action card.
- Only that action card highlights for the DM.
- DM opening/acting on that card acknowledges only that card's nudge.
- A second active card from the same player remains unhighlighted unless separately nudged.
- Older schemas without `party_messages.action_intent_id` degrade to generic sender-level nudge behavior.

## Fog / Reveal

- Reveal all temporarily shows the map without deleting painted reveal areas.
- Hide all temporarily hides the map without deleting painted reveal areas.
- Use planned reveals restores previous painted reveal and room-mask behavior.
- Painting, toggling, or deleting a specific reveal/room clears the temporary override back to planned reveals.
- Player and center-screen views agree on reveal override behavior.

## Center Screen

- Tokens with `visible_on_cast = false` do not appear on center-screen.
- Hidden non-discoverable tokens do not appear.
- Discoverable hints remain redacted and only appear when cast-visible.
- Hidden room data is not sent to the center-screen client.
- View groups use only cast-safe player tokens.

## Realtime Recovery

- DM and player maps update token, map, reveal, and room changes without refresh.
- Action requests, roll requests/results, party messages, travel confirmations, and Codex publications refresh without manual reload.
- Temporarily degraded realtime status refreshes the route and resubscribes without repeated popups.
- Party-message notifications do not duplicate after multiple messages.

## Mobile Player Pass

- Action tray fits a phone viewport.
- Roll popup is visible and dismissible.
- Movement confirmation remains reachable.
- Party message modal fits the viewport.
- Travel confirmation remains reachable.
