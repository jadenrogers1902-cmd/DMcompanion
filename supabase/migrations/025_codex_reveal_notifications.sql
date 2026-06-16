-- ============================================================
-- DnD Companion App - Adventure Codex Phase 4
-- Player-safe reveal system for Codex docs.
--   1. Adds a dedicated 'codex_reveal' party-message type so reveals
--      reuse the existing live popup/notification pipeline.
--   2. Lets a member SELECT the codex_reveals rows that pertain to them
--      (party reveals + their own targeted reveals) so single-player
--      reveals push live over realtime. DM keeps full access.
-- Run this AFTER 024_adventure_codex_foundation.sql
-- ============================================================

-- 1. Allow 'codex_reveal' as a party-message type. The notification body is
--    always player-safe (a generic "new info" line + the DM's optional note);
--    it never carries DM notes, raw ids, or unrevealed content.
ALTER TABLE party_messages
  DROP CONSTRAINT IF EXISTS party_messages_message_type_check;

ALTER TABLE party_messages
  ADD CONSTRAINT party_messages_message_type_check
  CHECK (message_type IN ('meeting', 'announcement', 'whisper', 'nudge', 'codex_reveal'));

-- 2. codex_reveals stays DM-managed (insert/update/delete is DM-only via the
--    existing codex_reveals_dm_all policy). This ADDITIVE SELECT policy lets the
--    affected member receive the row over realtime so their Revealed Info panel
--    refetches without a manual refresh. A player only ever sees:
--      - party-scope reveals (already shared with the whole table), or
--      - player-scope reveals explicitly targeted at them.
--    They never see another player's targeted reveal, and the row contains no
--    DM notes — only doc_id (already exposed via the safe RPC/publications),
--    the DM's reveal_message, and reveal metadata.
DROP POLICY IF EXISTS "codex_reveals_select_scoped_member" ON codex_reveals;
CREATE POLICY "codex_reveals_select_scoped_member"
  ON codex_reveals FOR SELECT
  TO authenticated
  USING (
    is_campaign_member(campaign_id)
    AND (
      revealed_to_scope = 'party'
      OR (
        revealed_to_scope = 'player'
        AND revealed_to_player_id = auth.uid()
      )
    )
  );

COMMENT ON POLICY "codex_reveals_select_scoped_member" ON codex_reveals IS
  'Lets a member read only the reveals that apply to them (party reveals or their own targeted reveal) so single-player reveals propagate over realtime. Insert/update/delete remains DM-only.';
