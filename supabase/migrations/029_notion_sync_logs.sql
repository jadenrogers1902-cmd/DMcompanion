-- ============================================================
-- DnD Companion App - Adventure Codex Phase 8
-- Manual Notion -> Codex sync logs.
--
-- DM-only audit log of manual sync runs. No secrets; messages are
-- clean (no raw Notion API bodies). Run this AFTER
-- 028_notion_sync_mappings.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS notion_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL
    CHECK (sync_type IN ('doc', 'database', 'all')),
  source_page_id TEXT,
  source_database_id TEXT,
  status TEXT NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'failed', 'partial')),
  message TEXT,
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS notion_sync_logs_campaign_idx
  ON notion_sync_logs(campaign_id, started_at DESC);

ALTER TABLE notion_sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notion_sync_logs_dm_all" ON notion_sync_logs;
CREATE POLICY "notion_sync_logs_dm_all"
  ON notion_sync_logs FOR ALL
  TO authenticated
  USING (is_campaign_dm(campaign_id))
  WITH CHECK (is_campaign_dm(campaign_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE notion_sync_logs TO authenticated;

COMMENT ON TABLE notion_sync_logs IS
  'DM-only audit log of manual Notion->Codex sync runs. Clean messages only (no raw API errors). Not realtime-published.';
