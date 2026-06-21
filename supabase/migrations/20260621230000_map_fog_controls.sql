-- Adventure Maker fog controls: a map-level base fog mode + style, plus
-- author-painted fog regions.
--
-- Two parts:
--   1. fog_mode / fog_style on both prepared_maps (authoring) and maps (live):
--      base fog applied to the WHOLE map for players.
--        none   → no global fog (map fully visible unless masked by a region)
--        rooms  → legacy behaviour: global fog only when revealed-areas exist
--                 or there are no room masks (room masks carry the map)
--        hidden → entire map fogged for players until revealed live
--      fog_style picks the global fog density (blackout vs dim).
--   2. Painted fog regions are authored in prepared_maps.fog_regions (JSONB,
--      same shape as room_regions) and deploy into the existing
--      map_room_regions table as plain masks — so they reuse live rendering,
--      reveal, and realtime with no new live table.
--
-- Default 'rooms' / 'blackout' reproduces the current behaviour for every
-- existing map, so this is backward-compatible.

ALTER TABLE maps
  ADD COLUMN IF NOT EXISTS fog_mode TEXT NOT NULL DEFAULT 'rooms'
    CHECK (fog_mode IN ('none', 'rooms', 'hidden')),
  ADD COLUMN IF NOT EXISTS fog_style TEXT NOT NULL DEFAULT 'blackout'
    CHECK (fog_style IN ('blackout', 'dim'));

ALTER TABLE prepared_maps
  ADD COLUMN IF NOT EXISTS fog_mode TEXT NOT NULL DEFAULT 'rooms'
    CHECK (fog_mode IN ('none', 'rooms', 'hidden')),
  ADD COLUMN IF NOT EXISTS fog_style TEXT NOT NULL DEFAULT 'blackout'
    CHECK (fog_style IN ('blackout', 'dim')),
  ADD COLUMN IF NOT EXISTS fog_regions JSONB NOT NULL DEFAULT '[]'::JSONB;
