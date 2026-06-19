-- Chapter-level "live for play" + a per-chapter hub (entry) map.
--
-- is_hub: one prepared map per chapter is the entry point players land on.
-- is_live: one chapter per campaign is the currently playable one. Opening a
-- chapter for players marks it live and activates its hub as the live map.
-- Both are DM-only prep flags (these tables already have DM-only RLS).

ALTER TABLE prepared_maps
  ADD COLUMN IF NOT EXISTS is_hub BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE adventure_chapters
  ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT FALSE;

-- At most one hub per chapter / one live chapter per campaign. Partial unique
-- indexes keep it consistent even if two writes race.
CREATE UNIQUE INDEX IF NOT EXISTS prepared_maps_one_hub_per_chapter
  ON prepared_maps(chapter_id) WHERE is_hub = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS adventure_chapters_one_live_per_campaign
  ON adventure_chapters(campaign_id) WHERE is_live = TRUE;
