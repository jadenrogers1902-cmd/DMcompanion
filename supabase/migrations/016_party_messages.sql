-- ============================================================
-- DnD Companion App - Player Map Party Communication
-- Run this AFTER 015_pending_state_updates_player_insert.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS party_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL
    CHECK (message_type IN ('meeting', 'announcement', 'whisper', 'nudge')),
  message TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Party Message',
  sender_name TEXT,
  recipient_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  dm_recipient_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  visibility_level TEXT NOT NULL DEFAULT 'players'
    CHECK (visibility_level IN ('players', 'dm_metadata', 'private')),
  delivery_status TEXT NOT NULL DEFAULT 'sent'
    CHECK (delivery_status IN ('pending', 'sent', 'received', 'failed')),
  delivery_log JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE party_messages
  ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Party Message',
  ADD COLUMN IF NOT EXISTS sender_name TEXT,
  ADD COLUMN IF NOT EXISTS recipient_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  ADD COLUMN IF NOT EXISTS dm_recipient_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visibility_level TEXT NOT NULL DEFAULT 'players'
    CHECK (visibility_level IN ('players', 'dm_metadata', 'private')),
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'sent'
    CHECK (delivery_status IN ('pending', 'sent', 'received', 'failed')),
  ADD COLUMN IF NOT EXISTS delivery_log JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE party_messages
  DROP CONSTRAINT IF EXISTS party_messages_message_type_check;

ALTER TABLE party_messages
  ADD CONSTRAINT party_messages_message_type_check
  CHECK (message_type IN ('meeting', 'announcement', 'whisper', 'nudge'));

CREATE INDEX IF NOT EXISTS party_messages_campaign_idx ON party_messages(campaign_id);
CREATE INDEX IF NOT EXISTS party_messages_recipient_idx ON party_messages(recipient_user_id);
CREATE INDEX IF NOT EXISTS party_messages_created_idx ON party_messages(created_at);

ALTER TABLE party_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "party_messages_select_member_scoped" ON party_messages;
CREATE POLICY "party_messages_select_member_scoped"
  ON party_messages FOR SELECT
  TO authenticated
  USING (
    is_campaign_dm(campaign_id)
    OR (
      is_campaign_member(campaign_id)
      AND (
        recipient_user_id IS NULL
        OR recipient_user_id = auth.uid()
        OR sender_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "party_messages_insert_member" ON party_messages;
CREATE POLICY "party_messages_insert_member"
  ON party_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_user_id = auth.uid()
    AND is_campaign_member(campaign_id)
    AND (
      recipient_user_id IS NULL
      OR EXISTS (
        SELECT 1 FROM campaign_members cm
        WHERE cm.campaign_id = party_messages.campaign_id
          AND cm.user_id = party_messages.recipient_user_id
      )
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'party_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE party_messages;
  END IF;

  ALTER TABLE party_messages REPLICA IDENTITY FULL;
END $$;

GRANT SELECT, INSERT
ON TABLE party_messages
TO authenticated;
