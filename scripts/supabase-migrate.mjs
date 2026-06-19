import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import nextEnv from '@next/env'

const { loadEnvConfig } = nextEnv

loadEnvConfig(process.cwd())

function projectRefFromEnv() {
  if (process.env.SUPABASE_PROJECT_REF) return process.env.SUPABASE_PROJECT_REF.trim()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const match = url.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i)
  return match?.[1] ?? ''
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    shell: false,
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)

  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-8)
      .join(' | ')
      .replaceAll('%', '%25')
      .replaceAll('\r', '%0D')
      .replaceAll('\n', '%0A')

    if (process.env.GITHUB_ACTIONS && output) {
      console.error(`::error title=Supabase migrations failed::${output}`)
    }
    process.exit(result.status ?? 1)
  }
}

const projectRef = projectRefFromEnv()
if (!projectRef) {
  console.error('Cannot determine Supabase project ref.')
  console.error('Set SUPABASE_PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL in .env.local.')
  process.exit(1)
}

if (!process.env.SUPABASE_ACCESS_TOKEN) {
  console.warn('SUPABASE_ACCESS_TOKEN is not set.')
  console.warn('If the Supabase CLI is not already logged in, link/db push will fail.')
  console.warn('For CI or unattended runs, create a Supabase access token and set SUPABASE_ACCESS_TOKEN.')
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const dbPassword = process.env.SUPABASE_DB_PASSWORD?.trim()
const passwordArgs = dbPassword ? ['--password', dbPassword] : []

if (!existsSync('supabase/config.toml')) {
  console.log('Initializing Supabase project config...')
  run(npx, ['supabase', 'init', '--yes'])
}

console.log(`Linking Supabase project: ${projectRef}`)
run(npx, ['supabase', 'link', '--project-ref', projectRef, ...passwordArgs, '--yes'])

console.log('Pushing Supabase migrations...')
run(npx, ['supabase', 'db', 'push', ...passwordArgs, '--yes'])
