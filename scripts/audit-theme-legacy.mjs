import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCAN_ROOTS = ['app', 'components']
const SOURCE_EXTENSIONS = new Set(['.css', '.ts', '.tsx'])

// Exceptions must be exact file + line + token matches. Keep this list empty unless
// a gameplay color is intentionally expressed with a legacy Tailwind palette token.
// Broad file or directory exceptions are deliberately unsupported.
const ALLOWLIST = []

const LEGACY_THEME_TOKEN = /\b(?:accent|bg|border|caret|divide|fill|from|outline|placeholder|ring|shadow|stroke|text|to|via)-(?:amber|zinc)-(?:50|100|200|300|400|500|600|700|800|900|950)\b/g

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await sourceFiles(absolute))
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(absolute)
    }
  }

  return files
}

function isAllowed(finding) {
  return ALLOWLIST.some((entry) => (
    entry.file === finding.file
    && entry.line === finding.line
    && entry.token === finding.token
  ))
}

export async function auditLegacyThemeTokens(repoRoot = REPO_ROOT) {
  const files = (
    await Promise.all(SCAN_ROOTS.map((root) => sourceFiles(path.join(repoRoot, root))))
  ).flat()
  const findings = []

  for (const absolute of files) {
    const relative = path.relative(repoRoot, absolute).split(path.sep).join('/')
    const lines = (await readFile(absolute, 'utf8')).split(/\r?\n/)

    lines.forEach((text, index) => {
      for (const match of text.matchAll(LEGACY_THEME_TOKEN)) {
        const finding = {
          file: relative,
          line: index + 1,
          token: match[0],
          text: text.trim(),
        }
        if (!isAllowed(finding)) findings.push(finding)
      }
    })
  }

  return findings
}

async function main() {
  const findings = await auditLegacyThemeTokens()

  if (findings.length === 0) {
    console.log('Theme audit passed: semantic account themes contain no non-allowlisted zinc/amber utilities.')
    return
  }

  console.error(`Theme audit failed: ${findings.length} legacy theme token occurrence(s) remain.`)
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line}  ${finding.token}  ${finding.text}`)
  }
  console.error('')
  console.error('Migrate each occurrence to a semantic account-theme token. If a gameplay color must remain, add an exact file + line + token exception with a reason.')
  process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
