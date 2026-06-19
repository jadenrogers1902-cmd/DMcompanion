import { expect, test } from '@playwright/test'

const dmEmail = process.env.E2E_DM_EMAIL
const dmPassword = process.env.E2E_DM_PASSWORD
const campaignId = process.env.E2E_CAMPAIGN_ID
const allowClearBoard = process.env.E2E_ALLOW_CLEAR_BOARD === 'true'
const clearFromPopup = process.env.E2E_CLEAR_FROM_POPUP === 'true'

test.skip(
  !dmEmail || !dmPassword || !campaignId,
  'Set E2E_DM_EMAIL, E2E_DM_PASSWORD, and E2E_CAMPAIGN_ID to run authenticated DM queue QA.',
)

test('DM action queue renders expandable action cards', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(dmEmail ?? '')
  await page.getByLabel('Password').fill(dmPassword ?? '')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await page.goto(`/campaigns/${campaignId}/actions`)
  await expect(page.getByRole('heading', { name: 'Action Queue' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Clear Board' })).toBeVisible()

  const cards = page.locator('article').filter({ has: page.getByRole('button') })
  const cardCount = await cards.count()
  test.skip(cardCount === 0, 'No action requests are present in the configured campaign.')

  const firstCardButton = cards.first().getByRole('button').first()
  await expect(firstCardButton).toBeVisible()
  await firstCardButton.click()
  await expect(cards.first().getByLabel('DM response')).toBeVisible()
  await expect(cards.first().getByRole('button', { name: 'Approve' })).toBeVisible()
  await expect(cards.first().getByRole('button', { name: 'Require Roll' })).toBeVisible()
  await expect(cards.first().getByRole('button', { name: 'Deny' })).toBeVisible()
})

test('Clear Board uses one confirmed flow from the full queue when explicitly enabled', async ({ page }) => {
  test.skip(!allowClearBoard, 'Set E2E_ALLOW_CLEAR_BOARD=true only for a disposable campaign.')

  await page.goto('/login')
  await page.getByLabel('Email').fill(dmEmail ?? '')
  await page.getByLabel('Password').fill(dmPassword ?? '')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await page.goto(`/campaigns/${campaignId}/actions`)
  await page.getByRole('button', { name: 'Clear Board' }).click()
  await expect(page.getByRole('dialog', { name: 'Clear Action Board?' })).toBeVisible()
  await page.getByRole('button', { name: 'Yes, Clear Board' }).click()

  await expect(page.getByText('No action requests')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Clear Board' })).toBeDisabled()
})

test('Clear Board uses one confirmed flow from the popup when explicitly enabled', async ({ page }) => {
  test.skip(
    !allowClearBoard || !clearFromPopup,
    'Set E2E_ALLOW_CLEAR_BOARD=true and E2E_CLEAR_FROM_POPUP=true only for a disposable campaign with queued requests.',
  )

  await page.goto('/login')
  await page.getByLabel('Email').fill(dmEmail ?? '')
  await page.getByLabel('Password').fill(dmPassword ?? '')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await page.goto(`/campaigns/${campaignId}`)
  const popup = page.locator('aside').filter({ hasText: 'New Player Action' })
  await expect(popup).toBeVisible()
  await popup.getByRole('button', { name: 'Clear Board' }).click()
  await expect(page.getByRole('dialog', { name: 'Clear Action Board?' })).toBeVisible()
  await page.getByRole('button', { name: 'Yes, Clear Board' }).click()

  await expect(popup).toBeHidden()
  await page.goto(`/campaigns/${campaignId}/actions`)
  await expect(page.getByText('No action requests')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Clear Board' })).toBeDisabled()
})
