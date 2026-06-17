import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { PlayerMapView } from '@/components/maps/PlayerMapView'
import { DMUtilityPanel } from '@/components/nav/DMUtilityPanel'
import type {
  CampaignDocLinkPublication,
  GameMap,
  MapRevealedArea,
  MapTransportConfirmation,
  MapTravelParty,
  MapTravelPartyMember,
  PlayerToken,
  PlayerVisibleCampaignDoc,
  Profile,
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
      .select('*')
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

    const [
      { data: signed },
      { data: tokens },
      { data: characters },
      { data: areas },
      { data: members },
      { data: playerCodexDocs },
      { data: playerCodexLinks },
      { data: travelParties },
      { data: travelPartyMembers },
      { data: transportConfirmations },
    ] = await Promise.all([
      supabase.storage.from('maps').createSignedUrl(activeMap.storage_path, 3600),
      // tokens holds no DM-only columns now; RLS returns only visible rows.
      supabase.from('tokens').select('*').eq('map_id', activeMap.id),
      supabase.from('characters').select('id, name, speed, user_id').eq('campaign_id', id).eq('user_id', user.id),
      // RLS returns only player-visible areas on the active map.
      supabase.from('map_revealed_areas').select('*').eq('map_id', activeMap.id),
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
        .select('*')
        .eq('map_id', activeMap.id)
        .order('updated_at', { ascending: false }),
      supabase
        .from('map_travel_party_members')
        .select('*')
        .eq('map_id', activeMap.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('map_transport_confirmations')
        .select('*')
        .eq('map_id', activeMap.id),
    ])

    const characterSpeeds: Record<string, number> = {}
    ;(characters ?? []).forEach((c) => {
      characterSpeeds[c.id] = c.speed
    })

    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {backLink(id, campaign.name)}
        <p className="text-xs uppercase tracking-wide text-zinc-600 mb-1">Adventure</p>
        <h1 className="text-2xl font-bold text-zinc-100 mb-4">{activeMap.name}</h1>
        {signed?.signedUrl ? (
          <PlayerMapView
            campaignId={id}
            map={activeMap}
            imageUrl={signed.signedUrl}
            initialTokens={(tokens ?? []) as PlayerToken[]}
            initialAreas={(areas ?? []) as MapRevealedArea[]}
            currentUserId={user.id}
            characterSpeeds={characterSpeeds}
            myCharacters={(characters ?? []).map((c) => ({ id: c.id, name: c.name }))}
            partyMembers={(members ?? []).map((member) => ({
              userId: member.user_id,
              role: member.role,
              profile: (Array.isArray(member.profiles) ? member.profiles[0] : member.profiles) as Profile | null,
            }))}
            playerCodexDocs={(playerCodexDocs ?? []) as PlayerVisibleCampaignDoc[]}
            playerCodexLinks={(playerCodexLinks ?? []) as CampaignDocLinkPublication[]}
            initialTravelParties={(travelParties ?? []) as MapTravelParty[]}
            initialTravelPartyMembers={(travelPartyMembers ?? []) as MapTravelPartyMember[]}
            initialTransportConfirmations={(transportConfirmations ?? []) as MapTransportConfirmation[]}
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
            <Link key={m.id} href={`/campaigns/${id}/live-map/${m.id}`}>
              <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-colors h-full">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-zinc-100">{m.name}</h3>
                  {m.is_active && <Badge variant="success">Active</Badge>}
                </div>
                <p className="text-xs text-zinc-600 mt-2">
                  {m.width} × {m.height}px · 1 square = {m.grid_scale_feet}ft
                </p>
              </div>
            </Link>
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
