'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type {
  CampaignDoc,
  CampaignDocLink,
  CampaignDocLiveObjectType,
  CampaignDocRelationType,
  CampaignDocStatus,
  CampaignDocType,
  CampaignDocVisibility,
  Database,
  PlayerVisibleCampaignDoc,
} from '@/lib/types/database'

const CODEX_PATH = (campaignId: string) => `/campaigns/${campaignId}/codex`
const MAX_TAGS = 20
type CampaignDocRowUpdate = Database['public']['Tables']['campaign_docs']['Update']

type Result<T = unknown> = { success?: boolean; error?: string } & T

type CampaignDocInput = {
  doc_type: CampaignDocType
  title: string
  dm_summary?: string
  player_summary?: string
  dm_notes?: string
  tags?: string[]
  status?: CampaignDocStatus
  visibility?: CampaignDocVisibility
}

type CampaignDocUpdate = Partial<CampaignDocInput>

function cleanText(value: string | null | undefined, max = 8000) {
  const clean = value?.trim() ?? ''
  return clean.length > 0 ? clean.slice(0, max) : null
}

function cleanTags(tags: string[] | string | null | undefined) {
  const raw = Array.isArray(tags) ? tags : (tags ?? '').split(',')
  return Array.from(
    new Set(
      raw
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
        .map((tag) => tag.slice(0, 40)),
    ),
  ).slice(0, MAX_TAGS)
}

async function getClientAndUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

export async function createCampaignDoc(
  campaignId: string,
  input: CampaignDocInput,
): Promise<Result<{ docId?: string }>> {
  const { supabase, user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated.' }

  const title = cleanText(input.title, 160)
  if (!title) return { error: 'Title is required.' }

  const { data, error } = await supabase
    .from('campaign_docs')
    .insert({
      campaign_id: campaignId,
      source: 'manual',
      doc_type: input.doc_type,
      title,
      dm_summary: cleanText(input.dm_summary, 2000),
      player_summary: cleanText(input.player_summary, 2000),
      dm_notes: cleanText(input.dm_notes, 12000),
      tags: cleanTags(input.tags),
      status: input.status ?? 'draft',
      visibility: input.visibility ?? 'dm_only',
      reveal_state: input.visibility === 'revealed' ? 'revealed' : 'unrevealed',
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error || !data) return { error: 'Could not create Codex record. Please try again.' }
  revalidatePath(CODEX_PATH(campaignId))
  return { success: true, docId: data.id }
}

export async function updateCampaignDoc(
  campaignId: string,
  docId: string,
  input: CampaignDocUpdate,
): Promise<Result> {
  const { supabase } = await getClientAndUser()
  const update: CampaignDocRowUpdate = {}

  if (input.title !== undefined) {
    const title = cleanText(input.title, 160)
    if (!title) return { error: 'Title is required.' }
    update.title = title
  }
  if (input.doc_type !== undefined) update.doc_type = input.doc_type
  if (input.dm_summary !== undefined) update.dm_summary = cleanText(input.dm_summary, 2000)
  if (input.player_summary !== undefined) update.player_summary = cleanText(input.player_summary, 2000)
  if (input.dm_notes !== undefined) update.dm_notes = cleanText(input.dm_notes, 12000)
  if (input.tags !== undefined) update.tags = cleanTags(input.tags)
  if (input.status !== undefined) update.status = input.status
  if (input.visibility !== undefined) {
    update.visibility = input.visibility
    update.reveal_state = input.visibility === 'revealed' ? 'revealed' : 'unrevealed'
  }

  const { error } = await supabase
    .from('campaign_docs')
    .update(update)
    .eq('id', docId)
    .eq('campaign_id', campaignId)

  if (error) return { error: 'Could not update Codex record. Please try again.' }
  revalidatePath(CODEX_PATH(campaignId))
  return { success: true }
}

// --- Manual Notion link (Phase 5) -------------------------------------------
// Stores a Notion reference on a Codex doc. Does NOT fetch Notion content; that
// arrives with the API sync phase. All Notion fields live on campaign_docs,
// which is DM-only under RLS and excluded from the player-safe projection/RPC,
// so a Notion link is never exposed to players.

const NOTION_INVALID = 'This does not look like a valid Notion link.'

function toDashedUuid(hex32: string): string {
  const h = hex32.toLowerCase()
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

type ParsedNotionLink = {
  url: string
  pageId: string | null
  databaseId: string | null
}

/**
 * Validates a Notion URL and best-effort extracts the page or database id.
 * Accepts notion.so (any subdomain) and *.notion.site. The id is the trailing
 * 32-hex run in the path; a `?v=` query marks a database view, so the path id is
 * treated as a database id. Returns null when the input is not a Notion URL.
 */
function parseNotionLink(raw: string): ParsedNotionLink | null {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null

  const host = url.hostname.toLowerCase()
  const isNotion =
    host === 'notion.so' ||
    host === 'notion.site' ||
    host.endsWith('.notion.so') ||
    host.endsWith('.notion.site')
  if (!isNotion) return null

  // Match both compact (32-hex) and dashed-UUID id forms in the path.
  const compactPath = url.pathname.replace(/-/g, '')
  const runs = compactPath.match(/[0-9a-fA-F]{32}/g)
  const rawId = runs && runs.length > 0 ? runs[runs.length - 1] : null
  const dashed = rawId ? toDashedUuid(rawId) : null
  const isDatabaseView = url.searchParams.has('v')

  return {
    url: trimmed,
    pageId: isDatabaseView ? null : dashed,
    databaseId: isDatabaseView ? dashed : null,
  }
}

export async function setCampaignDocNotionLink(
  campaignId: string,
  docId: string,
  url: string,
): Promise<Result> {
  const { supabase, user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated.' }

  const parsed = parseNotionLink(url)
  if (!parsed) return { error: NOTION_INVALID }

  const { error } = await supabase
    .from('campaign_docs')
    .update({
      source: 'notion',
      source_url: parsed.url.slice(0, 2000),
      source_page_id: parsed.pageId,
      source_database_id: parsed.databaseId,
      source_linked_at: new Date().toISOString(),
    })
    .eq('id', docId)
    .eq('campaign_id', campaignId)

  if (error) {
    if (/duplicate key|unique/i.test(error.message)) {
      return { error: 'Another Codex record is already linked to this Notion page.' }
    }
    return { error: 'The Notion link could not be saved. Please try again.' }
  }
  revalidatePath(CODEX_PATH(campaignId))
  return { success: true }
}

export async function removeCampaignDocNotionLink(
  campaignId: string,
  docId: string,
): Promise<Result> {
  const { supabase, user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated.' }

  const { error } = await supabase
    .from('campaign_docs')
    .update({
      source: 'manual',
      source_url: null,
      source_page_id: null,
      source_database_id: null,
      source_linked_at: null,
    })
    .eq('id', docId)
    .eq('campaign_id', campaignId)

  if (error) return { error: 'The Notion link could not be removed. Please try again.' }
  revalidatePath(CODEX_PATH(campaignId))
  return { success: true }
}

export async function linkCampaignDocs(
  campaignId: string,
  sourceDocId: string,
  targetDocId: string,
  relationshipType: CampaignDocRelationType,
  visibility: CampaignDocVisibility = 'dm_only',
): Promise<Result> {
  const { supabase, user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated.' }
  if (sourceDocId === targetDocId) return { error: 'Choose two different Codex records.' }

  const { error } = await supabase.from('campaign_doc_links').insert({
    campaign_id: campaignId,
    source_doc_id: sourceDocId,
    target_doc_id: targetDocId,
    relationship_type: relationshipType,
    visibility,
    created_by: user.id,
  })

  if (error) return { error: 'Could not link those Codex records. Please try again.' }
  revalidatePath(CODEX_PATH(campaignId))
  return { success: true }
}

export async function linkCampaignDocToLiveObject(
  campaignId: string,
  sourceDocId: string,
  input: {
    live_object_type: CampaignDocLiveObjectType
    live_object_id: string
    live_object_label?: string
    relationship_type?: CampaignDocRelationType
    visibility?: CampaignDocVisibility
  },
): Promise<Result> {
  const { supabase, user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated.' }

  const { error } = await supabase.from('campaign_doc_links').insert({
    campaign_id: campaignId,
    source_doc_id: sourceDocId,
    live_object_type: input.live_object_type,
    live_object_id: input.live_object_id,
    live_object_label: cleanText(input.live_object_label, 160),
    relationship_type: input.relationship_type ?? 'related_to',
    visibility: input.visibility ?? 'dm_only',
    created_by: user.id,
  })

  if (error) return { error: 'Could not attach the Codex record. Please try again.' }
  revalidatePath(CODEX_PATH(campaignId))
  return { success: true }
}

export async function removeCampaignDocLink(
  campaignId: string,
  linkId: string,
): Promise<Result> {
  const { supabase } = await getClientAndUser()
  const { error } = await supabase
    .from('campaign_doc_links')
    .delete()
    .eq('id', linkId)
    .eq('campaign_id', campaignId)

  if (error) return { error: 'Could not remove the Codex link. Please try again.' }
  revalidatePath(CODEX_PATH(campaignId))
  revalidatePath(`/campaigns/${campaignId}/live-map`)
  return { success: true }
}

export async function fetchCampaignDocs(campaignId: string): Promise<CampaignDoc[]> {
  const { supabase } = await getClientAndUser()
  const { data } = await supabase
    .from('campaign_docs')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('updated_at', { ascending: false })
  return (data ?? []) as CampaignDoc[]
}

export async function fetchCampaignDocsByType(
  campaignId: string,
  docType: CampaignDocType,
): Promise<CampaignDoc[]> {
  const { supabase } = await getClientAndUser()
  const { data } = await supabase
    .from('campaign_docs')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('doc_type', docType)
    .order('updated_at', { ascending: false })
  return (data ?? []) as CampaignDoc[]
}

export async function fetchCampaignDocLinks(campaignId: string): Promise<CampaignDocLink[]> {
  const { supabase } = await getClientAndUser()
  const { data } = await supabase
    .from('campaign_doc_links')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('updated_at', { ascending: false })
  return (data ?? []) as CampaignDocLink[]
}

export async function fetchCampaignDocsLinkedToObject(
  campaignId: string,
  liveObjectType: CampaignDocLiveObjectType,
  liveObjectId: string,
): Promise<CampaignDoc[]> {
  const { supabase } = await getClientAndUser()
  const { data: links } = await supabase
    .from('campaign_doc_links')
    .select('source_doc_id')
    .eq('campaign_id', campaignId)
    .eq('live_object_type', liveObjectType)
    .eq('live_object_id', liveObjectId)

  const docIds = Array.from(new Set((links ?? []).map((link) => link.source_doc_id)))
  if (docIds.length === 0) return []

  const { data } = await supabase
    .from('campaign_docs')
    .select('*')
    .eq('campaign_id', campaignId)
    .in('id', docIds)
    .order('updated_at', { ascending: false })
  return (data ?? []) as CampaignDoc[]
}

export async function fetchPlayerVisibleCampaignDocs(
  campaignId: string,
): Promise<PlayerVisibleCampaignDoc[]> {
  const { supabase } = await getClientAndUser()
  const { data } = await supabase.rpc('get_player_visible_campaign_docs', {
    p_campaign_id: campaignId,
  })
  return (data ?? []) as PlayerVisibleCampaignDoc[]
}

export async function searchCampaignDocs(
  campaignId: string,
  query: string,
): Promise<CampaignDoc[]> {
  const q = query.trim().toLowerCase()
  const { supabase } = await getClientAndUser()
  const { data } = await supabase
    .from('campaign_docs')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('updated_at', { ascending: false })

  const docs = (data ?? []) as CampaignDoc[]
  if (!q) return docs

  return docs.filter((doc) =>
    [doc.title, doc.dm_summary, doc.player_summary, doc.dm_notes, doc.status, doc.doc_type, ...doc.tags]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q)),
  )
}

export type CodexPlayer = { id: string; name: string }

/**
 * Players (non-DM members) of a campaign, for the DM's "reveal to one player"
 * picker. Returns only id + display name — no roles, emails, or other metadata.
 */
export async function fetchCampaignPlayers(campaignId: string): Promise<CodexPlayer[]> {
  const { supabase } = await getClientAndUser()
  const { data: members } = await supabase
    .from('campaign_members')
    .select('user_id, role')
    .eq('campaign_id', campaignId)

  const playerIds = (members ?? [])
    .filter((member) => member.role !== 'dm')
    .map((member) => member.user_id)
  if (playerIds.length === 0) return []

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', playerIds)

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]))
  return playerIds
    .map((id) => ({ id, name: nameById.get(id) ?? 'Player' }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Clean, player-safe notification line by doc type. Never includes ids, DM
// notes, or raw content — only that *some* new info of this kind is available.
function revealNoticeFor(docType: CampaignDocType): string {
  switch (docType) {
    case 'location':
    case 'sub_location':
      return 'New location information is available.'
    case 'character':
    case 'npc':
      return 'New character information is available.'
    case 'boss':
    case 'hostile_enemy':
      return 'New enemy information is available.'
    case 'item':
    case 'loot':
      return 'New item details are available.'
    case 'handout':
      return 'A new handout is available.'
    case 'rumor':
      return 'The DM revealed a rumor.'
    case 'faction':
      return 'New faction information is available.'
    case 'main_quest':
    case 'side_quest':
      return 'New quest information is available.'
    default:
      return 'New information revealed.'
  }
}

/**
 * Delivers the player-facing reveal popup over the existing party_messages
 * realtime pipeline. Party reveals notify every player; single-player reveals
 * notify only the target. The body is always the player-safe notice line plus
 * an optional DM message — no doc ids, DM notes, or unrevealed content.
 *
 * Gracefully degrades on older schemas: if 'codex_reveal' isn't an allowed
 * message_type yet (migration 025 not applied) it retries as 'announcement'
 * (party) / 'whisper' (single), and if the migration-016 columns are missing it
 * retries with only the base columns.
 */
async function notifyCodexReveal(
  campaignId: string,
  input: {
    senderId: string
    docType: CampaignDocType
    reveal_message?: string | null
    playerIds: string[]
    targetPlayerId: string | null
  },
) {
  const supabase = await createClient()
  const { data: senderProfile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', input.senderId)
    .maybeSingle()
  const senderName = senderProfile?.display_name ?? 'The DM'

  const notice = revealNoticeFor(input.docType)
  const extra = cleanText(input.reveal_message, 280)
  const body = extra ? `${notice} ${extra}` : notice
  const recipientIds = input.targetPlayerId ? [input.targetPlayerId] : input.playerIds

  const baseRow = {
    id: crypto.randomUUID(),
    campaign_id: campaignId,
    sender_user_id: input.senderId,
    recipient_user_id: input.targetPlayerId,
    message_type: 'codex_reveal' as const,
    message: body,
  }
  const fullRow = {
    ...baseRow,
    title: 'New information revealed',
    sender_name: senderName,
    recipient_ids: recipientIds,
    dm_recipient_id: null,
    visibility_level: 'players' as const,
    delivery_status: 'sent' as const,
  }

  let { error } = await supabase.from('party_messages').insert(fullRow)
  if (error && /message_type|check constraint/i.test(error.message)) {
    const fallbackType = input.targetPlayerId ? 'whisper' : 'announcement'
    ;({ error } = await supabase
      .from('party_messages')
      .insert({ ...fullRow, message_type: fallbackType }))
    if (error && /column|schema cache/i.test(error.message)) {
      ;({ error } = await supabase
        .from('party_messages')
        .insert({ ...baseRow, message_type: fallbackType }))
    }
  } else if (error && /column|schema cache/i.test(error.message)) {
    ;({ error } = await supabase.from('party_messages').insert(baseRow))
  }
  // Notification delivery is best-effort: the reveal record itself is the source
  // of truth, so a missing popup never blocks the reveal.
}

type RevealScope = 'party' | 'player'

function resolveRevealScope(input?: { scope?: RevealScope; playerId?: string | null }): {
  scope: RevealScope
  playerId: string | null
  error?: string
} {
  const scope: RevealScope = input?.scope === 'player' ? 'player' : 'party'
  if (scope === 'player') {
    if (!input?.playerId) return { scope, playerId: null, error: 'Choose a player to reveal to.' }
    return { scope, playerId: input.playerId }
  }
  return { scope, playerId: null }
}

export async function revealCampaignDoc(
  campaignId: string,
  docId: string,
  input?: { reveal_message?: string; scope?: RevealScope; playerId?: string | null },
): Promise<Result> {
  const { supabase, user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated.' }

  const { scope, playerId, error: scopeError } = resolveRevealScope(input)
  if (scopeError) return { error: scopeError }

  const { data: doc } = await supabase
    .from('campaign_docs')
    .select('doc_type, title, player_summary')
    .eq('id', docId)
    .eq('campaign_id', campaignId)
    .maybeSingle()
  if (!doc) return { error: 'Codex record not found.' }
  if (!doc.player_summary?.trim()) {
    return { error: 'Add a player-safe summary before revealing this record.' }
  }

  const { error: revealError } = await supabase.from('codex_reveals').insert({
    campaign_id: campaignId,
    doc_id: docId,
    revealed_to_scope: scope,
    revealed_to_player_id: playerId,
    revealed_by: user.id,
    reveal_message: cleanText(input?.reveal_message, 500),
    reveal_type: 'manual',
  })
  if (revealError) return { error: 'Could not reveal this Codex record. Please try again.' }

  // Party reveals flip the doc to player-visible (which publishes the safe
  // projection to every player). Single-player reveals must NOT change global
  // visibility — the codex_reveals row alone grants that one player access via
  // get_player_visible_campaign_docs.
  if (scope === 'party') {
    const { error: docError } = await supabase
      .from('campaign_docs')
      .update({ visibility: 'revealed', reveal_state: 'revealed' })
      .eq('id', docId)
      .eq('campaign_id', campaignId)
    if (docError) return { error: 'The reveal was recorded, but the record visibility could not be updated.' }
  }

  const playerIds = scope === 'party' ? await playerIdsFor(campaignId) : []
  await notifyCodexReveal(campaignId, {
    senderId: user.id,
    docType: doc.doc_type as CampaignDocType,
    reveal_message: input?.reveal_message,
    playerIds,
    targetPlayerId: playerId,
  })

  revalidatePath(CODEX_PATH(campaignId))
  return { success: true }
}

export async function revealCampaignDocForLiveObject(
  campaignId: string,
  docId: string,
  input: {
    live_object_type: CampaignDocLiveObjectType
    live_object_id: string
    reveal_message?: string
    scope?: RevealScope
    playerId?: string | null
  },
): Promise<Result> {
  const { supabase, user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated.' }

  const { scope, playerId, error: scopeError } = resolveRevealScope(input)
  if (scopeError) return { error: scopeError }

  const { data: doc } = await supabase
    .from('campaign_docs')
    .select('doc_type, title, player_summary')
    .eq('id', docId)
    .eq('campaign_id', campaignId)
    .maybeSingle()
  if (!doc) return { error: 'Codex record not found.' }
  if (!doc.player_summary?.trim()) {
    return { error: 'Add a player-safe summary before revealing this record.' }
  }

  const { error: revealError } = await supabase.from('codex_reveals').insert({
    campaign_id: campaignId,
    doc_id: docId,
    revealed_to_scope: scope,
    revealed_to_player_id: playerId,
    revealed_by: user.id,
    reveal_message: cleanText(input.reveal_message, 500),
    reveal_type: 'map_object',
  })
  if (revealError) return { error: 'Could not reveal this Codex record. Please try again.' }

  // Only party reveals flip visibility + publish the link to the shared
  // map-object panel. A single-player reveal from a live object still records
  // the reveal and notifies that player (it surfaces on their Revealed Info
  // page), but does not publish the link to the party-wide object panel.
  if (scope === 'party') {
    const [{ error: docError }, { error: linkError }] = await Promise.all([
      supabase
        .from('campaign_docs')
        .update({ visibility: 'revealed', reveal_state: 'revealed' })
        .eq('id', docId)
        .eq('campaign_id', campaignId),
      supabase
        .from('campaign_doc_links')
        .update({ visibility: 'revealed' })
        .eq('source_doc_id', docId)
        .eq('campaign_id', campaignId)
        .eq('live_object_type', input.live_object_type)
        .eq('live_object_id', input.live_object_id),
    ])
    if (docError) return { error: 'The reveal was recorded, but the record visibility could not be updated.' }
    if (linkError) return { error: 'The reveal was recorded, but the live-object link could not be published.' }
  }

  const playerIds = scope === 'party' ? await playerIdsFor(campaignId) : []
  await notifyCodexReveal(campaignId, {
    senderId: user.id,
    docType: doc.doc_type as CampaignDocType,
    reveal_message: input.reveal_message,
    playerIds,
    targetPlayerId: playerId,
  })

  revalidatePath(CODEX_PATH(campaignId))
  revalidatePath(`/campaigns/${campaignId}/live-map`)
  return { success: true }
}

async function playerIdsFor(campaignId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data: members } = await supabase
    .from('campaign_members')
    .select('user_id, role')
    .eq('campaign_id', campaignId)
  return (members ?? []).filter((m) => m.role !== 'dm').map((m) => m.user_id)
}
