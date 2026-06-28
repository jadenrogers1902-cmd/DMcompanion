import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fetchCampaignPlayers } from '@/lib/actions/codex'
import { MapEditor } from '@/components/maps/MapEditor'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  buildPrivateMapImageUrl,
  LIVE_MAP_COLUMNS,
  MAP_REVEALED_AREA_COLUMNS,
  MAP_ROOM_REGION_COLUMNS,
  MAP_TRAVEL_PARTY_COLUMNS,
  MAP_TRAVEL_PARTY_MEMBER_COLUMNS,
} from '@/lib/maps/live-map'
import type {
  CampaignDoc,
  CampaignDocLink,
  Character,
  GameMap,
  MapRevealedArea,
  MapRoomRegion,
  MapTravelParty,
  MapTravelPartyMember,
  Token,
} from '@/lib/types/database'

interface PageProps {
  params: Promise<{ id: string; mapId: string }>
}

export default async function MapEditorPage({ params }: PageProps) {
  const { id, mapId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // DM only — players use /campaigns/[id]/live-map (active map view)
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
    console.info('[live-map] dm route using stable map image url', {
      campaignId: id,
      mapId: map.id,
      updatedAt: map.updated_at,
    })
  }

  const [
    { data: tokens },
    { data: characters },
    { data: dmNoteRows },
    { data: areas },
    { data: rooms },
    { data: codexDocs },
    { data: codexLinks },
    { data: travelParties },
    { data: travelPartyMembers },
  ] =
    await Promise.all([
      supabase
        .from('tokens')
        .select('*')
        .eq('map_id', mapId)
        .order('created_at', { ascending: true }),
      supabase
        .from('characters')
        .select('id, name, speed')
        .eq('campaign_id', id)
        .order('name', { ascending: true }),
      supabase
        .from('token_dm_notes')
        .select('token_id, content')
        .eq('campaign_id', id),
      supabase
        .from('map_revealed_areas')
        .select(MAP_REVEALED_AREA_COLUMNS)
        .eq('map_id', mapId)
        .order('created_at', { ascending: true }),
      supabase
        .from('map_room_regions')
        .select(MAP_ROOM_REGION_COLUMNS)
        .eq('map_id', mapId)
        .order('created_at', { ascending: true }),
      supabase
        .from('campaign_docs')
        .select('*')
        .eq('campaign_id', id)
        .order('title', { ascending: true }),
      supabase
        .from('campaign_doc_links')
        .select('*')
        .eq('campaign_id', id)
        .order('updated_at', { ascending: false }),
      supabase
        .from('map_travel_parties')
        .select(MAP_TRAVEL_PARTY_COLUMNS)
        .eq('map_id', mapId)
        .order('updated_at', { ascending: false }),
      supabase
        .from('map_travel_party_members')
        .select(MAP_TRAVEL_PARTY_MEMBER_COLUMNS)
        .eq('map_id', mapId)
        .order('created_at', { ascending: true }),
    ])

  // Seed the token "!" alert badges: target tokens with an active action request.
  const { data: activeIntents } = await supabase
    .from('action_intents')
    .select('target_token_id, status')
    .eq('campaign_id', id)
    .eq('map_id', mapId)
    .in('status', [
      'pending',
      'needs_roll',
      'approved',
      'approved_waiting_for_roll',
      'rolling',
      'rolled_waiting_for_dm',
      'resolving',
    ])
  const initialAlertTokenIds = Array.from(
    new Set((activeIntents ?? []).map((row) => row.target_token_id).filter(Boolean) as string[]),
  )

  const players = await fetchCampaignPlayers(id)

  const initialDmNotes: Record<string, string> = {}
  ;(dmNoteRows ?? []).forEach((r) => {
    if (r.content) initialDmNotes[r.token_id] = r.content
  })

  // If this live map was deployed from Adventure Maker, surface a DM-only link
  // back to the prep source (which holds the DM-only pinned notes & links). The
  // prep tables are DM-only under RLS, so this only resolves for the DM.
  let prepSource: { adventure_id: string; chapter_id: string; title: string } | null = null
  if (map.source_prepared_map_id) {
    const { data: prep } = await supabase
      .from('prepared_maps')
      .select('adventure_id, chapter_id, title')
      .eq('id', map.source_prepared_map_id)
      .maybeSingle()
    if (prep) prepSource = prep
  }
  const editMapHref =
    prepSource && map.source_prepared_map_id
      ? `/campaigns/${id}/adventures/${prepSource.adventure_id}/chapters/${prepSource.chapter_id}/maps/${map.source_prepared_map_id}`
      : null

  const backLink = (
    <Link
      href={`/campaigns/${id}/live-map`}
      className="text-sm text-zinc-500 hover:text-zinc-300 flex items-center gap-1.5 mb-4"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
      </svg>
      Back to Live Map
    </Link>
  )

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden px-3 py-3 sm:px-4 lg:px-5">
      <div className="shrink-0">
        {backLink}
        {prepSource && (
          <Link
            href={editMapHref ?? '#'}
            className="-mt-2 mb-4 flex items-center gap-1.5 text-xs text-amber-400/80 hover:text-amber-300"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            Prep source: {prepSource.title} (DM notes &amp; links)
          </Link>
        )}
      </div>
      {stableImageUrl ? (
        <MapEditor
          campaignId={id}
          map={map}
          imageUrl={stableImageUrl}
          initialTokens={(tokens ?? []) as Token[]}
          initialDmNotes={initialDmNotes}
          initialAreas={(areas ?? []) as unknown as MapRevealedArea[]}
          initialRooms={(rooms ?? []) as unknown as MapRoomRegion[]}
          characters={(characters ?? []) as Pick<Character, 'id' | 'name' | 'speed'>[]}
          initialAlertTokenIds={initialAlertTokenIds}
          codexDocs={(codexDocs ?? []) as CampaignDoc[]}
          codexLinks={(codexLinks ?? []) as CampaignDocLink[]}
          players={players}
          initialTravelParties={(travelParties ?? []) as unknown as MapTravelParty[]}
          initialTravelPartyMembers={(travelPartyMembers ?? []) as unknown as MapTravelPartyMember[]}
          editMapHref={editMapHref}
        />
      ) : (
        <EmptyState
          title="Map image unavailable"
          description="The map file could not be loaded from storage."
        />
      )}
    </div>
  )
}
