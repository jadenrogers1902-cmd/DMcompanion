-- ============================================================
-- DnD Companion App - Phase 6: Contextual Action Prompts
-- Run this AFTER 005_encounters.sql
-- ============================================================

ALTER TABLE tokens
  ADD COLUMN IF NOT EXISTS interaction_range_feet INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS available_actions TEXT[],
  ADD COLUMN IF NOT EXISTS hidden_dm_actions TEXT[];

CREATE TABLE IF NOT EXISTS action_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL,
  actor_character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_token_id UUID NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'needs_roll', 'resolved')),
  distance_feet INTEGER,
  range_feet INTEGER,
  dm_response TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS action_intents_campaign_idx ON action_intents(campaign_id);
CREATE INDEX IF NOT EXISTS action_intents_actor_idx ON action_intents(actor_user_id);
CREATE INDEX IF NOT EXISTS action_intents_status_idx ON action_intents(status);

ALTER TABLE action_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "action_intents_select"
  ON action_intents FOR SELECT
  TO authenticated
  USING (
    is_campaign_dm(campaign_id)
    OR actor_user_id = auth.uid()
  );

CREATE POLICY "action_intents_insert_actor"
  ON action_intents FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_user_id = auth.uid()
    AND character_owner_id(actor_character_id) = auth.uid()
    AND is_campaign_member(campaign_id)
    AND EXISTS (
      SELECT 1 FROM tokens t
      WHERE t.id = target_token_id
        AND t.campaign_id = campaign_id
        AND t.map_id = map_id
        AND t.visible_to_players = TRUE
    )
  );

CREATE POLICY "action_intents_update_dm"
  ON action_intents FOR UPDATE
  TO authenticated
  USING (is_campaign_dm(campaign_id))
  WITH CHECK (is_campaign_dm(campaign_id));

CREATE POLICY "action_intents_delete_dm"
  ON action_intents FOR DELETE
  TO authenticated
  USING (is_campaign_dm(campaign_id));

CREATE TABLE IF NOT EXISTS action_intent_dm_notes (
  intent_id UUID PRIMARY KEY REFERENCES action_intents(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  content TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE action_intent_dm_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "action_intent_dm_notes_all"
  ON action_intent_dm_notes FOR ALL
  TO authenticated
  USING (is_campaign_dm(campaign_id))
  WITH CHECK (is_campaign_dm(campaign_id));

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE action_intents,
         action_intent_dm_notes
TO authenticated;

GRANT SELECT
ON TABLE action_intents
TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE tokens
TO authenticated;
