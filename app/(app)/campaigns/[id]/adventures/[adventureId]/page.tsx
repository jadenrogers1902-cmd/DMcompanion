import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { EmptyState } from '@/components/ui/EmptyState'
import { AdventureBreadcrumbs } from '@/components/adventures/AdventureBreadcrumbs'
import { AdventureSettingsPanel } from '@/components/adventures/AdventureSettingsPanel'
import { ChapterList } from '@/components/adventures/ChapterList'
import { CreateChapterButton } from '@/components/adventures/CreateChapterButton'
import type { Adventure, Chapter } from '@/lib/types/adventure'

interface PageProps {
  params: Promise<{ id: string; adventureId: string }>
}

const ChapterIcon = (
  <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16.5 3.75h-9A2.25 2.25 0 005.25 6v12A2.25 2.25 0 007.5 20.25h9A2.25 2.25 0 0018.75 18V6a2.25 2.25 0 00-2.25-2.25zM8.25 8.25h7.5M8.25 12h7.5M8.25 15.75h4.5"
    />
  </svg>
)

export default async function AdventureDetailPage({ params }: PageProps) {
  const { id, adventureId } = await params
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

  const { data } = await supabase
    .from('adventures')
    .select('*')
    .eq('id', adventureId)
    .eq('campaign_id', id)
    .single()
  if (!data) notFound()
  const adventure = data as Adventure

  const [{ data: chapterRows }, { data: mapRows }] = await Promise.all([
    supabase
      .from('adventure_chapters')
      .select('*')
      .eq('adventure_id', adventureId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase.from('prepared_maps').select('chapter_id').eq('adventure_id', adventureId),
  ])
  const chapters = (chapterRows ?? []) as Chapter[]
  const sceneCounts: Record<string, number> = {}
  ;(mapRows ?? []).forEach((row) => {
    sceneCounts[row.chapter_id] = (sceneCounts[row.chapter_id] ?? 0) + 1
  })

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 lg:px-8">
      <AdventureBreadcrumbs
        crumbs={[
          { label: 'Adventure Maker', href: `/campaigns/${id}/adventures` },
          { label: adventure.title },
        ]}
      />

      <div className="mb-8">
        <AdventureSettingsPanel adventure={adventure} />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-100">Chapters</h2>
          {chapters.length > 0 && (
            <CreateChapterButton campaignId={id} adventureId={adventureId} />
          )}
        </div>
        {chapters.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
            <EmptyState
              icon={ChapterIcon}
              title="No chapters yet"
              description="Chapters break your adventure into scenes — a session, a dungeon, a key encounter. Each chapter will stage its own maps and notes."
              action={<CreateChapterButton campaignId={id} adventureId={adventureId} size="md" />}
            />
          </div>
        ) : (
          <ChapterList
            campaignId={id}
            adventureId={adventureId}
            chapters={chapters}
            sceneCounts={sceneCounts}
          />
        )}
      </section>
    </div>
  )
}
