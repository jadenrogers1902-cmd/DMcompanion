-- Account-level appearance preferences shared across DM and player roles.
-- Existing accounts keep the currently shipped Moonlit Grimoire appearance;
-- accounts created after this migration start with Emberforge and must confirm
-- their choice during onboarding.

ALTER TABLE public.profiles
  ADD COLUMN theme_key TEXT,
  ADD COLUMN theme_onboarding_completed_at TIMESTAMPTZ;

UPDATE public.profiles
SET
  theme_key = 'moonlit-grimoire',
  theme_onboarding_completed_at = NOW();

ALTER TABLE public.profiles
  ALTER COLUMN theme_key SET DEFAULT 'emberforge',
  ALTER COLUMN theme_key SET NOT NULL,
  ADD CONSTRAINT profiles_theme_key_check CHECK (
    theme_key IN (
      'emberforge',
      'moonlit-grimoire',
      'emerald-enclave',
      'frostbound-archive',
      'golden-parchment'
    )
  );

COMMENT ON COLUMN public.profiles.theme_key IS
  'Account-wide appearance theme used in both DM and player experiences.';

COMMENT ON COLUMN public.profiles.theme_onboarding_completed_at IS
  'Set when the user confirms the required first-sign-in theme chooser.';
