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

test('Moonlit Grimoire semantic tokens are applied to the rendered auth shell', async ({ page }) => {
  await page.goto('/login')

  const tokens = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement)
    return {
      canvas: styles.getPropertyValue('--color-canvas').trim(),
      panel: styles.getPropertyValue('--color-panel').trim(),
      accent: styles.getPropertyValue('--color-accent').trim(),
      playerSafe: styles.getPropertyValue('--color-player-safe').trim(),
      dmOnly: styles.getPropertyValue('--color-dm-only').trim(),
    }
  })

  expect(tokens).toEqual({
    canvas: '#100d16',
    panel: '#1b1524',
    accent: '#b8a7ff',
    playerSafe: '#67e8c2',
    dmOnly: '#f0719b',
  })
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
