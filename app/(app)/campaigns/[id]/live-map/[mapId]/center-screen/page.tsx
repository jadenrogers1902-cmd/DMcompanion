import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CenterScreenMapView, type CenterScreenViewGroup } from '@/components/maps/CenterScreenMapView'
import { EmptyState } from '@/components/ui/EmptyState'
import type { RenderArea, RenderToken } from '@/components/maps/MapCanvas'
import type { GameMap, MapRevealedArea, MapRoomRegion, MapTravelParty, MapTravelPartyMember, Token } from '@/lib/types/database'
import { normalizeCenterCastSettings } from '@/lib/utils/cast-settings'

interface PageProps {
  params: Promise<{ id: string; mapId: string }>
}

function areaToRenderArea(area: MapRevealedArea): RenderArea {
  return {
    id: area.id,
    shape_type: area.shape_type,
    x: area.x,
    y: area.y,
    width: area.width,
    height: area.height,
    radius: area.radius,
  }
}

function tokenToCenterScreenToken(token: Token): RenderToken | null {
  if (token.visible_to_players === false && !token.discoverable) return null
  const visible = token.visible_to_players !== false
  return {
    id: token.id,
    token_type: token.token_type,
    name: visible ? token.name : '',
    x: token.x,
    y: token.y,
    size: token.size,
    color: token.color,
    visible_to_players: visible,
    max_hp: visible ? token.max_hp : 0,
    current_hp: visible ? token.current_hp : 0,
    temp_hp: visible ? token.temp_hp : 0,
    is_defeated: visible ? token.is_defeated : false,
    showHealth: visible && token.max_hp > 0,
    dimmed: !visible,
  }
}

function distanceFeet(a: Token, b: Token, map: GameMap) {
  const gridSize = Math.max(1, map.grid_size || 1)
  const gridScale = Math.max(1, map.grid_scale_feet || 5)
  const dx = a.x - b.x
  const dy = a.y - b.y
  return (Math.sqrt((dx * dx) + (dy * dy)) / gridSize) * gridScale
}

function playerLabel(token: Token) {
  return token.name?.trim() || 'Player'
}

function buildViewGroups(input: {
  map: GameMap
  tokens: Token[]
  activeParty: MapTravelParty | null
  partyMembers: MapTravelPartyMember[]
}): CenterScreenViewGroup[] {
  const { map, tokens, activeParty, partyMembers } = input
  const settings = normalizeCenterCastSettings(map.cast_settings)
  const playerTokens = tokens.filter((token) => (
    token.token_type === 'player' &&
    token.visible_to_players !== false
  ))
  if (playerTokens.length === 0) {
    return [{
      id: 'map',
      label: map.name,
      subtitle: 'Full map',
      focusTokenId: null,
      focus: null,
      tone: 'party',
    }]
  }

  const firstPlayer = playerTokens[0]
  const partyLeaderToken = activeParty
    ? playerTokens.find((token) => token.controlled_by_user_id === activeParty.leader_user_id) ?? null
    : null
  const mainToken =
    settings.mainFocus === 'first_player'
      ? firstPlayer
      : partyLeaderToken ?? firstPlayer
  const acceptedPartyUsers = new Set(
    activeParty
      ? partyMembers
          .filter((member) => member.party_id === activeParty.id && member.status === 'accepted')
          .map((member) => member.user_id)
      : [],
  )
  if (activeParty) acceptedPartyUsers.add(activeParty.leader_user_id)

  const splitDistance = settings.splitDistanceFeet
  const separated = settings.dynamicSplitEnabled
    ? playerTokens.filter((token) => {
        if (token.id === mainToken.id) return false
        const userId = token.controlled_by_user_id
        const isAcceptedPartyMember = Boolean(userId && acceptedPartyUsers.has(userId))
        const tooFar = distanceFeet(token, mainToken, map) > splitDistance
        if (map.travel_mode === 'group_party' && activeParty) {
          return !isAcceptedPartyMember || tooFar
        }
        return tooFar
      })
    : []

  const mainLabel = activeParty && map.travel_mode === 'group_party'
    ? activeParty.name || 'Party'
    : playerLabel(mainToken)
  const mainSubtitle = separated.length > 0
    ? `${playerLabel(mainToken)} focus - ${separated.length} separated`
    : `${playerLabel(mainToken)} focus - everyone present`

  return [
    {
      id: 'party',
      label: mainLabel,
      subtitle: mainSubtitle,
      focusTokenId: mainToken.id,
      focus: { x: mainToken.x, y: mainToken.y },
      tone: 'party',
    },
    ...separated.map((token) => {
      const feetAway = Math.round(distanceFeet(token, mainToken, map))
      return {
        id: `player-${token.id}`,
        label: `${playerLabel(token)} alone`,
        subtitle: `${feetAway} ft from ${playerLabel(mainToken)}`,
        focusTokenId: token.id,
        focus: { x: token.x, y: token.y },
        tone: 'solo' as const,
      }
    }),
  ]
}

export default async function CenterScreenPage({ params }: PageProps) {
  const { id, mapId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('campaign_members')
    .select('role')
    .eq('campaign_id', id)
    .eq('user_id', user.id)
    .single()
  if (!membership) redirect('/dashboard')
  if (membership.role !== 'dm') redirect(`/campaigns/${id}/live-map`)

  const { data: map } = await supabase
    .from('maps')
    .select('*')
    .eq('id', mapId)
    .eq('campaign_id', id)
    .single<GameMap>()
  if (!map) notFound()

  const [
    { data: signed },
    { data: tokens },
    { data: areas },
    { data: rooms },
    { data: parties },
    { data: partyMembers },
  ] = await Promise.all([
    supabase.storage.from('maps').createSignedUrl(map.storage_path, 3600),
    supabase
      .from('tokens')
      .select('*')
      .eq('map_id', mapId)
      .order('created_at', { ascending: true }),
    supabase
      .from('map_revealed_areas')
      .select('*')
      .eq('map_id', mapId)
      .eq('visible_to_players', true)
      .order('created_at', { ascending: true }),
    supabase
      .from('map_room_regions')
      .select('*')
      .eq('map_id', mapId)
      .order('created_at', { ascending: true }),
    supabase
      .from('map_travel_parties')
      .select('*')
      .eq('map_id', mapId)
      .eq('status', 'approved')
      .order('updated_at', { ascending: false })
      .limit(1),
    supabase
      .from('map_travel_party_members')
      .select('*')
      .eq('map_id', mapId),
  ])

  if (!signed?.signedUrl) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-950 p-4">
        <EmptyState title="Map image unavailable" description="The map file could not be loaded from storage." />
      </div>
    )
  }

  const rawTokens = (tokens ?? []) as Token[]
  const activeParty = ((parties ?? []) as MapTravelParty[])[0] ?? null
  const rawPartyMembers = (partyMembers ?? []) as MapTravelPartyMember[]

  const renderTokens = rawTokens
    .map(tokenToCenterScreenToken)
    .filter((token): token is RenderToken => Boolean(token))

  const renderAreas = ((areas ?? []) as MapRevealedArea[]).map(areaToRenderArea)
  const renderRooms = (rooms ?? []) as MapRoomRegion[]
  const settings = normalizeCenterCastSettings(map.cast_settings)
  const viewGroups = buildViewGroups({
    map,
    tokens: rawTokens,
    activeParty,
    partyMembers: rawPartyMembers,
  })

  return (
    <main className="relative min-h-dvh bg-black">
      <Link
        href={`/campaigns/${id}/live-map/${mapId}`}
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-zinc-950 focus:px-3 focus:py-2 focus:text-sm focus:text-zinc-100"
      >
        Back to DM map editor
      </Link>
      <CenterScreenMapView
        campaignId={id}
        map={map}
        imageUrl={signed.signedUrl}
        tokens={renderTokens}
        revealedAreas={renderAreas}
        roomRegions={renderRooms}
        settings={settings}
        viewGroups={viewGroups}
      />
    </main>
  )
}
