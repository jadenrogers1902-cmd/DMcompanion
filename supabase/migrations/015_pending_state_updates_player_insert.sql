-- ============================================================
-- DnD Companion App - Phase 4 Game State Sync (fix-up)
-- Allows the acting player's roll-submission flow to insert a
-- *suggested* pending_state_updates row (status pending_dm_review)
-- when their attack lands damage on a known token.
--
-- Why this is needed: `submitAttackRollResult` runs as the rolling
-- player (not the DM), and the original 014 migration only granted a
-- DM-only "FOR ALL" policy (USING/WITH CHECK is_campaign_dm). That
-- blocked the INSERT with "new row violates row-level security policy
-- for table pending_state_updates" whenever an attack hit and rolled
-- damage against a known target token.
--
-- This adds a narrow, additive INSERT policy for campaign members so
-- the suggestion can be queued. SELECT/UPDATE/DELETE remain DM-only
-- via the existing `pending_state_updates_dm_all` policy — players
-- still cannot read suggested HP/AC/state changes before the DM
-- reviews and applies them (RLS policies are combined with OR for
-- permissive policies, so this only adds INSERT capability).
--
-- Run this AFTER 014_pending_state_updates.sql
-- ============================================================

DROP POLICY IF EXISTS "pending_state_updates_insert_member" ON pending_state_updates;

CREATE POLICY "pending_state_updates_insert_member"
  ON pending_state_updates FOR INSERT
  TO authenticated
  WITH CHECK (
    status = 'pending_dm_review'
    AND applied_at IS NULL
    AND applied_by_dm_id IS NULL
    AND is_campaign_member(campaign_id)
  );
