import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
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
    if (result.error) {
      console.error(`Could not start ${command}: ${result.error.message}`)
    }
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

function supabaseCommand() {
  if (process.platform !== 'win32') {
    return { command: 'npx', prefix: ['supabase'] }
  }

  // Node cannot spawn a .cmd shim directly with shell:false on Windows
  // (spawnSync returns EINVAL). npm exposes the JavaScript CLI path while an
  // npm script is running, so invoke the sibling npx entrypoint through Node.
  // This preserves argument boundaries and avoids placing secrets in a shell
  // command string.
  const npmExecPath = process.env.npm_execpath
  const npxCli = npmExecPath ? join(dirname(npmExecPath), 'npx-cli.js') : ''
  if (!npxCli || !existsSync(npxCli)) {
    console.error('Could not locate npm\'s npx-cli.js on Windows.')
    console.error('Run this migration through: npm.cmd run db:migrate')
    process.exit(1)
  }

  return { command: process.execPath, prefix: [npxCli, 'supabase'] }
}

const supabase = supabaseCommand()

function runSupabase(args) {
  run(supabase.command, [...supabase.prefix, ...args])
}

const projectRef = projectRefFromEnv()
if (!projectRef) {
  console.error('Cannot determine Supabase project ref.')
  console.error('Set SUPABASE_PROJECT_REF or NEXT_PUBLIC_SUPABASE_URL in .env.local.')
  process.exit(1)
}

if (!process.env.SUPABASE_ACCESS_TOKEN) {
  console.warn('SUPABASE_ACCESS_TOKEN is not set; using the stored Supabase CLI login.')
  console.warn('CI or unattended runs still require SUPABASE_ACCESS_TOKEN.')
}

const dbPassword = process.env.SUPABASE_DB_PASSWORD?.trim()
const passwordArgs = dbPassword ? ['--password', dbPassword] : []
const baselineBeforeVersion = process.env.SUPABASE_BASELINE_APPLIED_BEFORE_VERSION?.trim()

if (!existsSync('supabase/config.toml')) {
  console.log('Initializing Supabase project config...')
  runSupabase(['init', '--yes'])
}

console.log(`Linking Supabase project: ${projectRef}`)
runSupabase(['link', '--project-ref', projectRef, ...passwordArgs, '--yes'])

if (baselineBeforeVersion) {
  const baselineVersionNumber = Number(baselineBeforeVersion)
  const baselineVersions = [
    ...new Set(
      readdirSync('supabase/migrations')
        .map((fileName) => fileName.match(/^(\d+)_/)?.[1])
        .filter((version) => version && Number(version) < baselineVersionNumber),
    ),
  ].sort((a, b) => Number(a) - Number(b))

  if (baselineVersions.length > 0) {
    console.log(`Marking baseline migrations as applied before ${baselineBeforeVersion}:`)
    console.log(baselineVersions.join(', '))
    runSupabase([
      'migration',
      'repair',
      '--status',
      'applied',
      ...baselineVersions,
      ...passwordArgs,
      '--yes',
    ])
  }
}

console.log('Pushing Supabase migrations...')
runSupabase(['db', 'push', ...passwordArgs, '--yes'])
