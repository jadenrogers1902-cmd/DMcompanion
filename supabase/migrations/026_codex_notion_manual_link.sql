-- ============================================================
-- DnD Companion App - Adventure Codex Phase 5
-- Manual Notion link support. The Notion reference fields
-- (source, source_url, source_page_id, source_database_id) already
-- exist from 024; this adds the "last manually linked" timestamp.
--
-- No privacy/projection change is needed: campaign_docs is DM-only
-- under RLS, and none of the Notion source fields are included in the
-- player-safe projection (campaign_doc_publications) or in
-- get_player_visible_campaign_docs(). Players never receive Notion links.
-- Run this AFTER 025_codex_reveal_notifications.sql
-- ============================================================

ALTER TABLE campaign_docs
  ADD COLUMN IF NOT EXISTS source_linked_at TIMESTAMPTZ;

COMMENT ON COLUMN campaign_docs.source_linked_at IS
  'When the DM manually attached/updated the external (Notion) link. NULL when no link is set. DM-only; never exposed to players.';
