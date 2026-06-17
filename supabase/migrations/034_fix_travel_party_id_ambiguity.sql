-- Fix PL/pgSQL ambiguity around party_id in travel-party RPCs.
-- This is a follow-up for databases where migration 032 was already applied.

CREATE OR REPLACE FUNCTION create_travel_party(
  p_campaign_id UUID,
  p_map_id UUID,
  p_name TEXT,
  p_leader_user_id UUID,
  p_member_user_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_party_id UUID;
  v_member_id UUID;
  normalized_name TEXT;
BEGIN
  IF NOT is_campaign_member(p_campaign_id) THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM maps AS m WHERE m.id = p_map_id AND m.campaign_id = p_campaign_id) THEN
    RETURN jsonb_build_object('error', 'Map not found');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM campaign_members AS cm
    WHERE cm.campaign_id = p_campaign_id AND cm.user_id = p_leader_user_id
  ) THEN
    RETURN jsonb_build_object('error', 'Leader must be a campaign member');
  END IF;

  normalized_name := COALESCE(NULLIF(TRIM(p_name), ''), 'Travel Party');

  INSERT INTO map_travel_parties (campaign_id, map_id, name, created_by, leader_user_id)
  VALUES (p_campaign_id, p_map_id, normalized_name, auth.uid(), p_leader_user_id)
  RETURNING id INTO v_party_id;

  FOR v_member_id IN
    SELECT DISTINCT member_ids.x
    FROM unnest(array_append(COALESCE(p_member_user_ids, ARRAY[]::UUID[]), p_leader_user_id)) AS member_ids(x)
    WHERE member_ids.x IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM campaign_members AS cm
        WHERE cm.campaign_id = p_campaign_id AND cm.user_id = member_ids.x
      )
  LOOP
    INSERT INTO map_travel_party_members (party_id, campaign_id, map_id, user_id, status)
    VALUES (
      v_party_id,
      p_campaign_id,
      p_map_id,
      v_member_id,
      CASE WHEN v_member_id = auth.uid() THEN 'accepted' ELSE 'pending' END
    )
    ON CONFLICT (party_id, user_id) DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object('ok', TRUE, 'party_id', v_party_id);
END;
$$;

CREATE OR REPLACE FUNCTION respond_travel_party_invite(
  p_party_id UUID,
  p_accepted BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE map_travel_party_members AS m
    SET status = CASE WHEN p_accepted THEN 'accepted' ELSE 'denied' END
    WHERE m.party_id = p_party_id AND m.user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Party invite not found');
  END IF;

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION review_travel_party(
  p_party_id UUID,
  p_approved BOOLEAN,
  p_dm_response TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  p map_travel_parties;
BEGIN
  SELECT * INTO p FROM map_travel_parties AS tp WHERE tp.id = p_party_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Party not found');
  END IF;
  IF NOT is_campaign_dm(p.campaign_id) THEN
    RETURN jsonb_build_object('error', 'Only the DM can review parties');
  END IF;

  UPDATE map_travel_parties AS tp
    SET status = CASE WHEN p_approved THEN 'approved' ELSE 'denied' END,
        dm_response = NULLIF(TRIM(p_dm_response), ''),
        approved_by = auth.uid()
    WHERE tp.id = p_party_id;

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;
