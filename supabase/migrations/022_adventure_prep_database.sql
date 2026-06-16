-- ============================================================
-- DnD Companion App - Adventure Maker Phase 6
-- Notion-style prep metadata for adventures, chapters, prepared
-- maps, and tokens. Prep data remains DM-only through existing
-- table RLS policies; players cannot select these rows.
-- Run this AFTER 021_prepared_maps.sql
-- ============================================================

ALTER TABLE adventures
  ADD COLUMN IF NOT EXISTS prep_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS important_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE adventure_chapters
  ADD COLUMN IF NOT EXISTS prep_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS important_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE prepared_maps
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN adventures.prep_notes IS
  'DM-only Adventure Maker prep notes. May include player-facing text for DM prep, but the table is DM-only.';
COMMENT ON COLUMN adventures.important_links IS
  'DM-only Adventure Maker important links/resources for this adventure.';
COMMENT ON COLUMN adventures.tags IS
  'Lightweight prep tags for filtering/organization.';

COMMENT ON COLUMN adventure_chapters.prep_notes IS
  'DM-only Adventure Maker prep notes. May include player-facing text for DM prep, but the table is DM-only.';
COMMENT ON COLUMN adventure_chapters.important_links IS
  'DM-only Adventure Maker important links/resources for this chapter.';
COMMENT ON COLUMN adventure_chapters.tags IS
  'Lightweight prep tags for filtering/organization.';

COMMENT ON COLUMN prepared_maps.tags IS
  'Lightweight prep tags for filtering/organization.';
