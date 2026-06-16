import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { DMLinkedCodexDocsPanel } from '@/components/codex/CodexLinkedDocsPanel'
import { campaignDocTypeLabel } from '@/lib/codex/options'
import type { CodexPlayer } from '@/lib/actions/codex'
import type { CampaignDoc, CampaignDocLink } from '@/lib/types/database'
import type { PreparedMap } from '@/lib/types/adventure'

type PreparedMapRef = { id: string; adventure_id: string; chapter_id: string; title: string }

interface PreparedMapDetailCardProps {
  campaignId: string
  adventureId: string
  chapterId: string
  map: PreparedMap
  codexDocs: CampaignDoc[]
  codexLinks: CampaignDocLink[]
  players: CodexPlayer[]
  preparedMaps: PreparedMapRef[]
}

function snippet(value: string | null | undefined, max = 220) {
  const v = value?.trim()
  if (!v) return null
  return v.length > max ? `${v.slice(0, max)}…` : v
}

export function PreparedMapDetailCard({
  campaignId,
  adventureId,
  chapterId,
  map,
  codexDocs,
  codexLinks,
  players,
  preparedMaps,
}: PreparedMapDetailCardProps) {
  const docById = new Map(codexDocs.map((d) => [d.id, d]))
  const preparedMapById = new Map(preparedMaps.map((m) => [m.id, m]))

  // Codex entries tied directly to this map.
  const mapDocIds = new Set(
    codexLinks
      .filter((l) => l.live_object_type === 'prepared_map' && l.live_object_id === map.id)
      .map((l) => l.source_doc_id),
  )

  // docId -> the prepared map linked to that doc (for "child map" room navigation).
  const childMapIdByDocId = new Map<string, string>()
  for (const l of codexLinks) {
    if (l.live_object_type === 'prepared_map' && l.live_object_id) {
      childMapIdByDocId.set(l.source_doc_id, l.live_object_id)
    }
  }

  // Sub-locations: sub_location docs related (doc↔doc) to any doc tied to this map.
  const subLocationIds = new Set<string>()
  for (const l of codexLinks) {
    if (!l.target_doc_id) continue
    const a = l.source_doc_id
    const b = l.target_doc_id
    const aLinked = mapDocIds.has(a)
    const bLinked = mapDocIds.has(b)
    if (aLinked && docById.get(b)?.doc_type === 'sub_location') subLocationIds.add(b)
    if (bLinked && docById.get(a)?.doc_type === 'sub_location') subLocationIds.add(a)
  }
  const subLocations = Array.from(subLocationIds)
    .map((idValue) => docById.get(idValue))
    .filter((d): d is CampaignDoc => Boolean(d))

  const editHref = `/campaigns/${campaignId}/adventures/${adventureId}/chapters/${chapterId}/maps/${map.id}?edit=1`

  return (
    <div className="flex flex-col gap-5">
      {/* Header + Edit pill */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="dm">Map</Badge>
            <Badge variant="default">{map.tokens.length} token{map.tokens.length === 1 ? '' : 's'}</Badge>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-zinc-100">{map.title}</h1>
          {map.description && <p className="mt-1 text-sm text-zinc-500">{map.description}</p>}
        </div>
        <Link
          href={editHref}
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/20"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
          </svg>
          Edit Map and Tokens
        </Link>
      </div>

      {/* Tie Notion/Codex entries to this map (attach / reveal / open). */}
      <DMLinkedCodexDocsPanel
        campaignId={campaignId}
        objectType="prepared_map"
        objectId={map.id}
        objectLabel={map.title}
        docs={codexDocs}
        links={codexLinks}
        players={players}
      />

      {/* Sub-locations (rooms) within this location. */}
      <Card>
        <CardHeader>
          <CardTitle>Sub-locations</CardTitle>
        </CardHeader>
        {subLocations.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No sub-locations yet. Tie a Location entry above, then link its sub-locations
            in the Adventure Codex — they appear here automatically.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {subLocations.map((sub) => {
              const childMapId = childMapIdByDocId.get(sub.id)
              const childMap = childMapId ? preparedMapById.get(childMapId) : undefined
              return (
                <div key={sub.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-semibold text-zinc-100">{sub.title}</p>
                    <Badge variant="dm">{campaignDocTypeLabel(sub.doc_type)}</Badge>
                  </div>
                  {snippet(sub.dm_summary ?? sub.player_summary) && (
                    <p className="mt-2 whitespace-pre-wrap text-xs text-zinc-400">
                      {snippet(sub.dm_summary ?? sub.player_summary)}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={`/campaigns/${campaignId}/codex?doc=${sub.id}`}
                      className="rounded border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-200 hover:border-amber-500/50"
                    >
                      Open Codex
                    </Link>
                    {childMap && (
                      <Link
                        href={`/campaigns/${campaignId}/adventures/${childMap.adventure_id}/chapters/${childMap.chapter_id}/maps/${childMap.id}`}
                        className="rounded border border-zinc-700 px-2.5 py-1 text-[11px] text-amber-300 hover:border-amber-500/50"
                      >
                        Open room map
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Tokens placed on this map, each linking back to its Notion/Codex entry. */}
      <Card>
        <CardHeader>
          <CardTitle>Tokens on this map</CardTitle>
        </CardHeader>
        {map.tokens.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No tokens placed yet. Use <span className="text-zinc-300">Edit Map and Tokens</span> to add them.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {map.tokens.map((token) => {
              const doc = token.linked_campaign_doc_id ? docById.get(token.linked_campaign_doc_id) : null
              return (
                <div key={token.id} className="flex items-start justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <span className="text-base leading-none">{token.icon || '•'}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-zinc-100">{token.name || 'Unnamed token'}</p>
                      <p className="mt-0.5 text-[11px] text-zinc-500">
                        {String(token.token_type)}
                        {doc ? ` · linked to ${campaignDocTypeLabel(doc.doc_type)}` : ' · not linked'}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    {doc && (
                      <Link
                        href={`/campaigns/${campaignId}/codex?doc=${doc.id}`}
                        className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-200 hover:border-amber-500/50"
                      >
                        Open Codex
                      </Link>
                    )}
                    {doc?.source_url && (
                      <a
                        href={doc.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-200 hover:border-amber-500/50"
                      >
                        Open in Notion
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
