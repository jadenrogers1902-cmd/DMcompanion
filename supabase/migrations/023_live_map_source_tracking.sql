-- ============================================================
-- DnD Companion App - Adventure Maker Phase 9
-- Track which prepared map a live map was deployed from, so the DM
-- can see provenance and jump back to the (DM-only) prep source.
-- Run this AFTER 022_adventure_prep_database.sql
--
-- NOTE: `maps` is realtime-published, so players receive full rows of
-- the ACTIVE map. This column is an opaque reference id only — it
-- carries no DM-private content, and prepared_maps stays behind
-- DM-only RLS, so players gain nothing from seeing the id. We keep
-- all DM-private prep content (notes/links) in the DM-only prep
-- tables and reference them via this id, never copying them onto the
-- published live row.
-- ============================================================

ALTER TABLE maps
  ADD COLUMN IF NOT EXISTS source_prepared_map_id UUID
    REFERENCES prepared_maps(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS maps_source_prepared_map_idx
  ON maps(source_prepared_map_id);

COMMENT ON COLUMN maps.source_prepared_map_id IS
  'If this live map was deployed from an Adventure Maker prepared map, the source prepared_maps.id. ON DELETE SET NULL so deleting the prep never breaks the deployed live map. Opaque reference only — no DM-private content lives here.';
