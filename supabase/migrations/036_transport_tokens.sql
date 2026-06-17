-- Transport tokens: player-facing travel points that move the party between
-- maps. A transport token (live token_type 'portal') carries the prepared map
-- it travels to. Players tap it to travel — directly in freeroam/solo, or by
-- unanimous party confirmation in group-party mode. Travel is automatic (no DM
-- gate); the server action runs the deploy/activate with the service role.

ALTER TABLE tokens
  ADD COLUMN IF NOT EXISTS destination_prepared_map_id UUID
    REFERENCES prepared_maps(id) ON DELETE SET NULL;

-- One row per player per map: their current travel confirmation (which transport
-- token they want to go through). In group-party mode, when every accepted party
-- member has confirmed the same token, travel fires.
CREATE TABLE IF NOT EXISTS map_transport_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  token_id UUID NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  destination_prepared_map_id UUID REFERENCES prepared_maps(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (map_id, user_id)
);

CREATE INDEX IF NOT EXISTS map_transport_confirmations_map_idx
  ON map_transport_confirmations(map_id);
CREATE INDEX IF NOT EXISTS map_transport_confirmations_token_idx
  ON map_transport_confirmations(token_id);

ALTER TABLE map_transport_confirmations ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS map_transport_confirmations_updated_at ON map_transport_confirmations;
CREATE TRIGGER map_transport_confirmations_updated_at
  BEFORE UPDATE ON map_transport_confirmations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE POLICY "map_transport_confirmations_select"
  ON map_transport_confirmations FOR SELECT
  TO authenticated
  USING (is_campaign_member(campaign_id));

CREATE POLICY "map_transport_confirmations_insert_self"
  ON map_transport_confirmations FOR INSERT
  TO authenticated
  WITH CHECK (is_campaign_member(campaign_id) AND user_id = auth.uid());

CREATE POLICY "map_transport_confirmations_update_self"
  ON map_transport_confirmations FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "map_transport_confirmations_delete_self_or_dm"
  ON map_transport_confirmations FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR is_campaign_dm(campaign_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE map_transport_confirmations TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'map_transport_confirmations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE map_transport_confirmations;
  END IF;
END $$;

ALTER TABLE map_transport_confirmations REPLICA IDENTITY FULL;
