-- ============================================================
-- DnD Companion App - Action Intent Selected Tool
-- Run this AFTER 017_map_grid_visual_settings.sql
-- ============================================================

ALTER TABLE action_intents
  ADD COLUMN IF NOT EXISTS selected_tool_type TEXT,
  ADD COLUMN IF NOT EXISTS selected_tool_id TEXT,
  ADD COLUMN IF NOT EXISTS selected_tool_name TEXT;
