-- ============================================================
-- DnD Companion App - Talk Action NPC Reveals
-- Adds player-safe structured NPC profile snapshots for Talk approvals.
-- Run this AFTER 043_player_vision_radius_controls.sql
-- ============================================================

ALTER TABLE campaign_docs
  ADD COLUMN IF NOT EXISTS npc_profile JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE campaign_doc_publications
  ADD COLUMN IF NOT EXISTS npc_profile JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE action_results
  ADD COLUMN IF NOT EXISTS reveal_payload JSONB;

COMMENT ON COLUMN campaign_docs.npc_profile IS
  'Player-safe structured NPC profile cache from Notion/manual Codex fields: role, personality, appearance, wares.';
COMMENT ON COLUMN campaign_doc_publications.npc_profile IS
  'Player-safe structured NPC profile projection. Contains no Notion source ids, URLs, DM notes, or sync errors.';
COMMENT ON COLUMN action_results.reveal_payload IS
  'Optional player-safe structured reveal payload for resolved actions such as approved Talk NPC cards.';

CREATE OR REPLACE FUNCTION sync_campaign_doc_publication()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM campaign_doc_publications WHERE doc_id = OLD.id;
    DELETE FROM campaign_doc_link_publications WHERE doc_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.visibility IN ('player_safe', 'revealed')
    AND COALESCE(BTRIM(NEW.player_summary), '') <> ''
  THEN
    INSERT INTO campaign_doc_publications (
      doc_id,
      campaign_id,
      doc_type,
      title,
      player_summary,
      npc_profile,
      tags,
      status,
      visibility,
      reveal_state,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.campaign_id,
      NEW.doc_type,
      NEW.title,
      NEW.player_summary,
      COALESCE(NEW.npc_profile, '{}'::jsonb),
      NEW.tags,
      NEW.status,
      NEW.visibility,
      NEW.reveal_state,
      NEW.updated_at
    )
    ON CONFLICT (doc_id) DO UPDATE SET
      campaign_id = EXCLUDED.campaign_id,
      doc_type = EXCLUDED.doc_type,
      title = EXCLUDED.title,
      player_summary = EXCLUDED.player_summary,
      npc_profile = EXCLUDED.npc_profile,
      tags = EXCLUDED.tags,
      status = EXCLUDED.status,
      visibility = EXCLUDED.visibility,
      reveal_state = EXCLUDED.reveal_state,
      updated_at = EXCLUDED.updated_at;

    INSERT INTO campaign_doc_link_publications (
      link_id,
      campaign_id,
      doc_id,
      relationship_type,
      live_object_type,
      live_object_id,
      live_object_label,
      updated_at
    )
    SELECT
      l.id,
      l.campaign_id,
      l.source_doc_id,
      l.relationship_type,
      l.live_object_type,
      l.live_object_id,
      l.live_object_label,
      l.updated_at
    FROM campaign_doc_links l
    WHERE l.source_doc_id = NEW.id
      AND l.live_object_id IS NOT NULL
      AND l.live_object_type IS NOT NULL
      AND l.visibility IN ('player_safe', 'revealed')
    ON CONFLICT (link_id) DO UPDATE SET
      campaign_id = EXCLUDED.campaign_id,
      doc_id = EXCLUDED.doc_id,
      relationship_type = EXCLUDED.relationship_type,
      live_object_type = EXCLUDED.live_object_type,
      live_object_id = EXCLUDED.live_object_id,
      live_object_label = EXCLUDED.live_object_label,
      updated_at = EXCLUDED.updated_at;
  ELSE
    DELETE FROM campaign_doc_publications WHERE doc_id = NEW.id;
    DELETE FROM campaign_doc_link_publications WHERE doc_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- The return shape adds npc_profile, so Postgres requires dropping the old
-- table-returning function before recreating it.
DROP FUNCTION IF EXISTS get_player_visible_campaign_docs(UUID);

CREATE FUNCTION get_player_visible_campaign_docs(p_campaign_id UUID)
RETURNS TABLE (
  id UUID,
  campaign_id UUID,
  doc_type TEXT,
  title TEXT,
  player_summary TEXT,
  npc_profile JSONB,
  tags TEXT[],
  status TEXT,
  visibility TEXT,
  reveal_state TEXT,
  revealed_at TIMESTAMPTZ,
  reveal_message TEXT,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_campaign_member(p_campaign_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (d.id)
    d.id,
    d.campaign_id,
    d.doc_type,
    d.title,
    d.player_summary,
    COALESCE(d.npc_profile, '{}'::jsonb),
    d.tags,
    d.status,
    d.visibility,
    d.reveal_state,
    r.revealed_at,
    r.reveal_message,
    d.updated_at
  FROM campaign_docs d
  LEFT JOIN codex_reveals r
    ON r.doc_id = d.id
    AND r.campaign_id = d.campaign_id
    AND (
      r.revealed_to_scope = 'party'
      OR (
        r.revealed_to_scope = 'player'
        AND r.revealed_to_player_id = auth.uid()
      )
    )
  WHERE d.campaign_id = p_campaign_id
    AND COALESCE(d.player_summary, '') <> ''
    AND (
      d.visibility IN ('player_safe', 'revealed')
      OR r.id IS NOT NULL
    )
  ORDER BY d.id, r.revealed_at DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION get_player_visible_campaign_docs(UUID) TO authenticated;
