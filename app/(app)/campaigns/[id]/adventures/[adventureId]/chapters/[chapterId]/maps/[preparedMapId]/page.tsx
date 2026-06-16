import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdventureBreadcrumbs } from '@/components/adventures/AdventureBreadcrumbs'
import { PreparedMapEditor } from '@/components/adventures/PreparedMapEditor'
import { fetchCampaignPlayers } from '@/lib/actions/codex'
import type { Adventure, Chapter, PreparedMap } from '@/lib/types/adventure'
import type { CampaignDoc, CampaignDocLink } from '@/lib/types/database'

interface PageProps {
  params: Promise<{ id: string; adventureId: string; chapterId: string; preparedMapId: string }>
}

export default async function PreparedMapEditorPage({ params }: PageProps) {
  const { id, adventureId, chapterId, preparedMapId } = await params
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

  let imageUrl: string | null = null
  if (preparedMap.storage_path) {
    const { data: signed } = await supabase.storage
      .from('maps')
      .createSignedUrl(preparedMap.storage_path, 3600)
    imageUrl = signed?.signedUrl ?? null
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
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
      <PreparedMapEditor
        map={preparedMap}
        imageUrl={imageUrl}
        adventureTitle={adventure.title}
        chapterTitle={chapter.title}
        codexDocs={(codexDocs ?? []) as CampaignDoc[]}
        codexLinks={(codexLinks ?? []) as CampaignDocLink[]}
        players={players}
      />
    </div>
  )
}
