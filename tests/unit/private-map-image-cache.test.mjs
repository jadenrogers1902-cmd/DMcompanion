import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const { buildPrivateMapImageUrl } = await import('../../lib/maps/live-map.ts')

test('private map image URL is versioned by immutable storage path', () => {
  const original = buildPrivateMapImageUrl(
    'campaign-id',
    'map-id',
    'campaign-id/maps/original image.webp',
  )
  const unchanged = buildPrivateMapImageUrl(
    'campaign-id',
    'map-id',
    'campaign-id/maps/original image.webp',
  )
  const replacement = buildPrivateMapImageUrl(
    'campaign-id',
    'map-id',
    'campaign-id/maps/replacement.webp',
  )

  assert.equal(original, unchanged)
  assert.notEqual(original, replacement)
  assert.equal(
    original,
    '/api/campaigns/campaign-id/maps/map-id/image?v=campaign-id%2Fmaps%2Foriginal+image.webp',
  )
})

test('private map image response validators do not use mutable map metadata', async () => {
  const routeSource = await readFile(
    new URL(
      '../../app/api/campaigns/[id]/maps/[mapId]/image/route.ts',
      import.meta.url,
    ),
    'utf8',
  )

  assert.match(routeSource, /createHash\('sha256'\)\.update\(map\.storage_path\)\.digest\('base64url'\)/)
  assert.doesNotMatch(routeSource, /Buffer\.from\(map\.storage_path\)/)
  assert.match(routeSource, /new Date\(map\.created_at\)\.toUTCString\(\)/)
  assert.doesNotMatch(routeSource, /map\.updated_at/)
})

test('private map image route blocks inactive maps for players', async () => {
  const routeSource = await readFile(
    new URL(
      '../../app/api/campaigns/[id]/maps/[mapId]/image/route.ts',
      import.meta.url,
    ),
    'utf8',
  )

  assert.match(routeSource, /membership\.role !== 'dm' && !map\.is_active/)
})
