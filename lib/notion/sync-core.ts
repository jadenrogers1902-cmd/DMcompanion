// Client-agnostic Notion -> Codex sync core. Pure of auth/session: it takes a
// Supabase client (user-scoped for manual sync, or service-role for the webhook
// receiver) plus an actor id (the DM, or null for webhook-driven runs). Both the
// manual sync actions and the webhook handler call into this, so the upsert /
// relation / ownership rules live in exactly one place.

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchNotionPage, queryNotionDatabase, type NotionPage } from './client'
import { mapPageToDoc, type MappedDocFields } from './mapping'
import type { CampaignDocRelationType, Database, NotionSyncMapping } from '@/lib/types/database'

type Client = SupabaseClient<Database>
type DocUpdate = Database['public']['Tables']['campaign_docs']['Update']

export type SyncSummary = {
  created: number
  updated: number
  failed: number
  linked: number
  warnings: number
  capped: boolean
}

export const STATUS_ENUM = new Set(['draft', 'ready', 'active', 'archived', 'stale'])
export const MAX_PAGES_PER_SYNC = 5 // page_size 100 → up to 500 records per database

export function emptySummary(): SyncSummary {
  return { created: 0, updated: 0, failed: 0, linked: 0, warnings: 0, capped: false }
}

export function summaryMessage(s: SyncSummary): string {
  const parts = [`${s.created} created`, `${s.updated} updated`]
  if (s.failed) parts.push(`${s.failed} failed`)
  if (s.linked) parts.push(`${s.linked} relations linked`)
  if (s.capped) parts.push('record limit reached (re-run to continue)')
  return parts.join(', ') + '.'
}

/**
 * Upserts one mapped page into campaign_docs. Notion wins for MAPPED
 * documentation fields; app-owned fields (visibility, reveal_state, live links,
 * unmapped fields) are preserved. `actorId` is the DM id or null (webhook).
 */
export async function upsertDocCore(
  client: Client,
  campaignId: string,
  databaseId: string,
  fields: MappedDocFields,
  actorId: string | null,
  adventureId: string | null = null,
): Promise<{ docId: string; created: boolean } | null> {
  const { data: existing } = await client
    .from('campaign_docs')
    .select('id, tags')
    .eq('campaign_id', campaignId)
    .eq('source', 'notion')
    .eq('source_page_id', fields.sourcePageId)
    .maybeSingle()

  const nowIso = new Date().toISOString()

  let statusEnum: string | undefined
  let statusTag: string | undefined
  if (fields.status !== undefined && fields.status) {
    const s = fields.status.toLowerCase()
    if (STATUS_ENUM.has(s)) statusEnum = s
    else statusTag = `status:${s.slice(0, 30)}`
  }

  let nextTags: string[] | undefined
  if (fields.tags !== undefined || statusTag) {
    const base = (fields.tags !== undefined ? fields.tags : (existing?.tags ?? [])).filter(
      (t) => !t.startsWith('status:'),
    )
    if (statusTag) base.push(statusTag)
    nextTags = Array.from(new Set(base.map((t) => t.trim().toLowerCase()).filter(Boolean))).slice(0, 20)
  }

  if (existing) {
    const patch: DocUpdate = {
      doc_type: fields.docType,
      source_database_id: databaseId,
      source_url: fields.sourceUrl,
      source_linked_at: nowIso,
      last_synced_at: nowIso,
      sync_status: 'success',
      sync_error: null,
      updated_at: nowIso,
    }
    if (fields.title !== undefined) patch.title = fields.title.slice(0, 160)
    if (fields.dm_summary !== undefined) patch.dm_summary = fields.dm_summary?.slice(0, 2000) ?? null
    if (fields.dm_notes !== undefined) patch.dm_notes = fields.dm_notes?.slice(0, 12000) ?? null
    if (fields.player_summary !== undefined)
      patch.player_summary = fields.player_summary?.slice(0, 2000) ?? null
    if (nextTags !== undefined) patch.tags = nextTags
    if (statusEnum) patch.status = statusEnum
    // Inherit the mapping's Adventure when set; never clobber an existing
    // Adventure with null. Never write visibility / reveal_state — app-owned.
    if (adventureId) patch.adventure_id = adventureId

    const { error } = await client
      .from('campaign_docs')
      .update(patch)
      .eq('id', existing.id)
      .eq('campaign_id', campaignId)
    if (error) return null
    return { docId: existing.id, created: false }
  }

  const { data: inserted, error } = await client
    .from('campaign_docs')
    .insert({
      campaign_id: campaignId,
      source: 'notion',
      source_page_id: fields.sourcePageId,
      source_database_id: databaseId,
      adventure_id: adventureId,
      source_url: fields.sourceUrl,
      source_linked_at: nowIso,
      doc_type: fields.docType,
      title: (fields.title ?? 'Untitled').slice(0, 160),
      dm_summary: fields.dm_summary?.slice(0, 2000) ?? null,
      player_summary: fields.player_summary?.slice(0, 2000) ?? null,
      dm_notes: fields.dm_notes?.slice(0, 12000) ?? null,
      tags: nextTags ?? [],
      status: statusEnum ?? 'draft',
      visibility: 'dm_only',
      reveal_state: 'unrevealed',
      sync_status: 'success',
      last_synced_at: nowIso,
      created_by: actorId,
    })
    .select('id')
    .single()

  if (error || !inserted) return null
  return { docId: inserted.id, created: true }
}

/** Resolves relation page ids to existing Codex docs; idempotent doc↔doc links. */
export async function resolveRelationsCore(
  client: Client,
  campaignId: string,
  items: { docId: string; relations: MappedDocFields['relations'] }[],
  actorId: string | null,
): Promise<number> {
  const allPageIds = Array.from(
    new Set(items.flatMap((i) => i.relations.flatMap((r) => r.pageIds))),
  )
  if (allPageIds.length === 0) return 0

  const { data: targets } = await client
    .from('campaign_docs')
    .select('id, source_page_id, doc_type')
    .eq('campaign_id', campaignId)
    .eq('source', 'notion')
    .in('source_page_id', allPageIds)

  const targetByPage = new Map((targets ?? []).map((t) => [t.source_page_id as string, t]))
  const docIdByPage = new Map((targets ?? []).map((t) => [t.source_page_id as string, t.id]))
  if (docIdByPage.size === 0) return 0

  const sourceIds = items.map((i) => i.docId)
  const { data: existingLinks } = await client
    .from('campaign_doc_links')
    .select('source_doc_id, target_doc_id')
    .eq('campaign_id', campaignId)
    .in('source_doc_id', sourceIds)
  const existingPairs = new Set(
    (existingLinks ?? [])
      .filter((l) => l.target_doc_id)
      .map((l) => `${l.source_doc_id}->${l.target_doc_id}`),
  )

  const rows: Database['public']['Tables']['campaign_doc_links']['Insert'][] = []
  for (const item of items) {
    for (const rel of item.relations) {
      for (const pageId of rel.pageIds) {
        const targetId = docIdByPage.get(pageId)
        if (!targetId || targetId === item.docId) continue
        const key = `${item.docId}->${targetId}`
        if (existingPairs.has(key)) continue
        existingPairs.add(key)
        const targetType = (targetByPage.get(pageId)?.doc_type as string | undefined) ?? null
        rows.push({
          campaign_id: campaignId,
          source_doc_id: item.docId,
          target_doc_id: targetId,
          relationship_type: relationForTargetType(targetType),
          visibility: 'dm_only',
          created_by: actorId,
        })
      }
    }
  }

  if (rows.length === 0) return 0
  const { error } = await client.from('campaign_doc_links').insert(rows)
  return error ? 0 : rows.length
}

// Pick a (CHECK-valid) relationship_type from the linked record's type so the
// drawer/schema show a meaningful relation. Falls back to 'related_to'.
function relationForTargetType(docType: string | null): CampaignDocRelationType {
  switch (docType) {
    case 'location':
    case 'sub_location':
      return 'located_in'
    case 'faction':
      return 'member_of'
    case 'rumor':
      return 'rumor_for'
    case 'side_quest':
    case 'main_quest':
      return 'quest_hook'
    case 'boss':
    case 'hostile_enemy':
      return 'enemy_in'
    case 'npc':
    case 'character':
      return 'npc_in'
    case 'session':
    case 'chapter':
    case 'adventure':
      return 'session_topic'
    default:
      return 'related_to'
  }
}

export type TwoPassResult = {
  perTable: { databaseId: string; created: number; updated: number; failed: number; warnings: number }[]
  linked: number
  relationRefs: number
  unresolved: number
}

/**
 * Multi-table import that preserves cross-table relationships:
 *   Pass 1 — upsert every entry of every selected table (so targets exist).
 *   Pass 2 — resolve all relation references to local entries in one go.
 * A relation whose target table wasn't imported (or isn't shared) is left
 * unresolved and counted, not fatal.
 */
export async function syncTablesTwoPass(
  client: Client,
  campaignId: string,
  token: string,
  mappings: NotionSyncMapping[],
  actorId: string | null,
): Promise<TwoPassResult> {
  const perTable: TwoPassResult['perTable'] = []
  const allItems: { docId: string; relations: MappedDocFields['relations'] }[] = []

  // Pass 1
  for (const mapping of mappings) {
    let created = 0
    let updated = 0
    let failed = 0
    let warnings = 0
    let cursor: string | undefined
    let pages = 0
    do {
      const result = await queryNotionDatabase(token, mapping.notion_database_id, {
        page_size: 100,
        start_cursor: cursor,
      })
      if (!result.ok) {
        failed += 1
        break
      }
      for (const page of result.data.results as NotionPage[]) {
        const fields = mapPageToDoc(page, mapping)
        warnings += fields.warnings.length
        const res = await upsertDocCore(client, campaignId, mapping.notion_database_id, fields, actorId, mapping.adventure_id)
        if (!res) {
          failed += 1
          continue
        }
        if (res.created) created += 1
        else updated += 1
        allItems.push({ docId: res.docId, relations: fields.relations })
      }
      cursor = result.data.has_more ? result.data.next_cursor ?? undefined : undefined
      pages += 1
      if (pages >= MAX_PAGES_PER_SYNC && cursor) cursor = undefined
    } while (cursor)
    perTable.push({ databaseId: mapping.notion_database_id, created, updated, failed, warnings })
  }

  // Pass 2
  const relationRefs = allItems.reduce(
    (sum, item) => sum + item.relations.reduce((s, r) => s + r.pageIds.length, 0),
    0,
  )
  const linked = await resolveRelationsCore(client, campaignId, allItems, actorId)
  return { perTable, linked, relationRefs, unresolved: Math.max(0, relationRefs - linked) }
}

/** Syncs an entire mapped database (paginated, capped). */
export async function syncDatabaseCore(
  client: Client,
  campaignId: string,
  token: string,
  mapping: NotionSyncMapping,
  actorId: string | null,
): Promise<SyncSummary> {
  const summary = emptySummary()
  const items: { docId: string; relations: MappedDocFields['relations'] }[] = []

  let cursor: string | undefined
  let pages = 0
  do {
    const result = await queryNotionDatabase(token, mapping.notion_database_id, {
      page_size: 100,
      start_cursor: cursor,
    })
    if (!result.ok) {
      summary.failed += 1
      return summary
    }
    for (const page of result.data.results as NotionPage[]) {
      const fields = mapPageToDoc(page, mapping)
      summary.warnings += fields.warnings.length
      const res = await upsertDocCore(
        client,
        campaignId,
        mapping.notion_database_id,
        fields,
        actorId,
        mapping.adventure_id,
      )
      if (!res) {
        summary.failed += 1
        continue
      }
      if (res.created) summary.created += 1
      else summary.updated += 1
      items.push({ docId: res.docId, relations: fields.relations })
    }
    cursor = result.data.has_more ? result.data.next_cursor ?? undefined : undefined
    pages += 1
    if (pages >= MAX_PAGES_PER_SYNC && cursor) {
      summary.capped = true
      cursor = undefined
    }
  } while (cursor)

  summary.linked = await resolveRelationsCore(client, campaignId, items, actorId)
  return summary
}

/** Syncs a single Notion page into its Codex doc. */
export async function syncPageCore(
  client: Client,
  campaignId: string,
  token: string,
  mapping: NotionSyncMapping,
  pageId: string,
  actorId: string | null,
): Promise<{ summary: SyncSummary; fetchError?: string }> {
  const summary = emptySummary()
  const pageResult = await fetchNotionPage(token, pageId)
  if (!pageResult.ok) {
    summary.failed = 1
    return { summary, fetchError: pageResult.message }
  }
  const fields = mapPageToDoc(pageResult.data, mapping)
  summary.warnings = fields.warnings.length
  const res = await upsertDocCore(
    client,
    campaignId,
    mapping.notion_database_id,
    fields,
    actorId,
    mapping.adventure_id,
  )
  if (!res) {
    summary.failed = 1
    return { summary }
  }
  if (res.created) summary.created = 1
  else summary.updated = 1
  summary.linked = await resolveRelationsCore(
    client,
    campaignId,
    [{ docId: res.docId, relations: fields.relations }],
    actorId,
  )
  return { summary }
}
