import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CenterScreenMapView } from '@/components/maps/CenterScreenMapView'
import { EmptyState } from '@/components/ui/EmptyState'
import { buildPrivateMapImageUrl } from '@/lib/maps/live-map'
import type { PlayerLiveMapSnapshot } from '@/lib/types/database'

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

  const { data: snapshotRaw } = await supabase.rpc('get_player_live_map_snapshot', {
    p_map_id: mapId,
  })
  const snapshot = (snapshotRaw ?? null) as PlayerLiveMapSnapshot | null
  if (!snapshot || snapshot.map.campaign_id !== id) notFound()
  const map = snapshot.map

  const stableImageUrl = buildPrivateMapImageUrl(id, map.id, map.storage_path)
  if (process.env.NODE_ENV !== 'production') {
    console.info('[live-map] center screen using stable map image url', {
      campaignId: id,
      mapId: map.id,
      updatedAt: map.updated_at,
    })
  }

  if (!stableImageUrl) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas p-4">
        <EmptyState title="Map image unavailable" description="The map file could not be loaded from storage." />
      </div>
    )
  }

  return (
    <main className="relative min-h-dvh bg-black">
      <Link
        href={`/campaigns/${id}/live-map/${mapId}`}
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-canvas focus:px-3 focus:py-2 focus:text-sm focus:text-content"
      >
        Back to DM map editor
      </Link>
      <CenterScreenMapView
        key={`${map.id}:${map.updated_at}`}
        campaignId={id}
        map={map}
        imageUrl={stableImageUrl}
        initialTokens={snapshot.tokens}
        initialRevealedAreas={snapshot.areas}
        initialRoomRegions={snapshot.rooms}
        initialWalls={snapshot.walls}
        initialTravelParties={snapshot.travel_parties}
        initialTravelPartyMembers={snapshot.travel_party_members}
      />
    </main>
  )
}
