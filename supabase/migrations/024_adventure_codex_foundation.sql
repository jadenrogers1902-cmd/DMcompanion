-- ============================================================
-- DnD Companion App - Adventure Codex Phase 2
-- Internal app-owned documentation cache. Notion sync is not
-- implemented here; these tables provide the safe foundation for
-- manual Codex records and future external sync.
-- Run this AFTER 023_live_map_source_tracking.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS campaign_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'notion', 'import')),
  source_page_id TEXT,
  source_url TEXT,
  source_database_id TEXT,
  doc_type TEXT NOT NULL
    CHECK (
      doc_type IN (
        'adventure',
        'chapter',
        'session',
        'location',
        'sub_location',
        'character',
        'npc',
        'boss',
        'hostile_enemy',
        'faction',
        'rumor',
        'side_quest',
        'main_quest',
        'item',
        'loot',
        'handout',
        'map_note',
        'object_note'
      )
    ),
  title TEXT NOT NULL,
  dm_summary TEXT,
  player_summary TEXT,
  dm_notes TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'active', 'archived', 'stale')),
  visibility TEXT NOT NULL DEFAULT 'dm_only'
    CHECK (visibility IN ('dm_only', 'player_safe', 'revealed')),
  reveal_state TEXT NOT NULL DEFAULT 'unrevealed'
    CHECK (reveal_state IN ('unrevealed', 'partially_revealed', 'revealed', 'retracted')),
  last_synced_at TIMESTAMPTZ,
  sync_status TEXT NOT NULL DEFAULT 'never'
    CHECK (sync_status IN ('never', 'success', 'failed', 'partial', 'conflict')),
  sync_error TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, source, source_page_id)
);

CREATE TABLE IF NOT EXISTS campaign_doc_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  source_doc_id UUID NOT NULL REFERENCES campaign_docs(id) ON DELETE CASCADE,
  target_doc_id UUID REFERENCES campaign_docs(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL DEFAULT 'related_to'
    CHECK (
      relationship_type IN (
        'appears_in',
        'located_in',
        'contains',
        'related_to',
        'member_of',
        'enemy_in',
        'npc_in',
        'rumor_for',
        'quest_hook',
        'loot_in',
        'map_for',
        'object_doc',
        'token_doc',
        'faction_member',
        'session_topic'
      )
    ),
  live_object_type TEXT
    CHECK (
      live_object_type IS NULL
      OR live_object_type IN (
        'map',
        'token',
        'object',
        'prepared_map',
        'adventure',
        'chapter',
        'encounter',
        'quest',
        'npc',
        'location',
        'handout',
        'other'
      )
    ),
  live_object_id UUID,
  live_object_label TEXT,
  visibility TEXT NOT NULL DEFAULT 'dm_only'
    CHECK (visibility IN ('dm_only', 'player_safe', 'revealed')),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (target_doc_id IS NOT NULL OR live_object_id IS NOT NULL),
  CHECK (
    (target_doc_id IS NOT NULL AND live_object_id IS NULL AND live_object_type IS NULL)
    OR (target_doc_id IS NULL AND live_object_id IS NOT NULL AND live_object_type IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS campaign_doc_publications (
  doc_id UUID PRIMARY KEY REFERENCES campaign_docs(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  title TEXT NOT NULL,
  player_summary TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  status TEXT NOT NULL,
  visibility TEXT NOT NULL,
  reveal_state TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_doc_link_publications (
  link_id UUID PRIMARY KEY REFERENCES campaign_doc_links(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  doc_id UUID NOT NULL REFERENCES campaign_docs(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  live_object_type TEXT NOT NULL,
  live_object_id UUID NOT NULL,
  live_object_label TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS codex_reveals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  doc_id UUID NOT NULL REFERENCES campaign_docs(id) ON DELETE CASCADE,
  revealed_to_scope TEXT NOT NULL DEFAULT 'party'
    CHECK (revealed_to_scope IN ('party', 'player')),
  revealed_to_player_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  revealed_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  revealed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reveal_message TEXT,
  reveal_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (reveal_type IN ('manual', 'map_object', 'handout', 'session', 'sync_safe')),
  CHECK (
    (revealed_to_scope = 'party' AND revealed_to_player_id IS NULL)
    OR (revealed_to_scope = 'player' AND revealed_to_player_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS campaign_docs_campaign_idx
  ON campaign_docs(campaign_id);
CREATE INDEX IF NOT EXISTS campaign_docs_type_idx
  ON campaign_docs(campaign_id, doc_type);
CREATE INDEX IF NOT EXISTS campaign_docs_visibility_idx
  ON campaign_docs(campaign_id, visibility, reveal_state);
CREATE INDEX IF NOT EXISTS campaign_docs_status_idx
  ON campaign_docs(campaign_id, status);
CREATE INDEX IF NOT EXISTS campaign_docs_tags_idx
  ON campaign_docs USING GIN(tags);
CREATE INDEX IF NOT EXISTS campaign_doc_links_campaign_idx
  ON campaign_doc_links(campaign_id);
CREATE INDEX IF NOT EXISTS campaign_doc_links_source_idx
  ON campaign_doc_links(source_doc_id);
CREATE INDEX IF NOT EXISTS campaign_doc_links_target_doc_idx
  ON campaign_doc_links(target_doc_id);
CREATE INDEX IF NOT EXISTS campaign_doc_links_live_object_idx
  ON campaign_doc_links(live_object_type, live_object_id);
CREATE INDEX IF NOT EXISTS campaign_doc_publications_campaign_idx
  ON campaign_doc_publications(campaign_id);
CREATE INDEX IF NOT EXISTS campaign_doc_publications_type_idx
  ON campaign_doc_publications(campaign_id, doc_type);
CREATE INDEX IF NOT EXISTS campaign_doc_link_publications_campaign_idx
  ON campaign_doc_link_publications(campaign_id);
CREATE INDEX IF NOT EXISTS campaign_doc_link_publications_live_object_idx
  ON campaign_doc_link_publications(live_object_type, live_object_id);
CREATE INDEX IF NOT EXISTS campaign_doc_link_publications_doc_idx
  ON campaign_doc_link_publications(doc_id);
CREATE INDEX IF NOT EXISTS codex_reveals_campaign_idx
  ON codex_reveals(campaign_id);
CREATE INDEX IF NOT EXISTS codex_reveals_doc_idx
  ON codex_reveals(doc_id);
CREATE INDEX IF NOT EXISTS codex_reveals_player_idx
  ON codex_reveals(campaign_id, revealed_to_player_id);

DROP TRIGGER IF EXISTS campaign_docs_updated_at ON campaign_docs;
CREATE TRIGGER campaign_docs_updated_at
  BEFORE UPDATE ON campaign_docs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS campaign_doc_links_updated_at ON campaign_doc_links;
CREATE TRIGGER campaign_doc_links_updated_at
  BEFORE UPDATE ON campaign_doc_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

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

DROP TRIGGER IF EXISTS campaign_docs_publication_sync ON campaign_docs;
CREATE TRIGGER campaign_docs_publication_sync
  AFTER INSERT OR UPDATE OR DELETE ON campaign_docs
  FOR EACH ROW EXECUTE FUNCTION sync_campaign_doc_publication();

CREATE OR REPLACE FUNCTION sync_campaign_doc_link_publication()
RETURNS TRIGGER AS $$
DECLARE
  safe_doc RECORD;
  object_is_player_visible BOOLEAN := FALSE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM campaign_doc_link_publications WHERE link_id = OLD.id;
    RETURN OLD;
  END IF;

  SELECT doc_id
  INTO safe_doc
  FROM campaign_doc_publications
  WHERE doc_id = NEW.source_doc_id;

  IF NEW.live_object_type IN ('token', 'object') THEN
    SELECT EXISTS (
      SELECT 1
      FROM tokens t
      JOIN maps m ON m.id = t.map_id
      WHERE t.id = NEW.live_object_id
        AND t.campaign_id = NEW.campaign_id
        AND t.visible_to_players = TRUE
        AND m.is_active = TRUE
    )
    INTO object_is_player_visible;
  ELSIF NEW.live_object_type = 'map' THEN
    SELECT EXISTS (
      SELECT 1
      FROM maps m
      WHERE m.id = NEW.live_object_id
        AND m.campaign_id = NEW.campaign_id
        AND m.is_active = TRUE
    )
    INTO object_is_player_visible;
  ELSE
    -- Non-map runtime object types are not rendered in the live map player
    -- panel yet. Keep them unpublished until a feature-specific safe
    -- projection knows how to enforce that object's visibility rules.
    object_is_player_visible := FALSE;
  END IF;

  IF safe_doc.doc_id IS NOT NULL
    AND NEW.live_object_id IS NOT NULL
    AND NEW.live_object_type IS NOT NULL
    AND NEW.visibility IN ('player_safe', 'revealed')
    AND object_is_player_visible = TRUE
  THEN
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
    VALUES (
      NEW.id,
      NEW.campaign_id,
      NEW.source_doc_id,
      NEW.relationship_type,
      NEW.live_object_type,
      NEW.live_object_id,
      NEW.live_object_label,
      NEW.updated_at
    )
    ON CONFLICT (link_id) DO UPDATE SET
      campaign_id = EXCLUDED.campaign_id,
      doc_id = EXCLUDED.doc_id,
      relationship_type = EXCLUDED.relationship_type,
      live_object_type = EXCLUDED.live_object_type,
      live_object_id = EXCLUDED.live_object_id,
      live_object_label = EXCLUDED.live_object_label,
      updated_at = EXCLUDED.updated_at;
  ELSE
    DELETE FROM campaign_doc_link_publications WHERE link_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS campaign_doc_links_publication_sync ON campaign_doc_links;
CREATE TRIGGER campaign_doc_links_publication_sync
  AFTER INSERT OR UPDATE OR DELETE ON campaign_doc_links
  FOR EACH ROW EXECUTE FUNCTION sync_campaign_doc_link_publication();

CREATE OR REPLACE FUNCTION refresh_campaign_doc_link_publications_for_token()
RETURNS TRIGGER AS $$
DECLARE
  token_id UUID;
  token_campaign_id UUID;
  token_visible BOOLEAN := FALSE;
  token_map_active BOOLEAN := FALSE;
BEGIN
  token_id := COALESCE(NEW.id, OLD.id);
  token_campaign_id := COALESCE(NEW.campaign_id, OLD.campaign_id);

  DELETE FROM campaign_doc_link_publications
  WHERE live_object_id = token_id
    AND live_object_type IN ('token', 'object');

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT NEW.visible_to_players, COALESCE(m.is_active, FALSE)
  INTO token_visible, token_map_active
  FROM maps m
  WHERE m.id = NEW.map_id;

  IF token_visible = TRUE AND token_map_active = TRUE THEN
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
    JOIN campaign_doc_publications p ON p.doc_id = l.source_doc_id
    WHERE l.campaign_id = token_campaign_id
      AND l.live_object_id = token_id
      AND l.live_object_type IN ('token', 'object')
      AND l.visibility IN ('player_safe', 'revealed')
    ON CONFLICT (link_id) DO UPDATE SET
      campaign_id = EXCLUDED.campaign_id,
      doc_id = EXCLUDED.doc_id,
      relationship_type = EXCLUDED.relationship_type,
      live_object_type = EXCLUDED.live_object_type,
      live_object_id = EXCLUDED.live_object_id,
      live_object_label = EXCLUDED.live_object_label,
      updated_at = EXCLUDED.updated_at;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS campaign_doc_link_publications_token_refresh ON tokens;
CREATE TRIGGER campaign_doc_link_publications_token_refresh
  AFTER UPDATE OF visible_to_players, map_id ON tokens
  FOR EACH ROW EXECUTE FUNCTION refresh_campaign_doc_link_publications_for_token();

DROP TRIGGER IF EXISTS campaign_doc_link_publications_token_delete ON tokens;
CREATE TRIGGER campaign_doc_link_publications_token_delete
  AFTER DELETE ON tokens
  FOR EACH ROW EXECUTE FUNCTION refresh_campaign_doc_link_publications_for_token();

CREATE OR REPLACE FUNCTION refresh_campaign_doc_link_publications_for_map()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM campaign_doc_link_publications
  WHERE live_object_type = 'map'
    AND live_object_id = NEW.id;

  DELETE FROM campaign_doc_link_publications
  USING tokens t
  WHERE campaign_doc_link_publications.live_object_id = t.id
    AND campaign_doc_link_publications.live_object_type IN ('token', 'object')
    AND t.map_id = NEW.id;

  IF NEW.is_active = TRUE THEN
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
    JOIN campaign_doc_publications p ON p.doc_id = l.source_doc_id
    LEFT JOIN tokens t ON t.id = l.live_object_id AND l.live_object_type IN ('token', 'object')
    WHERE l.campaign_id = NEW.campaign_id
      AND l.visibility IN ('player_safe', 'revealed')
      AND (
        (l.live_object_type = 'map' AND l.live_object_id = NEW.id)
        OR (
          l.live_object_type IN ('token', 'object')
          AND t.map_id = NEW.id
          AND t.visible_to_players = TRUE
        )
      )
    ON CONFLICT (link_id) DO UPDATE SET
      campaign_id = EXCLUDED.campaign_id,
      doc_id = EXCLUDED.doc_id,
      relationship_type = EXCLUDED.relationship_type,
      live_object_type = EXCLUDED.live_object_type,
      live_object_id = EXCLUDED.live_object_id,
      live_object_label = EXCLUDED.live_object_label,
      updated_at = EXCLUDED.updated_at;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS campaign_doc_link_publications_map_refresh ON maps;
CREATE TRIGGER campaign_doc_link_publications_map_refresh
  AFTER UPDATE OF is_active ON maps
  FOR EACH ROW EXECUTE FUNCTION refresh_campaign_doc_link_publications_for_map();

ALTER TABLE campaign_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_doc_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_doc_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_doc_link_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE codex_reveals ENABLE ROW LEVEL SECURITY;

-- campaign_docs holds DM-only columns (`dm_summary`, `dm_notes`, private
-- source metadata, sync errors). Players never SELECT this table directly;
-- they use get_player_visible_campaign_docs(), which returns only safe fields.
DROP POLICY IF EXISTS "campaign_docs_dm_all" ON campaign_docs;
CREATE POLICY "campaign_docs_dm_all"
  ON campaign_docs FOR ALL
  TO authenticated
  USING (is_campaign_dm(campaign_id))
  WITH CHECK (is_campaign_dm(campaign_id));

DROP POLICY IF EXISTS "campaign_doc_links_dm_all" ON campaign_doc_links;
CREATE POLICY "campaign_doc_links_dm_all"
  ON campaign_doc_links FOR ALL
  TO authenticated
  USING (is_campaign_dm(campaign_id))
  WITH CHECK (is_campaign_dm(campaign_id));

DROP POLICY IF EXISTS "campaign_doc_publications_select_members" ON campaign_doc_publications;
CREATE POLICY "campaign_doc_publications_select_members"
  ON campaign_doc_publications FOR SELECT
  TO authenticated
  USING (is_campaign_member(campaign_id));

DROP POLICY IF EXISTS "campaign_doc_link_publications_select_members" ON campaign_doc_link_publications;
CREATE POLICY "campaign_doc_link_publications_select_members"
  ON campaign_doc_link_publications FOR SELECT
  TO authenticated
  USING (is_campaign_member(campaign_id));

DROP POLICY IF EXISTS "codex_reveals_dm_all" ON codex_reveals;
CREATE POLICY "codex_reveals_dm_all"
  ON codex_reveals FOR ALL
  TO authenticated
  USING (is_campaign_dm(campaign_id))
  WITH CHECK (is_campaign_dm(campaign_id));

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE campaign_docs, campaign_doc_links, codex_reveals
TO authenticated;

GRANT SELECT ON TABLE campaign_doc_publications, campaign_doc_link_publications TO authenticated;

CREATE OR REPLACE FUNCTION get_player_visible_campaign_docs(p_campaign_id UUID)
RETURNS TABLE (
  id UUID,
  campaign_id UUID,
  doc_type TEXT,
  title TEXT,
  player_summary TEXT,
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

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'campaign_docs',
    'campaign_doc_links',
    'campaign_doc_publications',
    'campaign_doc_link_publications',
    'codex_reveals'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;

    EXECUTE format('ALTER TABLE %I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;

COMMENT ON TABLE campaign_docs IS
  'Adventure Codex source-of-truth docs. Contains DM-only fields and is DM-select only; players use get_player_visible_campaign_docs for safe fields.';
COMMENT ON TABLE campaign_doc_links IS
  'DM-managed relationships between Codex docs and between Codex docs and live/prep app objects.';
COMMENT ON TABLE campaign_doc_publications IS
  'Player-safe realtime projection of Adventure Codex docs. Contains no DM notes, private source metadata, raw Notion ids, or sync errors.';
COMMENT ON TABLE campaign_doc_link_publications IS
  'Player-safe realtime projection of Codex links to live/prep objects. Published only when the doc and link are player-visible.';
COMMENT ON TABLE codex_reveals IS
  'DM-controlled audit log for Codex doc reveals to the party or individual players.';
COMMENT ON FUNCTION get_player_visible_campaign_docs(UUID) IS
  'Returns only player-safe Adventure Codex fields for campaign members. Does not expose DM notes, private source metadata, sync errors, or raw Notion IDs.';
