-- ============================================================
-- DnD Companion App - Adventure Codex Phase 6
-- Server-side Notion API connection. Stores the per-campaign Notion
-- integration token and test status.
--
-- SECURITY MODEL: the access token must never reach the browser. This
-- table has RLS ENABLED with NO policies for the `authenticated` role,
-- so the user-scoped Supabase client (browser AND cookie-based server
-- client) can read/write nothing here. Only the service-role admin
-- client used inside server actions (which bypasses RLS) touches it.
-- DM authorization is enforced in the server action layer before any
-- admin-client access.
-- Run this AFTER 026_codex_notion_manual_link.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS campaign_notion_connections (
  campaign_id UUID PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  -- Secret. Read only via the service-role client, server-side.
  access_token TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_test_status TEXT NOT NULL DEFAULT 'never'
    CHECK (last_test_status IN ('never', 'success', 'failed')),
  last_test_error TEXT,
  last_tested_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS campaign_notion_connections_updated_at ON campaign_notion_connections;
CREATE TRIGGER campaign_notion_connections_updated_at
  BEFORE UPDATE ON campaign_notion_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS on, deliberately NO policies for authenticated. The browser/cookie
-- client can never select the token (or any column). The service-role admin
-- client bypasses RLS and is the only accessor. This table is intentionally
-- NOT added to the realtime publication.
ALTER TABLE campaign_notion_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_notion_connections FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE campaign_notion_connections FROM authenticated;
REVOKE ALL ON TABLE campaign_notion_connections FROM anon;

COMMENT ON TABLE campaign_notion_connections IS
  'Per-campaign Notion integration secret + test status. RLS-locked: no authenticated policies, accessed only by the service-role admin client inside DM-gated server actions. Never published to realtime; token never returned to any client.';
COMMENT ON COLUMN campaign_notion_connections.access_token IS
  'Notion internal integration token. Server-only; read exclusively via the service-role client. Never selected into a frontend response.';
