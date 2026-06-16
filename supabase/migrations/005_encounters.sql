-- ============================================================
-- DnD Companion App - Phase 5: Encounter Manager
-- Run this AFTER 004_movement.sql
-- ============================================================

-- Encounters are manual combat trackers, not an automated combat engine.
CREATE TABLE IF NOT EXISTS encounters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  map_id UUID REFERENCES maps(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'completed')),
  current_round INTEGER NOT NULL DEFAULT 1,
  current_turn_participant_id UUID,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS encounters_campaign_idx ON encounters(campaign_id);
CREATE INDEX IF NOT EXISTS encounters_status_idx ON encounters(status);

ALTER TABLE encounters ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS encounters_updated_at ON encounters;
CREATE TRIGGER encounters_updated_at
  BEFORE UPDATE ON encounters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY "encounters_select"
  ON encounters FOR SELECT
  TO authenticated
  USING (is_campaign_member(campaign_id));

CREATE POLICY "encounters_insert_dm"
  ON encounters FOR INSERT
  TO authenticated
  WITH CHECK (is_campaign_dm(campaign_id) AND created_by = auth.uid());

CREATE POLICY "encounters_update_dm"
  ON encounters FOR UPDATE
  TO authenticated
  USING (is_campaign_dm(campaign_id))
  WITH CHECK (is_campaign_dm(campaign_id));

CREATE POLICY "encounters_delete_dm"
  ON encounters FOR DELETE
  TO authenticated
  USING (is_campaign_dm(campaign_id));

-- Encounter participants can be characters, map tokens, or manual rows.
CREATE TABLE IF NOT EXISTS encounter_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  token_id UUID REFERENCES tokens(id) ON DELETE SET NULL,
  character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  participant_type TEXT NOT NULL DEFAULT 'enemy'
    CHECK (participant_type IN ('player', 'npc', 'enemy')),
  initiative INTEGER,
  armor_class INTEGER NOT NULL DEFAULT 10,
  max_hp INTEGER NOT NULL DEFAULT 0,
  current_hp INTEGER NOT NULL DEFAULT 0,
  temp_hp INTEGER NOT NULL DEFAULT 0,
  speed INTEGER NOT NULL DEFAULT 30,
  is_visible_to_players BOOLEAN NOT NULL DEFAULT TRUE,
  is_defeated BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS encounter_participants_encounter_idx
  ON encounter_participants(encounter_id);
CREATE INDEX IF NOT EXISTS encounter_participants_campaign_idx
  ON encounter_participants(campaign_id);

ALTER TABLE encounter_participants ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS encounter_participants_updated_at ON encounter_participants;
CREATE TRIGGER encounter_participants_updated_at
  BEFORE UPDATE ON encounter_participants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE FUNCTION encounter_campaign_id(enc_id UUID)
RETURNS UUID AS $$
  SELECT campaign_id FROM encounters WHERE id = enc_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE POLICY "encounter_participants_select"
  ON encounter_participants FOR SELECT
  TO authenticated
  USING (
    is_campaign_dm(campaign_id)
    OR (is_campaign_member(campaign_id) AND is_visible_to_players = TRUE)
  );

CREATE POLICY "encounter_participants_insert_dm"
  ON encounter_participants FOR INSERT
  TO authenticated
  WITH CHECK (is_campaign_dm(campaign_id));

CREATE POLICY "encounter_participants_update_dm"
  ON encounter_participants FOR UPDATE
  TO authenticated
  USING (is_campaign_dm(campaign_id))
  WITH CHECK (is_campaign_dm(campaign_id));

CREATE POLICY "encounter_participants_delete_dm"
  ON encounter_participants FOR DELETE
  TO authenticated
  USING (is_campaign_dm(campaign_id));

-- DM-only participant notes are separate so player-visible participant rows
-- never expose private columns through direct API queries.
CREATE TABLE IF NOT EXISTS encounter_participant_dm_notes (
  participant_id UUID PRIMARY KEY REFERENCES encounter_participants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  content TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE encounter_participant_dm_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "encounter_participant_dm_notes_all"
  ON encounter_participant_dm_notes FOR ALL
  TO authenticated
  USING (is_campaign_dm(campaign_id))
  WITH CHECK (is_campaign_dm(campaign_id));

CREATE TABLE IF NOT EXISTS encounter_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES encounter_participants(id) ON DELETE CASCADE,
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS encounter_conditions_participant_idx
  ON encounter_conditions(participant_id);
CREATE INDEX IF NOT EXISTS encounter_conditions_encounter_idx
  ON encounter_conditions(encounter_id);

ALTER TABLE encounter_conditions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "encounter_conditions_select"
  ON encounter_conditions FOR SELECT
  TO authenticated
  USING (
    is_campaign_dm(campaign_id)
    OR (
      is_campaign_member(campaign_id)
      AND EXISTS (
        SELECT 1 FROM encounter_participants ep
        WHERE ep.id = encounter_conditions.participant_id
          AND ep.is_visible_to_players = TRUE
      )
    )
  );

CREATE POLICY "encounter_conditions_insert_dm"
  ON encounter_conditions FOR INSERT
  TO authenticated
  WITH CHECK (is_campaign_dm(campaign_id));

CREATE POLICY "encounter_conditions_delete_dm"
  ON encounter_conditions FOR DELETE
  TO authenticated
  USING (is_campaign_dm(campaign_id));

-- Add the current-turn foreign key after participants exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'encounters_current_turn_participant_id_fkey'
  ) THEN
    ALTER TABLE encounters
      ADD CONSTRAINT encounters_current_turn_participant_id_fkey
      FOREIGN KEY (current_turn_participant_id)
      REFERENCES encounter_participants(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- API privileges: RLS still decides which rows each user may access.
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE profiles,
         campaigns,
         campaign_members,
         characters,
         character_inventory_items,
         character_spells,
         character_abilities,
         character_conditions,
         maps,
         tokens,
         token_dm_notes,
         encounters,
         encounter_participants,
         encounter_participant_dm_notes,
         encounter_conditions
TO authenticated;

GRANT SELECT
ON TABLE profiles,
         campaigns,
         campaign_members,
         maps,
         tokens,
         encounters,
         encounter_participants,
         encounter_conditions
TO anon;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
