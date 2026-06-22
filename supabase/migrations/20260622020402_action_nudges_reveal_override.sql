-- Action-specific nudges + non-destructive reveal-all/hide-all override.
--
-- `party_messages.action_intent_id` lets the DM action queue highlight and
-- acknowledge one exact action card instead of every active card from a player.
-- `maps.reveal_override` lets the DM temporarily reveal or hide the whole map
-- without deleting painted reveal areas or room masks.

ALTER TABLE party_messages
  ADD COLUMN IF NOT EXISTS action_intent_id UUID REFERENCES action_intents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS party_messages_action_intent_idx
  ON party_messages(action_intent_id)
  WHERE action_intent_id IS NOT NULL;

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
    AND (
      action_intent_id IS NULL
      OR (
        message_type = 'nudge'
        AND EXISTS (
          SELECT 1 FROM action_intents ai
          WHERE ai.id = party_messages.action_intent_id
            AND ai.campaign_id = party_messages.campaign_id
            AND ai.actor_user_id = auth.uid()
            AND ai.status NOT IN ('denied', 'resolved', 'cancelled')
        )
      )
    )
  );

ALTER TABLE maps
  ADD COLUMN IF NOT EXISTS reveal_override TEXT NOT NULL DEFAULT 'normal'
    CHECK (reveal_override IN ('normal', 'reveal_all', 'hide_all'));

-- Preserve existing UPDATE policy; migration 20260621220000 grants DMs the
-- ability to stamp handled_at. The narrowed INSERT policy keeps generic nudges
-- possible while preventing players from pointing action nudges at someone
-- else's action intent.
