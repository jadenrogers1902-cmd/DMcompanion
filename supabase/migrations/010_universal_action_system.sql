-- ============================================================
-- DnD Companion App - Universal DM-Controlled Action System
-- Run this AFTER 009_realtime_sync.sql if present, otherwise AFTER
-- 008_map_visibility_objects.sql.
--
-- Extends the existing tokens + action_intents infrastructure instead of
-- creating a parallel action_requests table.
-- ============================================================

-- Tokens become universal interactable objects that may also carry combat HP.
ALTER TABLE tokens
  ADD COLUMN IF NOT EXISTS visible_on_cast BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS resolver_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (resolver_type IN ('manual', 'attack', 'object_state')),
  ADD COLUMN IF NOT EXISTS resolver_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS max_hp INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_hp INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS temp_hp INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS armor_class INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS is_defeated BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE tokens DROP CONSTRAINT IF EXISTS tokens_object_state_known_check;
ALTER TABLE tokens ADD CONSTRAINT tokens_object_state_known_check
  CHECK (
    object_state IS NULL OR object_state IN (
      'hidden', 'visible', 'locked', 'unlocked', 'open', 'closed',
      'trapped', 'disarmed', 'activated', 'disabled', 'looted',
      'broken', 'defeated', 'custom'
    )
  );

ALTER TABLE action_intents DROP CONSTRAINT IF EXISTS action_intents_status_check;
ALTER TABLE action_intents ADD CONSTRAINT action_intents_status_check
  CHECK (status IN (
    'pending', 'approved', 'denied', 'needs_roll',
    'resolving', 'resolved', 'cancelled'
  ));

ALTER TABLE action_intents
  ADD COLUMN IF NOT EXISTS response_visibility TEXT NOT NULL DEFAULT 'actor'
    CHECK (response_visibility IN ('actor', 'public', 'dm')),
  ADD COLUMN IF NOT EXISTS resolver_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (resolver_type IN ('manual', 'attack', 'object_state')),
  ADD COLUMN IF NOT EXISTS resolver_status TEXT NOT NULL DEFAULT 'idle'
    CHECK (resolver_status IN ('idle', 'pending_player', 'rolling', 'applied', 'manual', 'failed')),
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Character attack definitions for the first attack resolver. These are
-- user/DM-authored, not sourcebook data.
CREATE TABLE IF NOT EXISTS character_attacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  attack_type TEXT NOT NULL DEFAULT 'melee'
    CHECK (attack_type IN ('melee', 'ranged', 'spell', 'custom')),
  ability_modifier TEXT NOT NULL DEFAULT 'str'
    CHECK (ability_modifier IN ('str', 'dex', 'con', 'intel', 'wis', 'cha', 'custom')),
  proficient BOOLEAN NOT NULL DEFAULT TRUE,
  attack_bonus_override INTEGER,
  damage_dice TEXT NOT NULL DEFAULT '1d6',
  damage_modifier INTEGER NOT NULL DEFAULT 0,
  damage_type TEXT,
  range_normal INTEGER,
  range_long INTEGER,
  equipped BOOLEAN NOT NULL DEFAULT TRUE,
  ammo_required BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS character_attacks_character_idx ON character_attacks(character_id);
ALTER TABLE character_attacks ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER character_attacks_updated_at
  BEFORE UPDATE ON character_attacks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY "character_attacks_select"
  ON character_attacks FOR SELECT
  TO authenticated
  USING (
    character_owner_id(character_id) = auth.uid()
    OR is_campaign_dm(character_campaign_id(character_id))
  );

CREATE POLICY "character_attacks_insert_owner"
  ON character_attacks FOR INSERT
  TO authenticated
  WITH CHECK (
    character_owner_id(character_id) = auth.uid()
    OR is_campaign_dm(character_campaign_id(character_id))
  );

CREATE POLICY "character_attacks_update_owner"
  ON character_attacks FOR UPDATE
  TO authenticated
  USING (
    character_owner_id(character_id) = auth.uid()
    OR is_campaign_dm(character_campaign_id(character_id))
  )
  WITH CHECK (
    character_owner_id(character_id) = auth.uid()
    OR is_campaign_dm(character_campaign_id(character_id))
  );

CREATE POLICY "character_attacks_delete_owner"
  ON character_attacks FOR DELETE
  TO authenticated
  USING (
    character_owner_id(character_id) = auth.uid()
    OR is_campaign_dm(character_campaign_id(character_id))
  );

-- Player-safe action results. DM-only details are split into a protected
-- column and only selected by DM views.
CREATE TABLE IF NOT EXISTS action_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_intent_id UUID NOT NULL REFERENCES action_intents(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  map_id UUID REFERENCES maps(id) ON DELETE SET NULL,
  actor_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  actor_character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL DEFAULT 'token',
  target_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  result_type TEXT NOT NULL DEFAULT 'manual',
  result_summary TEXT,
  private_dm_details TEXT,
  public_result BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS action_results_campaign_idx ON action_results(campaign_id);
CREATE INDEX IF NOT EXISTS action_results_intent_idx ON action_results(action_intent_id);
CREATE INDEX IF NOT EXISTS action_results_actor_idx ON action_results(actor_user_id);
ALTER TABLE action_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "action_results_select"
  ON action_results FOR SELECT
  TO authenticated
  USING (
    is_campaign_dm(campaign_id)
    OR (
      private_dm_details IS NULL
      AND (
        actor_user_id = auth.uid()
        OR (public_result = TRUE AND is_campaign_member(campaign_id))
      )
    )
  );

CREATE POLICY "action_results_insert_dm"
  ON action_results FOR INSERT
  TO authenticated
  WITH CHECK (is_campaign_dm(campaign_id));

CREATE POLICY "action_results_update_dm"
  ON action_results FOR UPDATE
  TO authenticated
  USING (is_campaign_dm(campaign_id))
  WITH CHECK (is_campaign_dm(campaign_id));

CREATE POLICY "action_results_delete_dm"
  ON action_results FOR DELETE
  TO authenticated
  USING (is_campaign_dm(campaign_id));

CREATE TABLE IF NOT EXISTS combat_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  map_id UUID REFERENCES maps(id) ON DELETE SET NULL,
  encounter_id UUID REFERENCES encounters(id) ON DELETE SET NULL,
  action_intent_id UUID REFERENCES action_intents(id) ON DELETE SET NULL,
  actor_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  actor_character_id UUID REFERENCES characters(id) ON DELETE SET NULL,
  target_token_id UUID REFERENCES tokens(id) ON DELETE SET NULL,
  attack_id UUID REFERENCES character_attacks(id) ON DELETE SET NULL,
  d20_roll INTEGER,
  attack_modifier INTEGER NOT NULL DEFAULT 0,
  attack_total INTEGER,
  target_ac INTEGER,
  result TEXT NOT NULL CHECK (result IN ('hit', 'miss', 'manual')),
  damage_dice TEXT,
  damage_rolls INTEGER[] NOT NULL DEFAULT '{}',
  damage_modifier INTEGER NOT NULL DEFAULT 0,
  total_damage INTEGER NOT NULL DEFAULT 0,
  damage_type TEXT,
  hp_before INTEGER,
  hp_after INTEGER,
  target_defeated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS combat_logs_campaign_idx ON combat_logs(campaign_id);
CREATE INDEX IF NOT EXISTS combat_logs_intent_idx ON combat_logs(action_intent_id);
CREATE INDEX IF NOT EXISTS combat_logs_target_idx ON combat_logs(target_token_id);
ALTER TABLE combat_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "combat_logs_select"
  ON combat_logs FOR SELECT
  TO authenticated
  USING (is_campaign_member(campaign_id));

CREATE POLICY "combat_logs_insert_dm"
  ON combat_logs FOR INSERT
  TO authenticated
  WITH CHECK (is_campaign_dm(campaign_id));

CREATE POLICY "combat_logs_update_dm"
  ON combat_logs FOR UPDATE
  TO authenticated
  USING (is_campaign_dm(campaign_id))
  WITH CHECK (is_campaign_dm(campaign_id));

CREATE POLICY "combat_logs_delete_dm"
  ON combat_logs FOR DELETE
  TO authenticated
  USING (is_campaign_dm(campaign_id));

-- Realtime publication for no-refresh action workflows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'action_intents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE action_intents;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'action_results'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE action_results;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'combat_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE combat_logs;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'character_attacks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE character_attacks;
  END IF;
END $$;

ALTER TABLE action_results REPLICA IDENTITY FULL;
ALTER TABLE combat_logs REPLICA IDENTITY FULL;
ALTER TABLE character_attacks REPLICA IDENTITY FULL;
ALTER TABLE action_intents REPLICA IDENTITY FULL;
ALTER TABLE tokens REPLICA IDENTITY FULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE character_attacks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE action_results TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE combat_logs TO authenticated;
