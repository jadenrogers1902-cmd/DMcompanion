# Action Roll Modifiers - Phase 2

## Status

Implemented as a character-based modifier layer on top of Phase 1 roll requests.

## Scope

This phase calculates d20 modifiers from finalized character data. It does not automate damage,
token HP, spell effects, encounter scripting, or advanced rules.

## Supported Roll Categories

- Ability checks
- Skill checks
- Saving throws
- Tool checks
- Weapon attacks
- Spell attacks
- Custom/manual rolls

## Data Sources

The modifier engine reads the existing finalized character model:

- `characters` for ability scores and proficiency bonus
- `character_attacks` for saved weapon/attack options
- `character_spells` for spell selection labels
- `character_abilities` for spellcasting ability and spell attack/DC text
- `character_inventory_items` for tools and equipped armor notes
- `character_conditions` for active-condition warnings
- structured sections preserved in `characters.notes` from finalized templates, including skills,
  saving throws, and proficiencies/languages

Missing or incomplete data produces warnings instead of failing the roll request.

## Files Changed

- `supabase/migrations/012_roll_modifier_context.sql`
- `lib/utils/roll-modifiers.ts`
- `lib/actions/roll-requests.ts`
- `lib/types/database.ts`
- `components/actions/ActionQueueDmControls.tsx`
- `components/actions/ActionCenter.tsx`
- `components/actions/PlayerRollRequestPopup.tsx`

## DM Flow

The shared DM roll request controls now offer roll-type-specific selectors. The UI previews the
calculated modifier, breakdown, notes, and warnings before the DM sends the roll request. DMs can
toggle Override to manually change the modifier.

## Player Flow

The global player roll popup shows the assigned roll request and includes a compact modifier
details disclosure with the same breakdown, notes, and warnings stored on the request.

## Database

Migration `012_roll_modifier_context.sql` expands roll type values and adds:

- `modifier_source`
- `modifier_breakdown`
- `modifier_notes`
- `modifier_warnings`
- `roll_context`

Apply migration `011_action_roll_requests.sql` first, then `012_roll_modifier_context.sql`.
