import { defineConfig, devices } from '@playwright/test'
import { loadEnvConfig } from '@next/env'

// Load .env.local (etc.) into process.env so E2E_DM_EMAIL / E2E_DM_PASSWORD /
// E2E_CAMPAIGN_ID set there are visible to the Playwright runner, matching how
// the app loads env. Without this the authenticated DM tests stay skipped.
loadEnvConfig(process.cwd())

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm.cmd run dev',
    url: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
