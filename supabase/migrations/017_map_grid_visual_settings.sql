-- ============================================================
-- DnD Companion App - Map Grid Visual Settings
-- Run this AFTER 016_party_messages.sql
-- ============================================================

ALTER TABLE maps
  ADD COLUMN IF NOT EXISTS grid_color TEXT NOT NULL DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS grid_opacity DOUBLE PRECISION NOT NULL DEFAULT 0.34,
  ADD COLUMN IF NOT EXISTS grid_line_width DOUBLE PRECISION NOT NULL DEFAULT 1.25,
  ADD COLUMN IF NOT EXISTS grid_subdivisions INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS grid_offset_x INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grid_offset_y INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dm_light_brightness DOUBLE PRECISION NOT NULL DEFAULT 0.18;

ALTER TABLE maps
  DROP CONSTRAINT IF EXISTS maps_grid_color_format_check,
  DROP CONSTRAINT IF EXISTS maps_grid_opacity_range_check,
  DROP CONSTRAINT IF EXISTS maps_grid_line_width_range_check,
  DROP CONSTRAINT IF EXISTS maps_grid_subdivisions_range_check,
  DROP CONSTRAINT IF EXISTS maps_dm_light_brightness_range_check;

ALTER TABLE maps
  ADD CONSTRAINT maps_grid_color_format_check
    CHECK (grid_color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT maps_grid_opacity_range_check
    CHECK (grid_opacity >= 0.05 AND grid_opacity <= 1),
  ADD CONSTRAINT maps_grid_line_width_range_check
    CHECK (grid_line_width >= 0.5 AND grid_line_width <= 6),
  ADD CONSTRAINT maps_grid_subdivisions_range_check
    CHECK (grid_subdivisions >= 1 AND grid_subdivisions <= 8),
  ADD CONSTRAINT maps_dm_light_brightness_range_check
    CHECK (dm_light_brightness >= 0 AND dm_light_brightness <= 0.6);
