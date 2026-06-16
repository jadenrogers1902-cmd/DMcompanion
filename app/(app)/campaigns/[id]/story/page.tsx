import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { StoryWorkspace } from '@/components/story/StoryWorkspace'
import { Badge } from '@/components/ui/Badge'
import type {
  GameMap,
  Handout,
  HandoutWithUrl,
  Npc,
  Quest,
  SessionRecap,
  StoryLocation,
  StoryNote,
} from '@/lib/types/database'

interface PageProps {
  params: Promise<{ id: string }>
}

async function withHandoutUrls(handouts: Handout[]) {
  const supabase = await createClient()
  const signed = await Promise.all(
    handouts.map(async (handout) => {
      const { data } = await supabase.storage
        .from('handouts')
        .createSignedUrl(handout.storage_path, 60 * 30)

      return {
        ...handout,
        signed_url: data?.signedUrl ?? null,
      }
    }),
  )

  return signed
}

export default async function StoryPage({ params }: PageProps) {
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

  const [
    { data: questsRaw },
    { data: npcsRaw },
    { data: locationsRaw },
    { data: notesRaw },
    { data: handoutsRaw },
    { data: recapsRaw },
    { data: mapsRaw },
  ] = await Promise.all([
    isDM
      ? supabase.from('quests').select('*').eq('campaign_id', id).order('updated_at', { ascending: false })
      : supabase
          .from('quests')
          .select('id,campaign_id,title,status,player_visible_description,rewards,visible_to_players,created_at,updated_at')
          .eq('campaign_id', id)
          .eq('visible_to_players', true)
          .order('updated_at', { ascending: false }),
    isDM
      ? supabase.from('npcs').select('*').eq('campaign_id', id).order('updated_at', { ascending: false })
      : supabase
          .from('npcs')
          .select('id,campaign_id,name,role,location_id,relationship_to_party,player_visible_notes,portrait_url,linked_token_id,visible_to_players,created_at,updated_at')
          .eq('campaign_id', id)
          .eq('visible_to_players', true)
          .order('updated_at', { ascending: false }),
    isDM
      ? supabase.from('locations').select('*').eq('campaign_id', id).order('updated_at', { ascending: false })
      : supabase
          .from('locations')
          .select('id,campaign_id,name,description,player_visible_notes,map_id,visible_to_players,created_at,updated_at')
          .eq('campaign_id', id)
          .eq('visible_to_players', true)
          .order('updated_at', { ascending: false }),
    isDM
      ? supabase.from('notes').select('*').eq('campaign_id', id).order('updated_at', { ascending: false })
      : supabase
          .from('notes')
          .select('id,campaign_id,title,content,visibility,quest_id,npc_id,location_id,map_id,encounter_id,created_by,created_at,updated_at')
          .eq('campaign_id', id)
          .eq('visibility', 'shared')
          .order('updated_at', { ascending: false }),
    isDM
      ? supabase.from('handouts').select('*').eq('campaign_id', id).order('updated_at', { ascending: false })
      : supabase
          .from('handouts')
          .select('*')
          .eq('campaign_id', id)
          .eq('is_revealed', true)
          .order('updated_at', { ascending: false }),
    isDM
      ? supabase.from('session_recaps').select('*').eq('campaign_id', id).order('session_date', { ascending: false })
      : supabase
          .from('session_recaps')
          .select('id,campaign_id,session_title,session_date,what_happened,important_npcs,locations_visited,loot_gained,quest_updates,open_threads,next_session_start,visible_to_players,created_at,updated_at')
          .eq('campaign_id', id)
          .eq('visible_to_players', true)
          .order('session_date', { ascending: false }),
    isDM
      ? supabase.from('maps').select('id, name').eq('campaign_id', id).order('name', { ascending: true })
      : Promise.resolve({ data: [] }),
  ])

  const handouts = await withHandoutUrls((handoutsRaw ?? []) as Handout[])

  return (
    <div className={isDM ? 'mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8' : 'max-w-7xl mx-auto px-4 sm:px-6 py-6'}>
      <Link
        href={`/campaigns/${id}`}
        className="text-sm text-zinc-500 hover:text-zinc-300 flex items-center gap-1.5 mb-4"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        {campaign.name}
      </Link>
      <div className="mb-5">
        <Badge variant={isDM ? 'dm' : 'player'}>{isDM ? 'DM' : 'Player'}</Badge>
      </div>
      <StoryWorkspace
        campaignId={id}
        isDM={isDM}
        quests={(questsRaw ?? []) as Quest[]}
        npcs={(npcsRaw ?? []) as Npc[]}
        locations={(locationsRaw ?? []) as StoryLocation[]}
        notes={(notesRaw ?? []) as StoryNote[]}
        handouts={handouts as HandoutWithUrl[]}
        recaps={(recapsRaw ?? []) as SessionRecap[]}
        maps={(mapsRaw ?? []) as Pick<GameMap, 'id' | 'name'>[]}
      />
    </div>
  )
}
