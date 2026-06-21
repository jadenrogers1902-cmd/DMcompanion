-- Persist DM acknowledgement of player "Nudge DM" pokes (QA Phase 5).
--
-- A nudge is a party_messages row (message_type = 'nudge'). Previously the DM
-- action queue's red highlight was cleared only client-side, so a hard refresh
-- re-derived the highlight from the still-present nudge row and it reappeared.
-- handled_at stamps when the DM opened/acted on that player's nudged card; the
-- server derivation then ignores handled nudges, so the highlight stays cleared
-- across refreshes while genuinely new nudges (handled_at IS NULL) still show.

ALTER TABLE party_messages
  ADD COLUMN IF NOT EXISTS handled_at TIMESTAMPTZ;

-- Narrow DM-only UPDATE path. party_messages was insert-only (players insert
-- their own rows). This lets the campaign DM acknowledge messages (set
-- handled_at) without granting players any UPDATE. The DM is already trusted to
-- read every campaign message, so a DM-scoped UPDATE is safe.
DROP POLICY IF EXISTS "party_messages_update_dm" ON party_messages;
CREATE POLICY "party_messages_update_dm"
  ON party_messages FOR UPDATE
  TO authenticated
  USING (is_campaign_dm(campaign_id))
  WITH CHECK (is_campaign_dm(campaign_id));

GRANT UPDATE ON TABLE party_messages TO authenticated;
