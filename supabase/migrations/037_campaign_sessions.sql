-- Live tabletop sessions: a campaign-level "we are live at the table" signal the
-- DM starts from any live map. Drives the player-facing Tabletop tab + the live
-- (red) indicator. Independent of which map is active — it's a presence signal,
-- not map state.

CREATE TABLE IF NOT EXISTS campaign_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  -- The map the DM started the session from (reference only).
  map_id UUID REFERENCES maps(id) ON DELETE SET NULL,
  started_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- At most one active session per campaign.
CREATE UNIQUE INDEX IF NOT EXISTS campaign_sessions_one_active
  ON campaign_sessions(campaign_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS campaign_sessions_campaign_idx ON campaign_sessions(campaign_id);

ALTER TABLE campaign_sessions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS campaign_sessions_updated_at ON campaign_sessions;
CREATE TRIGGER campaign_sessions_updated_at
  BEFORE UPDATE ON campaign_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY "campaign_sessions_select"
  ON campaign_sessions FOR SELECT
  TO authenticated
  USING (is_campaign_member(campaign_id));

CREATE POLICY "campaign_sessions_insert_dm"
  ON campaign_sessions FOR INSERT
  TO authenticated
  WITH CHECK (is_campaign_dm(campaign_id) AND started_by = auth.uid());

CREATE POLICY "campaign_sessions_update_dm"
  ON campaign_sessions FOR UPDATE
  TO authenticated
  USING (is_campaign_dm(campaign_id))
  WITH CHECK (is_campaign_dm(campaign_id));

GRANT SELECT, INSERT, UPDATE ON TABLE campaign_sessions TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'campaign_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE campaign_sessions;
  END IF;
END $$;

ALTER TABLE campaign_sessions REPLICA IDENTITY FULL;
