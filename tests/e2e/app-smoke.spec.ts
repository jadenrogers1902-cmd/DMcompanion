import { expect, test } from '@playwright/test'

test('unauthenticated campaign app routes redirect to login', async ({ page }) => {
  await page.goto('/dashboard')

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

test('login page renders core controls', async ({ page }) => {
  await page.goto('/login')

  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
})

test('registration page retains its public account controls', async ({ page }) => {
  await page.goto('/register')

  await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible()
  await expect(page.getByLabel('Display name')).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Confirm password')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
})

test('Emberforge semantic tokens are applied to the public auth shell', async ({ page }) => {
  await page.goto('/login')

  const tokens = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement)
    return {
      canvas: styles.getPropertyValue('--theme-canvas').trim(),
      panel: styles.getPropertyValue('--theme-panel').trim(),
      accent: styles.getPropertyValue('--theme-accent').trim(),
      playerSafe: styles.getPropertyValue('--theme-player-safe').trim(),
      dmOnly: styles.getPropertyValue('--theme-dm-only').trim(),
    }
  })

  expect(tokens).toEqual({
    canvas: '#120f0e',
    panel: '#211917',
    accent: '#e58a45',
    playerSafe: '#78d6a3',
    dmOnly: '#e06b68',
  })
})

test('all five account palettes expose complete runtime theme anchors', async ({ page }) => {
  await page.goto('/login')
  const expected = {
    emberforge: ['#120f0e', '#211917', '#e58a45', 'dark'],
    'moonlit-grimoire': ['#100d16', '#1b1524', '#b8a7ff', 'dark'],
    'emerald-enclave': ['#0c1512', '#17251f', '#56c596', 'dark'],
    'frostbound-archive': ['#0b111c', '#15243a', '#77c8ff', 'dark'],
    'golden-parchment': ['#e8d8b7', '#f5e9cf', '#9a3e45', 'light'],
  }

  for (const [theme, values] of Object.entries(expected)) {
    const actual = await page.evaluate((themeKey) => {
      document.documentElement.dataset.theme = themeKey
      const styles = getComputedStyle(document.documentElement)
      return [
        styles.getPropertyValue('--theme-canvas').trim(),
        styles.getPropertyValue('--theme-panel').trim(),
        styles.getPropertyValue('--theme-accent').trim(),
        styles.colorScheme,
      ]
    }, theme)
    expect(actual).toEqual(values)
  }
})

test('incomplete confirmation callbacks return a readable retry path', async ({ page }) => {
  await page.goto('/auth/callback')
  await expect(page).toHaveURL(/\/login\?confirmation=missing$/)
  await expect(page.getByText('The confirmation link was incomplete', { exact: false })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Create one' })).toBeVisible()
})

test('public auth screens do not overflow a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })

  for (const route of ['/login', '/register']) {
    await page.goto(route)
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth)
  }
})
