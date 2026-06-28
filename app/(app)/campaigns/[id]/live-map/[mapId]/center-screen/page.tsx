import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CenterScreenMapView } from '@/components/maps/CenterScreenMapView'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  buildPrivateMapImageUrl,
  CENTER_SCREEN_TOKEN_COLUMNS,
  LIVE_MAP_COLUMNS,
  MAP_REVEALED_AREA_COLUMNS,
  MAP_ROOM_REGION_COLUMNS,
  MAP_TRAVEL_PARTY_COLUMNS,
  MAP_TRAVEL_PARTY_MEMBER_COLUMNS,
} from '@/lib/maps/live-map'
import type { GameMap, MapRevealedArea, MapRoomRegion, MapTravelParty, MapTravelPartyMember, Token } from '@/lib/types/database'

interface PageProps {
  params: Promise<{ id: string; mapId: string }>
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
    .select(LIVE_MAP_COLUMNS)
    .eq('id', mapId)
    .eq('campaign_id', id)
    .single<GameMap>()
  if (!map) notFound()

  const stableImageUrl = buildPrivateMapImageUrl(id, map.id, map.updated_at)
  if (process.env.NODE_ENV !== 'production') {
    console.info('[live-map] center screen using stable map image url', {
      campaignId: id,
      mapId: map.id,
      updatedAt: map.updated_at,
    })
  }

  const [{ data: tokens }, { data: areas }, { data: rooms }, { data: parties }, { data: partyMembers }] = await Promise.all([
    supabase
      .from('tokens')
      .select(CENTER_SCREEN_TOKEN_COLUMNS)
      .eq('map_id', mapId)
      .order('created_at', { ascending: true }),
    supabase
      .from('map_revealed_areas')
      .select(MAP_REVEALED_AREA_COLUMNS)
      .eq('map_id', mapId)
      .eq('visible_to_players', true)
      .order('created_at', { ascending: true }),
    supabase
      .from('map_room_regions')
      .select(MAP_ROOM_REGION_COLUMNS)
      .eq('map_id', mapId)
      .eq('visible_to_players', true)
      .order('created_at', { ascending: true }),
    supabase
      .from('map_travel_parties')
      .select(MAP_TRAVEL_PARTY_COLUMNS)
      .eq('map_id', mapId)
      .order('updated_at', { ascending: false }),
    supabase
      .from('map_travel_party_members')
      .select(MAP_TRAVEL_PARTY_MEMBER_COLUMNS)
      .eq('map_id', mapId),
  ])

  if (!stableImageUrl) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-950 p-4">
        <EmptyState title="Map image unavailable" description="The map file could not be loaded from storage." />
      </div>
    )
  }

  return (
    <main className="relative min-h-dvh bg-black">
      <Link
        href={`/campaigns/${id}/live-map/${mapId}`}
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-zinc-950 focus:px-3 focus:py-2 focus:text-sm focus:text-zinc-100"
      >
        Back to DM map editor
      </Link>
      <CenterScreenMapView
        key={`${map.id}:${map.updated_at}`}
        campaignId={id}
        map={map}
        imageUrl={stableImageUrl}
        initialTokens={(tokens ?? []) as unknown as Token[]}
        initialRevealedAreas={(areas ?? []) as unknown as MapRevealedArea[]}
        initialRoomRegions={(rooms ?? []) as unknown as MapRoomRegion[]}
        initialTravelParties={(parties ?? []) as unknown as MapTravelParty[]}
        initialTravelPartyMembers={(partyMembers ?? []) as unknown as MapTravelPartyMember[]}
      />
    </main>
  )
}
