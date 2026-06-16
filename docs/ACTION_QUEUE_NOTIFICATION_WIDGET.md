# Action Queue Notification Widget

## Status

Implemented as a global authenticated-app widget.

## Placement

- Mounted once in `app/(app)/layout.tsx`.
- Renders through `components/actions/ActionQueueNotificationWidget.tsx`.
- Detects the current campaign from `/campaigns/[id]` paths.
- Hidden outside campaign-specific pages because there is no campaign queue context on global pages
  such as `/dashboard` or `/join`.

## Data Source

- Uses the existing `action_intents` queue and existing `/campaigns/[id]/actions` Action Queue page.
- Shows the latest queued intent with status in:
  - `pending`
  - `needs_roll`
  - `approved`
  - `resolving`
- Looks up display context from `profiles`, `characters`, `tokens`, and `maps`.
- Does not query or display DM-only queue notes.

## Live Updates

- Subscribes to Supabase `postgres_changes` on `action_intents` filtered by campaign ID.
- On insert/update/delete, it refetches the latest RLS-visible queue state.
- If the realtime channel errors, times out, or closes, it falls back to a lightweight 30-second
  poll until realtime becomes healthy again.

## Role Behavior

- The widget is DM-only for now.
- It checks `campaign_members.role` for the current user and campaign before querying/displaying
  queue notifications.
- Players continue to use existing player-safe action surfaces and do not receive the DM queue
  popup.

## Dismissal

- Dismiss is local UI state only.
- Dismissed action IDs are stored in `sessionStorage` per campaign.
- Dismissing does not mutate action status or mark anything resolved.
- New action IDs reappear normally.

## DM Actions Shortcut

- The popup includes a DM-only `DM Actions` button next to `View Action Queue`.
- `DM Actions` opens a compact popover attached to the notification.
- The popover uses the shared `ActionQueueDmControls` component, the same component used by the
  full Action Queue item cards.
- Available controls:
  - DM response
  - DM-only note
  - Approve
  - Ask Roll
  - Deny
  - Resolve & Reveal
- These controls call the existing `updateActionIntentStatus` and `upsertActionIntentDmNote`
  server actions. No second action system was added.
- The popover closes on outside click, close button, or successful decision action.

## Route

The CTA links to the existing Action Queue page:

- `/campaigns/[id]/actions`
