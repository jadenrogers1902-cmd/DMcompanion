import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { StoryWorkspace } from '@/components/story/StoryWorkspace'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import type {
  GameMap,
  Handout,
  HandoutWithUrl,
  Npc,
  PlayerStorySnapshot,
  Quest,
  SessionRecap,
  StoryLocation,
  StoryNote,
} from '@/lib/types/database'

interface PageProps {
  params: Promise<{ id: string }>
}

async function withHandoutUrls(handouts: Handout[]) {
  if (handouts.length === 0) return []
  const supabase = await createClient()
  const { data } = await supabase.storage
    .from('handouts')
    .createSignedUrls(handouts.map((handout) => handout.storage_path), 60 * 5)
  const urls = new Map((data ?? []).map((item) => [item.path, item.signedUrl ?? null]))

  return handouts.map((handout) => ({
    ...handout,
    signed_url: urls.get(handout.storage_path) ?? null,
  }))
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

  const playerStoryResult = !isDM
    ? await supabase.rpc('get_player_story_snapshot', { p_campaign_id: id })
    : null
  const playerStory = (playerStoryResult?.data ?? null) as PlayerStorySnapshot | null

  if (!isDM && playerStoryResult?.error) {
    console.error('[story] player-safe snapshot failed', playerStoryResult.error.message)
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link href={`/campaigns/${id}`} className="mb-4 flex items-center gap-1.5 text-sm text-faint hover:text-content">
          {campaign.name}
        </Link>
        <EmptyState
          title="Journal temporarily unavailable"
          description="The protected campaign journal could not be loaded. Refresh to try again."
        />
      </div>
    )
  }

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
      : Promise.resolve({ data: playerStory?.quests ?? [] }),
    isDM
      ? supabase.from('npcs').select('*').eq('campaign_id', id).order('updated_at', { ascending: false })
      : Promise.resolve({ data: playerStory?.npcs ?? [] }),
    isDM
      ? supabase.from('locations').select('*').eq('campaign_id', id).order('updated_at', { ascending: false })
      : Promise.resolve({ data: playerStory?.locations ?? [] }),
    isDM
      ? supabase.from('notes').select('*').eq('campaign_id', id).order('updated_at', { ascending: false })
      : Promise.resolve({ data: playerStory?.notes ?? [] }),
    isDM
      ? supabase.from('handouts').select('*').eq('campaign_id', id).order('updated_at', { ascending: false })
      : Promise.resolve({ data: playerStory?.handouts ?? [] }),
    isDM
      ? supabase.from('session_recaps').select('*').eq('campaign_id', id).order('session_date', { ascending: false })
      : Promise.resolve({ data: playerStory?.recaps ?? [] }),
    isDM
      ? supabase.from('maps').select('id, name').eq('campaign_id', id).order('name', { ascending: true })
      : Promise.resolve({ data: [] }),
  ])

  const handouts = await withHandoutUrls((handoutsRaw ?? []) as Handout[])

  return (
    <div className={isDM ? 'mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8' : 'max-w-7xl mx-auto px-4 sm:px-6 py-6'}>
      <Link
        href={`/campaigns/${id}`}
        className="text-sm text-faint hover:text-content flex items-center gap-1.5 mb-4"
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
