'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { CAMPAIGN_DOC_TYPES, campaignDocTypeLabel } from '@/lib/codex/options'
import {
  deleteNotionMapping,
  loadNotionDatabaseSchema,
  saveNotionMapping,
  testNotionMapping,
  type NotionDatabaseSchema,
  type NotionDiscoveredDatabase,
  type NotionMappingInput,
} from '@/lib/actions/notion-mappings'
import { syncAllNotionDatabases, syncNotionDatabase } from '@/lib/actions/notion-sync'
import type { MappingPreview } from '@/lib/notion/mapping'
import type { CampaignDocType, NotionSyncMapping } from '@/lib/types/database'

type DraftState = {
  notion_database_id: string
  notion_database_name: string
  doc_type: CampaignDocType
  title_property: string
  dm_summary_property: string
  player_summary_property: string
  dm_notes_property: string
  tags_property: string
  status_property: string
  source_url_property: string
  relation_properties: string[]
}

const EMPTY_DRAFT: DraftState = {
  notion_database_id: '',
  notion_database_name: '',
  doc_type: 'location',
  title_property: '',
  dm_summary_property: '',
  player_summary_property: '',
  dm_notes_property: '',
  tags_property: '',
  status_property: '',
  source_url_property: '',
  relation_properties: [],
}

function draftFromMapping(m: NotionSyncMapping): DraftState {
  return {
    notion_database_id: m.notion_database_id,
    notion_database_name: m.notion_database_name ?? '',
    doc_type: m.doc_type,
    title_property: m.title_property ?? '',
    dm_summary_property: m.dm_summary_property ?? '',
    player_summary_property: m.player_summary_property ?? '',
    dm_notes_property: m.dm_notes_property ?? '',
    tags_property: m.tags_property ?? '',
    status_property: m.status_property ?? '',
    source_url_property: m.source_url_property ?? '',
    relation_properties: m.relation_properties ?? [],
  }
}

function draftToInput(draft: DraftState): NotionMappingInput {
  return {
    notion_database_id: draft.notion_database_id,
    notion_database_name: draft.notion_database_name || null,
    doc_type: draft.doc_type,
    title_property: draft.title_property || null,
    dm_summary_property: draft.dm_summary_property || null,
    player_summary_property: draft.player_summary_property || null,
    dm_notes_property: draft.dm_notes_property || null,
    tags_property: draft.tags_property || null,
    status_property: draft.status_property || null,
    source_url_property: draft.source_url_property || null,
    relation_properties: draft.relation_properties,
  }
}

export function NotionMappingManager({
  campaignId,
  mappings,
  serverReady,
  initialNotice = null,
}: {
  campaignId: string
  mappings: NotionSyncMapping[]
  serverReady: boolean
  initialNotice?: string | null
}) {
  const router = useRouter()
  const [dbInput, setDbInput] = useState('')
  const [schema, setSchema] = useState<NotionDatabaseSchema | null>(null)
  const [discoveredDatabases, setDiscoveredDatabases] = useState<NotionDiscoveredDatabase[]>([])
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState<'load' | 'test' | 'save' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(initialNotice)
  const [preview, setPreview] = useState<MappingPreview | null>(null)
  const [syncBusy, setSyncBusy] = useState<string | null>(null)

  // Property options = schema names ∪ values already selected in the draft (so
  // an existing mapping shows its saved props even before the schema is loaded).
  const propertyOptions = useMemo(() => {
    const names = new Set<string>(schema?.properties.map((p) => p.name) ?? [])
    ;[
      draft.title_property,
      draft.dm_summary_property,
      draft.player_summary_property,
      draft.dm_notes_property,
      draft.tags_property,
      draft.status_property,
      draft.source_url_property,
      ...draft.relation_properties,
    ].forEach((v) => v && names.add(v))
    return Array.from(names).sort((a, b) => a.localeCompare(b))
  }, [schema, draft])

  function resetEditor() {
    setDraft(EMPTY_DRAFT)
    setSchema(null)
    setDiscoveredDatabases([])
    setDbInput('')
    setEditingId(null)
    setPreview(null)
    setError(null)
    setNotice(null)
  }

  async function loadSchema(inputOverride?: string) {
    setBusy('load')
    setError(null)
    setNotice(null)
    const target = inputOverride ?? (dbInput || draft.notion_database_id)
    const result = await loadNotionDatabaseSchema(campaignId, target)
    setBusy(null)
    if (result.error || !result.schema) {
      if (result.databases && result.databases.length > 0) {
        setDiscoveredDatabases(result.databases)
        setError(null)
        setNotice(`Found ${result.databases.length} database${result.databases.length === 1 ? '' : 's'} on that Notion page. Choose one to map.`)
        return
      }
      setError(result.error ?? 'The database could not be loaded.')
      return
    }
    setDiscoveredDatabases([])
    setSchema(result.schema)
    setDraft((prev) => ({
      ...prev,
      notion_database_id: result.schema!.databaseId,
      notion_database_name: prev.notion_database_name || result.schema!.title,
    }))
    setNotice(`Loaded "${result.schema.title}" (${result.schema.properties.length} properties).`)
  }

  async function test() {
    setBusy('test')
    setError(null)
    setNotice(null)
    setPreview(null)
    const result = await testNotionMapping(campaignId, draftToInput(draft))
    setBusy(null)
    if (result.error || !result.preview) {
      setError(result.error ?? 'The mapping could not be previewed.')
      return
    }
    setPreview(result.preview)
  }

  async function save() {
    setBusy('save')
    setError(null)
    setNotice(null)
    const result = await saveNotionMapping(campaignId, draftToInput(draft))
    setBusy(null)
    if (result.error) {
      setError(result.error)
      return
    }
    setNotice('Mapping saved.')
    resetEditor()
    router.refresh()
  }

  async function remove(mappingId: string) {
    const result = await deleteNotionMapping(campaignId, mappingId)
    if (result.error) {
      setError(result.error)
      return
    }
    if (editingId === mappingId) resetEditor()
    setNotice(result.message ?? 'Mapping removed. Local Notion references were cleared.')
    router.refresh()
  }

  async function syncOne(mappingId: string) {
    setSyncBusy(mappingId)
    setError(null)
    setNotice(null)
    const result = await syncNotionDatabase(campaignId, mappingId)
    setSyncBusy(null)
    if (result.error) {
      setError(result.error)
      return
    }
    setNotice(`Sync complete — ${result.message ?? 'done.'}`)
    router.refresh()
  }

  async function syncAll() {
    setSyncBusy('all')
    setError(null)
    setNotice(null)
    const result = await syncAllNotionDatabases(campaignId)
    setSyncBusy(null)
    if (result.error) {
      setError(result.error)
      return
    }
    setNotice(`Sync complete — ${result.message ?? 'done.'}`)
    router.refresh()
  }

  function editExisting(m: NotionSyncMapping) {
    setEditingId(m.id)
    setDraft(draftFromMapping(m))
    setDbInput(m.notion_database_id)
    setSchema(null)
    setDiscoveredDatabases([])
    setPreview(null)
    setError(null)
    setNotice('Editing a saved mapping. Load the database to refresh its property list.')
  }

  const hasDb = Boolean(draft.notion_database_id)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Table Mappings</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Map each Notion source table onto an Adventure Codex table type. All synced
          content defaults to DM-only — players never see a mapped field unless
          you explicitly reveal it.{' '}
          <Link href={`/campaigns/${campaignId}/settings`} className="text-amber-400 hover:text-amber-300">
            Manage the Notion connection
          </Link>
          .
        </p>
      </div>

      {!serverReady && (
        <Card className="border-amber-500/30 bg-amber-500/[0.04]">
          <p className="text-sm text-amber-200">
            Notion is not connected yet. Add and verify an integration token in
            campaign settings before creating mappings.
          </p>
        </Card>
      )}

      {error && (
        <p className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</p>
      )}
      {notice && (
        <p className="rounded-lg border border-emerald-800/60 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">{notice}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? 'Edit Mapping' : 'Add Mapping'}</CardTitle>
        </CardHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Input
                label="Notion database link or ID"
                value={dbInput}
                onChange={(event) => setDbInput(event.target.value)}
                placeholder="https://www.notion.so/...?v=..."
                disabled={!serverReady}
              />
            </div>
            <Button size="sm" onClick={() => loadSchema()} loading={busy === 'load'} disabled={!serverReady || (!dbInput.trim() && !hasDb)}>
              Load database
            </Button>
          </div>

          {discoveredDatabases.length > 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <p className="text-xs font-medium text-zinc-300">Databases found on that page</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {discoveredDatabases.map((db) => (
                  <Button
                    key={db.databaseId}
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setDbInput(db.databaseId)
                      setDraft((prev) => ({
                        ...prev,
                        notion_database_id: db.databaseId,
                        notion_database_name: db.title,
                      }))
                      setDiscoveredDatabases([])
                      void loadSchema(db.databaseId)
                    }}
                  >
                    {db.title}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {hasDb && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label="Codex doc type"
                  value={draft.doc_type}
                  onChange={(event) => setDraft({ ...draft, doc_type: event.target.value as CampaignDocType })}
                >
                  {CAMPAIGN_DOC_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </Select>
                <Input
                  label="Database label (optional)"
                  value={draft.notion_database_name}
                  onChange={(event) => setDraft({ ...draft, notion_database_name: event.target.value })}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <PropertySelect label="Title" value={draft.title_property} options={propertyOptions} onChange={(v) => setDraft({ ...draft, title_property: v })} />
                <PropertySelect label="Status" value={draft.status_property} options={propertyOptions} onChange={(v) => setDraft({ ...draft, status_property: v })} />
                <PropertySelect label="DM summary (DM-only)" value={draft.dm_summary_property} options={propertyOptions} onChange={(v) => setDraft({ ...draft, dm_summary_property: v })} />
                <PropertySelect label="Player-safe summary" value={draft.player_summary_property} options={propertyOptions} onChange={(v) => setDraft({ ...draft, player_summary_property: v })} />
                <PropertySelect label="DM notes (DM-only)" value={draft.dm_notes_property} options={propertyOptions} onChange={(v) => setDraft({ ...draft, dm_notes_property: v })} />
                <PropertySelect label="Tags" value={draft.tags_property} options={propertyOptions} onChange={(v) => setDraft({ ...draft, tags_property: v })} />
                <PropertySelect label="Source URL (optional)" value={draft.source_url_property} options={propertyOptions} onChange={(v) => setDraft({ ...draft, source_url_property: v })} />
              </div>

              <fieldset className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <legend className="px-1 text-xs font-medium text-zinc-400">Relation properties → related docs</legend>
                {propertyOptions.length === 0 ? (
                  <p className="text-xs text-zinc-600">Load the database to choose relation properties.</p>
                ) : (
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {propertyOptions.map((name) => {
                      const checked = draft.relation_properties.includes(name)
                      return (
                        <label key={name} className="flex items-center gap-2 text-xs text-zinc-300">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              setDraft((prev) => ({
                                ...prev,
                                relation_properties: event.target.checked
                                  ? [...prev.relation_properties, name]
                                  : prev.relation_properties.filter((p) => p !== name),
                              }))
                            }
                            className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-900"
                          />
                          <span className="truncate">{name}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </fieldset>

              <p className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-[11px] text-zinc-500">
                Combat stats and ability scores should be mapped to DM notes only.
                They are treated as DM reference text — Notion never controls live
                combat, HP, AC, or initiative.
              </p>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={test} loading={busy === 'test'} disabled={!serverReady}>
                  Test mapping
                </Button>
                <Button size="sm" onClick={save} loading={busy === 'save'} disabled={!serverReady}>
                  {editingId ? 'Update mapping' : 'Save mapping'}
                </Button>
                <Button size="sm" variant="secondary" onClick={resetEditor}>
                  {editingId ? 'Cancel edit' : 'Clear'}
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>

      {preview && <MappingPreviewCard preview={preview} docType={draft.doc_type} />}

      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center justify-between gap-3">
              Saved Mappings
              {mappings.some((m) => m.enabled) && (
                <Button size="sm" onClick={syncAll} loading={syncBusy === 'all'} disabled={!serverReady || syncBusy !== null}>
                  Sync all
                </Button>
              )}
            </span>
          </CardTitle>
        </CardHeader>
        {mappings.length === 0 ? (
          <p className="text-sm text-zinc-500">No databases mapped yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {mappings.map((m) => (
              <div key={m.id} className="flex items-start justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-zinc-100">
                      {m.notion_database_name || 'Notion database'}
                    </p>
                    <Badge variant="dm">{campaignDocTypeLabel(m.doc_type)}</Badge>
                    {!m.enabled && <Badge variant="warning">Disabled</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {m.relation_properties.length} relation{m.relation_properties.length === 1 ? '' : 's'} mapped
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    onClick={() => syncOne(m.id)}
                    loading={syncBusy === m.id}
                    disabled={!serverReady || !m.enabled || syncBusy !== null}
                  >
                    Sync now
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => editExisting(m)}>Edit</Button>
                  <Button size="sm" variant="danger" onClick={() => remove(m.id)}>Delete</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function PropertySelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <Select label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">— None —</option>
      {options.map((name) => (
        <option key={name} value={name}>{name}</option>
      ))}
    </Select>
  )
}

function MappingPreviewCard({ preview, docType }: { preview: MappingPreview; docType: CampaignDocType }) {
  return (
    <Card className="border-amber-500/20 bg-amber-500/[0.03]">
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            Sample Preview
            <Badge variant="dm">{campaignDocTypeLabel(docType)}</Badge>
          </span>
        </CardTitle>
      </CardHeader>
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-zinc-600">Title</p>
          <p className="text-sm text-zinc-100">{preview.title || <span className="text-zinc-600">No title mapped</span>}</p>
        </div>

        <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-3">
          <p className="text-[11px] uppercase tracking-wide text-amber-300/80">DM-only</p>
          {preview.dmFields.length === 0 ? (
            <p className="mt-1 text-xs text-zinc-600">No DM-only fields mapped.</p>
          ) : (
            preview.dmFields.map((f) => (
              <div key={f.label} className="mt-2">
                <p className="text-[11px] font-medium text-amber-200/80">{f.label}</p>
                <p className="whitespace-pre-wrap text-xs text-zinc-300">{f.value}</p>
              </div>
            ))
          )}
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">Player-safe</p>
          {preview.playerFields.length === 0 ? (
            <p className="mt-1 text-xs text-zinc-600">No player-safe fields mapped (stays DM-only).</p>
          ) : (
            preview.playerFields.map((f) => (
              <div key={f.label} className="mt-2">
                <p className="text-[11px] font-medium text-zinc-400">{f.label}</p>
                <p className="whitespace-pre-wrap text-xs text-zinc-300">{f.value}</p>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {preview.status && <Badge variant="default">Status: {preview.status}</Badge>}
          {preview.tags.map((tag) => (
            <Badge key={tag} variant="default">{tag}</Badge>
          ))}
        </div>

        {preview.relations.length > 0 && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">Relations</p>
            <div className="mt-2 flex flex-col gap-1">
              {preview.relations.map((rel) => (
                <p key={rel.property} className="text-xs text-zinc-400">
                  <span className="text-zinc-200">{rel.property}</span>: {rel.count} linked
                  {rel.sample && <span className="text-zinc-600"> — {rel.sample}</span>}
                </p>
              ))}
            </div>
          </div>
        )}

        {preview.warnings.length > 0 && (
          <div className="rounded-lg border border-yellow-700/40 bg-yellow-950/30 p-3">
            <p className="text-[11px] uppercase tracking-wide text-yellow-400/80">Warnings</p>
            <ul className="mt-1 list-disc pl-4 text-xs text-yellow-200/90">
              {preview.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  )
}
