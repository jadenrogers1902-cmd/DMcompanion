import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { PlayerMapView } from '@/components/maps/PlayerMapView'
import { RemoveLiveMapButton } from '@/components/maps/RemoveLiveMapButton'
import { DMUtilityPanel } from '@/components/nav/DMUtilityPanel'
import { buildPrivateMapImageUrl } from '@/lib/maps/live-map'
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
  MapWall,
  PlayerLiveMapSnapshot,
  PlayerToken,
  PlayerVisibleCampaignDoc,
  Profile,
  Spell,
} from '@/lib/types/database'

export const metadata: Metadata = { title: 'Campaign Map' }

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
    className="text-sm text-faint hover:text-muted flex items-center gap-1.5 mb-4"
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
    const { data: snapshotRaw, error: snapshotError } = await supabase.rpc(
      'get_player_active_live_map_snapshot',
      { p_campaign_id: id },
    )
    const snapshot = (snapshotRaw ?? null) as PlayerLiveMapSnapshot | null
    const activeMap = snapshot?.map ?? null

    if (snapshotError) {
      console.error('[live-map] player-safe snapshot failed', snapshotError.message)
    }

    if (!snapshot || !activeMap) {
      return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          {backLink(id, campaign.name)}
          <h1 className="text-2xl font-bold text-content mb-6">Adventure</h1>
          <EmptyState
            icon={MapIcon}
            title="No map shared yet"
            description="Your DM hasn't shared a map for this campaign. Check back during the session."
          />
        </div>
      )
    }

    const stableImageUrl = buildPrivateMapImageUrl(id, activeMap.id, activeMap.storage_path)
    if (process.env.NODE_ENV !== 'production') {
      console.info('[live-map] player route using stable map image url', {
        campaignId: id,
        mapId: activeMap.id,
        updatedAt: activeMap.updated_at,
      })
    }

    const [
      { data: characters },
      { data: members },
      { data: playerCodexDocs },
      { data: playerCodexLinks },
    ] = await Promise.all([
      supabase.from('characters').select('*').eq('campaign_id', id).eq('user_id', user.id),
      supabase
        .from('campaign_members')
        .select('user_id, role, profiles ( id, display_name, avatar_url, created_at )')
        .eq('campaign_id', id),
      supabase.rpc('get_player_visible_campaign_docs', { p_campaign_id: id }),
      supabase
        .from('campaign_doc_link_publications')
        .select('*')
        .eq('campaign_id', id),
    ])

    // Player map data is fail-closed: this route never falls back to a mixed
    // source table when the sanitized snapshot is unavailable.
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
        <p className="text-xs uppercase tracking-wide text-faint mb-1">Adventure</p>
        <h1 className="text-2xl font-bold text-content mb-4">{activeMap.name}</h1>
        {stableImageUrl ? (
          <PlayerMapView
            key={activeMap.id}
            campaignId={id}
            map={activeMap}
            imageUrl={stableImageUrl}
            initialTokens={snapshot.tokens as PlayerToken[]}
            initialAreas={snapshot.areas as MapRevealedArea[]}
            initialRooms={snapshot.rooms as MapRoomRegion[]}
            initialWalls={snapshot.walls as MapWall[]}
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
            initialTravelParties={snapshot.travel_parties as MapTravelParty[]}
            initialTravelPartyMembers={snapshot.travel_party_members as MapTravelPartyMember[]}
            initialTransportConfirmations={snapshot.transport_confirmations as MapTransportConfirmation[]}
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
              <h1 className="text-2xl font-bold text-content">Live Map</h1>
              <Badge variant="dm">DM</Badge>
            </div>
            <p className="text-sm text-faint mt-1">
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
                <div className="p-4 rounded-xl bg-panel border border-border hover:border-border-strong transition-colors h-full">
                  <h3 className="font-semibold text-content pr-8">{m.name}</h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-faint">
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
