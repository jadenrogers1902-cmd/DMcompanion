'use client'

import Link from 'next/link'
import { useMemo, useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { campaignDocTypeLabel } from '@/lib/codex/options'
import type { PreparedMapToken, PreparedTokenType } from '@/lib/types/adventure'
import type { CampaignDoc, CampaignDocSource, CampaignDocType } from '@/lib/types/database'
import { preparedTokenTypeMeta } from './token-meta'

export type StaticTokenTemplate = {
  key: string
  label: string
  type: PreparedTokenType
  icon: string
  color: string
  state?: string
  description: string
  interactable: boolean
}

const STATIC_TEMPLATES: StaticTokenTemplate[] = [
  { key: 'door', label: 'Door', type: 'door', icon: 'D', color: '#78716c', state: 'closed', description: 'A door or gate.', interactable: true },
  { key: 'chest', label: 'Chest', type: 'loot', icon: 'C', color: '#a16207', state: 'locked', description: 'A container that may hold treasure or clues.', interactable: true },
  { key: 'lever', label: 'Lever', type: 'custom', icon: 'L', color: '#ca8a04', state: 'disabled', description: 'A switchable mechanism.', interactable: true },
  { key: 'button', label: 'Button', type: 'custom', icon: 'B', color: '#d97706', state: 'disabled', description: 'A pressable control.', interactable: true },
  { key: 'trap', label: 'Trap', type: 'trap', icon: 'T', color: '#ea580c', state: 'trapped', description: 'A hidden or visible hazard.', interactable: true },
  { key: 'portal', label: 'Portal', type: 'custom', icon: 'P', color: '#7c3aed', state: 'disabled', description: 'A magical or physical transition point.', interactable: true },
  { key: 'stairs', label: 'Stairs', type: 'location', icon: 'S', color: '#0d9488', description: 'A connection to another elevation or area.', interactable: false },
  { key: 'sign', label: 'Sign', type: 'clue', icon: 'I', color: '#2563eb', description: 'Readable world information.', interactable: true },
  { key: 'loot', label: 'Loot', type: 'loot', icon: '$', color: '#ca8a04', state: 'hidden', description: 'Treasure or recoverable supplies.', interactable: true },
  { key: 'light', label: 'Light', type: 'custom', icon: '*', color: '#eab308', state: 'visible', description: 'A light source or illumination marker.', interactable: false },
  { key: 'puzzle', label: 'Puzzle', type: 'custom', icon: '?', color: '#0891b2', description: 'A puzzle component or clue object.', interactable: true },
  { key: 'hazard', label: 'Hazard', type: 'trap', icon: '!', color: '#dc2626', state: 'trapped', description: 'Dangerous terrain or an environmental threat.', interactable: false },
  { key: 'custom', label: 'Custom', type: 'custom', icon: '+', color: '#52525b', description: 'A custom fixed map object.', interactable: true },
]

const DYNAMIC_DOC_TYPES = new Set([
  'character',
  'npc',
  'boss',
  'hostile_enemy',
  'item',
  'loot',
  'location',
  'sub_location',
  'faction',
  'rumor',
  'side_quest',
  'main_quest',
  'object_note',
  'map_note',
])

function sourceLabel(source: CampaignDocSource | string | null | undefined) {
  if (source === 'notion') return 'Notion'
  if (source === 'manual') return 'Manual'
  if (source === 'import') return 'Import'
  return 'Codex'
}

function docMatches(doc: CampaignDoc, query: string) {
  if (!query) return true
  const q = query.toLowerCase()
  return [doc.title, doc.doc_type, doc.status, doc.source, ...doc.tags]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q))
}

function Collapsible({
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string
  badge?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-zinc-900"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <svg
            className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${open ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-semibold text-zinc-100">{title}</span>
        </span>
        {badge}
      </button>
      {open && <div className="border-t border-zinc-800 p-3">{children}</div>}
    </section>
  )
}

export function TokenBuilderPanel({
  campaignId,
  hasImage,
  docs,
  tokens,
  selectedTokenId,
  onAddLinkedDoc,
  onAddStaticToken,
  onAddTransportToken,
  onSelectToken,
  onRemoveToken,
}: {
  campaignId: string
  hasImage: boolean
  docs: CampaignDoc[]
  tokens: PreparedMapToken[]
  selectedTokenId: string | null
  onAddLinkedDoc: (doc: CampaignDoc) => void
  onAddStaticToken: (template: StaticTokenTemplate) => void
  onAddTransportToken: () => void
  onSelectToken: (id: string) => void
  onRemoveToken: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [source, setSource] = useState<'all' | CampaignDocSource>('all')
  const [linked, setLinked] = useState<'all' | 'linked' | 'unlinked'>('all')
  const [activeType, setActiveType] = useState<'' | CampaignDocType>('')

  const linkedDocIds = useMemo(
    () => new Set(tokens.map((token) => token.linked_campaign_doc_id).filter(Boolean) as string[]),
    [tokens],
  )
  const dynamicDocs = useMemo(
    () => docs.filter((doc) => DYNAMIC_DOC_TYPES.has(doc.doc_type)),
    [docs],
  )
  const availableTypes = useMemo(() => {
    const types = Array.from(new Set(dynamicDocs.map((doc) => doc.doc_type))).sort((a, b) =>
      campaignDocTypeLabel(a).localeCompare(campaignDocTypeLabel(b)),
    )
    return types
  }, [dynamicDocs])

  const visibleDocs = useMemo(() => {
    return dynamicDocs.filter((doc) => {
      if (activeType && doc.doc_type !== activeType) return false
      if (source !== 'all' && doc.source !== source) return false
      const isLinked = linkedDocIds.has(doc.id)
      if (linked === 'linked' && !isLinked) return false
      if (linked === 'unlinked' && isLinked) return false
      return docMatches(doc, query.trim())
    })
  }, [activeType, dynamicDocs, linked, linkedDocIds, query, source])

  const placedTokens = tokens.slice().reverse()

  return (
    <aside className="flex min-h-0 flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Map Builder Tokens</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Add linked characters, enemies, objects, and world elements to this map.
        </p>
      </div>

      <Collapsible
        title="Dynamic Tokens"
        badge={<Badge variant="player">{dynamicDocs.length}</Badge>}
      >
        <p className="text-xs text-zinc-500">Live-aware entity tokens linked to Codex records.</p>

        <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          <Input
            label="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, tags, type"
            className="sm:col-span-3 lg:col-span-1 xl:col-span-3"
          />
          <Select label="Source" value={source} onChange={(event) => setSource(event.target.value as 'all' | CampaignDocSource)}>
            <option value="all">All sources</option>
            <option value="notion">Notion</option>
            <option value="manual">Manual</option>
            <option value="import">Import</option>
          </Select>
          <Select label="Linked" value={linked} onChange={(event) => setLinked(event.target.value as 'all' | 'linked' | 'unlinked')}>
            <option value="all">All entries</option>
            <option value="unlinked">Unlinked</option>
            <option value="linked">Already linked</option>
          </Select>
          <Select label="Type" value={activeType} onChange={(event) => setActiveType(event.target.value as '' | CampaignDocType)}>
            <option value="">All types</option>
            {availableTypes.map((type) => (
              <option key={type} value={type}>{campaignDocTypeLabel(type)}</option>
            ))}
          </Select>
        </div>

        <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
          <h4 className="text-sm font-semibold text-zinc-100">Add Linked Token</h4>
          {availableTypes.length === 0 ? (
            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-500">
              <p>No synced Codex entries found. Sync from Notion or create Codex entries first.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/campaigns/${campaignId}/codex`}>
                  <Button type="button" size="sm" variant="secondary">Open Adventure Codex</Button>
                </Link>
                <Link href={`/campaigns/${campaignId}/codex/sync`}>
                  <Button type="button" size="sm" variant="secondary">Open Sync Dashboard</Button>
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveType('')}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    activeType === ''
                      ? 'border-amber-500/70 bg-amber-500/15 text-amber-200'
                      : 'border-zinc-700 bg-zinc-950 text-zinc-400 hover:border-zinc-500'
                  }`}
                >
                  All
                </button>
                {availableTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                  onClick={() => setActiveType(type)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      activeType === type
                        ? 'border-amber-500/70 bg-amber-500/15 text-amber-200'
                        : 'border-zinc-700 bg-zinc-950 text-zinc-400 hover:border-zinc-500'
                    }`}
                  >
                    {campaignDocTypeLabel(type)}
                  </button>
                ))}
              </div>

              <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-zinc-800">
                <table className="min-w-full text-left text-xs">
                  <thead className="sticky top-0 bg-zinc-950 text-zinc-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="hidden px-3 py-2 font-medium sm:table-cell">Tags</th>
                      <th className="hidden px-3 py-2 font-medium xl:table-cell">Status</th>
                      <th className="px-3 py-2 font-medium">Linked</th>
                      <th className="px-3 py-2 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {visibleDocs.slice(0, 80).map((doc) => {
                      const isLinked = linkedDocIds.has(doc.id)
                      return (
                        <tr key={doc.id} className="bg-zinc-900/70">
                          <td className="max-w-[12rem] px-3 py-2">
                            <div className="truncate font-medium text-zinc-100">{doc.title}</div>
                            <div className="text-[11px] text-zinc-600">{sourceLabel(doc.source)}</div>
                          </td>
                          <td className="px-3 py-2 text-zinc-400">{campaignDocTypeLabel(doc.doc_type)}</td>
                          <td className="hidden max-w-[10rem] px-3 py-2 text-zinc-500 sm:table-cell">
                            <span className="line-clamp-1">{doc.tags.join(', ') || 'None'}</span>
                          </td>
                          <td className="hidden px-3 py-2 text-zinc-500 xl:table-cell">{doc.status}</td>
                          <td className="px-3 py-2">
                            <Badge variant={isLinked ? 'success' : 'default'}>{isLinked ? 'Yes' : 'No'}</Badge>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant={isLinked ? 'secondary' : 'primary'}
                              disabled={!hasImage}
                              onClick={() => onAddLinkedDoc(doc)}
                            >
                              Add Token
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                    {visibleDocs.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-sm text-zinc-500">
                          No Codex entries match these filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {!hasImage && (
                <p className="mt-2 text-xs text-zinc-600">Add a background map image before placing tokens.</p>
              )}
            </>
          )}
        </div>
      </Collapsible>

      <Collapsible title="Transport Tokens">
        <p className="text-xs text-zinc-500">
          Travel points. Players tap a transport token to move the party to the map you link it to —
          they vote in party mode, or enter directly when alone.
        </p>
        <button
          type="button"
          disabled={!hasImage}
          onClick={onAddTransportToken}
          className="mt-3 inline-flex items-center gap-2 rounded-full border border-violet-500/60 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-200 transition-colors hover:border-violet-400 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          🌀 Add Transport
        </button>
        <p className="mt-2 text-xs text-zinc-600">
          After placing it, open the token to pick its destination map.
        </p>
      </Collapsible>

      <Collapsible title="Static Tokens">
        <p className="text-xs text-zinc-500">Fixed objects the DM can place and players cannot move.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {STATIC_TEMPLATES.map((template) => (
            <button
              key={template.key}
              type="button"
              disabled={!hasImage}
              onClick={() => onAddStaticToken(template)}
              className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {template.label}
            </button>
          ))}
        </div>
      </Collapsible>

      <Collapsible title="World Objects">
        <p className="text-xs text-zinc-500">
          Static objects default to DM-only or hidden states. Visible objects can still be inspected or routed through DM approval after deployment.
        </p>
      </Collapsible>

      <Collapsible title="Encounter Aids">
        <div className="flex flex-wrap gap-2">
          {STATIC_TEMPLATES.filter((item) => ['trap', 'hazard', 'light', 'loot', 'puzzle'].includes(item.key)).map((template) => (
            <button
              key={`aid-${template.key}`}
              type="button"
              disabled={!hasImage}
              onClick={() => onAddStaticToken(template)}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {template.label}
            </button>
          ))}
        </div>
      </Collapsible>

      {placedTokens.length > 0 && (
        <Collapsible
          title="Placed Tokens"
          badge={<span className="text-xs text-zinc-500">{placedTokens.length}</span>}
        >
          <div className="flex flex-col gap-1.5">
            {placedTokens.map((token) => {
              const meta = preparedTokenTypeMeta(token.token_type)
              const isSelected = selectedTokenId === token.id
              return (
                <div
                  key={token.id}
                  className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm ${
                    isSelected
                      ? 'border-amber-500/60 bg-amber-500/10 text-zinc-100'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectToken(token.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-black/40 text-[11px]"
                      style={{ backgroundColor: token.color }}
                    >
                      {token.icon || meta.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{token.name || meta.label}</span>
                    <span className="text-[10px] uppercase text-zinc-600">{token.is_dynamic ? 'Dynamic' : 'Static'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveToken(token.id)}
                    className="shrink-0 rounded-md p-1 text-zinc-600 hover:bg-zinc-800 hover:text-red-400"
                    aria-label={`Remove ${token.name || meta.label}`}
                    title="Remove token"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        </Collapsible>
      )}
    </aside>
  )
}
