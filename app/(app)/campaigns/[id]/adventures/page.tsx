import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { CreateAdventureButton } from '@/components/adventures/CreateAdventureButton'
import {
  adventureStatusBadgeVariant,
  adventureStatusLabel,
} from '@/components/adventures/adventure-status'
import type { Adventure } from '@/lib/types/adventure'

interface PageProps {
  params: Promise<{ id: string }>
}

const AdventureIcon = (
  <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
    />
  </svg>
)

function lastEdited(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default async function AdventuresPage({ params }: PageProps) {
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
  // Adventure Maker is DM prep space — players never see prepared content.
  if (membership.role !== 'dm') redirect(`/campaigns/${id}`)

  const [{ data }, { data: chapterRows }] = await Promise.all([
    supabase
      .from('adventures')
      .select('*')
      .eq('campaign_id', id)
      .order('updated_at', { ascending: false }),
    supabase.from('adventure_chapters').select('adventure_id').eq('campaign_id', id),
  ])
  const adventures = (data ?? []) as Adventure[]
  const chapterCounts: Record<string, number> = {}
  ;(chapterRows ?? []).forEach((row) => {
    chapterCounts[row.adventure_id] = (chapterCounts[row.adventure_id] ?? 0) + 1
  })

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
      <div className="mb-8">
        <Link
          href={`/campaigns/${id}`}
          className="text-sm text-zinc-500 hover:text-zinc-300 flex items-center gap-1.5 mb-4"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          {campaign.name}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-zinc-100">Adventure Maker</h1>
              <Badge variant="dm">DM</Badge>
            </div>
            <p className="text-sm text-zinc-500 mt-1">
              Prep adventures, chapters, maps, and encounters before the session — then run them
              on the Live Map.
            </p>
          </div>
          {adventures.length > 0 && <CreateAdventureButton campaignId={id} />}
        </div>
      </div>

      {adventures.length === 0 ? (
        <EmptyState
          icon={AdventureIcon}
          title="No adventures yet"
          description="Adventures are your prep workspaces — stage maps, chapters, encounters, and notes here before game night."
          action={<CreateAdventureButton campaignId={id} size="md" />}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {adventures.map((adventure) => (
            <Link key={adventure.id} href={`/campaigns/${id}/adventures/${adventure.id}`}>
              <div className="flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-zinc-600">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-zinc-100">{adventure.title}</h3>
                  <Badge variant={adventureStatusBadgeVariant(adventure.status)}>
                    {adventureStatusLabel(adventure.status)}
                  </Badge>
                </div>
                <p className="mt-1.5 line-clamp-2 text-sm text-zinc-500">
                  {adventure.description || 'No description yet.'}
                </p>
                <div className="mt-auto flex items-center gap-3 pt-3 text-xs text-zinc-600">
                  <span>
                    {chapterCounts[adventure.id] ?? 0}{' '}
                    {(chapterCounts[adventure.id] ?? 0) === 1 ? 'chapter' : 'chapters'}
                  </span>
                  <span aria-hidden>·</span>
                  <span>Edited {lastEdited(adventure.updated_at)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
