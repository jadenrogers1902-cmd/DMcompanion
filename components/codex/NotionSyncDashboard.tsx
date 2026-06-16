'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  Link2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Unlink,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { removeCampaignDocNotionLink } from '@/lib/actions/codex'
import {
  retryFailedNotionDocs,
  syncAllNotionDatabases,
  syncCodexDoc,
  syncNotionDatabase,
  wipeLocalCodexData,
} from '@/lib/actions/notion-sync'
import {
  CAMPAIGN_DOC_TYPES,
  WIPE_CONFIRMATION_PHRASE,
  campaignDocTypeLabel,
} from '@/lib/codex/options'
import { useRealtimeRefresh } from '@/lib/hooks/useRealtimeRefresh'
import type {
  CampaignDoc,
  CampaignDocLink,
  CampaignDocRevealState,
  CampaignDocSource,
  CampaignDocType,
  CampaignDocVisibility,
  NotionSyncLog,
  NotionSyncMapping,
} from '@/lib/types/database'

type DashboardStatus =
  | 'synced'
  | 'needs_sync'
  | 'failed'
  | 'broken_link'
  | 'not_shared'
  | 'mapping_missing'
  | 'dm_only'
  | 'player_safe'
  | 'revealed'
  | 'needs_review'
  | 'manual'

type SourceFilter = 'all' | CampaignDocSource
type LinkedFilter = 'all' | 'linked' | 'unlinked'
type BrokenFilter = 'all' | 'broken' | 'ok'
type ReviewFilter = 'all' | 'needs_review' | 'ok'

type AdventureOption = { id: string; title: string; status: string }

// Sentinel for the "records not linked to an Adventure" bucket in selectors.
const NO_ADVENTURE = '__none__'

interface NotionSyncDashboardProps {
  campaignId: string
  docs: CampaignDoc[]
  links: CampaignDocLink[]
  mappings: NotionSyncMapping[]
  logs: NotionSyncLog[]
  adventures: AdventureOption[]
  serverReady: boolean
  connected: boolean
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : 'Never'
}

function isNewer(left: string | null | undefined, right: string | null | undefined) {
  if (!left) return false
  if (!right) return true
  return new Date(left).getTime() > new Date(right).getTime()
}

function statusLabel(status: DashboardStatus) {
  switch (status) {
    case 'synced':
      return 'Synced'
    case 'needs_sync':
      return 'Needs sync'
    case 'failed':
      return 'Failed'
    case 'broken_link':
      return 'Broken link'
    case 'not_shared':
      return 'Not shared with integration'
    case 'mapping_missing':
      return 'Mapping missing'
    case 'dm_only':
      return 'DM-only'
    case 'player_safe':
      return 'Player-safe'
    case 'revealed':
      return 'Revealed'
    case 'needs_review':
      return 'Needs review'
    case 'manual':
      return 'Manual'
  }
}

function statusBadge(status: DashboardStatus) {
  if (status === 'synced' || status === 'revealed') return <Badge variant="success">{statusLabel(status)}</Badge>
  if (status === 'player_safe') return <Badge variant="player">{statusLabel(status)}</Badge>
  if (status === 'dm_only' || status === 'manual') return <Badge variant="dm">{statusLabel(status)}</Badge>
  if (status === 'failed' || status === 'broken_link' || status === 'not_shared') {
    return <Badge variant="warning">{statusLabel(status)}</Badge>
  }
  return <Badge variant="default">{statusLabel(status)}</Badge>
}

function friendlyIssue(doc: CampaignDoc, hasMapping: boolean) {
  if (doc.source === 'manual') return 'Manual doc'
  if (!doc.source_page_id || !doc.source_url) return 'Missing Notion page link'
  if (!hasMapping) return 'No database mapping'
  if (doc.sync_status === 'failed') {
    if (/not shared|share/i.test(doc.sync_error ?? '')) return 'Not shared with integration'
    return 'Last sync failed'
  }
  if (doc.sync_status === 'partial' || doc.sync_status === 'conflict') return 'Review sync result'
  if (isNewer(doc.updated_at, doc.last_synced_at)) return 'Local edits after sync'
  if ((doc.visibility === 'player_safe' || doc.visibility === 'revealed') && !doc.player_summary?.trim()) {
    return 'Player-safe summary missing'
  }
  return 'Healthy'
}

// Single human lifecycle label per record (Phase 7). Notion docs progress
// through these; manual docs are local-only. "Cleared locally" is a post-delete
// state (the row no longer exists) and is documented, not rendered.
function lifecycleLabel(doc: CampaignDoc, hasMapping: boolean): string {
  if (doc.source !== 'notion') return 'Local manual record'
  if (!doc.source_page_id || !doc.source_url) return 'Broken Notion link'
  if (!hasMapping) return doc.source_database_id ? 'Mapping removed' : 'Unmapped'
  if (doc.sync_status === 'failed') {
    if (/not found|deleted|no longer|404/i.test(doc.sync_error ?? '')) return 'Deleted in Notion?'
    return 'Sync failed'
  }
  if (isNewer(doc.updated_at, doc.last_synced_at)) return 'Needs sync'
  if (doc.sync_status === 'success') return 'Active synced'
  return 'Active mapped'
}

function buildStatuses(doc: CampaignDoc, hasMapping: boolean): DashboardStatus[] {
  const statuses: DashboardStatus[] = []
  if (doc.source === 'manual') statuses.push('manual')

  if (doc.source === 'notion') {
    if (!doc.source_page_id || !doc.source_url) statuses.push('broken_link')
    if (!hasMapping) statuses.push('mapping_missing')
    if (doc.sync_status === 'failed') statuses.push('failed')
    if (/not shared|share/i.test(doc.sync_error ?? '')) statuses.push('not_shared')
    if (doc.sync_status === 'success' && !isNewer(doc.updated_at, doc.last_synced_at)) statuses.push('synced')
    if (isNewer(doc.updated_at, doc.last_synced_at)) statuses.push('needs_sync')
  }

  if (doc.visibility === 'dm_only') statuses.push('dm_only')
  if (doc.visibility === 'player_safe') statuses.push('player_safe')
  if (doc.visibility === 'revealed' || doc.reveal_state === 'revealed') statuses.push('revealed')

  const needsReview =
    statuses.some((s) => ['failed', 'broken_link', 'not_shared', 'mapping_missing', 'needs_sync'].includes(s)) ||
    ((doc.visibility === 'player_safe' || doc.visibility === 'revealed') && !doc.player_summary?.trim())
  if (needsReview) statuses.push('needs_review')

  return Array.from(new Set(statuses))
}

function metricValue(value: number | string) {
  return <span className="text-2xl font-semibold text-zinc-100">{value}</span>
}

export function NotionSyncDashboard({
  campaignId,
  docs,
  links,
  mappings,
  logs,
  adventures,
  serverReady,
  connected,
}: NotionSyncDashboardProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [docType, setDocType] = useState<'all' | CampaignDocType>('all')
  const [source, setSource] = useState<SourceFilter>('all')
  const [syncStatus, setSyncStatus] = useState<'all' | DashboardStatus>('all')
  const [visibility, setVisibility] = useState<'all' | CampaignDocVisibility>('all')
  const [revealState, setRevealState] = useState<'all' | CampaignDocRevealState>('all')
  const [adventureFilter, setAdventureFilter] = useState<'all' | string>('all')
  const [linked, setLinked] = useState<LinkedFilter>('all')
  const [broken, setBroken] = useState<BrokenFilter>('all')
  const [review, setReview] = useState<ReviewFilter>('all')
  const [selectedDocId, setSelectedDocId] = useState<string>(docs[0]?.id ?? '')
  const [selectedMappingId, setSelectedMappingId] = useState<string>(mappings.find((m) => m.enabled)?.id ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Delete-local-synced-data flow state.
  const [wipeOpen, setWipeOpen] = useState(false)
  const [wipeTarget, setWipeTarget] = useState<string>('')
  const [wipePhrase, setWipePhrase] = useState('')

  // Synced-record counts per Adventure target, for the wipe preview + selector.
  const docCountByAdventure = useMemo(() => {
    const counts = new Map<string, number>()
    for (const doc of docs) {
      const key = doc.adventure_id ?? NO_ADVENTURE
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [docs])

  const adventureNameById = useMemo(
    () => new Map(adventures.map((a) => [a.id, a.title])),
    [adventures],
  )

  useRealtimeRefresh(`codex-sync-dashboard-${campaignId}`, [
    { table: 'campaign_docs', filter: `campaign_id=eq.${campaignId}` },
    { table: 'campaign_doc_links', filter: `campaign_id=eq.${campaignId}` },
    { table: 'codex_reveals', filter: `campaign_id=eq.${campaignId}` },
    { table: 'notion_sync_logs', filter: `campaign_id=eq.${campaignId}` },
  ])

  const liveLinkedDocIds = useMemo(
    () => new Set(links.filter((link) => link.live_object_id).map((link) => link.source_doc_id)),
    [links],
  )
  const mappingIds = useMemo(() => new Set(mappings.map((mapping) => mapping.notion_database_id)), [mappings])
  const mappingByDatabaseId = useMemo(
    () => new Map(mappings.map((mapping) => [mapping.notion_database_id, mapping])),
    [mappings],
  )

  const rows = useMemo(
    () =>
      docs.map((doc) => {
        const hasMapping = doc.source !== 'notion' || Boolean(doc.source_database_id && mappingIds.has(doc.source_database_id))
        const statuses = buildStatuses(doc, hasMapping)
        const liveLinkCount = links.filter((link) => link.source_doc_id === doc.id && link.live_object_id).length
        return {
          doc,
          statuses,
          issue: friendlyIssue(doc, hasMapping),
          hasMapping,
          liveLinkCount,
          mapping: doc.source_database_id ? mappingByDatabaseId.get(doc.source_database_id) : undefined,
        }
      }),
    [docs, links, mappingByDatabaseId, mappingIds],
  )

  const stats = useMemo(() => {
    const notionDocs = rows.filter((row) => row.doc.source === 'notion')
    const manualDocs = rows.filter((row) => row.doc.source === 'manual')
    const brokenLinks = rows.filter((row) => row.statuses.includes('broken_link'))
    const needsReview = rows.filter((row) => row.statuses.includes('needs_review'))
    const failedDocs = rows.filter((row) => row.statuses.includes('failed'))
    const lastDocSync = docs
      .map((doc) => doc.last_synced_at)
      .filter(Boolean)
      .sort()
      .at(-1)
    const lastLogSync = logs
      .map((log) => log.finished_at ?? log.started_at)
      .filter(Boolean)
      .sort()
      .at(-1)
    const lastSync = [lastDocSync, lastLogSync].filter(Boolean).sort().at(-1) ?? null

    return {
      total: docs.length,
      notionDocs: notionDocs.length,
      manualDocs: manualDocs.length,
      brokenLinks: brokenLinks.length,
      lastSync,
      failedCount: failedDocs.length + logs.filter((log) => log.status === 'failed').length,
      needsReview: needsReview.length,
      playerSafe: docs.filter((doc) => doc.visibility === 'player_safe').length,
      revealed: docs.filter((doc) => doc.visibility === 'revealed' || doc.reveal_state === 'revealed').length,
      dmOnly: docs.filter((doc) => doc.visibility === 'dm_only').length,
      linkedLiveObjects: links.filter((link) => link.live_object_id).length,
      unlinkedDocs: docs.filter((doc) => !liveLinkedDocIds.has(doc.id)).length,
    }
  }, [docs, liveLinkedDocIds, links, logs, rows])

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((row) => {
      const { doc, statuses } = row
      if (docType !== 'all' && doc.doc_type !== docType) return false
      if (source !== 'all' && doc.source !== source) return false
      if (syncStatus !== 'all' && !statuses.includes(syncStatus)) return false
      if (visibility !== 'all' && doc.visibility !== visibility) return false
      if (revealState !== 'all' && doc.reveal_state !== revealState) return false
      if (adventureFilter !== 'all') {
        const docAdventure = doc.adventure_id ?? NO_ADVENTURE
        if (docAdventure !== adventureFilter) return false
      }
      if (linked === 'linked' && row.liveLinkCount === 0) return false
      if (linked === 'unlinked' && row.liveLinkCount > 0) return false
      if (broken === 'broken' && !statuses.includes('broken_link')) return false
      if (broken === 'ok' && statuses.includes('broken_link')) return false
      if (review === 'needs_review' && !statuses.includes('needs_review')) return false
      if (review === 'ok' && statuses.includes('needs_review')) return false
      if (!q) return true
      return [doc.title, campaignDocTypeLabel(doc.doc_type), doc.status, doc.source, row.issue, ...doc.tags]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    })
  }, [adventureFilter, broken, docType, linked, query, revealState, review, rows, source, syncStatus, visibility])

  const selectedDoc = docs.find((doc) => doc.id === selectedDocId)

  async function runAction(key: string, action: () => Promise<{ error?: string; message?: string }>) {
    setBusy(key)
    setError(null)
    setNotice(null)
    const result = await action()
    setBusy(null)
    if (result.error) {
      setError(result.error)
      return
    }
    setNotice(result.message ?? 'Done.')
    router.refresh()
  }

  const canSyncSelected = selectedDoc?.source === 'notion' && Boolean(selectedDoc.source_page_id)

  const wipePreviewCount =
    wipeTarget === '' ? 0 : docCountByAdventure.get(wipeTarget) ?? 0
  const wipeTargetLabel =
    wipeTarget === ''
      ? ''
      : wipeTarget === NO_ADVENTURE
        ? 'Records not linked to an Adventure'
        : adventureNameById.get(wipeTarget) ?? 'Selected Adventure'
  const phraseMatches = wipePhrase.trim() === WIPE_CONFIRMATION_PHRASE
  const canConfirmWipe = wipeTarget !== '' && phraseMatches && busy === null

  function closeWipe() {
    setWipeOpen(false)
    setWipeTarget('')
    setWipePhrase('')
  }

  async function confirmWipe() {
    if (!canConfirmWipe) return
    setBusy('wipe')
    setError(null)
    setNotice(null)
    const result = await wipeLocalCodexData(campaignId, {
      adventureId: wipeTarget === NO_ADVENTURE ? null : wipeTarget,
      confirmationPhrase: wipePhrase.trim(),
    })
    setBusy(null)
    if (result.error) {
      setError(result.error)
      return
    }
    setNotice(result.message ?? 'Local synced data removed.')
    closeWipe()
    router.refresh()
  }

  // Records from a removed/missing mapping or a broken Notion link — reviewable
  // here, no longer shown in the active Codex table cards (Phase 4 moved them to
  // the Codex "Unmapped / Stale" bucket).
  const staleRows = rows.filter(
    (row) => row.statuses.includes('mapping_missing') || row.statuses.includes('broken_link'),
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-zinc-100">Table Sync</h1>
            <Badge variant={connected ? 'success' : 'warning'}>{connected ? 'Connected' : 'No connection'}</Badge>
            {!serverReady && <Badge variant="warning">Server key missing</Badge>}
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            DM-only health view for Adventure Codex sync state, visibility, and live-object linkage.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => runAction('sync-all', () => syncAllNotionDatabases(campaignId))}
            loading={busy === 'sync-all'}
            disabled={!connected || busy !== null}
            title="Sync all enabled Notion mappings"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Sync all
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => runAction('retry-failed', () => retryFailedNotionDocs(campaignId))}
            loading={busy === 'retry-failed'}
            disabled={busy !== null}
            title="Retry docs whose last sync failed"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Retry failed
          </Button>
          <Link
            href={`/campaigns/${campaignId}/codex/notion`}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-600 bg-zinc-700 px-3 py-1.5 text-sm text-zinc-100 transition-colors hover:bg-zinc-600"
          >
            <Filter className="h-4 w-4" aria-hidden="true" />
            Mappings
          </Link>
          <Button
            size="sm"
            variant="danger"
            onClick={() => setWipeOpen(true)}
            disabled={busy !== null}
            title="Delete local synced Notion data for one Adventure (never touches Notion)"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete Local Synced Data
          </Button>
        </div>
      </div>

      {error && <p className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</p>}
      {notice && <p className="rounded-lg border border-emerald-800/60 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">{notice}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <Metric title="Total Codex docs" value={stats.total} icon={<FileText />} />
        <Metric title="Notion-synced docs" value={stats.notionDocs} icon={<RefreshCw />} />
        <Metric title="Manual docs" value={stats.manualDocs} icon={<FileText />} />
        <Metric title="Broken Notion links" value={stats.brokenLinks} icon={<Unlink />} urgent={stats.brokenLinks > 0} />
        <Metric title="Last sync time" value={formatDate(stats.lastSync)} icon={<CheckCircle2 />} compact />
        <Metric title="Failed sync count" value={stats.failedCount} icon={<AlertTriangle />} urgent={stats.failedCount > 0} />
        <Metric title="Docs needing review" value={stats.needsReview} icon={<Eye />} urgent={stats.needsReview > 0} />
        <Metric title="Player-safe docs" value={stats.playerSafe} icon={<ShieldCheck />} />
        <Metric title="Revealed docs" value={stats.revealed} icon={<Eye />} />
        <Metric title="DM-only docs" value={stats.dmOnly} icon={<ShieldCheck />} />
        <Metric title="Linked live objects" value={stats.linkedLiveObjects} icon={<Link2 />} />
        <Metric title="Unlinked docs" value={stats.unlinkedDocs} icon={<Unlink />} />
      </div>

      {staleRows.length > 0 && (
        <Card className="border-yellow-700/40 bg-yellow-950/10">
          <CardHeader>
            <CardTitle>
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-400" aria-hidden="true" />
                Stale / Unmapped Records ({staleRows.length})
              </span>
            </CardTitle>
          </CardHeader>
          <p className="text-sm text-zinc-400">
            These local records came from a Notion mapping that is no longer active
            (or have a broken Notion link). They no longer appear in the active Codex
            table cards. Re-add the mapping and sync to restore them, or use
            <span className="text-zinc-200"> Delete Local Synced Data</span> to clear
            them for a selected Adventure. Notion is never modified.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="danger" onClick={() => setWipeOpen(true)} disabled={busy !== null}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete Local Synced Data
            </Button>
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            {staleRows.slice(0, 50).map((row) => (
              <div key={row.doc.id} className="flex items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-zinc-100">{row.doc.title}</p>
                  <p className="text-[11px] text-zinc-500">
                    {campaignDocTypeLabel(row.doc.doc_type)} · {lifecycleLabel(row.doc, row.hasMapping)}
                  </p>
                </div>
                <Link
                  href={`/campaigns/${campaignId}/codex?doc=${row.doc.id}`}
                  className="shrink-0 rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-200 hover:border-amber-500/50"
                >
                  Open
                </Link>
              </div>
            ))}
            {staleRows.length > 50 && (
              <p className="text-[11px] text-zinc-600">Showing first 50 of {staleRows.length}.</p>
            )}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Sync Controls</CardTitle>
        </CardHeader>
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto]">
          <Select
            label="Selected Codex doc"
            value={selectedDocId}
            onChange={(event) => setSelectedDocId(event.target.value)}
          >
            <option value="">Choose a doc</option>
            {docs.map((doc) => (
              <option key={doc.id} value={doc.id}>{doc.title}</option>
            ))}
          </Select>
          <div className="flex items-end">
            <Button
              size="sm"
              onClick={() => selectedDoc && runAction(`sync-doc-${selectedDoc.id}`, () => syncCodexDoc(campaignId, selectedDoc.id))}
              loading={busy === `sync-doc-${selectedDoc?.id}`}
              disabled={!canSyncSelected || busy !== null}
              title="Sync selected Notion-linked Codex doc"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Sync selected
            </Button>
          </div>
          <Select
            label="Mapped database"
            value={selectedMappingId}
            onChange={(event) => setSelectedMappingId(event.target.value)}
          >
            <option value="">Choose a mapping</option>
            {mappings.map((mapping) => (
              <option key={mapping.id} value={mapping.id}>
                {mapping.notion_database_name || campaignDocTypeLabel(mapping.doc_type)}
              </option>
            ))}
          </Select>
          <div className="flex items-end">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => runAction(`sync-map-${selectedMappingId}`, () => syncNotionDatabase(campaignId, selectedMappingId))}
              loading={busy === `sync-map-${selectedMappingId}`}
              disabled={!connected || !selectedMappingId || busy !== null}
              title="Sync selected mapped Notion database"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Sync mapped DB
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Input label="Search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, tag, issue..." />
          <Select label="Doc type" value={docType} onChange={(event) => setDocType(event.target.value as 'all' | CampaignDocType)}>
            <option value="all">All types</option>
            {CAMPAIGN_DOC_TYPES.map((type) => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </Select>
          <Select label="Source" value={source} onChange={(event) => setSource(event.target.value as SourceFilter)}>
            <option value="all">All sources</option>
            <option value="notion">Notion</option>
            <option value="manual">Manual</option>
            <option value="import">Import</option>
          </Select>
          <Select label="Sync status" value={syncStatus} onChange={(event) => setSyncStatus(event.target.value as 'all' | DashboardStatus)}>
            <option value="all">All statuses</option>
            {(['synced', 'needs_sync', 'failed', 'broken_link', 'not_shared', 'mapping_missing', 'needs_review'] as DashboardStatus[]).map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </Select>
          <Select label="Visibility" value={visibility} onChange={(event) => setVisibility(event.target.value as 'all' | CampaignDocVisibility)}>
            <option value="all">All visibility</option>
            <option value="dm_only">DM-only</option>
            <option value="player_safe">Player-safe</option>
            <option value="revealed">Revealed</option>
          </Select>
          <Select label="Reveal state" value={revealState} onChange={(event) => setRevealState(event.target.value as 'all' | CampaignDocRevealState)}>
            <option value="all">All reveal states</option>
            <option value="unrevealed">Unrevealed</option>
            <option value="partially_revealed">Partially revealed</option>
            <option value="revealed">Revealed</option>
            <option value="retracted">Retracted</option>
          </Select>
          <Select label="Adventure" value={adventureFilter} onChange={(event) => setAdventureFilter(event.target.value)}>
            <option value="all">All adventures</option>
            {adventures.map((adv) => (
              <option key={adv.id} value={adv.id}>{adv.title}</option>
            ))}
            <option value={NO_ADVENTURE}>Not linked to an Adventure</option>
          </Select>
          <Select label="Linked/unlinked" value={linked} onChange={(event) => setLinked(event.target.value as LinkedFilter)}>
            <option value="all">All docs</option>
            <option value="linked">Linked to live object</option>
            <option value="unlinked">Unlinked from live object</option>
          </Select>
          <Select label="Broken links" value={broken} onChange={(event) => setBroken(event.target.value as BrokenFilter)}>
            <option value="all">All link health</option>
            <option value="broken">Broken only</option>
            <option value="ok">Not broken</option>
          </Select>
          <Select label="Needs review" value={review} onChange={(event) => setReview(event.target.value as ReviewFilter)}>
            <option value="all">All review states</option>
            <option value="needs_review">Needs review</option>
            <option value="ok">No review flag</option>
          </Select>
        </div>
      </Card>

      <Card padding="none" className="overflow-hidden">
        <div className="border-b border-zinc-800 px-4 py-3">
          <p className="text-sm text-zinc-400">{filteredRows.length} docs shown</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-800 text-sm">
            <thead className="bg-zinc-950/80 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Doc</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Health</th>
                <th className="px-4 py-3">Sync</th>
                <th className="px-4 py-3">Links</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">No docs match the current filters.</td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.doc.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="min-w-64">
                        <p className="font-medium text-zinc-100">{row.doc.title}</p>
                        <p className="mt-1 text-xs text-zinc-500">{campaignDocTypeLabel(row.doc.doc_type)} · {row.doc.source}</p>
                        {row.doc.tags.length > 0 && (
                          <p className="mt-1 max-w-xs truncate text-xs text-zinc-600">{row.doc.tags.join(', ')}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex max-w-80 flex-wrap gap-1.5">
                        {row.statuses.map((status) => <span key={status}>{statusBadge(status)}</span>)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-zinc-300">{row.issue}</p>
                      {row.mapping && <p className="mt-1 text-xs text-zinc-600">{row.mapping.notion_database_name || 'Mapped database'}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      <p>Last: {formatDate(row.doc.last_synced_at)}</p>
                      <p>Updated: {formatDate(row.doc.updated_at)}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      <p>{row.liveLinkCount} live object{row.liveLinkCount === 1 ? '' : 's'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex min-w-80 flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => runAction(`row-sync-${row.doc.id}`, () => syncCodexDoc(campaignId, row.doc.id))}
                          loading={busy === `row-sync-${row.doc.id}`}
                          disabled={row.doc.source !== 'notion' || !row.doc.source_page_id || busy !== null}
                          title="Sync this Notion-linked doc"
                        >
                          <RefreshCw className="h-4 w-4" aria-hidden="true" />
                          Sync
                        </Button>
                        {row.doc.source_url && (
                          <a
                            href={row.doc.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-600 bg-zinc-700 px-3 py-1.5 text-sm text-zinc-100 transition-colors hover:bg-zinc-600"
                          >
                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                            Notion
                          </a>
                        )}
                        <Link
                          href={`/campaigns/${campaignId}/codex?doc=${row.doc.id}`}
                          className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-600 bg-zinc-700 px-3 py-1.5 text-sm text-zinc-100 transition-colors hover:bg-zinc-600"
                        >
                          <FileText className="h-4 w-4" aria-hidden="true" />
                          Codex
                        </Link>
                        <Link
                          href={`/campaigns/${campaignId}/live-map`}
                          className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-600 bg-zinc-700 px-3 py-1.5 text-sm text-zinc-100 transition-colors hover:bg-zinc-600"
                        >
                          <Link2 className="h-4 w-4" aria-hidden="true" />
                          Attach
                        </Link>
                        <Link
                          href={`/campaigns/${campaignId}/codex?doc=${row.doc.id}`}
                          className="inline-flex items-center justify-center gap-2 rounded-md border border-zinc-600 bg-zinc-700 px-3 py-1.5 text-sm text-zinc-100 transition-colors hover:bg-zinc-600"
                        >
                          <Eye className="h-4 w-4" aria-hidden="true" />
                          Review
                        </Link>
                        {row.statuses.includes('broken_link') && (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => runAction(`detach-${row.doc.id}`, () => removeCampaignDocNotionLink(campaignId, row.doc.id))}
                            loading={busy === `detach-${row.doc.id}`}
                            disabled={busy !== null}
                            title="Detach broken Notion link"
                          >
                            <Unlink className="h-4 w-4" aria-hidden="true" />
                            Detach
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {wipeOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-red-800/60 bg-zinc-950 p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <Trash2 className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden="true" />
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-zinc-100">Delete local synced Notion data?</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Choose which Adventure you want to clear from the Companion app. This only
                  removes local synced Codex/cache records for that Adventure. It does not delete
                  or modify anything in Notion.
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <Select
                label="Adventure to clear"
                value={wipeTarget}
                onChange={(event) => setWipeTarget(event.target.value)}
              >
                <option value="">Select an Adventure…</option>
                {adventures.map((adv) => (
                  <option key={adv.id} value={adv.id}>
                    {adv.title} ({docCountByAdventure.get(adv.id) ?? 0} records)
                  </option>
                ))}
                <option value={NO_ADVENTURE}>
                  Records not linked to an Adventure ({docCountByAdventure.get(NO_ADVENTURE) ?? 0} records)
                </option>
              </Select>

              {wipeTarget !== '' && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm">
                  <p className="text-zinc-300">
                    Will delete <span className="font-semibold text-red-300">{wipePreviewCount}</span> local
                    Codex record(s) for <span className="font-medium text-zinc-100">{wipeTargetLabel}</span>,
                    plus their Companion links and reveals.
                  </p>
                  <p className="mt-1 text-xs text-emerald-300">
                    Notion is NOT touched. No Notion pages are deleted. Your Notion mappings stay —
                    you can re-sync to repopulate this cache.
                  </p>
                </div>
              )}

              <div>
                <label htmlFor="wipe-phrase" className="mb-1 block text-xs font-medium text-zinc-400">
                  Type <span className="font-mono text-red-300">{WIPE_CONFIRMATION_PHRASE}</span> to confirm
                </label>
                <Input
                  id="wipe-phrase"
                  value={wipePhrase}
                  onChange={(event) => setWipePhrase(event.target.value)}
                  placeholder={WIPE_CONFIRMATION_PHRASE}
                  autoComplete="off"
                />
              </div>

              <div className="mt-1 flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={closeWipe} disabled={busy === 'wipe'}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={confirmWipe}
                  loading={busy === 'wipe'}
                  disabled={!canConfirmWipe}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete local data
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Metric({
  title,
  value,
  icon,
  urgent = false,
  compact = false,
}: {
  title: string
  value: number | string
  icon: ReactNode
  urgent?: boolean
  compact?: boolean
}) {
  return (
    <Card className={urgent ? 'border-orange-500/30 bg-orange-500/[0.04]' : ''}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-zinc-500">{title}</p>
          <div className={compact ? 'mt-2 text-sm font-semibold text-zinc-100' : 'mt-2'}>
            {compact ? value : metricValue(value)}
          </div>
        </div>
        <span className={urgent ? 'text-orange-400' : 'text-zinc-600'}>
          {icon && <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
        </span>
      </div>
    </Card>
  )
}
