# Action Attack Resolution - Phase 3

## Status

Implemented as a weapon-attack layer on top of Phase 1 roll requests and Phase 2 modifiers.

## Scope

This phase resolves normal weapon attacks and damage results. It does not apply damage to map
tokens, automate spell effects, implement advanced class rules, or replace DM review.

## Engine Locations

- Attack outcome engine: `lib/utils/attack-resolution.ts`
- Damage parser/roller: `lib/utils/attack-resolution.ts`
- Server submission action: `lib/actions/roll-requests.ts`

## Supported Damage Formulas

The parser supports common additive dice formulas:

- `1d6 + 3`
- `1d8 + 2`
- `1d12 + 3`
- `2d6 + 2`
- equivalent compact forms like `1d6+3`

Critical hits double the dice count and add the static modifier once.

## Data Model

Added migration:

- `supabase/migrations/013_attack_resolution_phase3.sql`

New tables:

- `action_attack_results`: player-safe attack result, damage, and reveal state
- `action_attack_result_dm_details`: DM-only target AC and full breakdown

## Target AC

The DM controls show target token AC when available. By default, target AC is not stored in the
player-readable roll request. During attack submission, the server resolves hidden AC from the
target token. If the DM explicitly enables "Reveal AC", the visible target AC is stored in the
player-safe result.

If target AC is unknown and not revealed, the attack can still be rolled, but the outcome is
`unknown` instead of hit/miss.

## Player Flow

For weapon attacks, the global player popup:

- shows the target, weapon label, and attack modifier
- lets the player roll automatically or enter a manual d20
- resolves hit, miss, critical hit, or critical miss
- auto-rolls damage on hit by default
- supports manual damage dice-total entry when the DM disables auto damage

## DM Flow

The shared DM controls detect attack action types and default to a weapon attack roll. The DM can
confirm:

- weapon
- target AC source/input
- advantage/disadvantage
- reveal target AC
- auto-roll damage on hit
- require DM review before reveal

The full Action Queue shows the DM-only attack breakdown and a Reveal Result button. Damage is
recorded only; token HP is not changed.

## Pending Requirement Addendum — Player Roll Outcome Popup Styling (carried from Phase 1)

Status: **Implemented.** `getRollOutcomeVariant` (in `lib/utils/roll-outcome-display.ts`) maps
attack outcomes (`critical_miss` → critical failure styling + thumbs-down, `miss` → failure,
`hit` → success, `critical_hit` → natural-20/critical-success styling + green flames) onto the
same `RollOutcomeVariant` set used for generic rolls, and `PlayerRollOutcomePanel` renders them
persistently in the player popup — including any `damage_total`/`damage_type` already present in
the player-safe `player_visible_summary` returned by `submitAttackRollResult`. Hidden-AC /
DM-review-before-reveal rules are untouched: the panel only ever displays the summary string and
fields the server already decided are safe to send to the player. See
`docs/PHASE_COMPLETION_REPORT.md` ("Player Roll Outcome Popup Styling") for the full build report.
Carries forward again into Phase 5 (`docs/ACTION_RESOLUTION_PHASE5_REQUIREMENTS.md`).
