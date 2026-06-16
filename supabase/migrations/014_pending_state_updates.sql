-- ============================================================
-- DnD Companion App - Phase 4 Game State Sync
-- Connects resolved actions (attacks, object interactions, checks)
-- to map/token/object state through DM-reviewed pending updates.
-- Run this AFTER 013_attack_resolution_phase3.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS pending_state_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  action_intent_id UUID REFERENCES action_intents(id) ON DELETE CASCADE,
  roll_result_id UUID,
  update_type TEXT NOT NULL
    CHECK (update_type IN (
      'damage_token', 'set_token_state', 'set_object_state',
      'reveal_object', 'set_awareness', 'custom'
    )),
  target_id UUID,
  target_kind TEXT NOT NULL DEFAULT 'token'
    CHECK (target_kind IN ('token', 'object', 'room', 'map', 'custom')),
  target_name TEXT,
  before JSONB NOT NULL DEFAULT '{}'::jsonb,
  after JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_dm_review'
    CHECK (status IN ('pending_dm_review', 'applied', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at TIMESTAMPTZ,
  applied_by_dm_id UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS pending_state_updates_campaign_idx ON pending_state_updates(campaign_id);
CREATE INDEX IF NOT EXISTS pending_state_updates_intent_idx ON pending_state_updates(action_intent_id);
CREATE INDEX IF NOT EXISTS pending_state_updates_status_idx ON pending_state_updates(status);
CREATE INDEX IF NOT EXISTS pending_state_updates_target_idx ON pending_state_updates(target_id);

ALTER TABLE pending_state_updates ENABLE ROW LEVEL SECURITY;

-- DM-only table: suggested updates may contain hidden HP/AC/state info that
-- must not leak to players before the DM applies and (where relevant) reveals
-- the resulting token/object change through the normal tokens RLS policies.
CREATE POLICY "pending_state_updates_dm_all"
  ON pending_state_updates FOR ALL
  TO authenticated
  USING (is_campaign_dm(campaign_id))
  WITH CHECK (is_campaign_dm(campaign_id));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pending_state_updates'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE pending_state_updates';
  END IF;

  EXECUTE 'ALTER TABLE pending_state_updates REPLICA IDENTITY FULL';
END $$;

GRANT SELECT, INSERT, UPDATE
ON TABLE pending_state_updates
TO authenticated;
