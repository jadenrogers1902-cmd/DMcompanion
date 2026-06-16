-- ════════════════════════════════════════════════════════════
-- Phase 9b: Hard requirement — live updates with no browser refresh.
--
-- Problem: several feature tables already have correct RLS (so a
-- postgres_changes subscriber only ever receives rows it's allowed to
-- see) but were never added to the `supabase_realtime` publication, so
-- no realtime events were ever emitted for them at all. This migration
-- adds the *player/DM-shared* tables needed for live sync across the
-- Action Center, Encounter Manager, Character Sheet, and Story Tools /
-- Party Journal screens.
--
-- DM-only note tables (`token_dm_notes`, `action_intent_dm_notes`,
-- `encounter_participant_dm_notes`) are deliberately NOT added — Realtime
-- broadcasts full rows and RLS filters rows, not columns, so any DM-only
-- data must stay on unpublished tables to avoid leaking to players who
-- share a campaign channel. This matches the existing documented pattern
-- (see migration 004's privacy fix comment for `token_dm_notes`).
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'characters',
    'character_conditions',
    'character_inventory_items',
    'character_spells',
    'character_abilities',
    'encounters',
    'encounter_participants',
    'encounter_conditions',
    'action_intents',
    'quests',
    'npcs',
    'locations',
    'notes',
    'handouts',
    'session_recaps'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;

    -- REPLICA IDENTITY FULL ensures DELETE/UPDATE payloads carry the full
    -- old row, which the existing "becomes-invisible-looks-like-a-delete"
    -- pattern (and plain DELETE handling) depends on.
    EXECUTE format('ALTER TABLE %I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;
