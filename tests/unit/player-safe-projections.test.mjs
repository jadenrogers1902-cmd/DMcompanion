import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

test('player map clients subscribe only to the payload-free event stream', () => {
  const playerView = read('components/maps/PlayerMapView.tsx')
  const centerView = read('components/maps/CenterScreenMapView.tsx')
  const safeHook = read('lib/hooks/usePlayerSafeMapRealtime.ts')

  assert.match(playerView, /usePlayerSafeMapRealtime\(campaignId, map\.id/)
  assert.match(centerView, /usePlayerSafeMapRealtime\(campaignId, map\.id/)
  assert.doesNotMatch(playerView, /table:\s*'tokens'/)
  assert.doesNotMatch(centerView, /table:\s*'(tokens|maps|map_room_regions|map_walls|map_revealed_areas)'/)
  assert.match(safeHook, /'player_safe_map_events'/)
  assert.match(safeHook, /'center_safe_map_events'/)
  assert.match(safeHook, /rpc\('get_player_live_map_snapshot'/)
  assert.match(safeHook, /rpc\('get_player_active_live_map_snapshot'/)
  assert.match(safeHook, /\? `campaign_id=eq\.\$\{campaignId\}`/)
  assert.match(safeHook, /: `map_id=eq\.\$\{mapId\}`/)
  assert.match(playerView, /rpc\('move_player_token'/)
  assert.doesNotMatch(playerView, /movePlayerToken/)
  assert.match(safeHook, /RETRY_CAP_MS = 30_000/)
  assert.match(safeHook, /void fetchSnapshot\(\)/)
  assert.match(safeHook, /retryDelay\(attempt\)/)
})

test('migration closes mixed-row reads and redacts private snapshot fields', () => {
  const migration = read('supabase/migrations/20260713041904_player_safe_live_projections.sql')

  for (const table of ['maps', 'tokens', 'map_revealed_areas', 'map_room_regions', 'map_walls']) {
    assert.match(
      migration,
      new RegExp(`CREATE POLICY "${table}_select" ON public\\.${table}[\\s\\S]*?is_campaign_dm\\(campaign_id\\)`),
    )
  }

  assert.match(migration, /'hidden_dm_actions', ARRAY\[\]::TEXT\[\]/)
  assert.match(migration, /'destination_prepared_map_id', NULL/)
  assert.match(migration, /'source_prepared_token_id', NULL/)
  assert.match(migration, /'resolver_config', '\{\}'::JSONB/)
  assert.match(migration, /'visible_on_cast', t\.visible_on_cast/)
  assert.match(migration, /'armor_class', CASE[\s\S]*?THEN 11[\s\S]*?ELSE 10/)
  assert.match(migration, /'linked_campaign_doc_id', NULL/)
  assert.match(migration, /'name', 'Wall'/)
  assert.match(migration, /'source_prepared_room_id', NULL/)
  assert.match(migration, /to_jsonb\(c\) - 'destination_prepared_map_id'/)
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.get_player_live_map_tokens\(UUID\) FROM PUBLIC, anon, authenticated/,
  )
  assert.match(migration, /DROP POLICY IF EXISTS "action_roll_requests_update_dm_or_player"/)
  assert.match(migration, /DROP POLICY IF EXISTS "action_intents_roll_update_actor"/)
  assert.match(migration, /DROP POLICY IF EXISTS "action_roll_results_insert_player"/)
  assert.match(migration, /DROP POLICY IF EXISTS "pending_state_updates_insert_member"/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.move_player_token/)
  assert.match(migration, /LIKE 'Path blocked by wall:%'/)
  assert.match(
    migration,
    /player_safe_map_events\.updated_at IS DISTINCT FROM NOW\(\)/,
  )
  assert.match(migration, /public\.campaigns AS c WHERE c\.id = p_campaign_id/)
  assert.match(migration, /public\.campaigns AS c WHERE c\.id = v_campaign_id/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.is_campaign_member[\s\S]*?SET search_path = ''/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.is_campaign_dm[\s\S]*?SET search_path = ''/)
  assert.match(migration, /REVOKE INSERT ON public\.action_intents FROM authenticated, anon/)
  assert.doesNotMatch(migration, /CREATE POLICY "action_intents_insert_actor"/)
  assert.match(migration, /DROP POLICY IF EXISTS "map_travel_parties_insert_member"/)
  assert.match(migration, /DROP POLICY IF EXISTS "map_travel_party_members_insert_creator"/)
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON public\.map_travel_parties/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.movement_crosses_wall[\s\S]*?authenticated/)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.reveal_auto_room_regions[\s\S]*?authenticated/)
  assert.match(migration, /private\.segment_intersection_point\([\s\S]*?p_old_x, p_old_y, p_new_x, p_new_y/)
  assert.match(migration, /door\.x - \(\(crossing\.point->>'x'\)::DOUBLE PRECISION\)/)
  assert.match(migration, /Group path is blocked by a wall\./)
  assert.match(migration, /AND t\.visible_to_players = TRUE/)
})

test('player Story and Storage reads are reveal-scoped', () => {
  const migration = read('supabase/migrations/20260713041904_player_safe_live_projections.sql')
  const story = read('components/story/StoryWorkspace.tsx')

  assert.match(story, /table:\s*'player_safe_story_events'/)
  assert.match(migration, /DROP POLICY IF EXISTS "Players can view visible quests"/)
  assert.match(migration, /get_player_story_snapshot/)
  assert.match(migration, /can_read_map_storage_object\(storage\.objects\.name\)/)
  assert.doesNotMatch(migration, /SELECT 1 FROM public\.maps AS m[\s\S]*?m\.storage_path = p_name/)
  assert.match(migration, /can_read_handout_storage_object\(storage\.objects\.name\)/)
  assert.match(migration, /h\.storage_path = p_name/)
  assert.match(migration, /h\.is_revealed = TRUE/)
})

test('hidden transports cannot be invoked through the privileged travel action', () => {
  const transport = read('lib/actions/transport.ts')

  assert.match(transport, /destination_prepared_map_id, visible_to_players/)
  assert.match(transport, /!isDm && !token\.visible_to_players/)
  assert.match(transport, /admin\.rpc\('set_active_map'/)
})

test('validated actions and transport confirmations are server-owned writes', () => {
  const actions = read('lib/actions/action-intents.ts')
  const transport = read('lib/actions/transport.ts')
  const storyPage = read('app/(app)/campaigns/[id]/story/page.tsx')

  assert.match(actions, /const admin = createAdminClient\(\)/)
  assert.match(actions, /await admin\.from\('action_intents'\)\.insert/)
  assert.match(actions, /map\.campaign_id !== campaignId/)
  assert.match(actions, /\.eq\('campaign_id', campaignId\)[\s\S]*?\.eq\('user_id', user\.id\)/)
  assert.match(transport, /await admin[\s\S]*?\.from\('map_transport_confirmations'\)[\s\S]*?\.delete\(\)/)
  assert.match(storyPage, /createSignedUrls\(/)
  assert.match(storyPage, /60 \* 5/)
  assert.doesNotMatch(storyPage, /createSignedUrl\(/)
})
