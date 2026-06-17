import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdventureBreadcrumbs } from '@/components/adventures/AdventureBreadcrumbs'
import { PreparedMapEditor } from '@/components/adventures/PreparedMapEditor'
import { PreparedMapDetailCard } from '@/components/adventures/PreparedMapDetailCard'
import { fetchCampaignPlayers } from '@/lib/actions/codex'
import type { Adventure, Chapter, PreparedMap } from '@/lib/types/adventure'
import type { CampaignDoc, CampaignDocLink } from '@/lib/types/database'

interface PageProps {
  params: Promise<{ id: string; adventureId: string; chapterId: string; preparedMapId: string }>
  searchParams: Promise<{ edit?: string }>
}

export default async function PreparedMapEditorPage({ params, searchParams }: PageProps) {
  const { id, adventureId, chapterId, preparedMapId } = await params
  const { edit } = await searchParams
  const editMode = edit === '1'
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
  // DM prep space only.
  if (membership.role !== 'dm') redirect(`/campaigns/${id}`)

  const [
    { data: adventureRow },
    { data: chapterRow },
    { data: mapRow },
    { data: codexDocs },
    { data: codexLinks },
  ] = await Promise.all([
    supabase.from('adventures').select('*').eq('id', adventureId).eq('campaign_id', id).single(),
    supabase
      .from('adventure_chapters')
      .select('*')
      .eq('id', chapterId)
      .eq('adventure_id', adventureId)
      .single(),
    supabase
      .from('prepared_maps')
      .select('*')
      .eq('id', preparedMapId)
      .eq('chapter_id', chapterId)
      .single(),
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
  ])
  if (!adventureRow || !chapterRow || !mapRow) notFound()
  const players = await fetchCampaignPlayers(id)
  const adventure = adventureRow as Adventure
  const chapter = chapterRow as Chapter
  const preparedMap = mapRow as unknown as PreparedMap

  const breadcrumbs = (
    <AdventureBreadcrumbs
      crumbs={[
        { label: 'Adventure Maker', href: `/campaigns/${id}/adventures` },
        { label: adventure.title, href: `/campaigns/${id}/adventures/${adventureId}` },
        {
          label: chapter.title,
          href: `/campaigns/${id}/adventures/${adventureId}/chapters/${chapterId}`,
        },
        { label: preparedMap.title },
      ]}
    />
  )

  // Default view: the Notion-style map detail card. The editor opens behind the
  // "Edit Map and Tokens" pill (?edit=1).
  if (!editMode) {
    const { data: preparedMapRows } = await supabase
      .from('prepared_maps')
      .select('id, adventure_id, chapter_id, title')
      .eq('campaign_id', id)

    return (
      <div className="mx-auto w-full max-w-[1100px] px-4 py-5 sm:px-6 lg:px-8">
        {breadcrumbs}
        <PreparedMapDetailCard
          campaignId={id}
          adventureId={adventureId}
          chapterId={chapterId}
          map={preparedMap}
          codexDocs={(codexDocs ?? []) as CampaignDoc[]}
          codexLinks={(codexLinks ?? []) as CampaignDocLink[]}
          players={players}
          preparedMaps={(preparedMapRows ?? []) as { id: string; adventure_id: string; chapter_id: string; title: string }[]}
        />
      </div>
    )
  }

  let imageUrl: string | null = null
  if (preparedMap.storage_path) {
    const { data: signed } = await supabase.storage
      .from('maps')
      .createSignedUrl(preparedMap.storage_path, 3600)
    imageUrl = signed?.signedUrl ?? null
  }

  // All prepared maps in the campaign — transport tokens link to these. Resolve
  // adventure/chapter titles so the destination picker can group them.
  const [{ data: destMapRows }, { data: adventureRows }, { data: chapterRows }] = await Promise.all([
    supabase
      .from('prepared_maps')
      .select('id, title, adventure_id, chapter_id')
      .eq('campaign_id', id)
      .order('title', { ascending: true }),
    supabase.from('adventures').select('id, title').eq('campaign_id', id),
    supabase.from('adventure_chapters').select('id, title').eq('campaign_id', id),
  ])
  const adventureTitleById = new Map((adventureRows ?? []).map((row) => [row.id, row.title]))
  const chapterTitleById = new Map((chapterRows ?? []).map((row) => [row.id, row.title]))
  const destinationMaps = (destMapRows ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    adventure_id: row.adventure_id as string,
    chapter_id: row.chapter_id as string,
    adventure_title: adventureTitleById.get(row.adventure_id) ?? null,
    chapter_title: chapterTitleById.get(row.chapter_id) ?? null,
  }))

  return (
    <div className="w-full px-3 py-4 sm:px-4 lg:px-5">
      {breadcrumbs}
      <Link
        href={`/campaigns/${id}/adventures/${adventureId}/chapters/${chapterId}/maps/${preparedMapId}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-amber-400 hover:text-amber-300"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Back to map card
      </Link>
      <PreparedMapEditor
        map={preparedMap}
        imageUrl={imageUrl}
        adventureTitle={adventure.title}
        chapterTitle={chapter.title}
        codexDocs={(codexDocs ?? []) as CampaignDoc[]}
        codexLinks={(codexLinks ?? []) as CampaignDocLink[]}
        players={players}
        destinationMaps={destinationMaps}
      />
    </div>
  )
}
