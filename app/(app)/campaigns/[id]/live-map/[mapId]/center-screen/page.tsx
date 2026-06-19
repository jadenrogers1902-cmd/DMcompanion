import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CenterScreenMapView } from '@/components/maps/CenterScreenMapView'
import { EmptyState } from '@/components/ui/EmptyState'
import type { RenderArea, RenderToken } from '@/components/maps/MapCanvas'
import type { GameMap, MapRevealedArea, MapTravelParty, Profile, Token } from '@/lib/types/database'

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

  const [{ data: signed }, { data: tokens }, { data: areas }, { data: parties }] = await Promise.all([
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
      .from('map_travel_parties')
      .select('*')
      .eq('map_id', mapId)
      .eq('status', 'approved')
      .order('updated_at', { ascending: false })
      .limit(1),
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
  const leaderRawToken =
    activeParty
      ? rawTokens.find((token) => (
          token.controlled_by_user_id === activeParty.leader_user_id &&
          token.token_type === 'player' &&
          token.visible_to_players !== false
        )) ?? null
      : null
  const fallbackLeaderToken =
    leaderRawToken ??
    rawTokens.find((token) => token.token_type === 'player' && token.visible_to_players !== false) ??
    null

  let leaderLabel: string | null = fallbackLeaderToken?.name ?? null
  if (activeParty?.leader_user_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', activeParty.leader_user_id)
      .maybeSingle<Pick<Profile, 'display_name'>>()
    leaderLabel = profile?.display_name ?? leaderLabel
  }

  const renderTokens = rawTokens
    .map(tokenToCenterScreenToken)
    .filter((token): token is RenderToken => Boolean(token))

  const renderAreas = ((areas ?? []) as MapRevealedArea[]).map(areaToRenderArea)

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
        leaderTokenId={fallbackLeaderToken?.id ?? null}
        leaderLabel={leaderLabel}
      />
    </main>
  )
}
