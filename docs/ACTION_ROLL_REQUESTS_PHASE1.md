# Action Roll Requests - Phase 1

## Status

Implemented as the first d20 roll-request layer on top of the existing Action Queue.

## Scope

This phase intentionally does not automate weapon damage, map/token HP, or advanced DnD rules.
It only creates a linked roll request, lets the assigned player roll a d20, stores the result, and
returns the total/result to the DM queue.

## Data Model

Added migration:

- `supabase/migrations/011_action_roll_requests.sql`

New tables:

- `action_roll_requests`
- `action_roll_results`

Extended `action_intents.status` with:

- `approved_waiting_for_roll`
- `rolling`
- `rolled_waiting_for_dm`

Roll request statuses:

- `waiting_for_player`
- `rolled`
- `cancelled`

Roll result values:

- `critical_failure`
- `failure`
- `success`
- `major_success`
- `critical_success`
- `unknown`

## DM Flow

- The full Action Queue page and the global DM popup both use `ActionQueueDmControls`.
- `Approve` and `Ask Roll` now create a generic roll request with:
  - label
  - roll type
  - modifier
  - optional target/DC
  - normal/advantage/disadvantage
- Creating a roll request moves the action to `approved_waiting_for_roll`.
- `Deny` and `Resolve & Reveal` continue using the existing action status server action.

## Player Flow

- `PlayerRollRequestPopup` is mounted globally in `app/(app)/layout.tsx`.
- It appears only for the assigned player and only for waiting roll requests.
- The player can choose:
  - Roll for Me
  - I Rolled Manually
- Manual rolls require natural d20 values from 1 through 20.
- Advantage uses the higher roll; disadvantage uses the lower roll.
- The app calculates total and result before storing the roll result.

## Realtime

- `action_roll_requests` and `action_roll_results` are added to Supabase realtime publication.
- The player popup subscribes to assigned roll requests.
- The Action Queue subscribes to roll request/result changes.
- The global DM latest-action popup stays subscribed to `action_intents` and `action_roll_results`.
- Fallback polling follows the existing 30-second lightweight pattern if a realtime channel fails.

## Permissions

- DMs can create roll requests for campaign actions.
- Only the assigned player can see and submit their roll request.
- DMs can read roll requests/results for their campaign.
- DM-only notes remain in the unpublished `action_intent_dm_notes` table and are not exposed to players.

## Known Limits

- The migration must be applied before runtime QA.
- This is generic d20 resolution only.
- Existing older attack resolver code remains in place for previous `approved`/`pending_player`
  attack flows, but the shared DM controls now route new Approve/Ask Roll decisions through the
  Phase 1 generic roll request path.

## Pending Requirement Addendum — Player Roll Outcome Popup Styling

Status: **Implemented.** The popup no longer auto-closes after a roll — the result panel
(`PlayerRollOutcomePanel` in `components/actions/RollOutcomeEffects.tsx`) stays mounted through
"outcome displayed" → "waiting for DM review" → "resolved", styled via the shared
`getRollOutcomeVariant` / `getRollOutcomeDisplay` mapper in `lib/utils/roll-outcome-display.ts`.
See `docs/PHASE_COMPLETION_REPORT.md` ("Player Roll Outcome Popup Styling") for the full build
report. Carried into Phase 3 (already applied to attack outcomes) and Phase 5 (future advanced
result types / accessibility settings wiring).

### Requirement

After the player completes a roll, the result must remain visible in the same popup where they
rolled — **do not auto-close the popup immediately after the roll resolves.**

**Outcome color rules:**

- Success = green styling
- Major success = stronger green styling
- Failure = red styling
- Major failure = stronger red styling
- Critical failure / Natural 1 = red styling, with animated mini thumb-down emojis popping off the
  result (plays once, does not loop)
- Critical success / Natural 20 = animated green flames around/behind the result (fantasy-themed,
  matches the dark theme; may loop subtly but must not make the popup unreadable)

**Required result display** (after the roll resolves): natural roll, modifier, total, result
label, outcome summary, damage result if applicable, a Continue/Close button, and an optional
"View Action" / "Waiting for DM" state.

**Popup state flow** — the result must stay visible across all of these states, never hidden
between them:

1. Waiting for player roll
2. Rolling animation
3. Roll outcome displayed
4. Waiting for DM review (show "Waiting for DM Review" *above* the still-visible roll result, when
   review is required)
5. Resolved/revealed result, once the DM finalizes it

The result stays in the popup until the player dismisses it, the DM resolves/reveals the final
result (popup updates in place), or a newer roll request replaces it.

**Accessibility / reduced motion:** never rely on color alone — always show text labels (Success,
Failure, Critical Failure, Natural 20, Critical Success). When the user/browser has
`prefers-reduced-motion` enabled, disable the popping-emoji and flame animations and fall back to
static badges/glows.

**Mobile:** keep the result compact, never let flame/emoji effects overflow the screen, keep the
Close/Continue button visible, and never permanently cover navigation.

**Player-visibility constraint (carries the same rule as the rest of this pipeline):** result
styling must never leak hidden DM-only data (target AC, DC, enemy HP) beyond what the player is
already allowed to see.

### QA additions (append to the Phase 1/3/5 checklists when implemented)

1. Successful roll remains visible in the player popup.
2. Success result uses green styling.
3. Failed roll remains visible in the player popup.
4. Failure result uses red styling.
5. Natural 1 displays "Critical Failure".
6. Natural 1 plays the mini thumb-down emoji pop animation (once, not looping).
7. Natural 20 displays "Natural 20 / Critical Success".
8. Natural 20 plays the animated green flame effect.
9. Animations do not block or obscure the result text.
10. Animations do not repeat annoyingly / indefinitely.
11. `prefers-reduced-motion` disables or simplifies animations.
12. Player can still close/dismiss the result popup.
13. "Waiting for DM Review" keeps the roll result visible above it.
14. Mobile layout remains usable with effects on-screen.
15. Result styling does not leak hidden DM data (AC, DC, enemy HP) beyond existing visibility rules.

### Carry-forward notes

- **Phase 3** (`docs/ACTION_ATTACK_RESOLUTION_PHASE3.md`): apply the same popup-persistence and
  outcome styling to attack hit/miss/critical/damage results — the attack flow reuses the same
  player roll popup, so the styling rules and state-flow above apply directly to
  hit/miss/critical_hit/critical_miss outcomes and any displayed damage total.
- **Phase 5** (future — see `docs/ACTION_RESOLUTION_PHASE5_REQUIREMENTS.md`): connect this styling
  system to additional/advanced result types as they're introduced, and wire the reduced-motion
  behavior to any future user-facing accessibility/animation settings.
