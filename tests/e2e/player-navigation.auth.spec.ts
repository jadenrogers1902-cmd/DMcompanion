import { expect, test } from '@playwright/test'

const playerEmail = process.env.E2E_PLAYER_EMAIL
const playerPassword = process.env.E2E_PLAYER_PASSWORD
const campaignId = process.env.E2E_PLAYER_CAMPAIGN_ID

test.skip(
  !playerEmail || !playerPassword || !campaignId,
  'Set E2E_PLAYER_EMAIL, E2E_PLAYER_PASSWORD, and E2E_PLAYER_CAMPAIGN_ID to run authenticated player navigation QA.',
)

test('player campaign destinations stay reachable on a narrow phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login')
  await page.getByLabel('Email').fill(playerEmail ?? '')
  await page.getByLabel('Password').fill(playerPassword ?? '')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await page.goto(`/campaigns/${campaignId}`)

  const navigation = page.getByRole('navigation', { name: 'Campaign navigation' })
  await expect(navigation).toBeVisible()
  await expect(navigation.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await expect(navigation.getByRole('link', { name: 'Characters', exact: true })).toBeVisible()
  await expect(navigation.getByRole('link', { name: /Adventure/ })).toBeVisible()

  const moreButton = navigation.getByRole('button', { name: 'More', exact: true })
  await expect(moreButton).toBeVisible()
  await moreButton.click()

  const moreDialog = page.getByRole('dialog', { name: 'More places' })
  await expect(moreDialog).toBeVisible()
  for (const destination of [
    'Encounters',
    'Journal',
    'Revealed Info',
    'Account Settings',
    'All Campaigns',
    'Join Campaign',
  ]) {
    await expect(moreDialog.getByRole('link', { name: destination, exact: true })).toBeVisible()
  }

  const closeButton = moreDialog.getByRole('button', { name: 'Close more navigation' })
  const closeBox = await closeButton.boundingBox()
  expect(closeBox?.width).toBeGreaterThanOrEqual(44)
  expect(closeBox?.height).toBeGreaterThanOrEqual(44)
  await closeButton.click()

  for (const destination of [
    'Adventure',
    'My Characters',
    'Encounters',
    'Party Journal',
    'Revealed Info',
  ]) {
    await expect(
      page.getByRole('main').getByRole('link', { name: new RegExp(`^${destination}`) }),
    ).toBeVisible()
  }

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth)

  await moreButton.click()
  await moreDialog.getByRole('link', { name: 'Journal', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/campaigns/${campaignId}/story$`))
  await expect(navigation.getByRole('button', { name: 'More', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )
})
