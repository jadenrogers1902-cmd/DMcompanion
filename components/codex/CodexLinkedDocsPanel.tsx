'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import {
  linkCampaignDocToLiveObject,
  removeCampaignDocLink,
  revealCampaignDocForLiveObject,
} from '@/lib/actions/codex'
import type { CodexPlayer } from '@/lib/actions/codex'
import { CodexRevealControls } from '@/components/codex/CodexRevealControls'
import {
  CAMPAIGN_DOC_RELATION_TYPES,
  campaignDocRelationLabel,
  campaignDocTypeLabel,
} from '@/lib/codex/options'
import type {
  CampaignDoc,
  CampaignDocLink,
  CampaignDocLinkPublication,
  CampaignDocLiveObjectType,
  CampaignDocRelationType,
  PlayerVisibleCampaignDoc,
} from '@/lib/types/database'

type Result = { success?: boolean; error?: string }

function visibilityBadge(value: string) {
  if (value === 'revealed') return <Badge variant="success">Revealed</Badge>
  if (value === 'player_safe') return <Badge variant="player">Player-safe</Badge>
  return <Badge variant="dm">DM only</Badge>
}

function relationForObject(type: CampaignDocLiveObjectType): CampaignDocRelationType {
  if (type === 'token') return 'token_doc'
  if (type === 'object') return 'object_doc'
  if (type === 'map') return 'map_for'
  if (type === 'prepared_map') return 'map_for'
  if (type === 'quest') return 'quest_hook'
  if (type === 'handout') return 'related_to'
  return 'related_to'
}

function defaultLinkVisibility(doc: CampaignDoc) {
  return doc.visibility === 'dm_only' ? 'dm_only' : doc.visibility
}

export function DMLinkedCodexDocsPanel({
  campaignId,
  objectType,
  objectId,
  objectLabel,
  docs,
  links,
  players = [],
}: {
  campaignId: string
  objectType: CampaignDocLiveObjectType
  objectId: string
  objectLabel: string
  docs: CampaignDoc[]
  links: CampaignDocLink[]
  players?: CodexPlayer[]
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [selectedDocId, setSelectedDocId] = useState('')
  const [relationshipType, setRelationshipType] = useState<CampaignDocRelationType>(() =>
    relationForObject(objectType),
  )
  const [busyLinkId, setBusyLinkId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const docById = useMemo(() => new Map(docs.map((doc) => [doc.id, doc])), [docs])
  const attachedLinks = links.filter(
    (link) => link.live_object_type === objectType && link.live_object_id === objectId,
  )
  const attachedDocIds = new Set(attachedLinks.map((link) => link.source_doc_id))
  const q = query.trim().toLowerCase()
  const candidates = docs.filter((doc) => {
    if (attachedDocIds.has(doc.id)) return false
    if (!q) return true
    return [doc.title, doc.doc_type, doc.status, doc.dm_summary, doc.player_summary, ...doc.tags]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q))
  })
  const selectedDoc = docs.find((doc) => doc.id === selectedDocId) ?? null

  async function attach() {
    if (!selectedDoc) return
    setBusyLinkId('attach')
    setError(null)
    const result: Result = await linkCampaignDocToLiveObject(campaignId, selectedDoc.id, {
      live_object_type: objectType,
      live_object_id: objectId,
      live_object_label: objectLabel,
      relationship_type: relationshipType,
      visibility: defaultLinkVisibility(selectedDoc),
    })
    setBusyLinkId(null)
    if (result.error) {
      setError(result.error)
      return
    }
    setSelectedDocId('')
    router.refresh()
  }

  async function remove(linkId: string) {
    setBusyLinkId(linkId)
    setError(null)
    const result = await removeCampaignDocLink(campaignId, linkId)
    setBusyLinkId(null)
    if (result.error) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-100">Linked Codex Docs</h3>
        <Link
          href={`/campaigns/${campaignId}/codex`}
          className="text-xs font-medium text-amber-400 hover:text-amber-300"
        >
          Open Codex
        </Link>
      </div>
      {error && (
        <p className="mt-3 rounded-md border border-red-800 bg-red-950/50 px-2.5 py-2 text-xs text-red-200">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2.5">
        {attachedLinks.length === 0 ? (
          <p className="text-xs text-zinc-600">No Codex docs linked to this object yet.</p>
        ) : (
          attachedLinks.map((link) => {
            const doc = docById.get(link.source_doc_id)
            if (!doc) return null
            return (
              <div key={link.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-100">{doc.title}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {campaignDocTypeLabel(doc.doc_type)} - {campaignDocRelationLabel(link.relationship_type)}
                    </p>
                  </div>
                  {visibilityBadge(doc.visibility)}
                </div>
                {doc.source && (
                  <p className="mt-2 text-[11px] text-zinc-600">Source: {doc.source}</p>
                )}
                {doc.dm_summary && (
                  <p className="mt-2 whitespace-pre-wrap text-xs text-amber-100/90">{doc.dm_summary}</p>
                )}
                {doc.player_summary && (
                  <p className="mt-2 whitespace-pre-wrap text-xs text-zinc-300">{doc.player_summary}</p>
                )}
                {doc.dm_notes && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-amber-400">DM notes</summary>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-400">{doc.dm_notes}</p>
                  </details>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={`/campaigns/${campaignId}/codex`}>
                    <Button type="button" size="sm" variant="secondary">Open</Button>
                  </Link>
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    onClick={() => remove(link.id)}
                    loading={busyLinkId === link.id}
                  >
                    Remove
                  </Button>
                </div>
                <div className="mt-3 border-t border-zinc-800 pt-3">
                  <p className="mb-2 text-[11px] uppercase tracking-wide text-zinc-600">Reveal player-safe summary</p>
                  <CodexRevealControls
                    players={players}
                    compact
                    disabled={!doc.player_summary}
                    disabledReason="Needs player-safe summary"
                    onReveal={({ scope, playerId, message }) =>
                      revealCampaignDocForLiveObject(campaignId, doc.id, {
                        live_object_type: objectType,
                        live_object_id: objectId,
                        scope,
                        playerId,
                        reveal_message: message,
                      })
                    }
                  />
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="mt-4 border-t border-zinc-800 pt-3">
        <Input
          label="Search Codex docs"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Goblin, faction, item..."
        />
        <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
          <Select
            aria-label="Codex doc to attach"
            value={selectedDocId}
            onChange={(event) => setSelectedDocId(event.target.value)}
          >
            <option value="">Attach selected doc...</option>
            {candidates.slice(0, 80).map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.title} ({campaignDocTypeLabel(doc.doc_type)})
              </option>
            ))}
          </Select>
          <Select
            aria-label="Relationship type"
            value={relationshipType}
            onChange={(event) => setRelationshipType(event.target.value as CampaignDocRelationType)}
          >
            {CAMPAIGN_DOC_RELATION_TYPES.map((type) => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </Select>
        </div>
        <Button
          type="button"
          size="sm"
          className="mt-2 w-full"
          onClick={attach}
          disabled={!selectedDoc}
          loading={busyLinkId === 'attach'}
        >
          Attach Codex Doc
        </Button>
      </div>
    </section>
  )
}

export function PlayerLinkedCodexDocsPanel({
  objectType,
  objectId,
  docs,
  links,
}: {
  objectType: CampaignDocLiveObjectType
  objectId: string
  docs: PlayerVisibleCampaignDoc[]
  links: CampaignDocLinkPublication[]
}) {
  const docById = useMemo(() => new Map(docs.map((doc) => [doc.id, doc])), [docs])
  const attached = links
    .filter((link) => link.live_object_type === objectType && link.live_object_id === objectId)
    .map((link) => ({ link, doc: docById.get(link.doc_id) }))
    .filter((item): item is { link: CampaignDocLinkPublication; doc: PlayerVisibleCampaignDoc } =>
      Boolean(item.doc),
    )

  if (attached.length === 0) return null

  return (
    <div className="mt-3 border-t border-zinc-800 pt-3">
      <p className="mb-2 text-[11px] uppercase tracking-wide text-zinc-600">Revealed info</p>
      <div className="flex flex-col gap-2">
        {attached.map(({ link, doc }) => (
          <div key={link.link_id} className="rounded-md border border-zinc-800 bg-zinc-950/80 px-2.5 py-2">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate text-xs font-semibold text-zinc-100">{doc.title}</p>
              <span className="shrink-0 text-[10px] text-zinc-600">{campaignDocTypeLabel(doc.doc_type)}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-400">{doc.player_summary}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

