'use client'

import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardDescription, CardEyebrow, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import {
  createCampaignDoc,
  linkCampaignDocToLiveObject,
  linkCampaignDocs,
  removeCampaignDocLink,
  removeCampaignDocNotionLink,
  revealCampaignDoc,
  setCampaignDocNotionLink,
  updateCampaignDoc,
} from '@/lib/actions/codex'
import type { CodexPlayer } from '@/lib/actions/codex'
import { syncCodexDoc, syncNotionDatabase } from '@/lib/actions/notion-sync'
import { CodexRevealControls } from '@/components/codex/CodexRevealControls'
import {
  CAMPAIGN_DOC_RELATION_TYPES,
  CAMPAIGN_DOC_STATUSES,
  CAMPAIGN_DOC_TYPES,
  CAMPAIGN_DOC_VISIBILITIES,
  campaignDocRelationLabel,
  campaignDocTypeLabel,
} from '@/lib/codex/options'
import { useRealtimeRefresh } from '@/lib/hooks/useRealtimeRefresh'
import type {
  CampaignDoc,
  CampaignDocLink,
  CampaignDocRelationType,
  CampaignDocStatus,
  CampaignDocType,
  CampaignDocLiveObjectType,
  CampaignDocVisibility,
  NotionSyncMapping,
  PlayerVisibleCampaignDoc,
} from '@/lib/types/database'

type AdventureOption = { id: string; title: string; status: string }
/** A campaign live object the DM can link a Codex record to (map/token/object). */
export type LiveObjectOption = { type: 'map' | 'token'; id: string; label: string; mapName?: string | null }

interface AdventureCodexWorkspaceProps {
  campaignId: string
  isDM: boolean
  docs: CampaignDoc[]
  links: CampaignDocLink[]
  playerDocs: PlayerVisibleCampaignDoc[]
  players?: CodexPlayer[]
  mappings?: NotionSyncMapping[]
  adventures?: AdventureOption[]
  liveObjects?: LiveObjectOption[]
}

// Best-effort emoji icon per Codex entity type. Unknown/future types fall back
// to a generic doc icon — table cards are generated from mappings, never a
// hardcoded table list.
function docTypeIcon(docType: string): string {
  switch (docType) {
    case 'character':
    case 'npc':
      return '🧑'
    case 'boss':
    case 'hostile_enemy':
      return '⚔️'
    case 'location':
      return '🗺️'
    case 'sub_location':
      return '🚪'
    case 'session':
    case 'chapter':
    case 'adventure':
      return '📖'
    case 'rumor':
      return '💬'
    case 'side_quest':
    case 'main_quest':
      return '🎯'
    case 'faction':
      return '🏛️'
    case 'item':
    case 'loot':
      return '💰'
    case 'handout':
      return '📜'
    case 'map_note':
    case 'object_note':
      return '📌'
    default:
      return '🗂️'
  }
}

// Best-effort Notion database URL from the stored id (dashes stripped).
function notionDatabaseUrl(databaseId: string): string {
  return `https://www.notion.so/${databaseId.replace(/-/g, '')}`
}

type Result = { success?: boolean; error?: string; docId?: string }

function tagsFromInput(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
}

function visibilityBadge(visibility: string) {
  if (visibility === 'revealed') return <Badge variant="success">Revealed</Badge>
  if (visibility === 'player_safe') return <Badge variant="player">Player-safe</Badge>
  return <Badge variant="dm">DM only</Badge>
}

function statusBadge(status: string) {
  if (status === 'active') return <Badge variant="success">Active</Badge>
  if (status === 'ready') return <Badge variant="player">Ready</Badge>
  if (status === 'stale') return <Badge variant="warning">Stale</Badge>
  return <Badge variant="default">{status}</Badge>
}

function safeSnippet(value: string | null | undefined) {
  return value?.trim() ? value : 'No player-safe summary yet.'
}

function sourceBadge(source: string) {
  if (source === 'notion') return <Badge variant="player">Notion</Badge>
  if (source === 'manual') return <Badge variant="warning">Local Manual</Badge>
  return <Badge variant="default">{source}</Badge>
}

// Notion-first empty state shown when the DM has no Codex records yet. Points to
// the Notion sync surfaces instead of suggesting manual creation.
function NotionFirstEmptyState({ campaignId }: { campaignId: string }) {
  return (
    <Card className="border-dashed">
      <h2 className="text-base font-semibold text-zinc-100">Connect a Notion table</h2>
      <p className="mt-2 text-sm text-zinc-400">
        Connect a Notion table to start building this Adventure Codex. Campaign
        content is managed in Notion and synced here.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/campaigns/${campaignId}/codex/sync`}>
          <Button size="sm">Open Notion Sync</Button>
        </Link>
        <Link href={`/campaigns/${campaignId}/codex/notion`}>
          <Button size="sm" variant="secondary">Manage Mappings</Button>
        </Link>
      </div>
      <p className="mt-3 text-xs text-zinc-600">
        Use Notion Sync to pull mapped tables, and Open in Notion (on a record) to
        edit the source content.
      </p>
    </Card>
  )
}

export function AdventureCodexWorkspace({
  campaignId,
  isDM,
  docs,
  links,
  playerDocs,
  players = [],
  mappings = [],
  adventures = [],
  liveObjects = [],
}: AdventureCodexWorkspaceProps) {
  // Subscribe to only the tables each role can actually SELECT. The DM watches
  // the source tables (DM-only RLS); players watch only the player-safe
  // projection + their own/party reveals — never a DM-only table.
  useRealtimeRefresh(
    `codex-${isDM ? 'dm' : 'player'}-${campaignId}`,
    isDM
      ? [
          { table: 'campaign_docs', filter: `campaign_id=eq.${campaignId}` },
          { table: 'campaign_doc_links', filter: `campaign_id=eq.${campaignId}` },
          { table: 'codex_reveals', filter: `campaign_id=eq.${campaignId}` },
        ]
      : [
          { table: 'campaign_doc_publications', filter: `campaign_id=eq.${campaignId}` },
          { table: 'codex_reveals', filter: `campaign_id=eq.${campaignId}` },
        ],
  )

  if (!isDM) return <PlayerRevealedInfo docs={playerDocs} />

  return (
    <DMCodexDashboard
      campaignId={campaignId}
      docs={docs}
      links={links}
      players={players}
      mappings={mappings}
      adventures={adventures}
      liveObjects={liveObjects}
    />
  )
}

function PlayerRevealedInfo({ docs }: { docs: PlayerVisibleCampaignDoc[] }) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      docs.filter((doc) => {
        if (!q) return true
        return [doc.title, doc.player_summary, doc.status, campaignDocTypeLabel(doc.doc_type), ...doc.tags]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q))
      }),
    [docs, q],
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <CardEyebrow>Codex</CardEyebrow>
          <h1 className="text-2xl font-bold text-zinc-100">Revealed Info</h1>
          <CardDescription className="mt-1 text-sm">
            Campaign details your DM has marked safe or revealed.
          </CardDescription>
        </div>
        <div className="w-full sm:w-80">
          <Input
            label="Search revealed info"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Place, person, rumor, item..."
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <p className="text-sm text-zinc-500">Nothing has been revealed here yet.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filtered.map((doc) => (
            <Card key={doc.id} tone="panel">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    {campaignDocTypeLabel(doc.doc_type)}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-zinc-100">{doc.title}</h2>
                </div>
                {visibilityBadge(doc.visibility)}
              </div>
              {doc.reveal_message && (
                <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                  {doc.reveal_message}
                </p>
              )}
              <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-400">
                {safeSnippet(doc.player_summary)}
              </p>
              {doc.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {doc.tags.map((tag) => (
                    <Badge key={tag} variant="default">{tag}</Badge>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

type CodexGroupKind = 'mapping' | 'unmapped' | 'manual'

interface CodexGroup {
  key: string
  kind: CodexGroupKind
  title: string
  docType: string | null
  mapping: NotionSyncMapping | null
  docs: CampaignDoc[]
}

function docMatchesQuery(doc: CampaignDoc, q: string) {
  if (!q) return true
  return [doc.title, doc.dm_summary, doc.player_summary, doc.dm_notes, doc.status, campaignDocTypeLabel(doc.doc_type), ...doc.tags]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q))
}

// Build one group per mapped Notion table (from mappings, not hardcoded), plus
// synthetic "Unmapped / Stale" (Notion docs with no current mapping) and
// "Local Manual Records" buckets. This is what fixes records appearing under the
// wrong entity type: a record's table is its mapping, not its raw doc_type.
function buildGroups(docs: CampaignDoc[], mappings: NotionSyncMapping[]): CodexGroup[] {
  const mappingDbIds = new Set(mappings.map((m) => m.notion_database_id))
  const groups: CodexGroup[] = []

  for (const mapping of mappings) {
    groups.push({
      key: `map:${mapping.id}`,
      kind: 'mapping',
      title: mapping.notion_database_name || campaignDocTypeLabel(mapping.doc_type),
      docType: mapping.doc_type,
      mapping,
      docs: docs.filter(
        (doc) => doc.source === 'notion' && doc.source_database_id === mapping.notion_database_id,
      ),
    })
  }

  const unmapped = docs.filter(
    (doc) =>
      doc.source === 'notion' && (!doc.source_database_id || !mappingDbIds.has(doc.source_database_id)),
  )
  if (unmapped.length > 0) {
    groups.push({ key: 'unmapped', kind: 'unmapped', title: 'Unmapped / Stale', docType: null, mapping: null, docs: unmapped })
  }

  const manual = docs.filter((doc) => doc.source !== 'notion')
  if (manual.length > 0) {
    groups.push({ key: 'manual', kind: 'manual', title: 'Local Manual Records', docType: null, mapping: null, docs: manual })
  }

  return groups
}

function DMCodexDashboard({
  campaignId,
  docs,
  links,
  players,
  mappings,
  adventures,
  liveObjects,
}: {
  campaignId: string
  docs: CampaignDoc[]
  links: CampaignDocLink[]
  players: CodexPlayer[]
  mappings: NotionSyncMapping[]
  adventures: AdventureOption[]
  liveObjects: LiveObjectOption[]
}) {
  const searchParams = useSearchParams()
  const requestedDocId = searchParams.get('doc')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(
    docs.some((doc) => doc.id === requestedDocId) ? requestedDocId : docs[0]?.id ?? null,
  )

  const selectedDoc = docs.find((doc) => doc.id === selectedId) ?? docs[0] ?? null
  const adventureNameById = useMemo(() => new Map(adventures.map((a) => [a.id, a.title])), [adventures])
  const groups = useMemo(() => buildGroups(docs, mappings), [docs, mappings])
  const tableNameByDb = useMemo(
    () => new Map(mappings.map((m) => [m.notion_database_id, m.notion_database_name || campaignDocTypeLabel(m.doc_type)])),
    [mappings],
  )
  const selectedTableName =
    selectedDoc?.source === 'notion' && selectedDoc.source_database_id
      ? tableNameByDb.get(selectedDoc.source_database_id) ?? null
      : selectedDoc?.source === 'manual'
        ? 'Local Manual Records'
        : null

  const q = query.trim().toLowerCase()
  const hasContent = docs.length > 0 || mappings.length > 0
  const hasStale = groups.some((group) => group.kind === 'unmapped')

  return (
    <div className="grid gap-5 xl:grid-cols-[24rem_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Adventure Codex</h1>
          <p className="mt-1 text-sm text-zinc-500">
            One card per mapped Notion table. Notion owns the content; Companion owns
            display, visibility, reveals, and live links.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link
              href={`/campaigns/${campaignId}/codex/sync`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.75h1.875A2.625 2.625 0 0121 6.375v11.25a2.625 2.625 0 01-2.625 2.625H5.625A2.625 2.625 0 013 17.625V6.375A2.625 2.625 0 015.625 3.75H7.5m9 0v3.375m0-3.375h-9m0 0v3.375m0 0h9m-9 0H6.75m10.5 0H18" />
              </svg>
              Table Sync
            </Link>
            <Link
              href={`/campaigns/${campaignId}/codex/notion`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              Table mappings
            </Link>
            <Link
              href={`/campaigns/${campaignId}/codex/schema`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
              Schema view
            </Link>
          </div>
        </div>

        <Card>
          <Input
            label="Search Codex"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Title, tag, status..."
          />
        </Card>

        {hasStale && (
          <p className="rounded-lg border border-yellow-700/40 bg-yellow-950/20 px-3 py-2 text-xs text-yellow-200/90">
            Some local records came from mappings that are no longer active. Review or
            delete them from the{' '}
            <Link href={`/campaigns/${campaignId}/codex/sync`} className="underline hover:text-yellow-100">
              Notion Sync Dashboard
            </Link>.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {!hasContent ? (
            <NotionFirstEmptyState campaignId={campaignId} />
          ) : (
            groups.map((group) => (
              <CodexTableCard
                key={group.key}
                campaignId={campaignId}
                group={group}
                links={links}
                query={q}
                selectedId={selectedDoc?.id ?? null}
                onSelect={setSelectedId}
                adventureNameById={adventureNameById}
              />
            ))
          )}
        </div>

        <AdvancedManualRecords campaignId={campaignId} />
      </div>

      {selectedDoc ? (
        <CodexRecordPanel
          key={selectedDoc.id}
          campaignId={campaignId}
          doc={selectedDoc}
          docs={docs}
          links={links}
          players={players}
          liveObjects={liveObjects}
          tableName={selectedTableName}
          onSelect={setSelectedId}
        />
      ) : (
        <NotionFirstEmptyState campaignId={campaignId} />
      )}
    </div>
  )
}

function CodexTableCard({
  campaignId,
  group,
  links,
  query,
  selectedId,
  onSelect,
  adventureNameById,
}: {
  campaignId: string
  group: CodexGroup
  links: CampaignDocLink[]
  query: string
  selectedId: string | null
  onSelect: (id: string) => void
  adventureNameById: Map<string, string>
}) {
  const router = useRouter()
  const docIds = useMemo(() => new Set(group.docs.map((d) => d.id)), [group.docs])
  const containsSelected = selectedId != null && docIds.has(selectedId)
  const [open, setOpen] = useState(containsSelected)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const matchingDocs = group.docs.filter((doc) => docMatchesQuery(doc, query))
  const titleMatches = !query || group.title.toLowerCase().includes(query)
  // Hide a card during search only when nothing in it matches.
  if (query && !titleMatches && matchingDocs.length === 0) return null

  const liveObjectCount = links.filter((l) => l.live_object_id && docIds.has(l.source_doc_id)).length
  const recordLinkCount = links.filter(
    (l) => l.target_doc_id && (docIds.has(l.source_doc_id) || (l.target_doc_id ? docIds.has(l.target_doc_id) : false)),
  ).length
  const lastSynced = group.docs
    .map((d) => d.last_synced_at)
    .filter(Boolean)
    .sort()
    .at(-1)
  const failedCount = group.docs.filter((d) => d.sync_status === 'failed').length
  const adventureName =
    group.mapping?.adventure_id ? adventureNameById.get(group.mapping.adventure_id) ?? null : null

  async function syncTable() {
    if (!group.mapping) return
    setBusy(true)
    setError(null)
    const result = await syncNotionDatabase(campaignId, group.mapping.id)
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <span className="text-base leading-none">{group.docType ? docTypeIcon(group.docType) : group.kind === 'manual' ? '🗒️' : '⚠️'}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-zinc-100">{group.title}</span>
            <span className="shrink-0 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400">
              {group.docs.length}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-zinc-500">
            {group.kind === 'mapping'
              ? `${campaignDocTypeLabel(group.docType ?? '')} · Notion`
              : group.kind === 'manual'
                ? 'Local Companion records'
                : 'Notion records with no current mapping'}
          </span>
        </span>
        {group.kind === 'mapping' ? (
          <Badge variant="player">Notion</Badge>
        ) : group.kind === 'manual' ? (
          <Badge variant="warning">Local</Badge>
        ) : (
          <Badge variant="warning">Stale</Badge>
        )}
        <svg
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-zinc-800 px-3 py-3">
          <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
            {group.kind === 'mapping' && (
              <span>Mapping: <span className="text-zinc-300">{group.mapping?.enabled ? 'Active' : 'Disabled'}</span></span>
            )}
            <span>Adventure: <span className="text-zinc-300">{adventureName ?? 'Not linked'}</span></span>
            <span>Last synced: <span className="text-zinc-300">{lastSynced ? new Date(lastSynced).toLocaleString() : 'Never'}</span></span>
            <span>Live links: <span className="text-zinc-300">{liveObjectCount}</span></span>
            <span>Record links: <span className="text-zinc-300">{recordLinkCount}</span></span>
            {group.kind === 'unmapped' && <span className="text-yellow-400">{group.docs.length} stale</span>}
            {failedCount > 0 && <span className="text-red-400">{failedCount} failed sync</span>}
          </div>

          {group.kind === 'unmapped' && (
            <p className="mb-3 rounded-md border border-yellow-700/40 bg-yellow-950/20 px-2.5 py-2 text-[11px] text-yellow-200/90">
              This table is no longer mapped. Its old local records are hidden from the
              active Codex. Some local records came from mappings that are no longer
              active — review or delete them from the{' '}
              <Link href={`/campaigns/${campaignId}/codex/sync`} className="underline hover:text-yellow-100">
                Notion Sync Dashboard
              </Link>.
            </p>
          )}

          {group.kind === 'mapping' && group.mapping && (
            <div className="mb-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={syncTable} loading={busy}>Sync</Button>
              <a
                href={notionDatabaseUrl(group.mapping.notion_database_id)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200 hover:border-amber-500/50"
              >
                Open Notion Table
              </a>
              <Link
                href={`/campaigns/${campaignId}/codex/notion`}
                className="inline-flex items-center rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200 hover:border-amber-500/50"
              >
                Manage Mapping
              </Link>
              <Link
                href={`/campaigns/${campaignId}/codex/schema?table=${group.mapping.notion_database_id}`}
                className="inline-flex items-center rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200 hover:border-amber-500/50"
              >
                View Relationships
              </Link>
            </div>
          )}

          {error && (
            <p className="mb-2 rounded-md border border-red-800 bg-red-950/50 px-2.5 py-1.5 text-xs text-red-200">{error}</p>
          )}

          {matchingDocs.length === 0 ? (
            <p className="text-xs text-zinc-600">
              {group.docs.length === 0 ? 'No records synced yet. Sync this table from Notion.' : 'No entries match the search.'}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {matchingDocs.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => onSelect(doc.id)}
                  className={`rounded-md border px-2.5 py-2 text-left transition ${
                    selectedId === doc.id
                      ? 'border-amber-500/60 bg-amber-500/10'
                      : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-zinc-100">{doc.title}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-zinc-500">
                        {campaignDocTypeLabel(doc.doc_type)}
                      </span>
                    </span>
                    {visibilityBadge(doc.visibility)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CreateDocCard({ campaignId }: { campaignId: string }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const formData = new FormData(event.currentTarget)
    const result: Result = await createCampaignDoc(campaignId, {
      title: String(formData.get('title') ?? ''),
      doc_type: String(formData.get('doc_type') ?? 'location') as CampaignDocType,
      dm_summary: String(formData.get('dm_summary') ?? ''),
      player_summary: String(formData.get('player_summary') ?? ''),
      tags: tagsFromInput(String(formData.get('tags') ?? '')),
      status: String(formData.get('status') ?? 'draft') as CampaignDocStatus,
      visibility: String(formData.get('visibility') ?? 'dm_only') as CampaignDocVisibility,
    })
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    formRef.current?.reset()
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Local Manual Record</CardTitle>
      </CardHeader>
      <form ref={formRef} onSubmit={submit} className="flex flex-col gap-3">
        {error && (
          <p className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}
        <Input name="title" label="Title" required />
        <Select name="doc_type" label="Type" defaultValue="location">
          {CAMPAIGN_DOC_TYPES.map((type) => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </Select>
        <Textarea name="dm_summary" label="DM-only summary" rows={2} />
        <Textarea name="player_summary" label="Player-safe summary" rows={2} />
        <Input name="tags" label="Tags" placeholder="forest, clue, session-4" />
        <div className="grid grid-cols-2 gap-3">
          <Select name="status" label="Status" defaultValue="draft">
            {CAMPAIGN_DOC_STATUSES.map((status) => (
              <option key={status.value} value={status.value}>{status.label}</option>
            ))}
          </Select>
          <Select name="visibility" label="Visibility" defaultValue="dm_only">
            {CAMPAIGN_DOC_VISIBILITIES.map((visibility) => (
              <option key={visibility.value} value={visibility.value}>{visibility.label}</option>
            ))}
          </Select>
        </div>
        <Button type="submit" loading={busy}>Create Record</Button>
      </form>
    </Card>
  )
}

// Manual record creation is intentionally NOT part of the normal Notion-first
// workflow. It stays available only behind this collapsed Advanced section for
// local-only notes / legacy data. Existing manual records are unaffected.
function AdvancedManualRecords({ campaignId }: { campaignId: string }) {
  return (
    <details className="rounded-lg border border-zinc-800 bg-zinc-950">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200">
        Advanced: Local Manual Records
      </summary>
      <div className="border-t border-zinc-800 p-3">
        <p className="mb-3 text-xs text-zinc-500">
          Manual records are local Companion-only records. Notion remains the main
          source for campaign content. Use these only for local notes or legacy data.
        </p>
        <CreateDocCard campaignId={campaignId} />
      </div>
    </details>
  )
}

function CodexRecordPanel({
  campaignId,
  doc,
  docs,
  links,
  players,
  liveObjects,
  tableName,
  onSelect,
}: {
  campaignId: string
  doc: CampaignDoc
  docs: CampaignDoc[]
  links: CampaignDocLink[]
  players: CodexPlayer[]
  liveObjects: LiveObjectOption[]
  tableName: string | null
  onSelect: (id: string) => void
}) {
  const router = useRouter()
  const isNotion = doc.source === 'notion'
  // Companion-side display settings (always editable). Notion-owned content
  // fields below are read-only for synced docs — edited in Notion only.
  const [status, setStatus] = useState(doc.status)
  const [visibility, setVisibility] = useState<CampaignDocVisibility>(doc.visibility)
  const [tags, setTags] = useState(doc.tags.join(', '))
  // Manual-only content editing.
  const [title, setTitle] = useState(doc.title)
  const [docType, setDocType] = useState<CampaignDocType>(doc.doc_type)
  const [dmSummary, setDmSummary] = useState(doc.dm_summary ?? '')
  const [playerSummary, setPlayerSummary] = useState(doc.player_summary ?? '')
  const [dmNotes, setDmNotes] = useState(doc.dm_notes ?? '')
  const [targetDocId, setTargetDocId] = useState('')
  const [relationshipType, setRelationshipType] = useState<CampaignDocRelationType>('related_to')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const docLinks = links.filter((link) => link.source_doc_id === doc.id || link.target_doc_id === doc.id)
  const docById = useMemo(() => new Map(docs.map((item) => [item.id, item])), [docs])
  const possibleTargets = docs.filter((item) => item.id !== doc.id)
  const recordLinks = docLinks.filter((link) => link.target_doc_id)
  const liveLinks = docLinks.filter((link) => link.live_object_id)

  // Group related records by the linked record's entity type, so a Character's
  // linked Locations appear under "Location", its Factions under "Faction", etc.
  const relatedGroups = new Map<string, { link: CampaignDocLink; other: CampaignDoc }[]>()
  for (const link of recordLinks) {
    const otherId = link.source_doc_id === doc.id ? link.target_doc_id : link.source_doc_id
    const other = otherId ? docById.get(otherId) : null
    if (!other) continue
    const list = relatedGroups.get(other.doc_type) ?? []
    list.push({ link, other })
    relatedGroups.set(other.doc_type, list)
  }
  const relatedByType = Array.from(relatedGroups.entries())

  async function saveSettings() {
    setBusy('save')
    setError(null)
    const result = await updateCampaignDoc(
      campaignId,
      doc.id,
      isNotion
        ? { status, visibility, tags: tagsFromInput(tags) }
        : {
            title,
            doc_type: docType,
            dm_summary: dmSummary,
            player_summary: playerSummary,
            dm_notes: dmNotes,
            tags: tagsFromInput(tags),
            status,
            visibility,
          },
    )
    setBusy(null)
    if (result.error) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  async function addDocLink() {
    if (!targetDocId) return
    setBusy('linkdoc')
    setError(null)
    const result = await linkCampaignDocs(campaignId, doc.id, targetDocId, relationshipType)
    setBusy(null)
    if (result.error) {
      setError(result.error)
      return
    }
    setTargetDocId('')
    router.refresh()
  }

  async function removeLink(linkId: string) {
    setBusy(`rm-${linkId}`)
    setError(null)
    const result = await removeCampaignDocLink(campaignId, linkId)
    setBusy(null)
    if (result.error) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  return (
    <Card>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 border-b border-zinc-800 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-2">
              {visibilityBadge(doc.visibility)}
              {statusBadge(doc.status)}
              {sourceBadge(doc.source)}
            </div>
            <h2 className="mt-3 text-2xl font-bold text-zinc-100">{doc.title}</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {campaignDocTypeLabel(doc.doc_type)}
              {tableName && <span className="text-zinc-600"> · {tableName}</span>}
            </p>
            {isNotion && (
              <p className="mt-1 text-xs text-zinc-600">
                Sync: {doc.sync_status}
                {doc.last_synced_at && ` · last ${new Date(doc.last_synced_at).toLocaleString()}`}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {doc.source_url && (
              <a
                href={doc.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 hover:border-amber-500/50"
              >
                Open in Notion
              </a>
            )}
          </div>
        </div>

        {error && (
          <p className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}

        {/* Companion display settings — never edits Notion content. */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-zinc-100">Display Settings (Companion)</h3>
            <Button size="sm" onClick={saveSettings} loading={busy === 'save'}>Save</Button>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {isNotion
              ? 'Edits Companion-side display only (visibility, status, tags). The record’s content is managed in Notion — use Open in Notion.'
              : 'Local manual record — fully editable in Companion.'}
          </p>
          {isNotion ? (
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <Select label="Visibility" value={visibility} onChange={(e) => setVisibility(e.target.value as CampaignDocVisibility)}>
                {CAMPAIGN_DOC_VISIBILITIES.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
              <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as CampaignDocStatus)}>
                {CAMPAIGN_DOC_STATUSES.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
              <div className="lg:col-span-2">
                <Input label="Display tags" value={tags} onChange={(e) => setTags(e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              <div className="grid gap-3 lg:grid-cols-2">
                <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
                <Select label="Type" value={docType} onChange={(e) => setDocType(e.target.value as CampaignDocType)}>
                  {CAMPAIGN_DOC_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </Select>
                <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as CampaignDocStatus)}>
                  {CAMPAIGN_DOC_STATUSES.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
                <Select label="Visibility" value={visibility} onChange={(e) => setVisibility(e.target.value as CampaignDocVisibility)}>
                  {CAMPAIGN_DOC_VISIBILITIES.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <Textarea label="DM-only summary" rows={4} value={dmSummary} onChange={(e) => setDmSummary(e.target.value)} />
                <Textarea label="Player-safe summary" rows={4} value={playerSummary} onChange={(e) => setPlayerSummary(e.target.value)} />
              </div>
              <Textarea label="Full DM notes" rows={6} value={dmNotes} onChange={(e) => setDmNotes(e.target.value)} />
              <Input label="Tags" value={tags} onChange={(e) => setTags(e.target.value)} />
            </div>
          )}
        </section>

        {/* Read-only mirror of Notion content. */}
        {isNotion && (
          <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
            <h3 className="text-sm font-semibold text-zinc-100">Content (from Notion, read-only)</h3>
            {doc.dm_summary && (
              <div className="mt-3">
                <p className="text-[11px] uppercase tracking-wide text-amber-300/80">DM summary</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{doc.dm_summary}</p>
              </div>
            )}
            {doc.player_summary && (
              <div className="mt-3">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">Player-safe summary</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{doc.player_summary}</p>
              </div>
            )}
            {doc.dm_notes && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-amber-400">DM notes</summary>
                <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-400">{doc.dm_notes}</p>
              </details>
            )}
            {!doc.dm_summary && !doc.player_summary && !doc.dm_notes && (
              <p className="mt-2 text-xs text-zinc-600">No synced content yet. Sync this table from Notion Sync.</p>
            )}
          </section>
        )}

        <NotionLinkSection campaignId={campaignId} doc={doc} />

        <section className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4">
          <h3 className="text-sm font-semibold text-zinc-100">Reveal to Players</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Sends a live notification and shares the player-safe summary. DM notes
            stay private. Save edits first so players see the latest summary.
          </p>
          <div className="mt-3">
            <CodexRevealControls
              players={players}
              disabled={!doc.player_summary?.trim()}
              disabledReason="Add a player-safe summary first"
              onReveal={({ scope, playerId, message }) =>
                revealCampaignDoc(campaignId, doc.id, { scope, playerId, reveal_message: message })
              }
            />
          </div>
        </section>

        {/* Relationships grouped by linked record's entity type. */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <h3 className="text-sm font-semibold text-zinc-100">Related Records</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_13rem_auto]">
            <Select aria-label="Target Codex record" value={targetDocId} onChange={(e) => setTargetDocId(e.target.value)}>
              <option value="">Choose record</option>
              {possibleTargets.map((item) => (
                <option key={item.id} value={item.id}>{item.title} ({campaignDocTypeLabel(item.doc_type)})</option>
              ))}
            </Select>
            <Select aria-label="Relationship type" value={relationshipType} onChange={(e) => setRelationshipType(e.target.value as CampaignDocRelationType)}>
              {CAMPAIGN_DOC_RELATION_TYPES.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
            <Button type="button" variant="secondary" onClick={addDocLink} disabled={!targetDocId} loading={busy === 'linkdoc'}>
              Link
            </Button>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {relatedByType.length === 0 ? (
              <p className="text-sm text-zinc-600">No related records linked yet.</p>
            ) : (
              relatedByType.map(([type, items]) => (
                <div key={type}>
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500">{campaignDocTypeLabel(type)}</p>
                  <div className="mt-1.5 flex flex-col gap-1.5">
                    {items.map(({ link, other }) => (
                      <div key={link.id} className="flex items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-zinc-100">{other.title}</p>
                          <p className="text-[11px] text-zinc-600">{campaignDocRelationLabel(link.relationship_type)}</p>
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <button type="button" onClick={() => onSelect(other.id)} className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-200 hover:border-amber-500/50">Open</button>
                          <button type="button" onClick={() => removeLink(link.id)} className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-red-300 hover:border-red-500/50" disabled={busy === `rm-${link.id}`}>Remove</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Companion-side live object links. */}
        <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <h3 className="text-sm font-semibold text-zinc-100">Linked Live Objects</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Companion-side links to live map objects. These never change Notion.
          </p>
          <LiveObjectLinker campaignId={campaignId} docId={doc.id} liveObjects={liveObjects} />
          <div className="mt-3 flex flex-col gap-2">
            {liveLinks.length === 0 ? (
              <p className="text-sm text-zinc-600">No live map, token, or object links yet.</p>
            ) : (
              liveLinks.map((link) => (
                <div key={link.id} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-zinc-100">{link.live_object_label || 'Linked app object'}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {link.live_object_type ? campaignDocTypeLabel(link.live_object_type) : 'Live object'} · {campaignDocRelationLabel(link.relationship_type)}
                    </p>
                  </div>
                  <button type="button" onClick={() => removeLink(link.id)} className="shrink-0 rounded border border-zinc-700 px-2 py-1 text-[11px] text-red-300 hover:border-red-500/50" disabled={busy === `rm-${link.id}`}>Remove</button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </Card>
  )
}

function LiveObjectLinker({
  campaignId,
  docId,
  liveObjects,
}: {
  campaignId: string
  docId: string
  liveObjects: LiveObjectOption[]
}) {
  const router = useRouter()
  const [objType, setObjType] = useState<'token' | 'object' | 'map'>('token')
  const [targetId, setTargetId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Tokens back both "token" and "map object" links; maps back "map" links.
  const candidates = liveObjects.filter((o) => (objType === 'map' ? o.type === 'map' : o.type === 'token'))

  async function attach() {
    const chosen = candidates.find((c) => c.id === targetId)
    if (!chosen) return
    const liveObjectType: CampaignDocLiveObjectType = objType
    const relationship: CampaignDocRelationType =
      objType === 'map' ? 'map_for' : objType === 'object' ? 'object_doc' : 'token_doc'
    setBusy(true)
    setError(null)
    const result = await linkCampaignDocToLiveObject(campaignId, docId, {
      live_object_type: liveObjectType,
      live_object_id: chosen.id,
      live_object_label: chosen.label,
      relationship_type: relationship,
    })
    setBusy(false)
    if (result.error) {
      setError(result.error)
      return
    }
    setTargetId('')
    router.refresh()
  }

  return (
    <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <p className="mb-2 text-[11px] uppercase tracking-wide text-zinc-500">Link to a live object</p>
      {liveObjects.length === 0 ? (
        <p className="text-xs text-zinc-600">No live maps or tokens in this campaign yet. Create them on the Live Map.</p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
            <Select
              aria-label="Live object type"
              value={objType}
              onChange={(e) => {
                setObjType(e.target.value as 'token' | 'object' | 'map')
                setTargetId('')
              }}
            >
              <option value="token">Token</option>
              <option value="object">Map object</option>
              <option value="map">Map</option>
            </Select>
            <Select aria-label="Live object" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">Choose {objType === 'map' ? 'map' : 'token'}…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}{c.mapName ? ` (${c.mapName})` : ''}
                </option>
              ))}
            </Select>
            <Button type="button" size="sm" onClick={attach} disabled={!targetId} loading={busy}>Link</Button>
          </div>
          <p className="mt-2 text-[11px] text-zinc-600">
            Room/sub-location nodes and quest markers link as a Map object or Token.
          </p>
        </>
      )}
      {error && (
        <p className="mt-2 rounded-md border border-red-800 bg-red-950/50 px-2.5 py-1.5 text-xs text-red-200">{error}</p>
      )}
    </div>
  )
}

function NotionLinkSection({ campaignId, doc }: { campaignId: string; doc: CampaignDoc }) {
  const router = useRouter()
  const isLinked = doc.source === 'notion' && Boolean(doc.source_url)
  const [url, setUrl] = useState(doc.source_url ?? '')
  const [busy, setBusy] = useState<'save' | 'remove' | 'sync' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function sync() {
    setBusy('sync')
    setError(null)
    setNotice(null)
    const result = await syncCodexDoc(campaignId, doc.id)
    setBusy(null)
    if (result.error) {
      setError(result.error)
      return
    }
    setNotice(`Synced from Notion — ${result.message ?? 'done.'}`)
    router.refresh()
  }

  async function save() {
    setBusy('save')
    setError(null)
    setNotice(null)
    const result = await setCampaignDocNotionLink(campaignId, doc.id, url)
    setBusy(null)
    if (result.error) {
      setError(result.error)
      return
    }
    setNotice('Notion link saved.')
    router.refresh()
  }

  async function remove() {
    setBusy('remove')
    setError(null)
    setNotice(null)
    const result = await removeCampaignDocNotionLink(campaignId, doc.id)
    setBusy(null)
    if (result.error) {
      setError(result.error)
      return
    }
    setUrl('')
    setNotice('Notion link removed.')
    router.refresh()
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-100">Notion Link</h3>
        {isLinked ? (
          <Badge variant="player">Notion linked</Badge>
        ) : (
          <Badge variant="default">Not linked</Badge>
        )}
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        DM-only reference to the Notion page. Players only ever see the app-cached
        player-safe summary, never this link. Sync pulls the latest mapped fields
        from Notion; your visibility, reveal state, and links are preserved.
      </p>

      {isLinked && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={sync} loading={busy === 'sync'}>
            Sync from Notion
          </Button>
          {doc.last_synced_at && (
            <span className="text-[11px] text-zinc-600">
              Last synced {new Date(doc.last_synced_at).toLocaleString()}
              {doc.sync_status === 'failed' && <span className="text-red-400"> (failed)</span>}
            </span>
          )}
          <a
            href={doc.source_url ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:border-amber-500/50"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            Open in Notion
          </a>
          {doc.source_linked_at && (
            <span className="text-[11px] text-zinc-600">
              Linked {new Date(doc.source_linked_at).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Input
            label={isLinked ? 'Update Notion URL' : 'Notion URL'}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://www.notion.so/..."
          />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={save} loading={busy === 'save'} disabled={!url.trim()}>
            {isLinked ? 'Update' : 'Save link'}
          </Button>
          {isLinked && (
            <Button size="sm" variant="danger" onClick={remove} loading={busy === 'remove'}>
              Remove
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-2 rounded-md border border-red-800 bg-red-950/50 px-2.5 py-1.5 text-xs text-red-200">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-2 rounded-md border border-emerald-800/60 bg-emerald-950/40 px-2.5 py-1.5 text-xs text-emerald-200">
          {notice}
        </p>
      )}
    </section>
  )
}
