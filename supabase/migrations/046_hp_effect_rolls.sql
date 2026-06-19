-- Adds DM-approved HP effect rolls for healing and damage.

ALTER TABLE pending_state_updates DROP CONSTRAINT IF EXISTS pending_state_updates_update_type_check;
ALTER TABLE pending_state_updates ADD CONSTRAINT pending_state_updates_update_type_check
  CHECK (update_type IN (
    'damage_token', 'heal_token', 'set_token_state', 'set_object_state',
    'reveal_object', 'set_awareness', 'custom'
  ));

CREATE TABLE IF NOT EXISTS action_hp_effect_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_intent_id UUID NOT NULL REFERENCES action_intents(id) ON DELETE CASCADE,
  roll_request_id UUID NOT NULL REFERENCES action_roll_requests(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_id UUID,
  target_name TEXT,
  effect_kind TEXT NOT NULL CHECK (effect_kind IN ('damage', 'healing')),
  formula TEXT NOT NULL,
  dice_rolled INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  modifier INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  roll_mode TEXT NOT NULL CHECK (roll_mode IN ('manual', 'automatic')),
  player_visible_summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS action_hp_effect_results_intent_idx ON action_hp_effect_results(action_intent_id);
CREATE INDEX IF NOT EXISTS action_hp_effect_results_roll_request_idx ON action_hp_effect_results(roll_request_id);
CREATE INDEX IF NOT EXISTS action_hp_effect_results_campaign_idx ON action_hp_effect_results(campaign_id);
CREATE INDEX IF NOT EXISTS action_hp_effect_results_player_idx ON action_hp_effect_results(player_id);

ALTER TABLE action_hp_effect_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "action_hp_effect_results_select" ON action_hp_effect_results;
CREATE POLICY "action_hp_effect_results_select"
  ON action_hp_effect_results FOR SELECT
  TO authenticated
  USING (
    is_campaign_dm(campaign_id)
    OR player_id = auth.uid()
  );

DROP POLICY IF EXISTS "action_hp_effect_results_insert_player_or_dm" ON action_hp_effect_results;
CREATE POLICY "action_hp_effect_results_insert_player_or_dm"
  ON action_hp_effect_results FOR INSERT
  TO authenticated
  WITH CHECK (
    player_id = auth.uid()
    OR is_campaign_dm(campaign_id)
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'action_hp_effect_results'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE action_hp_effect_results';
  END IF;

  EXECUTE 'ALTER TABLE action_hp_effect_results REPLICA IDENTITY FULL';
END $$;

GRANT SELECT, INSERT, UPDATE
ON TABLE action_hp_effect_results
TO authenticated;
