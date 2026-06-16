-- ============================================================
-- DnD Companion App - Adventure Codex Remaster Phase 2
-- Adventure scoping for Codex records + mappings.
--
-- Adds a nullable adventure_id to campaign_docs and notion_sync_mappings so
-- synced records can belong to an Adventure. This is what makes the
-- "Delete local synced data by Adventure" wipe safe and precise (it can scope
-- deletes to one Adventure instead of the whole campaign), and lets Codex cards
-- show which Adventure a table belongs to.
--
-- Existing rows are left with adventure_id = NULL ("not linked to an Adventure").
-- No data is deleted. No Notion data is touched. ON DELETE SET NULL keeps Codex
-- records if their Adventure is later removed.
-- Run this AFTER 030_notion_webhooks.sql
-- ============================================================

ALTER TABLE campaign_docs
  ADD COLUMN IF NOT EXISTS adventure_id UUID REFERENCES adventures(id) ON DELETE SET NULL;

ALTER TABLE notion_sync_mappings
  ADD COLUMN IF NOT EXISTS adventure_id UUID REFERENCES adventures(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS campaign_docs_adventure_idx
  ON campaign_docs(campaign_id, adventure_id);
CREATE INDEX IF NOT EXISTS notion_sync_mappings_adventure_idx
  ON notion_sync_mappings(campaign_id, adventure_id);

COMMENT ON COLUMN campaign_docs.adventure_id IS
  'Optional Adventure this synced/manual Codex record belongs to. NULL = not linked to an Adventure. Used to scope the "delete local synced data" wipe by Adventure. Never affects Notion.';
COMMENT ON COLUMN notion_sync_mappings.adventure_id IS
  'Optional Adventure this Notion table mapping belongs to. Sync stamps it onto upserted campaign_docs so records inherit their Adventure.';
