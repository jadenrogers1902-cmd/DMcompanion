# Character Template System

## Status

Implemented for the Starter Set template pack in `components/Character Templates`.

## Source Data

- `starter_set_character_templates_ingestible.json` remains immutable source data.
- The loader in `lib/character-templates.ts` validates the pack before exposing templates.
- Validation checks template IDs, duplicate IDs, required identity fields, ability scores,
  saving throws, skills, core combat stats, attacks, level advancement, and customization rules.
- Development builds fail loudly on malformed template data. Production logs validation errors.

## Player Flow

- Players browse templates at `/campaigns/[id]/characters/templates`.
- Each template has a full detail page at `/campaigns/[id]/characters/templates/[templateId]`.
- Detail pages expose overview, stats, skills, saves, combat, spellcasting, features, equipment,
  proficiencies, personality, backstory, goals, and level-up path.
- The finalization form lets players edit identity and narrative fields while protected mechanics
  are copied from the template.

## Clone Behavior

Finalizing a template creates a new player-owned character and leaves the template unchanged.

Copied runtime initialization:

- `current_hp` starts at template max HP.
- `temp_hp` starts at 0.
- Conditions start empty.
- Equipment is copied into `character_inventory_items`.
- Features are copied into `character_abilities`.
- Spells are copied into `character_spells`.
- Attacks are copied into `character_attacks`.
- Full template context, customization notes, skills, saves, lore, and advancement data are
  preserved in character notes because the current character schema does not yet have dedicated
  source-template or narrative columns.

## Known Limits

- There is no separate `character_templates` database table; templates are loaded from the local
  source pack at build/runtime.
- Source template ID and detailed narrative metadata are stored in character notes rather than
  first-class columns.
- Cleric prepared spell choices use a free-form field because the template does not include a full
  cleric spell-list dataset.
