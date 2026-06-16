import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AdventureCodexWorkspace, type LiveObjectOption } from '@/components/codex/AdventureCodexWorkspace'
import { Badge } from '@/components/ui/Badge'
import { createClient } from '@/lib/supabase/server'
import { fetchCampaignPlayers } from '@/lib/actions/codex'
import type {
  CampaignDoc,
  CampaignDocLink,
  NotionSyncMapping,
  PlayerVisibleCampaignDoc,
} from '@/lib/types/database'
import type { Adventure } from '@/lib/types/adventure'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AdventureCodexPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: campaign }, { data: membership }] = await Promise.all([
    supabase.from('campaigns').select('id, name').eq('id', id).single(),
    supabase
      .from('campaign_members')
      .select('role')
      .eq('campaign_id', id)
      .eq('user_id', user.id)
      .single(),
  ])

  if (!campaign) notFound()
  if (!membership) redirect('/dashboard')

  const isDM = membership.role === 'dm'

  const [{ data: docsRaw }, { data: linksRaw }, { data: playerDocsRaw }, { data: mappingsRaw }, { data: adventuresRaw }] =
    await Promise.all([
      isDM
        ? supabase
            .from('campaign_docs')
            .select('*')
            .eq('campaign_id', id)
            .order('updated_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      isDM
        ? supabase
            .from('campaign_doc_links')
            .select('*')
            .eq('campaign_id', id)
            .order('updated_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      !isDM
        ? supabase.rpc('get_player_visible_campaign_docs', { p_campaign_id: id })
        : Promise.resolve({ data: [] }),
      isDM
        ? supabase
            .from('notion_sync_mappings')
            .select('*')
            .eq('campaign_id', id)
            .order('updated_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      isDM
        ? supabase
            .from('adventures')
            .select('id, title, status')
            .eq('campaign_id', id)
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: [] }),
    ])

  // Live objects (maps + tokens) the DM can link Codex records to.
  let liveObjects: LiveObjectOption[] = []
  if (isDM) {
    const [{ data: maps }, { data: tokens }] = await Promise.all([
      supabase.from('maps').select('id, name').eq('campaign_id', id).order('name', { ascending: true }),
      supabase
        .from('tokens')
        .select('id, name, token_type, map_id')
        .eq('campaign_id', id)
        .order('name', { ascending: true }),
    ])
    const mapNameById = new Map((maps ?? []).map((m) => [m.id as string, m.name as string]))
    liveObjects = [
      ...(maps ?? []).map((m) => ({ type: 'map' as const, id: m.id as string, label: (m.name as string) || 'Map' })),
      ...(tokens ?? []).map((t) => ({
        type: 'token' as const,
        id: t.id as string,
        label: (t.name as string) || (t.token_type as string) || 'Token',
        mapName: t.map_id ? mapNameById.get(t.map_id as string) ?? null : null,
      })),
    ]
  }

  const players = isDM ? await fetchCampaignPlayers(id) : []

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
      <Link
        href={`/campaigns/${id}`}
        className="mb-4 flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        {campaign.name}
      </Link>
      <div className="mb-5">
        <Badge variant={isDM ? 'dm' : 'player'}>{isDM ? 'DM' : 'Player'}</Badge>
      </div>
      <AdventureCodexWorkspace
        campaignId={id}
        isDM={isDM}
        docs={(docsRaw ?? []) as CampaignDoc[]}
        links={(linksRaw ?? []) as CampaignDocLink[]}
        playerDocs={(playerDocsRaw ?? []) as PlayerVisibleCampaignDoc[]}
        players={players}
        mappings={(mappingsRaw ?? []) as NotionSyncMapping[]}
        adventures={(adventuresRaw ?? []) as Pick<Adventure, 'id' | 'title' | 'status'>[]}
        liveObjects={liveObjects}
      />
    </div>
  )
}

