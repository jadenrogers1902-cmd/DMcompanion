-- ============================================================
-- DnD Companion App - Adventure Codex Phase 10
-- Optional Notion webhook receiver support.
--
-- Adds an admin-only webhook event store (for dedup + audit) and
-- auto-sync status fields on the connection. The webhook endpoint runs
-- server-side with the service-role client; these tables are never read
-- by the browser (the DM UI reads status via a DM-gated server action).
-- Run this AFTER 029_notion_sync_logs.sql
-- ============================================================

-- Auto-sync status on the (already server-only) connection row.
ALTER TABLE campaign_notion_connections
  ADD COLUMN IF NOT EXISTS auto_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_webhook_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_auto_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_auto_sync_status TEXT NOT NULL DEFAULT 'never'
    CHECK (last_auto_sync_status IN ('never', 'success', 'failed', 'partial')),
  ADD COLUMN IF NOT EXISTS failed_sync_count INTEGER NOT NULL DEFAULT 0;

-- Webhook event store: dedup by Notion delivery/event id, audit + status.
-- No raw payload is stored — only the fields needed to route + dedup + report.
CREATE TABLE IF NOT EXISTS notion_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  event_type TEXT,
  page_id TEXT,
  database_id TEXT,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processed', 'ignored', 'failed')),
  message TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS notion_webhook_events_campaign_idx
  ON notion_webhook_events(campaign_id, received_at DESC);

-- Admin-only, like campaign_notion_connections: RLS forced, no policies,
-- privileges revoked. Touched solely by the service-role webhook handler.
ALTER TABLE notion_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notion_webhook_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE notion_webhook_events FROM authenticated;
REVOKE ALL ON TABLE notion_webhook_events FROM anon;

COMMENT ON TABLE notion_webhook_events IS
  'Server-only Notion webhook event store for dedup + audit. No raw payload. RLS-locked: accessed only by the service-role webhook handler. Not realtime-published.';
