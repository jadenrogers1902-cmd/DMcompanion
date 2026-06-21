-- Allow a campaign DM to remove player members from their campaign.
-- DM rows are intentionally excluded here; this is a player-removal control,
-- not a DM ownership or demotion workflow.

DROP POLICY IF EXISTS "campaign_members_delete" ON campaign_members;

CREATE POLICY "campaign_members_delete"
  ON campaign_members FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      role = 'player'
      AND is_campaign_dm(campaign_id)
    )
  );
