import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { PlayerMapView } from '@/components/maps/PlayerMapView'
import { RemoveLiveMapButton } from '@/components/maps/RemoveLiveMapButton'
import { DMUtilityPanel } from '@/components/nav/DMUtilityPanel'
import {
  buildPrivateMapImageUrl,
  LIVE_MAP_COLUMNS,
  MAP_REVEALED_AREA_COLUMNS,
  MAP_ROOM_REGION_COLUMNS,
  MAP_TRANSPORT_CONFIRMATION_COLUMNS,
  MAP_TRAVEL_PARTY_COLUMNS,
  MAP_TRAVEL_PARTY_MEMBER_COLUMNS,
} from '@/lib/maps/live-map'
import type {
  CampaignDocLinkPublication,
  Ability,
  Character,
  Condition,
  GameMap,
  InventoryItem,
  MapRevealedArea,
  MapRoomRegion,
  MapTransportConfirmation,
  MapTravelParty,
  MapTravelPartyMember,
  PlayerToken,
  PlayerVisibleCampaignDoc,
  Profile,
  Spell,
} from '@/lib/types/database'

interface PageProps {
  params: Promise<{ id: string }>
}

const MapIcon = (
  <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
  </svg>
)

const backLink = (id: string, name: string) => (
  <Link
    href={`/campaigns/${id}`}
    className="text-sm text-zinc-500 hover:text-zinc-300 flex items-center gap-1.5 mb-4"
  >
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
    {name}
  </Link>
)

export default async function MapsPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, name')
    .eq('id', id)
    .single()
  if (!campaign) notFound()

  const { data: membership } = await supabase
    .from('campaign_members')
    .select('role')
    .eq('campaign_id', id)
    .eq('user_id', user.id)
    .single()
  if (!membership) redirect('/dashboard')

  const isDM = membership.role === 'dm'

  // ─── PLAYER VIEW: the active map, read-only ───
  if (!isDM) {
    const { data: activeMap } = await supabase
      .from('maps')
      .select(LIVE_MAP_COLUMNS)
      .eq('campaign_id', id)
      .eq('is_active', true)
      .maybeSingle<GameMap>()

    if (!activeMap) {
      return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          {backLink(id, campaign.name)}
          <h1 className="text-2xl font-bold text-zinc-100 mb-6">Adventure</h1>
          <EmptyState
            icon={MapIcon}
            title="No map shared yet"
            description="Your DM hasn't shared a map for this campaign. Check back during the session."
          />
        </div>
      )
    }

    const stableImageUrl = buildPrivateMapImageUrl(id, activeMap.id, activeMap.updated_at)
    if (process.env.NODE_ENV !== 'production') {
      console.info('[live-map] player route using stable map image url', {
        campaignId: id,
        mapId: activeMap.id,
        updatedAt: activeMap.updated_at,
      })
    }

    const [
      { data: tokens, error: tokensError },
      { data: characters },
      { data: areas },
      { data: rooms },
      { data: members },
      { data: playerCodexDocs },
      { data: playerCodexLinks },
      { data: travelParties },
      { data: travelPartyMembers },
      { data: transportConfirmations },
    ] = await Promise.all([
      supabase.rpc('get_player_live_map_tokens', { p_map_id: activeMap.id }),
      supabase.from('characters').select('*').eq('campaign_id', id).eq('user_id', user.id),
      // RLS returns only player-visible areas on the active map.
      supabase.from('map_revealed_areas').select(MAP_REVEALED_AREA_COLUMNS).eq('map_id', activeMap.id),
      supabase.from('map_room_regions').select(MAP_ROOM_REGION_COLUMNS).eq('map_id', activeMap.id),
      supabase
        .from('campaign_members')
        .select('user_id, role, profiles ( id, display_name, avatar_url, created_at )')
        .eq('campaign_id', id),
      supabase.rpc('get_player_visible_campaign_docs', { p_campaign_id: id }),
      supabase
        .from('campaign_doc_link_publications')
        .select('*')
        .eq('campaign_id', id),
      supabase
        .from('map_travel_parties')
        .select(MAP_TRAVEL_PARTY_COLUMNS)
        .eq('map_id', activeMap.id)
        .order('updated_at', { ascending: false }),
      supabase
        .from('map_travel_party_members')
        .select(MAP_TRAVEL_PARTY_MEMBER_COLUMNS)
        .eq('map_id', activeMap.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('map_transport_confirmations')
        .select(MAP_TRANSPORT_CONFIRMATION_COLUMNS)
        .eq('map_id', activeMap.id),
    ])

    // The player token RPC redacts hidden/discoverable tokens server-side and
    // emits player-safe hint markers. If it's unavailable (e.g. migration 051
    // not applied, or a transient error), we fall back to a direct RLS-guarded
    // select so the map still loads — RLS still hides non-visible tokens, so no
    // hidden data leaks — but discoverable hint markers are lost. That's a
    // DEGRADED state, so surface it loudly in the server logs instead of failing
    // silently. See QA Phase 4.
    if (tokensError) {
      console.error(
        '[live-map] get_player_live_map_tokens RPC failed — falling back to a ' +
          'direct token select (RLS still enforced, but discoverable-token hint ' +
          `markers are unavailable). Apply migration 051 / check the RPC. Cause: ${
            tokensError.message ?? tokensError
          }`,
      )
    }
    const fallbackTokens =
      tokensError
        ? await supabase.from('tokens').select('*').eq('map_id', activeMap.id)
        : { data: null }
    const playerTokens = tokens ?? fallbackTokens.data ?? []
    const ownedCharacters = (characters ?? []) as Character[]
    const ownedCharacterIds = ownedCharacters.map((character) => character.id)
    const [{ data: ownedInventory }, { data: ownedSpells }, { data: ownedAbilities }, { data: ownedConditions }] =
      ownedCharacterIds.length > 0
        ? await Promise.all([
            supabase
              .from('character_inventory_items')
              .select('*')
              .in('character_id', ownedCharacterIds)
              .order('created_at', { ascending: true }),
            supabase
              .from('character_spells')
              .select('*')
              .in('character_id', ownedCharacterIds)
              .order('spell_level', { ascending: true }),
            supabase
              .from('character_abilities')
              .select('*')
              .in('character_id', ownedCharacterIds)
              .order('created_at', { ascending: true }),
            supabase
              .from('character_conditions')
              .select('*')
              .in('character_id', ownedCharacterIds)
              .order('created_at', { ascending: true }),
          ])
        : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }]

    const characterSpeeds: Record<string, number> = {}
    ownedCharacters.forEach((c) => {
      characterSpeeds[c.id] = c.speed
    })
    const characterSummaries = ownedCharacters.map((character) => ({
      character,
      inventory: ((ownedInventory ?? []) as InventoryItem[]).filter((item) => item.character_id === character.id),
      spells: ((ownedSpells ?? []) as Spell[]).filter((spell) => spell.character_id === character.id),
      abilities: ((ownedAbilities ?? []) as Ability[]).filter((ability) => ability.character_id === character.id),
      conditions: ((ownedConditions ?? []) as Condition[]).filter((condition) => condition.character_id === character.id),
    }))

    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {backLink(id, campaign.name)}
        <p className="text-xs uppercase tracking-wide text-zinc-600 mb-1">Adventure</p>
        <h1 className="text-2xl font-bold text-zinc-100 mb-4">{activeMap.name}</h1>
        {stableImageUrl ? (
          <PlayerMapView
            key={activeMap.id}
            campaignId={id}
            map={activeMap}
            imageUrl={stableImageUrl}
            initialTokens={playerTokens as PlayerToken[]}
            initialAreas={(areas ?? []) as unknown as MapRevealedArea[]}
            initialRooms={(rooms ?? []) as unknown as MapRoomRegion[]}
            currentUserId={user.id}
            characterSpeeds={characterSpeeds}
            myCharacters={ownedCharacters.map((c) => ({ id: c.id, name: c.name }))}
            characterSummaries={characterSummaries}
            partyMembers={(members ?? []).map((member) => ({
              userId: member.user_id,
              role: member.role,
              profile: (Array.isArray(member.profiles) ? member.profiles[0] : member.profiles) as Profile | null,
            }))}
            playerCodexDocs={(playerCodexDocs ?? []) as PlayerVisibleCampaignDoc[]}
            playerCodexLinks={(playerCodexLinks ?? []) as CampaignDocLinkPublication[]}
            initialTravelParties={(travelParties ?? []) as unknown as MapTravelParty[]}
            initialTravelPartyMembers={(travelPartyMembers ?? []) as unknown as MapTravelPartyMember[]}
            initialTransportConfirmations={(transportConfirmations ?? []) as unknown as MapTransportConfirmation[]}
          />
        ) : (
          <EmptyState title="Map image unavailable" description="The map file could not be loaded." />
        )}
      </div>
    )
  }

  // ─── DM VIEW: list of maps ───
  const { data: maps } = await supabase
    .from('maps')
    .select('*')
    .eq('campaign_id', id)
    .order('created_at', { ascending: false })

  const mapList = (maps ?? []) as GameMap[]
  const activeMapName = mapList.find((m) => m.is_active)?.name ?? null
  const { data: pendingRequests } = await supabase
    .from('action_intents')
    .select('id')
    .eq('campaign_id', id)
    .in('status', ['pending', 'needs_roll', 'approved', 'resolving'])

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
      <div className="mb-8">
        {backLink(id, campaign.name)}
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-zinc-100">Live Map</h1>
              <Badge variant="dm">DM</Badge>
            </div>
            <p className="text-sm text-zinc-500 mt-1">
              Your live session dashboard. Upload maps, configure the grid, place tokens, and run the active scene.
            </p>
          </div>
          <Link href={`/campaigns/${id}/live-map/new`}>
            <Button size="sm">Upload Map</Button>
          </Link>
        </div>
      </div>

      {mapList.length === 0 ? (
        <EmptyState
          icon={MapIcon}
          title="No maps yet"
          description="Upload your first battle map to start placing tokens."
          action={
            <Link href={`/campaigns/${id}/live-map/new`}>
              <Button>Upload a map</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {mapList.map((m) => (
            <div key={m.id} className="relative">
              <RemoveLiveMapButton
                campaignId={id}
                mapId={m.id}
                storagePath={m.storage_path}
                mapName={m.name}
              />
              <Link href={`/campaigns/${id}/live-map/${m.id}`}>
                <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-colors h-full">
                  <h3 className="font-semibold text-zinc-100 pr-8">{m.name}</h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                    {m.is_active && <Badge variant="success">Active</Badge>}
                    <span>{m.width} × {m.height}px · 1 square = {m.grid_scale_feet}ft</span>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
        </div>
        <DMUtilityPanel
          campaignId={id}
          campaignName={campaign.name}
          activeMapName={activeMapName}
          pendingRequests={pendingRequests?.length ?? 0}
        />
      </div>
    </div>
  )
}
