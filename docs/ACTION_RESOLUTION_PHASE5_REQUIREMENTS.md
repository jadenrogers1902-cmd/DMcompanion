# Action Resolution — Phase 5 (Forward-Looking Requirements)

## Status

Not started. This document collects requirements that have been explicitly recorded as
"carry forward into Phase 5" while building Phases 1-4 of the action resolution pipeline
(generic roll requests → modifier engine → attack/damage automation → game-state sync). It is a
planning placeholder, not an implementation report.

## Carried Forward: Player Roll Outcome Popup Styling

Originally specified as an addendum to Phase 1
(`docs/ACTION_ROLL_REQUESTS_PHASE1.md` → "Pending Requirement Addendum — Player Roll Outcome
Popup Styling") and explicitly carried into Phase 3
(`docs/ACTION_ATTACK_RESOLUTION_PHASE3.md` → same section name) for attack/damage results.

For Phase 5, this requirement should be **completed/extended** to cover:

- **Advanced result types.** As later phases introduce additional structured outcomes beyond
  generic checks and weapon attacks (e.g. saving throws with effects, object-interaction results,
  spell results, or any new `roll_type`/`update_type` values), the same persistent, color-coded,
  accessibility-respecting popup treatment defined in the Phase 1 addendum must be applied
  consistently — not re-invented per result type.
- **Reduced motion / accessibility settings.** The Phase 1 addendum requires the popup to honor
  `prefers-reduced-motion` and to never rely on color alone. Phase 5 should connect that behavior
  to any user-facing accessibility/animation preference the app adds (e.g. a campaign or profile
  setting to disable celebratory animations globally), rather than relying solely on the OS-level
  media query.
- **Consistency across surfaces.** Verify the same outcome styling/state-flow rules apply
  uniformly anywhere roll/attack outcomes are surfaced to players (popup, action log, character
  sheet notifications, etc.), so a player always gets the same legible, non-leaking presentation
  of their result regardless of where they see it.

## Full Requirement Reference

See `docs/ACTION_ROLL_REQUESTS_PHASE1.md` for:

- the complete outcome color rules (success/major success/failure/major failure/critical
  failure/critical success, including the thumb-down-emoji and green-flame animation specs),
- the required result display fields and example layouts,
- the five-state popup flow (waiting → rolling → outcome displayed → waiting for DM review →
  resolved/revealed) and the rule that the result must never be hidden between states,
- the accessibility and mobile rules, and
- the 15-item QA checklist to extend once implemented.

## Notes

- This requirement does not change any data model, RLS policy, or server action — it is purely
  player-facing presentation in `PlayerRollRequestPopup.tsx` (and wherever else outcomes are
  rendered). It can be implemented independently of the Phase 5 game-mechanics scope, as long as
  it ships before or alongside whatever Phase 5 ultimately covers.
- Keep the same DM-control and player-visibility constraints that govern the rest of this
  pipeline: outcome styling must never reveal hidden DM-only data (target AC, DC, enemy HP) beyond
  what the player is already permitted to see.
