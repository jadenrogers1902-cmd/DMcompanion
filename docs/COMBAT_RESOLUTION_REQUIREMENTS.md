# Combat Resolution Requirements

## Status

First attack resolver implemented.

Attack is not the core system. It is one resolver type inside the universal action framework.

## Attack Flow

1. Player chooses `Attack` on a visible interactable target where the DM has allowed Attack.
2. The request enters `pending`.
3. DM approves the request.
4. The request becomes `approved` with `resolver_status = pending_player`.
5. Player chooses a saved `character_attacks` option or uses Basic attack.
6. Server rolls a d20 and damage dice.
7. Server compares attack total against target token AC.
8. On hit, damage reduces temp HP first, then current HP.
9. If current HP reaches 0, target `is_defeated = true` and `object_state = defeated`.
10. `combat_logs` and `action_results` are written.
11. Player and DM see the result live.

## Token HP Rules

- Damage reduces `temp_hp` first.
- Remaining damage reduces `current_hp`.
- `current_hp` cannot go below 0.
- `current_hp = 0` marks the token defeated.

## Character Attack Fields

- `name`
- `attack_type`
- `ability_modifier`
- `proficient`
- `attack_bonus_override`
- `damage_dice`
- `damage_modifier`
- `damage_type`
- `range_normal`
- `range_long`
- `equipped`
- `ammo_required`
- `notes`

## DM Override Support

The Map Editor exposes token AC, max HP, current HP, temp HP, defeated state, object state, and visibility controls. This lets the DM correct resolver results manually.

## Remaining Work

- Undo last damage button.
- Explicit override hit/miss UI.
- Revive shortcut beyond manually unchecking defeated and restoring HP.
- Spell/class feature automation.
