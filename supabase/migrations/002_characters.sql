-- ============================================================
-- DnD Companion App — Phase 2: Characters
-- Run this AFTER 001_initial_schema.sql
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- HELPER FUNCTIONS (SECURITY DEFINER — bypass RLS to avoid recursion)
-- ────────────────────────────────────────────────────────────

-- Is the current user a member of this campaign?
CREATE OR REPLACE FUNCTION is_campaign_member(cid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM campaign_members
    WHERE campaign_id = cid AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Is the current user the DM of this campaign (member with role 'dm', or owner)?
CREATE OR REPLACE FUNCTION is_campaign_dm(cid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM campaign_members
    WHERE campaign_id = cid AND user_id = auth.uid() AND role = 'dm'
  ) OR EXISTS (
    SELECT 1 FROM campaigns
    WHERE id = cid AND owner_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ────────────────────────────────────────────────────────────
-- FIX PHASE 1 RECURSION: campaign_members self-referencing policy
-- The original policy did a subquery on campaign_members from within
-- a campaign_members policy, which Postgres rejects as infinite recursion.
-- Replace it with the SECURITY DEFINER helper.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "campaign_members_select_member" ON campaign_members;

CREATE POLICY "campaign_members_select_member"
  ON campaign_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR is_campaign_member(campaign_id)
  );

-- ────────────────────────────────────────────────────────────
-- CHARACTERS
-- Ability scores (STR–CHA) and core combat stats are kept on this
-- row because they are strictly 1:1 with a character. A separate
-- character_stats table would add a join for no benefit.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Identity
  name TEXT NOT NULL,
  class TEXT,
  level INTEGER NOT NULL DEFAULT 1,
  race TEXT,
  background TEXT,

  -- Combat / core stats
  armor_class INTEGER NOT NULL DEFAULT 10,
  max_hp INTEGER NOT NULL DEFAULT 0,
  current_hp INTEGER NOT NULL DEFAULT 0,
  temp_hp INTEGER NOT NULL DEFAULT 0,
  speed INTEGER NOT NULL DEFAULT 30,
  initiative_bonus INTEGER NOT NULL DEFAULT 0,
  passive_perception INTEGER NOT NULL DEFAULT 10,
  proficiency_bonus INTEGER NOT NULL DEFAULT 2,

  -- Ability scores
  str INTEGER NOT NULL DEFAULT 10,
  dex INTEGER NOT NULL DEFAULT 10,
  con INTEGER NOT NULL DEFAULT 10,
  intel INTEGER NOT NULL DEFAULT 10,  -- 'int' is a reserved word in some contexts; use intel
  wis INTEGER NOT NULL DEFAULT 10,
  cha INTEGER NOT NULL DEFAULT 10,

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS characters_campaign_idx ON characters(campaign_id);
CREATE INDEX IF NOT EXISTS characters_user_idx ON characters(user_id);

ALTER TABLE characters ENABLE ROW LEVEL SECURITY;

-- Keep updated_at current
CREATE TRIGGER characters_updated_at
  BEFORE UPDATE ON characters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- SELECT: owner, or any member of the same campaign (party + DM can view)
CREATE POLICY "characters_select"
  ON characters FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR is_campaign_member(campaign_id)
  );

-- INSERT: a player creates their own character in a campaign they belong to
CREATE POLICY "characters_insert_own"
  ON characters FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND is_campaign_member(campaign_id)
  );

-- UPDATE: owner, or the DM of the campaign (DM may edit HP/conditions)
CREATE POLICY "characters_update"
  ON characters FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR is_campaign_dm(campaign_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    OR is_campaign_dm(campaign_id)
  );

-- DELETE: owner only
CREATE POLICY "characters_delete_own"
  ON characters FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ────────────────────────────────────────────────────────────
-- CHARACTER ACCESS HELPERS (for child tables)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION character_owner_id(char_id UUID)
RETURNS UUID AS $$
  SELECT user_id FROM characters WHERE id = char_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION character_campaign_id(char_id UUID)
RETURNS UUID AS $$
  SELECT campaign_id FROM characters WHERE id = char_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ────────────────────────────────────────────────────────────
-- CHARACTER INVENTORY ITEMS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS character_inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  equipped BOOLEAN NOT NULL DEFAULT FALSE,
  magical BOOLEAN NOT NULL DEFAULT FALSE,
  visible_to_dm BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS inventory_character_idx ON character_inventory_items(character_id);
ALTER TABLE character_inventory_items ENABLE ROW LEVEL SECURITY;

-- SELECT: character owner sees all; DM sees only items flagged visible_to_dm
CREATE POLICY "inventory_select"
  ON character_inventory_items FOR SELECT
  TO authenticated
  USING (
    character_owner_id(character_id) = auth.uid()
    OR (
      is_campaign_dm(character_campaign_id(character_id))
      AND visible_to_dm = TRUE
    )
  );

-- INSERT/UPDATE/DELETE: owner only
CREATE POLICY "inventory_insert_own"
  ON character_inventory_items FOR INSERT
  TO authenticated
  WITH CHECK (character_owner_id(character_id) = auth.uid());

CREATE POLICY "inventory_update_own"
  ON character_inventory_items FOR UPDATE
  TO authenticated
  USING (character_owner_id(character_id) = auth.uid())
  WITH CHECK (character_owner_id(character_id) = auth.uid());

CREATE POLICY "inventory_delete_own"
  ON character_inventory_items FOR DELETE
  TO authenticated
  USING (character_owner_id(character_id) = auth.uid());

-- ────────────────────────────────────────────────────────────
-- CHARACTER SPELLS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS character_spells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  spell_level INTEGER NOT NULL DEFAULT 0,  -- 0 = cantrip
  prepared BOOLEAN NOT NULL DEFAULT FALSE,
  uses TEXT,  -- manual, e.g. "3/4" or "2 slots"
  description TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS spells_character_idx ON character_spells(character_id);
ALTER TABLE character_spells ENABLE ROW LEVEL SECURITY;

-- SELECT: owner or DM
CREATE POLICY "spells_select"
  ON character_spells FOR SELECT
  TO authenticated
  USING (
    character_owner_id(character_id) = auth.uid()
    OR is_campaign_dm(character_campaign_id(character_id))
  );

CREATE POLICY "spells_insert_own"
  ON character_spells FOR INSERT
  TO authenticated
  WITH CHECK (character_owner_id(character_id) = auth.uid());

CREATE POLICY "spells_update_own"
  ON character_spells FOR UPDATE
  TO authenticated
  USING (character_owner_id(character_id) = auth.uid())
  WITH CHECK (character_owner_id(character_id) = auth.uid());

CREATE POLICY "spells_delete_own"
  ON character_spells FOR DELETE
  TO authenticated
  USING (character_owner_id(character_id) = auth.uid());

-- ────────────────────────────────────────────────────────────
-- CHARACTER ABILITIES / FEATURES
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS character_abilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source TEXT,  -- class / race / feat / homebrew
  uses TEXT,    -- manual
  reset_type TEXT,  -- short rest / long rest / manual
  description TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS abilities_character_idx ON character_abilities(character_id);
ALTER TABLE character_abilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "abilities_select"
  ON character_abilities FOR SELECT
  TO authenticated
  USING (
    character_owner_id(character_id) = auth.uid()
    OR is_campaign_dm(character_campaign_id(character_id))
  );

CREATE POLICY "abilities_insert_own"
  ON character_abilities FOR INSERT
  TO authenticated
  WITH CHECK (character_owner_id(character_id) = auth.uid());

CREATE POLICY "abilities_update_own"
  ON character_abilities FOR UPDATE
  TO authenticated
  USING (character_owner_id(character_id) = auth.uid())
  WITH CHECK (character_owner_id(character_id) = auth.uid());

CREATE POLICY "abilities_delete_own"
  ON character_abilities FOR DELETE
  TO authenticated
  USING (character_owner_id(character_id) = auth.uid());

-- ────────────────────────────────────────────────────────────
-- CHARACTER CONDITIONS
-- DM may add/remove conditions as well as the owner.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS character_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,  -- e.g. Poisoned, Prone, or a custom string
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS conditions_character_idx ON character_conditions(character_id);
ALTER TABLE character_conditions ENABLE ROW LEVEL SECURITY;

-- SELECT: owner or DM (and any campaign member for the party glance)
CREATE POLICY "conditions_select"
  ON character_conditions FOR SELECT
  TO authenticated
  USING (
    character_owner_id(character_id) = auth.uid()
    OR is_campaign_member(character_campaign_id(character_id))
  );

-- INSERT: owner or DM
CREATE POLICY "conditions_insert"
  ON character_conditions FOR INSERT
  TO authenticated
  WITH CHECK (
    character_owner_id(character_id) = auth.uid()
    OR is_campaign_dm(character_campaign_id(character_id))
  );

-- DELETE: owner or DM
CREATE POLICY "conditions_delete"
  ON character_conditions FOR DELETE
  TO authenticated
  USING (
    character_owner_id(character_id) = auth.uid()
    OR is_campaign_dm(character_campaign_id(character_id))
  );
