-- ============================================================
-- DnD Companion App - Phase 1 Roll Request Flow
-- Run this AFTER 010_universal_action_system.sql
-- ============================================================

ALTER TABLE action_intents DROP CONSTRAINT IF EXISTS action_intents_status_check;
ALTER TABLE action_intents ADD CONSTRAINT action_intents_status_check
  CHECK (status IN (
    'pending',
    'approved',
    'approved_waiting_for_roll',
    'rolling',
    'rolled_waiting_for_dm',
    'denied',
    'needs_roll',
    'resolving',
    'resolved',
    'cancelled'
  ));

CREATE TABLE IF NOT EXISTS action_roll_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_intent_id UUID NOT NULL REFERENCES action_intents(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  requested_by_dm_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Roll d20',
  roll_type TEXT NOT NULL DEFAULT 'generic'
    CHECK (roll_type IN ('generic', 'attack', 'skill_check', 'saving_throw', 'tool_check', 'damage', 'custom')),
  modifier INTEGER NOT NULL DEFAULT 0,
  target_number INTEGER,
  target_number_type TEXT NOT NULL DEFAULT 'dc'
    CHECK (target_number_type IN ('dc', 'ac', 'unknown')),
  advantage_state TEXT NOT NULL DEFAULT 'normal'
    CHECK (advantage_state IN ('normal', 'advantage', 'disadvantage')),
  status TEXT NOT NULL DEFAULT 'waiting_for_player'
    CHECK (status IN ('waiting_for_player', 'rolled', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS action_roll_requests_campaign_idx ON action_roll_requests(campaign_id);
CREATE INDEX IF NOT EXISTS action_roll_requests_player_idx ON action_roll_requests(player_id);
CREATE INDEX IF NOT EXISTS action_roll_requests_status_idx ON action_roll_requests(status);
CREATE INDEX IF NOT EXISTS action_roll_requests_intent_idx ON action_roll_requests(action_intent_id);

ALTER TABLE action_roll_requests ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER action_roll_requests_updated_at
  BEFORE UPDATE ON action_roll_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY "action_roll_requests_select"
  ON action_roll_requests FOR SELECT
  TO authenticated
  USING (
    is_campaign_dm(campaign_id)
    OR player_id = auth.uid()
  );

CREATE POLICY "action_roll_requests_insert_dm"
  ON action_roll_requests FOR INSERT
  TO authenticated
  WITH CHECK (is_campaign_dm(campaign_id));

CREATE POLICY "action_roll_requests_update_dm_or_player"
  ON action_roll_requests FOR UPDATE
  TO authenticated
  USING (
    is_campaign_dm(campaign_id)
    OR player_id = auth.uid()
  )
  WITH CHECK (
    is_campaign_dm(campaign_id)
    OR player_id = auth.uid()
  );

CREATE TABLE IF NOT EXISTS action_roll_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roll_request_id UUID NOT NULL REFERENCES action_roll_requests(id) ON DELETE CASCADE,
  action_intent_id UUID NOT NULL REFERENCES action_intents(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  roll_mode TEXT NOT NULL CHECK (roll_mode IN ('manual', 'automatic')),
  natural_roll INTEGER NOT NULL CHECK (natural_roll BETWEEN 1 AND 20),
  second_natural_roll INTEGER CHECK (second_natural_roll BETWEEN 1 AND 20),
  used_natural_roll INTEGER NOT NULL CHECK (used_natural_roll BETWEEN 1 AND 20),
  modifier INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  target_number INTEGER,
  result TEXT NOT NULL DEFAULT 'unknown'
    CHECK (result IN ('critical_failure', 'failure', 'success', 'major_success', 'critical_success', 'unknown')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS action_roll_results_request_idx ON action_roll_results(roll_request_id);
CREATE INDEX IF NOT EXISTS action_roll_results_intent_idx ON action_roll_results(action_intent_id);
CREATE INDEX IF NOT EXISTS action_roll_results_campaign_idx ON action_roll_results(campaign_id);

ALTER TABLE action_roll_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "action_roll_results_select"
  ON action_roll_results FOR SELECT
  TO authenticated
  USING (
    is_campaign_dm(campaign_id)
    OR player_id = auth.uid()
  );

CREATE POLICY "action_roll_results_insert_player"
  ON action_roll_results FOR INSERT
  TO authenticated
  WITH CHECK (player_id = auth.uid());

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'action_roll_requests',
    'action_roll_results'
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

CREATE POLICY "action_intents_roll_update_actor"
  ON action_intents FOR UPDATE
  TO authenticated
  USING (
    actor_user_id = auth.uid()
    AND status IN ('approved_waiting_for_roll', 'rolling')
  )
  WITH CHECK (
    actor_user_id = auth.uid()
    AND status IN ('rolling', 'rolled_waiting_for_dm')
  );

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE action_roll_requests,
         action_roll_results
TO authenticated;
