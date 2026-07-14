import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const {
  getCampaignMobileItems,
  getCampaignNavigationItems,
  getPlayerMoreItems,
} = await import('../../components/nav/campaign-navigation.ts')

test('player phone navigation keeps every campaign destination reachable', () => {
  const mobileNav = read('components/nav/MobileNav.tsx')
  const primary = getCampaignMobileItems('campaign-id', 'player', false)
  const livePrimary = getCampaignMobileItems('campaign-id', 'player', true)
  const more = getPlayerMoreItems('campaign-id')

  assert.deepEqual(primary.map((item) => item.label), ['Home', 'Characters', 'Adventure'])
  assert.deepEqual(livePrimary.map((item) => item.label), ['Home', 'Characters', 'Adventure'])
  assert.deepEqual(
    getCampaignMobileItems('campaign-id', null, false).map((item) => item.label),
    ['Home', 'Characters', 'Map'],
  )
  assert.equal(livePrimary.find((item) => item.label === 'Adventure')?.live, true)
  assert.deepEqual(more.map((item) => item.label), [
    'Encounters',
    'Journal',
    'Revealed Info',
    'Account Settings',
    'All Campaigns',
    'Join Campaign',
  ])

  assert.match(mobileNav, />More</)
  assert.match(mobileNav, /role="dialog"/)
  assert.match(mobileNav, /aria-current=/)
  assert.match(mobileNav, /event\.key === 'Escape'/)
  assert.match(mobileNav, /min-h-14 min-w-11/)
})

test('campaign home provides artwork-led links without dropping player features', () => {
  const campaignHome = [
    read('app/(app)/campaigns/[id]/page.tsx'),
    read('components/campaigns/PlayerTabletopCard.tsx'),
  ].join('\n')

  for (const asset of ['adventure', 'characters', 'encounters', 'journal', 'revealed-info']) {
    assert.match(campaignHome, new RegExp(`/player-ui/destinations/${asset}\\.webp`))
    assert.equal(
      existsSync(new URL(`../../public/player-ui/destinations/${asset}.webp`, import.meta.url)),
      true,
      `${asset}.webp must exist`,
    )
  }
  for (const route of ['live-map', 'characters', 'encounters', 'story', 'codex']) {
    assert.match(campaignHome, new RegExp(`/campaigns/\\$\\{id\\}/${route}`))
  }
  assert.match(campaignHome, /<MemberList members=\{members\}/)
})

test('player map keeps its movement contract while surfacing visual controls', () => {
  const playerMap = read('components/maps/PlayerMapView.tsx')
  const legend = playerMap.slice(
    playerMap.indexOf('function MapControlLegend'),
    playerMap.indexOf('function MovementPreviewPill'),
  )

  assert.match(playerMap, /rpc\('move_player_token'/)
  assert.match(playerMap, />Character</)
  assert.match(playerMap, />Actions</)
  for (const mode of ['Hand', 'Move', 'Target']) {
    assert.match(playerMap, new RegExp(`label="${mode}"`))
  }
  assert.deepEqual(
    Array.from(legend.matchAll(/label: '([^']+)'/g), (match) => match[1]),
    ['Hand', 'Move', 'Target', 'Actions'],
  )
})

test('DM and player desktop campaign navigation retain their complete route sets', () => {
  assert.deepEqual(
    getCampaignNavigationItems('campaign-id', 'dm', false).map((item) => item.label),
    [
      'Dashboard',
      'Live Map',
      'Adventure Maker',
      'Adventure Codex',
      'Table Sync',
      'Players',
      'Requests',
      'Encounters',
      'Story',
      'Settings',
    ],
  )
  assert.deepEqual(
    getCampaignNavigationItems('campaign-id', 'player', false).map((item) => item.label),
    ['Dashboard', 'Adventure', 'Revealed Info', 'Characters', 'Encounters', 'Journal'],
  )
})

test('player media only accepts local paths and the configured Storage origin', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project-ref.supabase.co'
  const { isPlayerImageMimeType, safePlayerImageUrl } = await import(
    `../../lib/utils/player-media.ts?test=${Date.now()}`
  )

  assert.equal(safePlayerImageUrl('/player-ui/destinations/adventure.webp'), '/player-ui/destinations/adventure.webp')
  assert.equal(
    safePlayerImageUrl('https://project-ref.supabase.co/storage/v1/object/sign/handouts/example.webp?token=abc'),
    'https://project-ref.supabase.co/storage/v1/object/sign/handouts/example.webp?token=abc',
  )
  assert.equal(safePlayerImageUrl('https://project-ref.supabase.co.evil.example/tracker.png'), null)
  assert.equal(safePlayerImageUrl('https://example.com/tracker.png'), null)
  assert.equal(safePlayerImageUrl('//example.com/tracker.png'), null)
  assert.equal(safePlayerImageUrl(String.raw`/\example.com/tracker.png`), null)
  assert.equal(safePlayerImageUrl(String.raw`/\\example.com/tracker.png`), null)
  assert.equal(isPlayerImageMimeType('image/webp'), true)
  assert.equal(isPlayerImageMimeType('application/pdf'), false)
})
