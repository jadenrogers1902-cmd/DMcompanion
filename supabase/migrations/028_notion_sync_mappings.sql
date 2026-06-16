-- ============================================================
-- DnD Companion App - Adventure Codex Phase 7
-- Notion database -> Adventure Codex doc-type mappings.
--
-- Stores how a Notion database's properties map onto Codex fields.
-- Contains no secrets (property names + a doc type), so it is a normal
-- DM-only RLS table accessed by the user-scoped client. The actual
-- Notion content read + sync happens server-side via the service-role
-- token (Phase 6); this table only describes the mapping.
-- Run this AFTER 027_campaign_notion_connections.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS notion_sync_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  notion_database_id TEXT NOT NULL,
  notion_database_name TEXT,
  doc_type TEXT NOT NULL
    CHECK (
      doc_type IN (
        'adventure', 'chapter', 'session', 'location', 'sub_location',
        'character', 'npc', 'boss', 'hostile_enemy', 'faction', 'rumor',
        'side_quest', 'main_quest', 'item', 'loot', 'handout', 'map_note',
        'object_note'
      )
    ),
  title_property TEXT,
  dm_summary_property TEXT,
  player_summary_property TEXT,
  dm_notes_property TEXT,
  tags_property TEXT,
  status_property TEXT,
  source_url_property TEXT,
  -- Array of Notion property names treated as relations -> related Codex docs.
  relation_properties JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, notion_database_id)
);

CREATE INDEX IF NOT EXISTS notion_sync_mappings_campaign_idx
  ON notion_sync_mappings(campaign_id);

DROP TRIGGER IF EXISTS notion_sync_mappings_updated_at ON notion_sync_mappings;
CREATE TRIGGER notion_sync_mappings_updated_at
  BEFORE UPDATE ON notion_sync_mappings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE notion_sync_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notion_sync_mappings_dm_all" ON notion_sync_mappings;
CREATE POLICY "notion_sync_mappings_dm_all"
  ON notion_sync_mappings FOR ALL
  TO authenticated
  USING (is_campaign_dm(campaign_id))
  WITH CHECK (is_campaign_dm(campaign_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE notion_sync_mappings TO authenticated;

COMMENT ON TABLE notion_sync_mappings IS
  'DM-only mapping of a Notion database''s properties onto Adventure Codex fields. No secrets; the Notion token lives in campaign_notion_connections. Not realtime-published.';
COMMENT ON COLUMN notion_sync_mappings.relation_properties IS
  'JSON array of Notion property names whose values are treated as relations to related Codex docs.';
