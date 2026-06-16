'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  extractNotionId,
  fetchNotionDatabase,
  findChildNotionDatabases,
  parseNotionTitle,
  queryNotionDatabase,
  searchNotionDatabases,
} from '@/lib/notion/client'
import { applyMapping, type MappingPreview } from '@/lib/notion/mapping'
import { autoMapTable, type AutoMapResult } from '@/lib/notion/auto-map'
import { syncTablesTwoPass, summaryMessage } from '@/lib/notion/sync-core'
import type { CampaignDocType, NotionSyncMapping } from '@/lib/types/database'

type Result<T = unknown> = { success?: boolean; error?: string } & T

const SERVER_NOT_READY =
  'The Notion integration is not configured on the server. Set SUPABASE_SERVICE_ROLE_KEY.'

export type NotionMappingInput = {
  notion_database_id: string
  notion_database_name?: string | null
  adventure_id?: string | null
  doc_type: CampaignDocType
  title_property?: string | null
  dm_summary_property?: string | null
  player_summary_property?: string | null
  dm_notes_property?: string | null
  tags_property?: string | null
  status_property?: string | null
  source_url_property?: string | null
  relation_properties?: string[]
  enabled?: boolean
}

/** One discovered Notion table + its auto-detected type/field mapping. */
export type DiscoveredTable = {
  databaseId: string
  title: string
  fieldCount: number
  imported: boolean
  auto: AutoMapResult
}

export type NotionDatabaseSchema = {
  databaseId: string
  title: string
  properties: { name: string; type: string }[]
}

export type NotionDiscoveredDatabase = {
  databaseId: string
  title: string
}

async function getDmUserId(campaignId: string): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data: membership } = await supabase
    .from('campaign_members')
    .select('role')
    .eq('campaign_id', campaignId)
    .eq('user_id', user.id)
    .maybeSingle()
  return membership?.role === 'dm' ? user.id : null
}

async function getNotionToken(campaignId: string): Promise<
  | { ok: true; token: string }
  | { ok: false; error: string }
> {
  const admin = createAdminClient()
  if (!admin) return { ok: false, error: SERVER_NOT_READY }
  const { data } = await admin
    .from('campaign_notion_connections')
    .select('access_token, is_enabled')
    .eq('campaign_id', campaignId)
    .maybeSingle()
  if (!data?.access_token) return { ok: false, error: 'Connect a Notion token in campaign settings first.' }
  if (!data.is_enabled) return { ok: false, error: 'The Notion connection is disabled.' }
  return { ok: true, token: data.access_token }
}

function cleanProp(value: string | null | undefined): string | null {
  const v = value?.trim()
  return v ? v.slice(0, 200) : null
}

function plural(value: number | null | undefined, singular: string, pluralLabel = `${singular}s`) {
  return `${value ?? 0} ${(value ?? 0) === 1 ? singular : pluralLabel}`
}

export async function getNotionMappings(campaignId: string): Promise<NotionSyncMapping[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('notion_sync_mappings')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('updated_at', { ascending: false })
  return (data ?? []) as NotionSyncMapping[]
}

async function detachLocalNotionDocs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  campaignId: string,
  docIds: string[],
) {
  let removedDocLinks = 0
  if (docIds.length === 0) {
    return { detachedDocs: 0, removedDocLinks }
  }

  const { count: sourceLinkCount, error: sourceLinkError } = await supabase
    .from('campaign_doc_links')
    .delete({ count: 'exact' })
    .eq('campaign_id', campaignId)
    .in('source_doc_id', docIds)
    .not('target_doc_id', 'is', null)

  if (sourceLinkError) return { error: 'The mapping relation links could not be removed.' }
  removedDocLinks += sourceLinkCount ?? 0

  const { count: targetLinkCount, error: targetLinkError } = await supabase
    .from('campaign_doc_links')
    .delete({ count: 'exact' })
    .eq('campaign_id', campaignId)
    .in('target_doc_id', docIds)

  if (targetLinkError) return { error: 'The mapping relation links could not be removed.' }
  removedDocLinks += targetLinkCount ?? 0

  const { count: detachedDocs, error: detachError } = await supabase
    .from('campaign_docs')
    .update(
      {
        source: 'manual',
        source_url: null,
        source_page_id: null,
        source_database_id: null,
        source_linked_at: null,
        last_synced_at: null,
        sync_status: 'never',
        sync_error: null,
        updated_at: new Date().toISOString(),
      },
      { count: 'exact' },
    )
    .eq('campaign_id', campaignId)
    .in('id', docIds)

  if (detachError) return { error: 'The synced Codex records could not be detached from Notion.' }
  return { detachedDocs: detachedDocs ?? 0, removedDocLinks }
}

export async function cleanupOrphanedNotionReferences(
  campaignId: string,
): Promise<Result<{ message?: string; cleaned?: boolean }>> {
  const dmId = await getDmUserId(campaignId)
  if (!dmId) return { error: 'Only the DM can clean Notion mapping references.' }

  const supabase = await createClient()
  const { data: mappings, error: mappingError } = await supabase
    .from('notion_sync_mappings')
    .select('notion_database_id')
    .eq('campaign_id', campaignId)

  if (mappingError) return { error: 'The current mappings could not be inspected.' }

  const activeDatabaseIds = new Set((mappings ?? []).map((mapping) => mapping.notion_database_id))
  const { data: notionDocs, error: docsError } = await supabase
    .from('campaign_docs')
    .select('id, source_database_id')
    .eq('campaign_id', campaignId)
    .eq('source', 'notion')
    .not('source_database_id', 'is', null)

  if (docsError) return { error: 'The current Codex records could not be inspected.' }

  const orphanDocIds = (notionDocs ?? [])
    .filter((doc) => doc.source_database_id && !activeDatabaseIds.has(doc.source_database_id))
    .map((doc) => doc.id)

  const detachResult = await detachLocalNotionDocs(supabase, campaignId, orphanDocIds)
  if ('error' in detachResult && detachResult.error) return { error: detachResult.error }

  const { data: logs, error: logsError } = await supabase
    .from('notion_sync_logs')
    .select('id, source_database_id')
    .eq('campaign_id', campaignId)

  if (logsError) return { error: 'The sync history could not be inspected.' }

  const orphanLogIds = (logs ?? [])
    .filter((log) => {
      if (activeDatabaseIds.size === 0) return true
      return Boolean(log.source_database_id && !activeDatabaseIds.has(log.source_database_id))
    })
    .map((log) => log.id)

  let removedLogs = 0
  if (orphanLogIds.length > 0) {
    const { count, error } = await supabase
      .from('notion_sync_logs')
      .delete({ count: 'exact' })
      .eq('campaign_id', campaignId)
      .in('id', orphanLogIds)

    if (error) return { error: 'The orphaned sync history could not be removed.' }
    removedLogs = count ?? 0
  }

  const detachedDocs = detachResult.detachedDocs ?? 0
  const removedDocLinks = detachResult.removedDocLinks ?? 0
  const cleaned = detachedDocs > 0 || removedDocLinks > 0 || removedLogs > 0
  if (cleaned) {
    revalidatePath(`/campaigns/${campaignId}/codex/notion`)
    revalidatePath(`/campaigns/${campaignId}/codex`)
    revalidatePath(`/campaigns/${campaignId}/codex/sync`)
  }

  return {
    success: true,
    cleaned,
    message: cleaned
      ? `Cleared orphaned Notion mapping references: ${plural(detachedDocs, 'doc')} detached, ${plural(removedDocLinks, 'relation link')} removed, ${plural(removedLogs, 'sync log')} cleared. Notion was not modified.`
      : undefined,
  }
}

export async function loadNotionDatabaseSchema(
  campaignId: string,
  urlOrId: string,
): Promise<Result<{ schema?: NotionDatabaseSchema; databases?: NotionDiscoveredDatabase[] }>> {
  const dmId = await getDmUserId(campaignId)
  if (!dmId) return { error: 'Only the DM can configure Notion mappings.' }

  const databaseId = extractNotionId(urlOrId)
  if (!databaseId) return { error: 'Enter a valid Notion database link or ID.' }

  const tokenResult = await getNotionToken(campaignId)
  if (!tokenResult.ok) return { error: tokenResult.error }

  const result = await fetchNotionDatabase(tokenResult.token, databaseId)
  if (!result.ok) {
    if (result.code === 'not_found' || result.code === 'invalid_request') {
      const childResult = await findChildNotionDatabases(tokenResult.token, databaseId)
      if (!childResult.ok) return { error: childResult.message }

      if (childResult.data.length === 0) {
        return {
          error:
            'That link looks like a Notion page, not a database. Share the page with the integration, then paste a database link from inside it.',
        }
      }

      return {
        success: true,
        databases: childResult.data.map((db) => ({
          databaseId: db.id,
          title: db.title,
        })),
      }
    }

    return { error: result.message }
  }

  const properties = Object.entries(result.data.properties ?? {}).map(([name, def]) => ({
    name,
    type: def?.type ?? 'unknown',
  }))

  return {
    success: true,
    schema: {
      databaseId: result.data.id,
      title: parseNotionTitle(result.data) || 'Untitled database',
      properties,
    },
  }
}

export async function saveNotionMapping(
  campaignId: string,
  input: NotionMappingInput,
): Promise<Result> {
  const dmId = await getDmUserId(campaignId)
  if (!dmId) return { error: 'Only the DM can configure Notion mappings.' }

  const databaseId = extractNotionId(input.notion_database_id)
  if (!databaseId) return { error: 'A valid Notion database is required.' }
  if (!input.doc_type) return { error: 'Choose a Codex doc type for this database.' }

  const relations = Array.isArray(input.relation_properties)
    ? Array.from(new Set(input.relation_properties.map((p) => p.trim()).filter(Boolean))).slice(0, 30)
    : []

  const supabase = await createClient()
  const { error } = await supabase.from('notion_sync_mappings').upsert(
    {
      campaign_id: campaignId,
      notion_database_id: databaseId,
      notion_database_name: cleanProp(input.notion_database_name),
      adventure_id: input.adventure_id ?? null,
      doc_type: input.doc_type,
      title_property: cleanProp(input.title_property),
      dm_summary_property: cleanProp(input.dm_summary_property),
      player_summary_property: cleanProp(input.player_summary_property),
      dm_notes_property: cleanProp(input.dm_notes_property),
      tags_property: cleanProp(input.tags_property),
      status_property: cleanProp(input.status_property),
      source_url_property: cleanProp(input.source_url_property),
      relation_properties: relations,
      enabled: input.enabled ?? true,
      created_by: dmId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'campaign_id,notion_database_id' },
  )

  if (error) return { error: 'The mapping could not be saved. Please try again.' }
  revalidatePath(`/campaigns/${campaignId}/codex/notion`)
  return { success: true }
}

export async function deleteNotionMapping(campaignId: string, mappingId: string): Promise<Result<{ message?: string }>> {
  const dmId = await getDmUserId(campaignId)
  if (!dmId) return { error: 'Only the DM can configure Notion mappings.' }

  const supabase = await createClient()
  const { data: mapping, error: mappingError } = await supabase
    .from('notion_sync_mappings')
    .select('notion_database_id')
    .eq('id', mappingId)
    .eq('campaign_id', campaignId)
    .maybeSingle()

  if (mappingError) return { error: 'The mapping could not be inspected. Please try again.' }
  if (!mapping) return { error: 'Mapping not found.' }

  const { data: mappedDocs } = await supabase
    .from('campaign_docs')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('source', 'notion')
    .eq('source_database_id', mapping.notion_database_id)

  const mappedDocIds = (mappedDocs ?? []).map((doc) => doc.id)
  const detachResult = await detachLocalNotionDocs(supabase, campaignId, mappedDocIds)
  if ('error' in detachResult && detachResult.error) return { error: detachResult.error }

  const { count: removedLogs, error: logError } = await supabase
    .from('notion_sync_logs')
    .delete({ count: 'exact' })
    .eq('campaign_id', campaignId)
    .eq('source_database_id', mapping.notion_database_id)

  if (logError) return { error: 'The mapping sync history could not be removed.' }

  const { error } = await supabase
    .from('notion_sync_mappings')
    .delete()
    .eq('id', mappingId)
    .eq('campaign_id', campaignId)

  if (error) return { error: 'The mapping could not be removed.' }
  revalidatePath(`/campaigns/${campaignId}/codex/notion`)
  revalidatePath(`/campaigns/${campaignId}/codex`)
  revalidatePath(`/campaigns/${campaignId}/codex/sync`)
  return {
    success: true,
    message: `Mapping removed. ${plural(detachResult.detachedDocs, 'local Codex doc')} detached, ${plural(detachResult.removedDocLinks, 'local relation link')} removed, and ${plural(removedLogs, 'sync log')} cleared. Notion was not modified.`,
  }
}

/**
 * Previews how the first record of the mapped database would land in the Codex.
 * Accepts a draft mapping so the DM can test before saving. Missing/renamed
 * properties surface as warnings rather than failing.
 */
export async function testNotionMapping(
  campaignId: string,
  input: NotionMappingInput,
): Promise<Result<{ preview?: MappingPreview }>> {
  const dmId = await getDmUserId(campaignId)
  if (!dmId) return { error: 'Only the DM can test Notion mappings.' }

  const databaseId = extractNotionId(input.notion_database_id)
  if (!databaseId) return { error: 'A valid Notion database is required.' }

  const tokenResult = await getNotionToken(campaignId)
  if (!tokenResult.ok) return { error: tokenResult.error }

  const queryResult = await queryNotionDatabase(tokenResult.token, databaseId, { page_size: 1 })
  if (!queryResult.ok) return { error: queryResult.message }
  const sample = queryResult.data.results[0]
  if (!sample) return { error: 'That database has no records to preview.' }

  // Build a mapping-shaped object from the draft (ids/timestamps unused by apply).
  const mapping: NotionSyncMapping = {
    id: 'draft',
    campaign_id: campaignId,
    notion_database_id: databaseId,
    notion_database_name: input.notion_database_name ?? null,
    adventure_id: null,
    doc_type: input.doc_type,
    title_property: cleanProp(input.title_property),
    dm_summary_property: cleanProp(input.dm_summary_property),
    player_summary_property: cleanProp(input.player_summary_property),
    dm_notes_property: cleanProp(input.dm_notes_property),
    tags_property: cleanProp(input.tags_property),
    status_property: cleanProp(input.status_property),
    source_url_property: cleanProp(input.source_url_property),
    relation_properties: input.relation_properties ?? [],
    enabled: input.enabled ?? true,
    created_by: dmId,
    created_at: '',
    updated_at: '',
  }

  return { success: true, preview: applyMapping(sample, mapping) }
}

/**
 * Discovers every Notion database the integration can access, auto-detects each
 * one's Codex type + field mapping, and flags which are already imported. No raw
 * ids/API payloads are surfaced beyond the opaque database id needed to import.
 */
export async function discoverNotionTables(
  campaignId: string,
): Promise<Result<{ tables?: DiscoveredTable[] }>> {
  const dmId = await getDmUserId(campaignId)
  if (!dmId) return { error: 'Only the DM can find Notion tables.' }

  const tokenResult = await getNotionToken(campaignId)
  if (!tokenResult.ok) return { error: tokenResult.error }

  const result = await searchNotionDatabases(tokenResult.token)
  if (!result.ok) return { error: result.message }
  if (result.data.length === 0) {
    return {
      error: 'No tables found. Make sure your Notion page or database is shared with the integration.',
    }
  }

  const existing = await getNotionMappings(campaignId)
  const importedIds = new Set(existing.map((m) => m.notion_database_id))

  const tables: DiscoveredTable[] = result.data.map((db) => ({
    databaseId: db.id,
    title: db.title,
    fieldCount: db.properties.length,
    imported: importedIds.has(db.id),
    auto: autoMapTable(db),
  }))

  // Recommended (confident) tables first, then needs-review, then imported.
  tables.sort((a, b) => {
    const score = (t: DiscoveredTable) => (t.imported ? 2 : t.auto.needsReview ? 1 : 0)
    return score(a) - score(b) || a.title.localeCompare(b.title)
  })

  return { success: true, tables }
}

/**
 * Two-pass import of several selected tables for one Adventure: saves each
 * mapping (stamped with the Adventure), imports all entries, then resolves
 * cross-table relationships. Never modifies Notion.
 */
export async function autoImportNotionTables(
  campaignId: string,
  input: { adventureId: string | null; tables: NotionMappingInput[] },
): Promise<Result<{ message?: string; created?: number; updated?: number; failed?: number; linked?: number; unresolved?: number }>> {
  const dmId = await getDmUserId(campaignId)
  if (!dmId) return { error: 'Only the DM can import Notion tables.' }
  if (input.tables.length === 0) return { error: 'Select at least one table to import.' }

  const tokenResult = await getNotionToken(campaignId)
  if (!tokenResult.ok) return { error: tokenResult.error }

  const supabase = await createClient()
  const databaseIds: string[] = []
  for (const table of input.tables) {
    const databaseId = extractNotionId(table.notion_database_id)
    if (!databaseId || !table.doc_type) continue
    const relations = Array.isArray(table.relation_properties)
      ? Array.from(new Set(table.relation_properties.map((p) => p.trim()).filter(Boolean))).slice(0, 30)
      : []
    const { error } = await supabase.from('notion_sync_mappings').upsert(
      {
        campaign_id: campaignId,
        notion_database_id: databaseId,
        notion_database_name: cleanProp(table.notion_database_name),
        adventure_id: input.adventureId,
        doc_type: table.doc_type,
        title_property: cleanProp(table.title_property),
        dm_summary_property: cleanProp(table.dm_summary_property),
        player_summary_property: cleanProp(table.player_summary_property),
        dm_notes_property: cleanProp(table.dm_notes_property),
        tags_property: cleanProp(table.tags_property),
        status_property: cleanProp(table.status_property),
        source_url_property: cleanProp(table.source_url_property),
        relation_properties: relations,
        enabled: true,
        created_by: dmId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'campaign_id,notion_database_id' },
    )
    if (!error) databaseIds.push(databaseId)
  }

  if (databaseIds.length === 0) return { error: 'No valid tables to import.' }

  // Reload the saved mappings and run the two-pass sync over exactly these tables.
  const { data: savedRaw } = await supabase
    .from('notion_sync_mappings')
    .select('*')
    .eq('campaign_id', campaignId)
    .in('notion_database_id', databaseIds)
  const saved = (savedRaw ?? []) as NotionSyncMapping[]

  const result = await syncTablesTwoPass(supabase, campaignId, tokenResult.token, saved, dmId)

  const created = result.perTable.reduce((s, t) => s + t.created, 0)
  const updated = result.perTable.reduce((s, t) => s + t.updated, 0)
  const failed = result.perTable.reduce((s, t) => s + t.failed, 0)

  // Log one summary row.
  await supabase.from('notion_sync_logs').insert({
    campaign_id: campaignId,
    sync_type: 'all',
    status: failed > 0 ? (created + updated > 0 ? 'partial' : 'failed') : 'success',
    message: summaryMessage({ created, updated, failed, linked: result.linked, warnings: 0, capped: false }).slice(0, 500),
    created_count: created,
    updated_count: updated,
    failed_count: failed,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    created_by: dmId,
  })

  revalidatePath(`/campaigns/${campaignId}/codex`)
  revalidatePath(`/campaigns/${campaignId}/codex/notion`)
  revalidatePath(`/campaigns/${campaignId}/codex/sync`)

  const unresolvedNote = result.unresolved > 0
    ? ` ${result.unresolved} link(s) point to tables not in this import — re-import those tables to connect them.`
    : ''
  return {
    success: true,
    created,
    updated,
    failed,
    linked: result.linked,
    unresolved: result.unresolved,
    message: `Imported ${created} new and updated ${updated} table entries, ${result.linked} relationship link(s) resolved.${unresolvedNote} Notion was not modified.`,
  }
}
