-- ============================================================
-- DnD Companion App - Phase 3 Attack Resolution
-- Run this AFTER 012_roll_modifier_context.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS action_attack_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_intent_id UUID NOT NULL REFERENCES action_intents(id) ON DELETE CASCADE,
  roll_request_id UUID NOT NULL REFERENCES action_roll_requests(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_id UUID,
  target_name TEXT,
  weapon_name TEXT NOT NULL,
  natural_roll INTEGER NOT NULL CHECK (natural_roll BETWEEN 1 AND 20),
  second_natural_roll INTEGER CHECK (second_natural_roll BETWEEN 1 AND 20),
  used_natural_roll INTEGER NOT NULL CHECK (used_natural_roll BETWEEN 1 AND 20),
  attack_modifier INTEGER NOT NULL DEFAULT 0,
  attack_total INTEGER NOT NULL,
  target_ac_visible INTEGER,
  outcome TEXT NOT NULL
    CHECK (outcome IN ('critical_miss', 'miss', 'hit', 'critical_hit', 'unknown')),
  damage_formula TEXT,
  damage_dice_rolled INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  damage_modifier INTEGER NOT NULL DEFAULT 0,
  damage_total INTEGER,
  damage_type TEXT,
  critical BOOLEAN NOT NULL DEFAULT FALSE,
  damage_mode TEXT NOT NULL DEFAULT 'none'
    CHECK (damage_mode IN ('automatic', 'manual', 'none')),
  player_visible_summary TEXT NOT NULL,
  revealed_to_player BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS action_attack_results_intent_idx ON action_attack_results(action_intent_id);
CREATE INDEX IF NOT EXISTS action_attack_results_roll_request_idx ON action_attack_results(roll_request_id);
CREATE INDEX IF NOT EXISTS action_attack_results_campaign_idx ON action_attack_results(campaign_id);
CREATE INDEX IF NOT EXISTS action_attack_results_player_idx ON action_attack_results(player_id);

ALTER TABLE action_attack_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "action_attack_results_select"
  ON action_attack_results FOR SELECT
  TO authenticated
  USING (
    is_campaign_dm(campaign_id)
    OR (player_id = auth.uid() AND revealed_to_player = TRUE)
  );

CREATE POLICY "action_attack_results_insert_player_or_dm"
  ON action_attack_results FOR INSERT
  TO authenticated
  WITH CHECK (
    player_id = auth.uid()
    OR is_campaign_dm(campaign_id)
  );

CREATE POLICY "action_attack_results_update_dm"
  ON action_attack_results FOR UPDATE
  TO authenticated
  USING (is_campaign_dm(campaign_id))
  WITH CHECK (is_campaign_dm(campaign_id));

CREATE TABLE IF NOT EXISTS action_attack_result_dm_details (
  attack_result_id UUID PRIMARY KEY REFERENCES action_attack_results(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  target_ac INTEGER,
  target_ac_source TEXT NOT NULL DEFAULT 'unknown',
  dm_summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE action_attack_result_dm_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "action_attack_result_dm_details_select"
  ON action_attack_result_dm_details FOR SELECT
  TO authenticated
  USING (is_campaign_dm(campaign_id));

CREATE POLICY "action_attack_result_dm_details_insert_player_or_dm"
  ON action_attack_result_dm_details FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "action_attack_result_dm_details_update_dm"
  ON action_attack_result_dm_details FOR UPDATE
  TO authenticated
  USING (is_campaign_dm(campaign_id))
  WITH CHECK (is_campaign_dm(campaign_id));

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'action_attack_results',
    'action_attack_result_dm_details'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;

    EXECUTE format('ALTER TABLE %I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE
ON TABLE action_attack_results,
         action_attack_result_dm_details
TO authenticated;
