'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { CAMPAIGN_DOC_TYPES } from '@/lib/codex/options'
import {
  autoImportNotionTables,
  discoverNotionTables,
  type DiscoveredTable,
  type NotionMappingInput,
} from '@/lib/actions/notion-mappings'
import type { FieldRole } from '@/lib/notion/auto-map'
import type { CampaignDocType } from '@/lib/types/database'

type AdventureOption = { id: string; title: string; status: string }

function roleLabel(role: FieldRole): string {
  switch (role) {
    case 'title': return 'Title'
    case 'dm_summary': return 'DM summary'
    case 'player_summary': return 'Player-safe summary'
    case 'dm_notes': return 'DM notes'
    case 'tags': return 'Tags'
    case 'status': return 'Status'
    case 'relation': return 'Linked records'
    case 'ignored': return 'Ignored'
  }
}

export function NotionTableDiscovery({
  campaignId,
  adventures,
  serverReady,
}: {
  campaignId: string
  adventures: AdventureOption[]
  serverReady: boolean
}) {
  const router = useRouter()
  const [tables, setTables] = useState<DiscoveredTable[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [typeOverrides, setTypeOverrides] = useState<Record<string, CampaignDocType>>({})
  const [previewOpen, setPreviewOpen] = useState<Set<string>>(new Set())
  const [adventureId, setAdventureId] = useState('')
  const [busy, setBusy] = useState<'find' | 'import' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  function docTypeFor(t: DiscoveredTable): CampaignDocType | '' {
    return typeOverrides[t.databaseId] ?? t.auto.docType ?? ''
  }

  async function find() {
    setBusy('find')
    setError(null)
    setNotice(null)
    const result = await discoverNotionTables(campaignId)
    setBusy(null)
    setSearched(true)
    if (result.error || !result.tables) {
      setError(result.error ?? 'No tables found.')
      setTables([])
      return
    }
    setTables(result.tables)
    setSelected(new Set())
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(tables.map((t) => t.databaseId)))
  }
  function selectRecommended() {
    setSelected(new Set(tables.filter((t) => !t.auto.needsReview && !t.imported).map((t) => t.databaseId)))
  }
  function clearSelection() {
    setSelected(new Set())
  }
  function togglePreview(id: string) {
    setPreviewOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Selected tables that still lack a doc type can't be imported.
  const selectedTables = tables.filter((t) => selected.has(t.databaseId))
  const missingType = selectedTables.filter((t) => !docTypeFor(t))

  async function importSelected() {
    if (selectedTables.length === 0) return
    if (missingType.length > 0) {
      setError('Choose a table type for every selected table marked "Needs review".')
      return
    }
    setBusy('import')
    setError(null)
    setNotice(null)
    const payload: NotionMappingInput[] = selectedTables.map((t) => ({
      notion_database_id: t.databaseId,
      notion_database_name: t.title,
      doc_type: docTypeFor(t) as CampaignDocType,
      title_property: t.auto.mapping.title_property,
      dm_summary_property: t.auto.mapping.dm_summary_property,
      player_summary_property: t.auto.mapping.player_summary_property,
      dm_notes_property: t.auto.mapping.dm_notes_property,
      tags_property: t.auto.mapping.tags_property,
      status_property: t.auto.mapping.status_property,
      relation_properties: t.auto.mapping.relation_properties,
    }))
    const result = await autoImportNotionTables(campaignId, {
      adventureId: adventureId || null,
      tables: payload,
    })
    setBusy(null)
    if (result.error) {
      setError(result.error)
      return
    }
    setNotice(result.message ?? 'Imported.')
    setSelected(new Set())
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Find Tables from Notion</CardTitle>
      </CardHeader>
      <p className="text-sm text-zinc-500">
        Discover the Notion tables shared with your integration, auto-map their
        fields, and import them as Adventure Codex table cards. This imports a synced
        copy into Companion — it does not modify Notion.
      </p>

      {!serverReady && (
        <p className="mt-3 rounded-md border border-yellow-700/40 bg-yellow-950/20 px-3 py-2 text-xs text-yellow-200/90">
          Connect and verify a Notion integration in campaign settings first.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="w-56">
          <Select label="Import into Adventure" value={adventureId} onChange={(e) => setAdventureId(e.target.value)}>
            <option value="">Not linked to an Adventure</option>
            {adventures.map((a) => (
              <option key={a.id} value={a.id}>{a.title}</option>
            ))}
          </Select>
        </div>
        <Button size="sm" onClick={find} loading={busy === 'find'} disabled={!serverReady || busy !== null}>
          Find Tables from Notion
        </Button>
      </div>

      {error && <p className="mt-3 rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</p>}
      {notice && <p className="mt-3 rounded-md border border-emerald-800/60 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">{notice}</p>}

      {tables.length > 0 && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={selectAll}>Select all</Button>
            <Button size="sm" variant="secondary" onClick={selectRecommended}>Select recommended</Button>
            <Button size="sm" variant="secondary" onClick={clearSelection}>Clear</Button>
            <span className="text-xs text-zinc-500">{selected.size} selected</span>
            <Button
              size="sm"
              onClick={importSelected}
              loading={busy === 'import'}
              disabled={selected.size === 0 || busy !== null}
              className="ml-auto"
            >
              Import Selected Tables
            </Button>
          </div>

          <div className="mt-3 flex flex-col gap-2">
            {tables.map((t) => {
              const isSelected = selected.has(t.databaseId)
              const chosenType = docTypeFor(t)
              return (
                <div key={t.databaseId} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(t.databaseId)}
                      className="mt-1 h-4 w-4 rounded border-zinc-700 bg-zinc-950"
                      aria-label={`Select ${t.title}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-zinc-100">{t.title}</span>
                        <Badge variant="player">Source: Notion</Badge>
                        {t.imported ? (
                          <Badge variant="success">Imported</Badge>
                        ) : t.auto.needsReview ? (
                          <Badge variant="warning">Needs review</Badge>
                        ) : (
                          <Badge variant="default">Ready</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-zinc-500">
                        {t.fieldCount} field{t.fieldCount === 1 ? '' : 's'} · {t.auto.mapping.relation_properties.length} relation field(s)
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <div className="w-52">
                          <Select
                            aria-label={`Table type for ${t.title}`}
                            value={chosenType}
                            onChange={(e) => setTypeOverrides((prev) => ({ ...prev, [t.databaseId]: e.target.value as CampaignDocType }))}
                          >
                            <option value="">Choose table type…</option>
                            {CAMPAIGN_DOC_TYPES.map((dt) => (
                              <option key={dt.value} value={dt.value}>{dt.label}</option>
                            ))}
                          </Select>
                        </div>
                        <button
                          type="button"
                          onClick={() => togglePreview(t.databaseId)}
                          className="rounded border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-200 hover:border-amber-500/50"
                        >
                          {previewOpen.has(t.databaseId) ? 'Hide fields' : 'Preview fields'}
                        </button>
                      </div>

                      {previewOpen.has(t.databaseId) && (
                        <div className="mt-2 overflow-x-auto rounded-md border border-zinc-800">
                          <table className="min-w-full divide-y divide-zinc-800 text-xs">
                            <thead className="bg-zinc-950/80 text-left text-zinc-500">
                              <tr>
                                <th className="px-2 py-1.5">Notion field</th>
                                <th className="px-2 py-1.5">Type</th>
                                <th className="px-2 py-1.5">Suggested mapping</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800">
                              {t.auto.fieldPlan.map((f) => (
                                <tr key={f.name}>
                                  <td className="px-2 py-1.5 text-zinc-200">{f.name}</td>
                                  <td className="px-2 py-1.5 text-zinc-500">{f.type}</td>
                                  <td className="px-2 py-1.5">
                                    <span className={f.role === 'ignored' ? 'text-zinc-600' : 'text-zinc-300'}>{roleLabel(f.role)}</span>
                                    {f.confidence === 'low' && f.role !== 'ignored' && <span className="ml-1 text-yellow-500">(review)</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {missingType.length > 0 && (
            <p className="mt-2 text-xs text-yellow-400">
              {missingType.length} selected table(s) still need a type chosen before import.
            </p>
          )}
        </>
      )}

      {searched && tables.length === 0 && !error && (
        <p className="mt-3 text-sm text-zinc-500">No tables found.</p>
      )}
    </Card>
  )
}
