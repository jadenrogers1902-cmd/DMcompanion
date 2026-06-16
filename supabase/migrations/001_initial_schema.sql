-- ============================================================
-- DnD Companion App — Initial Schema
-- Run this in your Supabase SQL editor or via Supabase CLI
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- PROFILES (extends auth.users)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_authenticated"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Auto-create a profile when a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ────────────────────────────────────────────────────────────
-- INVITE CODE GENERATOR
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, (floor(random() * length(chars)) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────
-- shared updated_at trigger function (used by multiple tables)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────────────────────────
-- CAMPAIGNS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  invite_code TEXT UNIQUE NOT NULL DEFAULT generate_invite_code(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

-- NOTE: campaigns_select_member is defined AFTER campaign_members below.

CREATE POLICY "campaigns_insert_authenticated"
  ON campaigns FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "campaigns_update_owner"
  ON campaigns FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "campaigns_delete_owner"
  ON campaigns FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

CREATE TRIGGER campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────────────────────────────────────────────────────────
-- CAMPAIGN MEMBERS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('dm', 'player')),
  joined_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(campaign_id, user_id)
);

ALTER TABLE campaign_members ENABLE ROW LEVEL SECURITY;

-- Members can only see their own membership rows.
-- Migration 002 upgrades this to the full "any member of the same campaign" rule
-- via a SECURITY DEFINER helper (which avoids the infinite-recursion problem).
CREATE POLICY "campaign_members_select_member"
  ON campaign_members FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "campaign_members_insert_self"
  ON campaign_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "campaign_members_delete"
  ON campaign_members FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_members.campaign_id
        AND campaigns.owner_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- CAMPAIGNS SELECT POLICY (defined here, after campaign_members exists)
-- ────────────────────────────────────────────────────────────
CREATE POLICY "campaigns_select_member"
  ON campaigns FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM campaign_members
      WHERE campaign_members.campaign_id = campaigns.id
        AND campaign_members.user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- HELPER: Look up a campaign by invite code
-- Returns only id and name — no sensitive DM data
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_campaign_by_invite_code(code TEXT)
RETURNS TABLE(id UUID, name TEXT) AS $$
  SELECT c.id, c.name
  FROM campaigns c
  WHERE upper(c.invite_code) = upper(code)
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- REGENERATE INVITE CODE (DM only)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION regenerate_invite_code(campaign_id UUID)
RETURNS TEXT AS $$
DECLARE
  new_code TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM campaigns WHERE id = campaign_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  new_code := generate_invite_code();
  UPDATE campaigns SET invite_code = new_code WHERE id = campaign_id;
  RETURN new_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
