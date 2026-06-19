import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { AdventureBreadcrumbs } from '@/components/adventures/AdventureBreadcrumbs'
import { ChapterSettingsPanel } from '@/components/adventures/ChapterSettingsPanel'
import { ChapterLiveButton } from '@/components/adventures/ChapterLiveButton'
import { CreatePreparedMapButton } from '@/components/adventures/CreatePreparedMapButton'
import {
  adventureStatusBadgeVariant,
  adventureStatusLabel,
} from '@/components/adventures/adventure-status'
import type { Adventure, Chapter, PreparedMap } from '@/lib/types/adventure'

interface PageProps {
  params: Promise<{ id: string; adventureId: string; chapterId: string }>
}

const SceneIcon = (
  <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"
    />
  </svg>
)

export default async function ChapterWorkspacePage({ params }: PageProps) {
  const { id, adventureId, chapterId } = await params
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

  const [{ data: adventureRow }, { data: chapterRow }] = await Promise.all([
    supabase
      .from('adventures')
      .select('*')
      .eq('id', adventureId)
      .eq('campaign_id', id)
      .single(),
    supabase
      .from('adventure_chapters')
      .select('*')
      .eq('id', chapterId)
      .eq('adventure_id', adventureId)
      .single(),
  ])
  if (!adventureRow || !chapterRow) notFound()
  const adventure = adventureRow as Adventure
  const chapter = chapterRow as Chapter

  const { data: mapRows } = await supabase
    .from('prepared_maps')
    .select('*')
    .eq('chapter_id', chapterId)
    .order('updated_at', { ascending: false })
  const preparedMaps = (mapRows ?? []) as unknown as PreparedMap[]
  const hubMap = preparedMaps.find((map) => map.is_hub) ?? null

  // Signed thumbnails for cards that have an image.
  const thumbnails: Record<string, string> = {}
  await Promise.all(
    preparedMaps
      .filter((map) => map.storage_path)
      .map(async (map) => {
        const { data: signed } = await supabase.storage
          .from('maps')
          .createSignedUrl(map.storage_path!, 3600)
        if (signed?.signedUrl) thumbnails[map.id] = signed.signedUrl
      }),
  )

  const lastEdited = (value: string) =>
    new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 lg:px-8">
      <AdventureBreadcrumbs
        crumbs={[
          { label: 'Adventure Maker', href: `/campaigns/${id}/adventures` },
          { label: adventure.title, href: `/campaigns/${id}/adventures/${adventureId}` },
          { label: chapter.title },
        ]}
      />

      <div className="mb-6">
        <ChapterSettingsPanel chapter={chapter} />
      </div>

      <div className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-100">Play this chapter</h2>
            <p className="mt-1 text-xs text-zinc-500">
              {hubMap
                ? <>Hub map: <span className="text-zinc-300">{hubMap.title}</span>. Opening deploys it as the active map players land on.</>
                : 'Pick one map below as the hub (entry point), then open the chapter for players.'}
            </p>
          </div>
          <ChapterLiveButton
            campaignId={id}
            adventureId={adventureId}
            chapterId={chapterId}
            isLive={Boolean(chapter.is_live)}
            hasHub={Boolean(hubMap)}
            hubHasImage={Boolean(hubMap?.storage_path)}
          />
        </div>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-100">Maps &amp; Scenes</h2>
          {preparedMaps.length > 0 && (
            <CreatePreparedMapButton campaignId={id} adventureId={adventureId} chapterId={chapterId} />
          )}
        </div>
        {preparedMaps.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
            <EmptyState
              icon={SceneIcon}
              title="No maps or scenes yet"
              description="Prepared maps are premade environments — stage the battle map, tokens, and DM notes here, then send them to the Live Map during the session."
              action={
                <CreatePreparedMapButton
                  campaignId={id}
                  adventureId={adventureId}
                  chapterId={chapterId}
                  size="md"
                />
              }
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {preparedMaps.map((map) => {
              const tokenCount = map.tokens?.length ?? 0
              const noteCount = map.notes?.length ?? 0
              return (
                <Link
                  key={map.id}
                  href={`/campaigns/${id}/adventures/${adventureId}/chapters/${chapterId}/maps/${map.id}`}
                >
                  <div className="flex h-full flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 transition-colors hover:border-zinc-600">
                    <div className="h-28 w-full bg-zinc-950">
                      {thumbnails[map.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumbnails[map.id]}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-zinc-700">
                          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-zinc-100">{map.title}</h3>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {map.is_hub && <Badge variant="success">Hub</Badge>}
                          <Badge variant={adventureStatusBadgeVariant(map.status)}>
                            {adventureStatusLabel(map.status)}
                          </Badge>
                        </div>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-zinc-500">
                        {map.description || 'No description yet.'}
                      </p>
                      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-xs text-zinc-600">
                        <span>{tokenCount} {tokenCount === 1 ? 'token' : 'tokens'}</span>
                        <span aria-hidden>·</span>
                        <span>{noteCount} {noteCount === 1 ? 'note' : 'notes'}</span>
                        <span aria-hidden>·</span>
                        <span>Edited {lastEdited(map.updated_at)}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
