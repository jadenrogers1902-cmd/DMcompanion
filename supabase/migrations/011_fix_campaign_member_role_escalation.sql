-- Fix: campaign_members_insert_self allowed an authenticated user to insert
-- a membership row for themselves with an arbitrary role (including 'dm'),
-- bypassing the app-level joinCampaign() flow which always hard-codes
-- role = 'player'. A direct REST/JS-client insert could self-promote to DM
-- on any campaign whose UUID is known (e.g. visible in the URL), gaining
-- access to all DM-only data gated by is_campaign_dm().
--
-- createCampaign() (lib/actions/campaigns.ts) legitimately inserts a
-- role = 'dm' row for the campaign creator immediately after inserting the
-- campaigns row with owner_id = auth.uid(). That path must keep working, so
-- the policy allows role = 'dm' only when the caller actually owns the
-- target campaign; every other self-insert must be role = 'player'
-- (mirrors joinCampaign()'s hard-coded role assignment).

DROP POLICY IF EXISTS "campaign_members_insert_self" ON campaign_members;

CREATE POLICY "campaign_members_insert_self"
  ON campaign_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      role = 'player'
      OR (
        role = 'dm'
        AND EXISTS (
          SELECT 1 FROM campaigns c
          WHERE c.id = campaign_id AND c.owner_id = auth.uid()
        )
      )
    )
  );
