'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import {
  CAMPAIGN_DOC_RELATION_TYPES,
  campaignDocRelationLabel,
  campaignDocTypeLabel,
} from '@/lib/codex/options'
import type {
  CampaignDoc,
  CampaignDocLink,
  CampaignDocRelationType,
  NotionSyncMapping,
} from '@/lib/types/database'

const UNMAPPED_KEY = '__unmapped__'
const MANUAL_KEY = '__manual__'

interface SchemaNode {
  key: string
  title: string
  docType: string | null
  kind: 'mapping' | 'unmapped' | 'manual'
  mappingEnabled: boolean
  recordCount: number
  liveCount: number
  internalCount: number
  hasFailedSync: boolean
}

interface SchemaEdge {
  key: string
  from: string
  to: string
  count: number
  relations: string[]
}

interface CodexSchemaViewProps {
  campaignId: string
  docs: CampaignDoc[]
  links: CampaignDocLink[]
  mappings: NotionSyncMapping[]
  initialTable?: string
}

function tableKeyForDoc(doc: CampaignDoc, mappingDbIds: Set<string>): string {
  if (doc.source !== 'notion') return MANUAL_KEY
  if (doc.source_database_id && mappingDbIds.has(doc.source_database_id)) return doc.source_database_id
  return UNMAPPED_KEY
}

export function CodexSchemaView({ campaignId, docs, links, mappings, initialTable }: CodexSchemaViewProps) {
  const [relFilter, setRelFilter] = useState<'all' | CampaignDocRelationType>('all')
  const [liveOnly, setLiveOnly] = useState(false)
  const [playerOnly, setPlayerOnly] = useState(false)
  const [staleOnly, setStaleOnly] = useState(false)
  const [selectedNode, setSelectedNode] = useState<string | null>(initialTable ?? null)
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)

  const mappingDbIds = useMemo(() => new Set(mappings.map((m) => m.notion_database_id)), [mappings])
  const docById = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs])
  const liveLinkedDocIds = useMemo(
    () => new Set(links.filter((l) => l.live_object_id).map((l) => l.source_doc_id)),
    [links],
  )

  // Nodes: one per mapped table, plus Unmapped/Manual buckets when populated.
  const nodes = useMemo<SchemaNode[]>(() => {
    const result: SchemaNode[] = []
    const liveCountForDocs = (predicate: (d: CampaignDoc) => boolean) =>
      links.filter((l) => l.live_object_id && docById.get(l.source_doc_id) && predicate(docById.get(l.source_doc_id)!)).length

    for (const mapping of mappings) {
      const tableDocs = docs.filter(
        (d) => d.source === 'notion' && d.source_database_id === mapping.notion_database_id,
      )
      result.push({
        key: mapping.notion_database_id,
        title: mapping.notion_database_name || campaignDocTypeLabel(mapping.doc_type),
        docType: mapping.doc_type,
        kind: 'mapping',
        mappingEnabled: mapping.enabled,
        recordCount: tableDocs.length,
        liveCount: liveCountForDocs((d) => d.source_database_id === mapping.notion_database_id),
        internalCount: 0,
        hasFailedSync: tableDocs.some((d) => d.sync_status === 'failed'),
      })
    }

    const unmapped = docs.filter(
      (d) => d.source === 'notion' && (!d.source_database_id || !mappingDbIds.has(d.source_database_id)),
    )
    if (unmapped.length > 0) {
      result.push({
        key: UNMAPPED_KEY,
        title: 'Unmapped / Stale',
        docType: null,
        kind: 'unmapped',
        mappingEnabled: false,
        recordCount: unmapped.length,
        liveCount: 0,
        internalCount: 0,
        hasFailedSync: unmapped.some((d) => d.sync_status === 'failed'),
      })
    }

    const manual = docs.filter((d) => d.source !== 'notion')
    if (manual.length > 0) {
      result.push({
        key: MANUAL_KEY,
        title: 'Local Manual Records',
        docType: null,
        kind: 'manual',
        mappingEnabled: false,
        recordCount: manual.length,
        liveCount: liveCountForDocs((d) => d.source !== 'notion'),
        internalCount: 0,
        hasFailedSync: false,
      })
    }
    return result
  }, [docs, links, mappings, mappingDbIds, docById])

  // Edges: aggregate doc↔doc links by table pair (respecting the relation filter).
  const { edges, nodesWithInternal } = useMemo(() => {
    const edgeMap = new Map<string, SchemaEdge>()
    const internal = new Map<string, number>()
    for (const link of links) {
      if (!link.target_doc_id) continue
      if (relFilter !== 'all' && link.relationship_type !== relFilter) continue
      const src = docById.get(link.source_doc_id)
      const tgt = docById.get(link.target_doc_id)
      if (!src || !tgt) continue
      const from = tableKeyForDoc(src, mappingDbIds)
      const to = tableKeyForDoc(tgt, mappingDbIds)
      if (from === to) {
        internal.set(from, (internal.get(from) ?? 0) + 1)
        continue
      }
      const key = `${from}->${to}`
      const existing = edgeMap.get(key)
      if (existing) {
        existing.count += 1
        if (!existing.relations.includes(link.relationship_type)) existing.relations.push(link.relationship_type)
      } else {
        edgeMap.set(key, { key, from, to, count: 1, relations: [link.relationship_type] })
      }
    }
    const withInternal = nodes.map((n) => ({ ...n, internalCount: internal.get(n.key) ?? 0 }))
    return { edges: Array.from(edgeMap.values()), nodesWithInternal: withInternal }
  }, [links, relFilter, docById, mappingDbIds, nodes])

  // Deterministic circular layout (no Date/random).
  const layout = useMemo(() => {
    const W = 820
    const H = 520
    const cx = W / 2
    const cy = H / 2
    const r = nodesWithInternal.length <= 1 ? 0 : Math.min(W, H) / 2 - 90
    const positions = new Map<string, { x: number; y: number }>()
    nodesWithInternal.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / Math.max(1, nodesWithInternal.length) - Math.PI / 2
      positions.set(n.key, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
    })
    return { W, H, positions }
  }, [nodesWithInternal])

  const selectedEdgeObj = edges.find((e) => e.key === selectedEdge) ?? null

  // Records for the node detail list, with record-level filters applied.
  const nodeRecords = useMemo(() => {
    if (!selectedNode) return []
    return docs
      .filter((d) => tableKeyForDoc(d, mappingDbIds) === selectedNode)
      .filter((d) => (liveOnly ? liveLinkedDocIds.has(d.id) : true))
      .filter((d) => (playerOnly ? d.visibility === 'player_safe' || d.visibility === 'revealed' : true))
      .filter((d) => (staleOnly ? d.source === 'notion' && (!d.source_database_id || !mappingDbIds.has(d.source_database_id)) : true))
  }, [selectedNode, docs, mappingDbIds, liveOnly, playerOnly, staleOnly, liveLinkedDocIds])

  // Edge detail: the doc↔doc links between the two tables.
  const edgeRecords = useMemo(() => {
    if (!selectedEdgeObj) return []
    return links
      .filter((l) => l.target_doc_id)
      .filter((l) => relFilter === 'all' || l.relationship_type === relFilter)
      .map((l) => ({ link: l, src: docById.get(l.source_doc_id), tgt: l.target_doc_id ? docById.get(l.target_doc_id) : undefined }))
      .filter((row) =>
        row.src &&
        row.tgt &&
        tableKeyForDoc(row.src, mappingDbIds) === selectedEdgeObj.from &&
        tableKeyForDoc(row.tgt, mappingDbIds) === selectedEdgeObj.to,
      )
  }, [selectedEdgeObj, links, relFilter, docById, mappingDbIds])

  const nodeTitle = (key: string) => nodesWithInternal.find((n) => n.key === key)?.title ?? key

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Codex Schema</h1>
        <p className="mt-1 text-sm text-zinc-500">
          How your mapped Notion tables connect. Nodes are tables; lines are linked
          records between them.
        </p>
        <Link href={`/campaigns/${campaignId}/codex`} className="mt-2 inline-block text-xs font-medium text-amber-400 hover:text-amber-300">
          ← Back to Adventure Codex
        </Link>
      </div>

      <Card>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Select label="Focus table" value={selectedNode ?? 'all'} onChange={(e) => { setSelectedNode(e.target.value === 'all' ? null : e.target.value); setSelectedEdge(null) }}>
            <option value="all">All tables</option>
            {nodesWithInternal.map((n) => (
              <option key={n.key} value={n.key}>{n.title}</option>
            ))}
          </Select>
          <Select label="Relationship type" value={relFilter} onChange={(e) => setRelFilter(e.target.value as 'all' | CampaignDocRelationType)}>
            <option value="all">All relationships</option>
            {CAMPAIGN_DOC_RELATION_TYPES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </Select>
          <label className="flex items-end gap-2 pb-2 text-xs text-zinc-300">
            <input type="checkbox" checked={liveOnly} onChange={(e) => setLiveOnly(e.target.checked)} className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-900" />
            Live-object linked only
          </label>
          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-2 text-xs text-zinc-300">
              <input type="checkbox" checked={playerOnly} onChange={(e) => setPlayerOnly(e.target.checked)} className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-900" />
              Player-visible / revealed only
            </label>
            <label className="flex items-center gap-2 text-xs text-zinc-300">
              <input type="checkbox" checked={staleOnly} onChange={(e) => setStaleOnly(e.target.checked)} className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-900" />
              Stale / unmapped only
            </label>
          </div>
        </div>
      </Card>

      {nodesWithInternal.length === 0 ? (
        <Card className="border-dashed">
          <p className="text-sm text-zinc-500">No mapped tables or records yet. Map a Notion database and sync to populate the schema.</p>
        </Card>
      ) : (
        <>
          {/* Desktop graph */}
          <Card className="hidden md:block">
            <svg viewBox={`0 0 ${layout.W} ${layout.H}`} className="h-auto w-full" role="img" aria-label="Codex relationship graph">
              {edges.map((edge) => {
                const a = layout.positions.get(edge.from)
                const b = layout.positions.get(edge.to)
                if (!a || !b) return null
                const mx = (a.x + b.x) / 2
                const my = (a.y + b.y) / 2
                const active = selectedEdge === edge.key
                const dim = selectedNode != null && edge.from !== selectedNode && edge.to !== selectedNode
                return (
                  <g key={edge.key} onClick={() => { setSelectedEdge(edge.key); setSelectedNode(null) }} className="cursor-pointer" opacity={dim ? 0.2 : 1}>
                    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={active ? '#f59e0b' : '#52525b'} strokeWidth={active ? 2.5 : 1.5} />
                    <rect x={mx - 14} y={my - 10} width={28} height={18} rx={4} fill="#18181b" stroke={active ? '#f59e0b' : '#3f3f46'} />
                    <text x={mx} y={my + 3} textAnchor="middle" className="fill-zinc-200" fontSize={11}>{edge.count}</text>
                  </g>
                )
              })}
              {nodesWithInternal.map((n) => {
                const p = layout.positions.get(n.key)
                if (!p) return null
                const active = selectedNode === n.key
                const w = 156
                const h = 60
                return (
                  <g key={n.key} onClick={() => { setSelectedNode(n.key); setSelectedEdge(null) }} className="cursor-pointer">
                    <rect
                      x={p.x - w / 2}
                      y={p.y - h / 2}
                      width={w}
                      height={h}
                      rx={8}
                      fill={active ? 'rgba(245,158,11,0.12)' : '#27272a'}
                      stroke={n.kind === 'mapping' ? (active ? '#f59e0b' : '#3f3f46') : '#a16207'}
                      strokeWidth={active ? 2 : 1.25}
                    />
                    <text x={p.x} y={p.y - 12} textAnchor="middle" className="fill-zinc-100" fontSize={12} fontWeight={600}>
                      {n.title.length > 20 ? `${n.title.slice(0, 19)}…` : n.title}
                    </text>
                    <text x={p.x} y={p.y + 4} textAnchor="middle" className="fill-zinc-500" fontSize={10}>
                      {n.recordCount} rec · {n.liveCount} live{n.internalCount ? ` · ↻${n.internalCount}` : ''}
                    </text>
                    <circle cx={p.x - w / 2 + 12} cy={p.y - h / 2 + 12} r={4} fill={n.hasFailedSync ? '#ef4444' : n.kind === 'mapping' && n.mappingEnabled ? '#22c55e' : '#a1a1aa'} />
                  </g>
                )
              })}
            </svg>
          </Card>

          {/* Mobile fallback: relationship list */}
          <Card className="md:hidden">
            <h2 className="text-sm font-semibold text-zinc-100">Tables</h2>
            <div className="mt-2 flex flex-col gap-1.5">
              {nodesWithInternal.map((n) => (
                <button key={n.key} type="button" onClick={() => { setSelectedNode(n.key); setSelectedEdge(null) }} className={`rounded-md border px-2.5 py-2 text-left text-sm ${selectedNode === n.key ? 'border-amber-500/60 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900'}`}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-zinc-100">{n.title}</span>
                    <span className="shrink-0 text-[11px] text-zinc-500">{n.recordCount} rec · {n.liveCount} live</span>
                  </span>
                </button>
              ))}
            </div>
            <h2 className="mt-4 text-sm font-semibold text-zinc-100">Relationships</h2>
            <div className="mt-2 flex flex-col gap-1.5">
              {edges.length === 0 ? (
                <p className="text-xs text-zinc-600">No cross-table relationships{relFilter !== 'all' ? ' for this relationship type' : ''}.</p>
              ) : (
                edges.map((edge) => (
                  <button key={edge.key} type="button" onClick={() => { setSelectedEdge(edge.key); setSelectedNode(null) }} className={`rounded-md border px-2.5 py-2 text-left text-xs ${selectedEdge === edge.key ? 'border-amber-500/60 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900'}`}>
                    <span className="text-zinc-200">{nodeTitle(edge.from)} → {nodeTitle(edge.to)}</span>
                    <span className="text-zinc-500"> · {edge.count}</span>
                  </button>
                ))
              )}
            </div>
          </Card>
        </>
      )}

      {/* Detail panel */}
      {selectedEdgeObj ? (
        <Card>
          <h2 className="text-sm font-semibold text-zinc-100">
            {nodeTitle(selectedEdgeObj.from)} → {nodeTitle(selectedEdgeObj.to)}
            <span className="ml-2 text-xs font-normal text-zinc-500">{selectedEdgeObj.count} link(s)</span>
          </h2>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {selectedEdgeObj.relations.map((r) => (
              <Badge key={r} variant="default">{campaignDocRelationLabel(r)}</Badge>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            {edgeRecords.map(({ link, src, tgt }) => (
              <div key={link.id} className="flex items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-zinc-200">{src?.title} → {tgt?.title}</span>
                <span className="flex shrink-0 gap-1.5">
                  {src && <Link href={`/campaigns/${campaignId}/codex?doc=${src.id}`} className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-200 hover:border-amber-500/50">Open source</Link>}
                  {tgt && <Link href={`/campaigns/${campaignId}/codex?doc=${tgt.id}`} className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-200 hover:border-amber-500/50">Open target</Link>}
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : selectedNode ? (
        <Card>
          <h2 className="text-sm font-semibold text-zinc-100">
            {nodeTitle(selectedNode)}
            <span className="ml-2 text-xs font-normal text-zinc-500">{nodeRecords.length} record(s)</span>
          </h2>
          <div className="mt-3 flex flex-col gap-1.5">
            {nodeRecords.length === 0 ? (
              <p className="text-xs text-zinc-600">No records match the current filters.</p>
            ) : (
              nodeRecords.map((d) => (
                <Link key={d.id} href={`/campaigns/${campaignId}/codex?doc=${d.id}`} className="flex items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm hover:border-amber-500/50">
                  <span className="min-w-0 truncate text-zinc-100">{d.title}</span>
                  <span className="shrink-0 text-[11px] text-zinc-500">{campaignDocTypeLabel(d.doc_type)}</span>
                </Link>
              ))
            )}
          </div>
        </Card>
      ) : (
        <Card className="border-dashed">
          <p className="text-sm text-zinc-500">Select a table node or a relationship line to see linked records.</p>
        </Card>
      )}
    </div>
  )
}
