'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { testNotionConnection as notionTestConnection } from '@/lib/notion/client'

type Result<T = unknown> = { success?: boolean; error?: string } & T

export type NotionConnectionStatus = {
  /** Whether the server has a service-role key configured (Notion usable at all). */
  serverReady: boolean
  serverError: string | null
  /** Whether a token is stored (boolean only — the token itself is never returned). */
  configured: boolean
  enabled: boolean
  lastTestStatus: 'never' | 'success' | 'failed'
  lastTestedAt: string | null
  lastSuccessAt: string | null
  lastTestError: string | null
  /** Whether auto-sync via the Notion webhook is enabled. */
  autoSyncEnabled: boolean
  lastWebhookAt: string | null
  lastAutoSyncAt: string | null
  lastAutoSyncStatus: 'never' | 'success' | 'failed' | 'partial'
  failedSyncCount: number
}

const SERVER_NOT_READY =
  'The Notion integration is not configured on the server. Set SUPABASE_SERVICE_ROLE_KEY to your Supabase service_role key, not the Notion token.'
const SERVER_KEY_INVALID =
  'The Supabase service-role key is missing or invalid. Add the project service_role key to SUPABASE_SERVICE_ROLE_KEY and restart the server.'

function emptyStatus(serverReady: boolean, serverError: string | null = null): NotionConnectionStatus {
  return {
    serverReady,
    serverError,
    configured: false,
    enabled: false,
    lastTestStatus: 'never',
    lastTestedAt: null,
    lastSuccessAt: null,
    lastTestError: null,
    autoSyncEnabled: false,
    lastWebhookAt: null,
    lastAutoSyncAt: null,
    lastAutoSyncStatus: 'never',
    failedSyncCount: 0,
  }
}

function isAdminAuthError(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? ''
  return error?.code === 'PGRST301' || message.includes('invalid api key') || message.includes('jwt')
}

function adminWriteError(error: { code?: string; message?: string } | null, fallback: string) {
  return isAdminAuthError(error) ? SERVER_KEY_INVALID : fallback
}

/** Confirms the current user is the DM of the campaign. Returns the user id or null. */
async function requireDM(campaignId: string): Promise<string | null> {
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

export async function getNotionConnectionStatus(
  campaignId: string,
): Promise<NotionConnectionStatus> {
  const dmId = await requireDM(campaignId)
  if (!dmId) return emptyStatus(false)

  const admin = createAdminClient()
  if (!admin) return emptyStatus(false)

  const { data, error } = await admin
    .from('campaign_notion_connections')
    .select(
      'access_token, is_enabled, last_test_status, last_tested_at, last_success_at, last_test_error, auto_sync_enabled, last_webhook_at, last_auto_sync_at, last_auto_sync_status, failed_sync_count',
    )
    .eq('campaign_id', campaignId)
    .maybeSingle()

  if (error) return emptyStatus(false, isAdminAuthError(error) ? SERVER_KEY_INVALID : SERVER_NOT_READY)

  if (!data) return emptyStatus(true)

  // Never return the token — only whether one exists.
  return {
    serverReady: true,
    serverError: null,
    configured: Boolean(data.access_token),
    enabled: data.is_enabled,
    lastTestStatus: data.last_test_status,
    lastTestedAt: data.last_tested_at,
    lastSuccessAt: data.last_success_at,
    lastTestError: data.last_test_error,
    autoSyncEnabled: data.auto_sync_enabled,
    lastWebhookAt: data.last_webhook_at,
    lastAutoSyncAt: data.last_auto_sync_at,
    lastAutoSyncStatus: data.last_auto_sync_status,
    failedSyncCount: data.failed_sync_count,
  }
}

export async function setNotionAutoSync(campaignId: string, enabled: boolean): Promise<Result> {
  const dmId = await requireDM(campaignId)
  if (!dmId) return { error: 'Only the DM can change auto-sync.' }

  const admin = createAdminClient()
  if (!admin) return { error: SERVER_NOT_READY }

  const { data: row, error: readError } = await admin
    .from('campaign_notion_connections')
    .select('access_token')
    .eq('campaign_id', campaignId)
    .maybeSingle()
  if (readError) return { error: adminWriteError(readError, SERVER_NOT_READY) }
  if (!row?.access_token) return { error: 'Connect and verify a Notion token first.' }

  const { error } = await admin
    .from('campaign_notion_connections')
    .update({ auto_sync_enabled: enabled })
    .eq('campaign_id', campaignId)
  if (error) return { error: adminWriteError(error, 'Could not update auto-sync. Please try again.') }
  revalidatePath(`/campaigns/${campaignId}/settings`)
  return { success: true }
}

export async function saveNotionToken(campaignId: string, token: string): Promise<Result> {
  const dmId = await requireDM(campaignId)
  if (!dmId) return { error: 'Only the DM can configure Notion.' }

  const admin = createAdminClient()
  if (!admin) return { error: SERVER_NOT_READY }

  const clean = (token ?? '').trim()
  if (clean.length < 20) {
    return { error: 'That does not look like a valid Notion integration token.' }
  }

  const { error } = await admin.from('campaign_notion_connections').upsert(
    {
      campaign_id: campaignId,
      access_token: clean,
      is_enabled: true,
      // A freshly saved token is untested until the DM runs Test connection.
      last_test_status: 'never',
      last_test_error: null,
      created_by: dmId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'campaign_id' },
  )

  if (error) return { error: adminWriteError(error, 'The Notion token could not be saved. Please try again.') }
  revalidatePath(`/campaigns/${campaignId}/settings`)
  return { success: true }
}

export async function testNotionConnection(
  campaignId: string,
): Promise<Result<{ status?: 'success' | 'failed'; message?: string }>> {
  const dmId = await requireDM(campaignId)
  if (!dmId) return { error: 'Only the DM can test the Notion connection.' }

  const admin = createAdminClient()
  if (!admin) return { error: SERVER_NOT_READY }

  const { data: row, error: readError } = await admin
    .from('campaign_notion_connections')
    .select('access_token, is_enabled')
    .eq('campaign_id', campaignId)
    .maybeSingle()
  if (readError) return { error: adminWriteError(readError, SERVER_NOT_READY) }

  if (!row?.access_token) return { error: 'Add a Notion token first.' }
  if (!row.is_enabled) return { error: 'The Notion connection is disabled. Re-save a token to enable it.' }

  const result = await notionTestConnection(row.access_token)
  const nowIso = new Date().toISOString()

  if (result.ok) {
    await admin
      .from('campaign_notion_connections')
      .update({
        last_test_status: 'success',
        last_tested_at: nowIso,
        last_success_at: nowIso,
        last_test_error: null,
      })
      .eq('campaign_id', campaignId)
    revalidatePath(`/campaigns/${campaignId}/settings`)
    return { success: true, status: 'success', message: 'Notion connection verified.' }
  }

  await admin
    .from('campaign_notion_connections')
    .update({
      last_test_status: 'failed',
      last_tested_at: nowIso,
      last_test_error: result.message,
    })
    .eq('campaign_id', campaignId)
  revalidatePath(`/campaigns/${campaignId}/settings`)
  return { success: true, status: 'failed', message: result.message }
}

export async function disableNotionConnection(campaignId: string): Promise<Result> {
  const dmId = await requireDM(campaignId)
  if (!dmId) return { error: 'Only the DM can change the Notion connection.' }

  const admin = createAdminClient()
  if (!admin) return { error: SERVER_NOT_READY }

  // Disabling clears the stored secret server-side and resets test state.
  const { error } = await admin
    .from('campaign_notion_connections')
    .update({
      access_token: null,
      is_enabled: false,
      auto_sync_enabled: false,
      last_test_status: 'never',
      last_test_error: null,
      last_tested_at: null,
      last_success_at: null,
    })
    .eq('campaign_id', campaignId)

  if (error) return { error: adminWriteError(error, 'The connection could not be disabled. Please try again.') }
  revalidatePath(`/campaigns/${campaignId}/settings`)
  return { success: true }
}
