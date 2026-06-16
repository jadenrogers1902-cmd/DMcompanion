'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  emptySummary,
  summaryMessage,
  syncDatabaseCore,
  syncPageCore,
  type SyncSummary,
} from '@/lib/notion/sync-core'
import { WIPE_CONFIRMATION_PHRASE } from '@/lib/codex/options'
import type { NotionSyncMapping } from '@/lib/types/database'

type Result<T = unknown> = { success?: boolean; error?: string } & T
type SupabaseServer = Awaited<ReturnType<typeof createClient>>

const SERVER_NOT_READY =
  'The Notion integration is not configured on the server. Set SUPABASE_SERVICE_ROLE_KEY to your Supabase service_role key, not the Notion token.'
const SERVER_KEY_INVALID =
  'The Supabase service-role key is missing or invalid. Add the project service_role key to SUPABASE_SERVICE_ROLE_KEY and restart the server.'

function isAdminAuthError(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ''
  return error?.code === 'PGRST301' || message.includes('invalid api key') || message.includes('jwt')
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

async function getNotionToken(
  campaignId: string,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const admin = createAdminClient()
  if (!admin) return { ok: false, error: SERVER_NOT_READY }
  const { data, error } = await admin
    .from('campaign_notion_connections')
    .select('access_token, is_enabled')
    .eq('campaign_id', campaignId)
    .maybeSingle()
  if (error) return { ok: false, error: isAdminAuthError(error) ? SERVER_KEY_INVALID : SERVER_NOT_READY }
  if (!data?.access_token) return { ok: false, error: 'Connect a Notion token in campaign settings first.' }
  if (!data.is_enabled) return { ok: false, error: 'The Notion connection is disabled.' }
  return { ok: true, token: data.access_token }
}

async function logSync(
  supabase: SupabaseServer,
  campaignId: string,
  dmId: string,
  input: {
    sync_type: 'doc' | 'database' | 'all'
    source_page_id?: string | null
    source_database_id?: string | null
    summary: SyncSummary
    startedAt: string
    message: string
  },
) {
  const produced = input.summary.created + input.summary.updated
  const status = input.summary.failed > 0 ? (produced > 0 ? 'partial' : 'failed') : 'success'
  await supabase.from('notion_sync_logs').insert({
    campaign_id: campaignId,
    sync_type: input.sync_type,
    source_page_id: input.source_page_id ?? null,
    source_database_id: input.source_database_id ?? null,
    status,
    message: input.message.slice(0, 500),
    created_count: input.summary.created,
    updated_count: input.summary.updated,
    failed_count: input.summary.failed,
    started_at: input.startedAt,
    finished_at: new Date().toISOString(),
    created_by: dmId,
  })
}

export async function syncNotionDatabase(
  campaignId: string,
  mappingId: string,
): Promise<Result<{ summary?: SyncSummary; message?: string }>> {
  const dmId = await getDmUserId(campaignId)
  if (!dmId) return { error: 'Only the DM can sync from Notion.' }
  const startedAt = new Date().toISOString()

  const supabase = await createClient()
  const { data: mapping } = await supabase
    .from('notion_sync_mappings')
    .select('*')
    .eq('id', mappingId)
    .eq('campaign_id', campaignId)
    .maybeSingle()
  if (!mapping) return { error: 'Mapping not found.' }
  if (!(mapping as NotionSyncMapping).enabled) return { error: 'This mapping is disabled.' }

  const tokenResult = await getNotionToken(campaignId)
  if (!tokenResult.ok) return { error: tokenResult.error }

  const summary = await syncDatabaseCore(
    supabase,
    campaignId,
    tokenResult.token,
    mapping as NotionSyncMapping,
    dmId,
  )
  const message = summaryMessage(summary)
  await logSync(supabase, campaignId, dmId, {
    sync_type: 'database',
    source_database_id: (mapping as NotionSyncMapping).notion_database_id,
    summary,
    startedAt,
    message,
  })

  revalidatePath(`/campaigns/${campaignId}/codex`)
  revalidatePath(`/campaigns/${campaignId}/codex/notion`)
  if (summary.failed > 0 && summary.created + summary.updated === 0) {
    return { error: 'Sync failed. Check that the database is shared with the integration.' }
  }
  return { success: true, summary, message }
}

export async function syncAllNotionDatabases(
  campaignId: string,
): Promise<Result<{ summary?: SyncSummary; message?: string }>> {
  const dmId = await getDmUserId(campaignId)
  if (!dmId) return { error: 'Only the DM can sync from Notion.' }
  const startedAt = new Date().toISOString()

  const supabase = await createClient()
  const { data: mappings } = await supabase
    .from('notion_sync_mappings')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('enabled', true)
  const enabled = (mappings ?? []) as NotionSyncMapping[]
  if (enabled.length === 0) return { error: 'No enabled mappings to sync.' }

  const tokenResult = await getNotionToken(campaignId)
  if (!tokenResult.ok) return { error: tokenResult.error }

  const total = emptySummary()
  for (const mapping of enabled) {
    const s = await syncDatabaseCore(supabase, campaignId, tokenResult.token, mapping, dmId)
    total.created += s.created
    total.updated += s.updated
    total.failed += s.failed
    total.linked += s.linked
    total.warnings += s.warnings
    total.capped = total.capped || s.capped
  }

  const message = summaryMessage(total)
  await logSync(supabase, campaignId, dmId, { sync_type: 'all', summary: total, startedAt, message })

  revalidatePath(`/campaigns/${campaignId}/codex`)
  revalidatePath(`/campaigns/${campaignId}/codex/notion`)
  return { success: true, summary: total, message }
}

export async function syncCodexDoc(
  campaignId: string,
  docId: string,
): Promise<Result<{ summary?: SyncSummary; message?: string }>> {
  const dmId = await getDmUserId(campaignId)
  if (!dmId) return { error: 'Only the DM can sync from Notion.' }
  const startedAt = new Date().toISOString()

  const supabase = await createClient()
  const { data: doc } = await supabase
    .from('campaign_docs')
    .select('id, source, source_page_id, source_database_id')
    .eq('id', docId)
    .eq('campaign_id', campaignId)
    .maybeSingle()
  if (!doc) return { error: 'Codex record not found.' }
  if (doc.source !== 'notion' || !doc.source_page_id) {
    return { error: 'This record is not linked to a Notion page.' }
  }
  if (!doc.source_database_id) {
    return { error: 'This record has no mapped database. Sync the database from Notion mappings.' }
  }

  const { data: mapping } = await supabase
    .from('notion_sync_mappings')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('notion_database_id', doc.source_database_id)
    .maybeSingle()
  if (!mapping) return { error: 'No mapping is configured for this record’s database.' }

  const tokenResult = await getNotionToken(campaignId)
  if (!tokenResult.ok) return { error: tokenResult.error }

  const { summary, fetchError } = await syncPageCore(
    supabase,
    campaignId,
    tokenResult.token,
    mapping as NotionSyncMapping,
    doc.source_page_id,
    dmId,
  )

  if (fetchError) {
    await supabase
      .from('campaign_docs')
      .update({ sync_status: 'failed', sync_error: fetchError, last_synced_at: new Date().toISOString() })
      .eq('id', docId)
      .eq('campaign_id', campaignId)
    await logSync(supabase, campaignId, dmId, {
      sync_type: 'doc',
      source_page_id: doc.source_page_id,
      source_database_id: doc.source_database_id,
      summary,
      startedAt,
      message: fetchError,
    })
    return { error: fetchError }
  }

  const message = summaryMessage(summary)
  await logSync(supabase, campaignId, dmId, {
    sync_type: 'doc',
    source_page_id: doc.source_page_id,
    source_database_id: doc.source_database_id,
    summary,
    startedAt,
    message,
  })

  revalidatePath(`/campaigns/${campaignId}/codex`)
  if (summary.failed > 0) return { error: 'Sync failed for this record.' }
  return { success: true, summary, message }
}

export async function retryFailedNotionDocs(
  campaignId: string,
): Promise<Result<{ attempted?: number; failed?: number; message?: string }>> {
  const dmId = await getDmUserId(campaignId)
  if (!dmId) return { error: 'Only the DM can retry Notion syncs.' }

  const supabase = await createClient()
  const { data: docs } = await supabase
    .from('campaign_docs')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('source', 'notion')
    .eq('sync_status', 'failed')
    .not('source_page_id', 'is', null)

  const failedDocs = docs ?? []
  if (failedDocs.length === 0) return { success: true, attempted: 0, failed: 0, message: 'No failed docs to retry.' }

  let failed = 0
  for (const doc of failedDocs) {
    const result = await syncCodexDoc(campaignId, doc.id)
    if (result.error) failed += 1
  }

  revalidatePath(`/campaigns/${campaignId}/codex`)
  revalidatePath(`/campaigns/${campaignId}/codex/sync`)
  return {
    success: true,
    attempted: failedDocs.length,
    failed,
    message: `${failedDocs.length - failed} retried successfully, ${failed} still failing.`,
  }
}

/**
 * Deletes ONLY Companion-side synced/cache Codex data for one selected scope:
 * a single Adventure, or the "not linked to an Adventure" bucket. Strictly
 * scoped to `campaign_id` + the chosen adventure target — it can never wipe all
 * campaigns or other Adventures in one call.
 *
 * Deleting campaign_docs cascades to campaign_doc_links, codex_reveals, and the
 * player-safe publications (all ON DELETE CASCADE from migration 024). Notion is
 * NEVER contacted or modified, no Notion pages are deleted, and Notion mappings
 * are left intact (re-syncing repopulates the cache).
 */
export async function wipeLocalCodexData(
  campaignId: string,
  input: { adventureId: string | null; confirmationPhrase: string },
): Promise<Result<{ deleted?: number; message?: string }>> {
  const dmId = await getDmUserId(campaignId)
  if (!dmId) return { error: 'Only the DM can delete local synced data.' }

  if (input.confirmationPhrase?.trim() !== WIPE_CONFIRMATION_PHRASE) {
    return { error: `Type ${WIPE_CONFIRMATION_PHRASE} exactly to confirm.` }
  }

  const supabase = await createClient()

  // Build a query strictly scoped to this campaign + exactly one adventure bucket.
  let query = supabase
    .from('campaign_docs')
    .delete({ count: 'exact' })
    .eq('campaign_id', campaignId)
  query = input.adventureId
    ? query.eq('adventure_id', input.adventureId)
    : query.is('adventure_id', null)

  const { count, error } = await query
  if (error) return { error: 'Could not delete local synced data. Please try again.' }

  // Codex docs are the only thing removed; mappings/connection are preserved so
  // the DM can re-sync. Notion was never touched.
  revalidatePath(`/campaigns/${campaignId}/codex`)
  revalidatePath(`/campaigns/${campaignId}/codex/sync`)
  const scope = input.adventureId ? 'the selected Adventure' : 'records not linked to an Adventure'
  return {
    success: true,
    deleted: count ?? 0,
    message: `Removed ${count ?? 0} local Codex record(s) for ${scope}. Notion was not modified.`,
  }
}
