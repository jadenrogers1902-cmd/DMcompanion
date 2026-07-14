import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const themeSource = await readFile(new URL('../../lib/themes.ts', import.meta.url), 'utf8')
const migrationSource = await readFile(
  new URL('../../supabase/migrations/20260714023612_account_theme_preferences.sql', import.meta.url),
  'utf8',
)

const expectedThemes = [
  'emberforge',
  'moonlit-grimoire',
  'emerald-enclave',
  'frostbound-archive',
  'golden-parchment',
]

test('theme registry exposes the locked five account themes', () => {
  for (const key of expectedThemes) assert.match(themeSource, new RegExp(`'${key}'`))
  assert.match(themeSource, /DEFAULT_THEME: ThemeKey = 'emberforge'/)
  assert.match(themeSource, /key: 'golden-parchment'[\s\S]*colorMode: 'light'/)
})

test('theme migration preserves existing users and defaults new users to Emberforge', () => {
  assert.match(migrationSource, /UPDATE public\.profiles[\s\S]*theme_key = 'moonlit-grimoire'/)
  assert.match(migrationSource, /theme_onboarding_completed_at = NOW\(\)/)
  assert.match(migrationSource, /ALTER COLUMN theme_key SET DEFAULT 'emberforge'/)
  for (const key of expectedThemes) assert.match(migrationSource, new RegExp(`'${key}'`))
})
