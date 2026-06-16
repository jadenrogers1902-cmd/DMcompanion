-- ============================================================
-- DnD Companion App - Phase 2 Roll Modifier Context
-- Run this AFTER 011_action_roll_requests.sql
-- ============================================================

ALTER TABLE action_roll_requests DROP CONSTRAINT IF EXISTS action_roll_requests_roll_type_check;
ALTER TABLE action_roll_requests ADD CONSTRAINT action_roll_requests_roll_type_check
  CHECK (roll_type IN (
    'generic',
    'ability_check',
    'attack',
    'weapon_attack',
    'spell_attack',
    'skill_check',
    'saving_throw',
    'tool_check',
    'damage',
    'custom'
  ));

ALTER TABLE action_roll_requests
  ADD COLUMN IF NOT EXISTS modifier_source TEXT NOT NULL DEFAULT 'manual'
    CHECK (modifier_source IN ('manual', 'calculated', 'override')),
  ADD COLUMN IF NOT EXISTS modifier_breakdown TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS modifier_notes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS modifier_warnings TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS roll_context JSONB NOT NULL DEFAULT '{}'::jsonb;
