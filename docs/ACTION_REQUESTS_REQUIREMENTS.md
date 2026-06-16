# Action Requests Requirements

## Status

Implemented using the existing `action_intents` table, extended by `010_universal_action_system.sql`.

## Flow

1. Player clicks or selects a nearby visible interactable token/object.
2. Player sees only actions allowed by the DM on that token/object.
3. Player submits an action request with an optional message.
4. DM sees the request in the Action Queue live.
5. DM chooses Approve, Deny, Ask Roll, or Resolve.
6. The app updates `action_intents`, writes `action_results` when appropriate, and refreshes clients through realtime subscriptions.

## Statuses

- `pending`
- `approved`
- `denied`
- `needs_roll`
- `resolving`
- `resolved`
- `cancelled`

## Enforcement

- Players can submit only for their own controlled character tokens.
- Players can target only visible, interactable, in-range tokens.
- Players can only cancel their own pending requests.
- DMs control approval and resolution.
- Allowed actions are rechecked server-side when a player submits.

## Realtime

The action UI subscribes to:

- `action_intents`
- `action_results`
- `combat_logs`
- `character_attacks`
- `tokens`
- `characters`
- `character_conditions`

This keeps the request queue, player request state, object state, HP, and logs synced without requiring manual browser refresh.
