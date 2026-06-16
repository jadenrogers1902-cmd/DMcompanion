# Adventure Maker Phase 6 - Prep Database

## Status

Code complete. Runtime CRUD verification requires migration
`022_adventure_prep_database.sql` applied in Supabase and a signed-in DM session.

## Scope

Phase 6 adds lightweight Notion-style prep database behavior to Adventure Maker without
rebuilding the Live Map action/roll system.

The implementation covers:

- Adventure-level prep notes, important links, tags, and status.
- Chapter-level prep notes, important links, tags, and status.
- Prepared-map tags plus upgraded structured map notes and important links.
- Token detail drawer metadata: status, visibility, tags, related records, DM-only notes,
  player-facing notes, pinned notes, and important links.

## Data Model

Migration `022_adventure_prep_database.sql` adds:

- `adventures.prep_notes jsonb`
- `adventures.important_links jsonb`
- `adventures.tags text[]`
- `adventure_chapters.prep_notes jsonb`
- `adventure_chapters.important_links jsonb`
- `adventure_chapters.tags text[]`
- `prepared_maps.tags text[]`

Prepared map notes and links continue to use the existing `prepared_maps.notes` and
`prepared_maps.links` JSONB columns, now normalized to the structured Phase 6 shape.
Prepared tokens remain inside `prepared_maps.tokens` JSONB and now carry status, tags,
structured prep notes, and richer link metadata.

## Privacy

Adventure Maker routes redirect non-DMs away from prep pages. The backing tables are also
DM-only under RLS:

- `adventures_dm_all`
- `adventure_chapters_dm_all`
- `prepared_maps_dm_all`

DM-only prep notes are stored only in these DM-only prep rows. Player-facing note fields are
visually separated for DM prep use, but are still not exposed to players until existing deploy
logic intentionally copies safe token text into Live Map public fields.

## UI Behavior

- Adventure and Chapter edit mode now includes a prep database panel.
- Prepared maps include tags and upgraded note/link rows with pinned behavior.
- Token detail drawers show related Adventure, Chapter, and Prepared Map context.
- Token detail drawers separate quick private DM notes, player-facing notes, and structured
  prep notes.
- Important links support type, URL, description, and pinning.

## Out Of Scope

This phase intentionally does not rebuild:

- Live Map action requests.
- Roll logic or roll visuals.
- DM action card stacks.
- Dominoes-style action tracker.
- Existing Nudge DM behavior.

Those remain reserved for a later Live Map action/roll phase.
