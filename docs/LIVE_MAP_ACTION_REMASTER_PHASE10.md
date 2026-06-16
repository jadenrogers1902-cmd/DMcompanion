# Live Map Phase 10 - Action Requests, Rolls, DM Cards & Nudge Highlight (Remaster)

## Status

Code complete; `tsc`, `lint`, and `build` pass; dev server compiles and serves. Full
happy-path runtime QA needs a signed-in DM + player and the migration backlog (015–023)
applied. **No new migration was required** for this phase.

## Summary Of What Changed

This phase remasters the existing live-session action system (it did not rebuild it).
The action_intents → roll-request → roll-result → resolution pipeline, the player roll
popup (auto/manual + dice animation + outcome effects), and the DM controls already
existed. Phase 10 adds the missing/visual pieces:

- A **"!" alert badge** on a map token when a player has an active action request on it.
- **Newest-at-bottom** DM action card stacking.
- A **player-matched "Action Phase" view** on the expanded DM card (request → roll →
  review → resolved), with a "waiting on you / waiting on player" sync indicator —
  explicitly *not* a Dominoes/order-tracker layout.
- The **existing Nudge DM** function connected to a **red card highlight** that clears
  when the DM opens or acts on the card.
- A **"Request Another Roll" (reroll)** DM control alongside the existing
  complete (Resolve & Reveal) / modify (modifier override) / cancel (Deny) / add-note.

## Files Changed

- `lib/actions/party-messages.ts` — `sendDMNudge` now persists the linked `intentId`
  into the existing `delivery_log` JSONB (via a new `DeliveryEnvelope.intentId`).
- `components/maps/MapCanvas.tsx` — new `alertTokenIds` prop renders the pulsing "!" badge.
- `components/maps/MapEditor.tsx` — seeds + live-subscribes to `action_intents` to keep
  `alertTokenIds` current; passes them to the canvas.
- `app/(app)/campaigns/[id]/live-map/[mapId]/page.tsx` — seeds `initialAlertTokenIds`.
- `app/(app)/campaigns/[id]/actions/page.tsx` — derives `nudgedIntentIds` from recent
  nudge rows (DM only) and passes them to the Action Center.
- `components/actions/ActionCenter.tsx` — newest-at-bottom ordering, red nudge highlight +
  "Nudged" badge + counter, nudge-clear on open/act, `ActionPhaseStrip`, `party_messages`
  added to the realtime resync.
- `components/actions/ActionQueueDmControls.tsx` — `hasRollResult` prop + "Request Another
  Roll (reroll)" button.
- `app/globals.css` — `action-alert-pulse` (badge) and `action-nudge-glow` (card)
  keyframes, both disabled under `prefers-reduced-motion`.

## Components Created / Updated

- **Created:** `ActionPhaseStrip` (+ `actionPhase` helper) in `ActionCenter.tsx`.
- **Updated:** `MapCanvas`, `MapEditor`, `ActionCenter` (DM queue), `ActionQueueDmControls`.

## Shared Action/Roll State Changes

No schema change. The only shared-state change is that nudges now carry their target
`action_intent` id inside `party_messages.delivery_log.intentId`. The action/roll tables
(`action_intents`, `action_roll_requests`, `action_roll_results`,
`action_attack_results`, `pending_state_updates`) and the player roll flow are unchanged.
The DM queue additionally subscribes to `party_messages` so a new nudge re-derives the
highlight live.

## Existing Nudge Function — Found & Reused

- **Location:** `sendDMNudge` in `lib/actions/party-messages.ts` (line ~221), already
  called from `components/maps/PlayerMapView.tsx` (`nudgeDM`, line ~650) with a 30s
  cooldown. It already accepted an `intentId` argument but did not persist it.
- **Reuse, not rebuild:** the player-facing "Nudge DM" button, cooldown, and delivery
  pathway are untouched. The only change is persisting `intentId` so the DM card can be
  matched. Delivery to the DM still flows through the existing `party_messages` +
  `PartyMessageListener` pill system.

## How Nudge Connects To The DM Card

1. Player taps the existing "Nudge DM" → `sendDMNudge({ intentId, … })`.
2. The nudge row stores `delivery_log.intentId` (no new table/column).
3. The Actions page (DM) reads recent nudge rows for this DM and builds `nudgedIntentIds`.
4. The DM queue applies the `action-nudge-highlight` class (red edge + pulsing glow) and a
   "Nudged" badge to any card whose id is in that set and is still active.
5. `party_messages` is in the queue's realtime resync, so a fresh nudge highlights live.

## How Nudge Highlight Clears

- Locally and immediately when the DM **opens** the card (`openCard` → `dismissNudge`) or
  **acts** on it (any DM control fires `onActionComplete` → `dismissNudge`).
- It also drops off whenever the underlying intent reaches a final status
  (`denied`/`resolved`/`cancelled`) — `isNudged` excludes final intents.
- Because dismissal is client-side, the highlight is intentionally not re-persisted; a new
  nudge for the same card re-triggers it.

## Confirmation: No Duplicate Nudge System

No new nudge table, action, component, or delivery path was created. `sendDMNudge` and the
`party_messages`/`PartyMessageListener` system are the single source of nudges; this phase
only added an id to the existing payload and a read of it on the DM side.

## How Roll Effects Were Implemented

Reused the existing documentation-driven system: `lib/utils/roll-outcome-display.ts`
(variant mapping incl. Natural 1/20) and `components/actions/RollOutcomeEffects.tsx`
(badge, thumbs-down/flame/shake effects, `prefers-reduced-motion` support). The DM card's
`RollResultPanel` / `AttackResultPanel` already render these, so DM and player see the same
color-coded, accessible outcome treatment. No roll math or effect code was rewritten.

## How DM Cards Stack

The DM queue renders one card per intent. Cards are sorted **ascending by `created_at`**,
so the newest request sits at the **bottom** of the stack. Header chips show active / need
-DM / nudged counts; the Clear Action Board control still hides the current set.

## How Token Exclamation Notifications Work

`MapEditor` seeds `alertTokenIds` from the server (active-status intents whose
`target_token_id` is on this map) and subscribes to `action_intents` for the campaign,
recomputing the set on any change. `MapCanvas` renders a pulsing red "!" badge on each
alerted token. When the request reaches a final status the intent leaves the active set
and the badge disappears.

## How The DM Action Phase View Matches The Player Screen

`ActionPhaseStrip` renders the same flow the player experiences — **Request → Roll →
Review → Resolved** — derived from the intent status (and roll request/result), with a
"Waiting on you / Waiting on player" indicator for phase synchronization. The expanded
card also shows the same roll-request summary and outcome panels (same styling utilities)
the player sees, plus DM-only controls. This is a phase view, **not** a Dominoes/order
tracker.

## DM Roll Outcome Review & Controls

The expanded card surfaces the roll/attack outcome (with reveal-to-player), and the DM
controls cover: **complete** = Resolve & Reveal, **reroll** = Request Another Roll,
**modify** = modifier override (and Edit-before-applying on suggested map updates),
**cancel** = Deny, **add-note** = DM-only note (autosaved, private).

## Manual QA Results

- [x] `npx.cmd tsc --noEmit`, `npm.cmd run lint`, `npm.cmd run build` all pass.
- [x] Dev server compiles changed routes without error; `/login` serves 200.
- [ ] (needs DM+player session) Player submits a request → "!" badge appears on the token.
- [ ] DM newest request shows at the bottom of the stack.
- [ ] Player "Nudge DM" → matching DM card turns red; opening/acting clears it.
- [ ] Expanded DM card phase strip tracks the player's phase live.
- [ ] Reroll issues a fresh roll request; player roll popup shows auto/manual + animation.
- [ ] Resolve & Reveal completes; player sees the same outcome styling.

## Known Limitations

- Nudge dismissal is client-side, so a full page reload while a nudge is still unhandled
  re-shows the highlight (by design — it's still waiting). Persisting "handled" would need
  a `party_messages` UPDATE policy (migration) which this phase avoided.
- The "!" badge reflects active intents on the current map only.
- Reroll reuses the standard Ask-Roll request builder rather than auto-copying the prior
  roll's settings.
- Runtime QA blocked until the migration backlog (015–023) is applied and a live session
  is available.

## Recommended Next Phase

A polish/QA pass with a live DM+player session: verify realtime timing of the badge,
nudge highlight, and phase sync end-to-end; optionally add a campaign/profile setting to
globally disable celebratory roll animations (the Phase 5 accessibility carry-forward).
