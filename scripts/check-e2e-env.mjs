import nextEnv from '@next/env'

const { loadEnvConfig } = nextEnv

loadEnvConfig(process.cwd())

const required = ['E2E_DM_EMAIL', 'E2E_DM_PASSWORD', 'E2E_CAMPAIGN_ID']
const missing = required.filter((key) => !process.env[key] || process.env[key]?.includes('your-'))

if (missing.length > 0) {
  console.error('Authenticated E2E QA is not configured.')
  console.error('')
  console.error(`Missing: ${missing.join(', ')}`)
  console.error('')
  console.error('Add these to .env.local for a disposable test campaign:')
  console.error('  E2E_DM_EMAIL=dm-test@example.com')
  console.error('  E2E_DM_PASSWORD=your-test-password')
  console.error('  E2E_CAMPAIGN_ID=00000000-0000-0000-0000-000000000000')
  console.error('')
  console.error('Optional destructive-test flags:')
  console.error('  E2E_ALLOW_CLEAR_BOARD=true')
  console.error('  E2E_CLEAR_FROM_POPUP=true')
  process.exit(1)
}

console.log('Authenticated E2E environment is configured.')
console.log(`Campaign: ${process.env.E2E_CAMPAIGN_ID}`)
