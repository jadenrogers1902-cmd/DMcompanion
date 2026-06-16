import crypto from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncPageCore } from '@/lib/notion/sync-core'
import type { NotionSyncMapping } from '@/lib/types/database'

// Optional Notion webhook receiver. PUBLIC HTTPS endpoint — only meaningful when
// the app is deployed with a reachable URL (Vercel/serverless/Edge Function).
//
// Security: requests are verified with HMAC-SHA256 over the raw body using
// NOTION_WEBHOOK_SECRET (the verification token Notion issues for the
// subscription). With no secret set, the receiver is DISABLED — it ack's with
// 200 (so Notion does not retry-storm) but does nothing.
//
// Safety: this only ever updates Adventure Codex documentation
// (campaign_docs / campaign_doc_links) via the shared sync core. It never
// touches live gameplay state, never auto-reveals, and never returns the raw
// Notion payload.

export const runtime = 'nodejs'

type Json = Record<string, unknown>

function getString(obj: Json | undefined, key: string): string | null {
  const v = obj?.[key]
  return typeof v === 'string' ? v : null
}

/** Best-effort extraction of the affected page id + parent database id. */
function extractTargets(body: Json): { pageId: string | null; databaseId: string | null; eventType: string | null } {
  const eventType = getString(body, 'type')
  const entity = (body.entity as Json) ?? (body.data as Json) ?? undefined
  const page = (body.page as Json) ?? undefined
  const pageId = getString(entity, 'id') ?? getString(page, 'id') ?? getString(body, 'page_id')

  const parent =
    ((body.data as Json)?.parent as Json) ??
    (entity?.parent as Json) ??
    (page?.parent as Json) ??
    undefined
  const databaseId =
    getString(parent, 'database_id') ??
    getString(body, 'database_id') ??
    getString((body.entity as Json), 'database_id')

  return { pageId, databaseId, eventType }
}

function verifySignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  // Accept both "sha256=<hex>" and bare "<hex>" forms.
  const provided = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice('sha256='.length)
    : signatureHeader
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(provided, 'utf8')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  const secret = process.env.NOTION_WEBHOOK_SECRET
  const rawBody = await request.text()

  let body: Json = {}
  try {
    body = rawBody ? (JSON.parse(rawBody) as Json) : {}
  } catch {
    return Response.json({ ok: false }, { status: 400 })
  }

  // Subscription verification handshake: Notion posts a verification token with
  // no signature. Ack it; the operator copies the token from Notion's UI into
  // NOTION_WEBHOOK_SECRET. We never echo or persist it.
  if (typeof body.verification_token === 'string') {
    return Response.json({ ok: true })
  }

  // Disabled when no secret is configured — ack without acting.
  if (!secret) return Response.json({ ok: true, disabled: true })

  // Verify authenticity before doing anything else.
  if (!verifySignature(rawBody, request.headers.get('x-notion-signature'), secret)) {
    return Response.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()
  if (!admin) return Response.json({ ok: true, disabled: true })

  const { pageId, databaseId, eventType } = extractTargets(body)

  // Dedup: a stable id per delivery. Prefer the event id; else hash the body.
  const eventId =
    getString(body, 'id') ??
    request.headers.get('x-notion-delivery-id') ??
    crypto.createHash('sha256').update(rawBody).digest('hex')

  // Insert-first dedup: a duplicate delivery hits the UNIQUE(event_id) and is
  // skipped. (PostgREST returns a 23505 conflict error → treat as duplicate.)
  const { error: insertError } = await admin.from('notion_webhook_events').insert({
    event_id: eventId,
    event_type: eventType,
    page_id: pageId,
    database_id: databaseId,
    status: 'received',
  })
  if (insertError) {
    // Already processed (or transient) — ack so Notion stops retrying.
    return Response.json({ ok: true, duplicate: true })
  }

  async function finishEvent(
    status: 'processed' | 'ignored' | 'failed',
    message: string,
    campaignId: string | null,
  ) {
    await admin!
      .from('notion_webhook_events')
      .update({ status, message: message.slice(0, 500), campaign_id: campaignId, processed_at: new Date().toISOString() })
      .eq('event_id', eventId)
  }

  if (!pageId) {
    await finishEvent('ignored', 'No page id in event.', null)
    return Response.json({ ok: true, ignored: true })
  }

  // Resolve the campaign + mapping. Primary path: the page is already a synced
  // Codex doc (gives campaign + database). Fallback: route by the parent
  // database id from the payload.
  let campaignId: string | null = null
  let databaseForMapping: string | null = databaseId

  const { data: existingDoc } = await admin
    .from('campaign_docs')
    .select('campaign_id, source_database_id')
    .eq('source', 'notion')
    .eq('source_page_id', pageId)
    .maybeSingle()
  if (existingDoc) {
    campaignId = existingDoc.campaign_id
    databaseForMapping = existingDoc.source_database_id ?? databaseForMapping
  }

  if (!databaseForMapping) {
    await finishEvent('ignored', 'Could not determine the source database.', campaignId)
    return Response.json({ ok: true, ignored: true })
  }

  // Find the mapping(s) for this database. If we already know the campaign,
  // scope to it; otherwise any campaign mapping that database.
  let mappingQuery = admin
    .from('notion_sync_mappings')
    .select('*')
    .eq('notion_database_id', databaseForMapping)
    .eq('enabled', true)
  if (campaignId) mappingQuery = mappingQuery.eq('campaign_id', campaignId)
  const { data: mappings } = await mappingQuery

  const targets = (mappings ?? []) as NotionSyncMapping[]
  if (targets.length === 0) {
    await finishEvent('ignored', 'No enabled mapping for this database.', campaignId)
    return Response.json({ ok: true, ignored: true })
  }

  let anyProcessed = false
  let anyFailed = false
  for (const mapping of targets) {
    const { data: conn } = await admin
      .from('campaign_notion_connections')
      .select('access_token, is_enabled, auto_sync_enabled, failed_sync_count')
      .eq('campaign_id', mapping.campaign_id)
      .maybeSingle()

    const nowIso = new Date().toISOString()
    if (!conn?.access_token || !conn.is_enabled || !conn.auto_sync_enabled) {
      // Record the webhook receipt but do not sync (auto-sync off / disconnected).
      await admin
        .from('campaign_notion_connections')
        .update({ last_webhook_at: nowIso })
        .eq('campaign_id', mapping.campaign_id)
      continue
    }

    const { summary, fetchError } = await syncPageCore(
      admin,
      mapping.campaign_id,
      conn.access_token,
      mapping,
      pageId,
      null,
    )

    const ok = !fetchError && summary.failed === 0
    anyProcessed = anyProcessed || ok
    anyFailed = anyFailed || !ok

    await admin
      .from('campaign_notion_connections')
      .update({
        last_webhook_at: nowIso,
        last_auto_sync_at: nowIso,
        last_auto_sync_status: ok ? 'success' : 'failed',
        failed_sync_count: ok ? conn.failed_sync_count : conn.failed_sync_count + 1,
      })
      .eq('campaign_id', mapping.campaign_id)

    if (ok) campaignId = mapping.campaign_id
  }

  const status = anyProcessed ? 'processed' : anyFailed ? 'failed' : 'ignored'
  await finishEvent(
    status,
    anyProcessed ? 'Synced from webhook.' : anyFailed ? 'Sync failed (page may be deleted or unshared).' : 'No auto-sync target.',
    campaignId,
  )
  return Response.json({ ok: true })
}
