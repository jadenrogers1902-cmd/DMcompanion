import assert from 'node:assert/strict'
import { AsyncLocalStorage } from 'node:async_hooks'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

globalThis.AsyncLocalStorage ??= AsyncLocalStorage

const { unstable_doesMiddlewareMatch } = await import(
  'next/experimental/testing/server.js'
)
const proxySource = await readFile(new URL('../../proxy.ts', import.meta.url), 'utf8')
const matcherBlock = proxySource.match(
  /export const config\s*=\s*\{\s*matcher:\s*\[([\s\S]*?)\]\s*,?\s*\}/,
)

assert.ok(matcherBlock, 'proxy.ts must export a statically analyzable matcher array')

const matcher = Array.from(
  matcherBlock[1].matchAll(/'([^']+)'/g),
  ([, value]) => value,
)
const expectedMatcher = [
  '/',
  '/login',
  '/register',
  '/dashboard/:path*',
  '/campaigns/:path*',
  '/join/:path*',
]

test('proxy matcher is limited to authenticated UI surfaces', () => {
  assert.deepEqual(matcher, expectedMatcher)

  const protectedUrls = [
    'https://companion.test/',
    'https://companion.test/login',
    'https://companion.test/register',
    'https://companion.test/dashboard',
    'https://companion.test/dashboard/settings',
    'https://companion.test/campaigns',
    'https://companion.test/campaigns/campaign-id/live-map',
    'https://companion.test/join/campaign-code',
  ]
  const bypassedUrls = [
    'https://companion.test/api/srd?q=wolf',
    'https://companion.test/api/campaigns/campaign-id/maps/map-id/image',
    'https://companion.test/api/notion/webhook',
    'https://companion.test/auth/callback?code=example',
    'https://companion.test/manifest.webmanifest',
    'https://companion.test/robots.txt',
    'https://companion.test/_next/static/chunks/app.js',
    'https://companion.test/_next/image?url=%2Fapp-icon.svg&w=128&q=75',
    'https://companion.test/app-icon.svg',
  ]

  for (const url of protectedUrls) {
    assert.equal(
      unstable_doesMiddlewareMatch({ config: { matcher }, nextConfig: {}, url }),
      true,
      `expected proxy to match ${url}`,
    )
  }

  for (const url of bypassedUrls) {
    assert.equal(
      unstable_doesMiddlewareMatch({ config: { matcher }, nextConfig: {}, url }),
      false,
      `expected proxy to bypass ${url}`,
    )
  }
})
