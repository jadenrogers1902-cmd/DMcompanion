'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/types/database'
import type {
  AdventureStatus,
  PreparedMap,
  PreparedMapLink,
  PreparedMapNote,
  PreparedMapToken,
} from '@/lib/types/adventure'
import {
  normalizePrepLinks,
  normalizePrepNotes,
  normalizeTags,
} from '@/components/adventures/prep-metadata'
import {
  normalizePreparedToken,
  normalizeTokenResource,
  revealStateIsPlayerVisible,
  toLiveTokenType,
} from '@/components/adventures/token-meta'

type PreparedMapUpdate = Database['public']['Tables']['prepared_maps']['Update']

const STATUSES: AdventureStatus[] = ['draft', 'ready', 'active', 'archived']
const MAX_TOKENS = 200
const MAX_NOTES = 100
const MAX_LINKS = 50

function revalidatePrepPaths(campaignId: string, adventureId: string, chapterId: string, mapId?: string) {
  revalidatePath(`/campaigns/${campaignId}/adventures/${adventureId}`)
  revalidatePath(`/campaigns/${campaignId}/adventures/${adventureId}/chapters/${chapterId}`)
  if (mapId) {
    revalidatePath(
      `/campaigns/${campaignId}/adventures/${adventureId}/chapters/${chapterId}/maps/${mapId}`,
    )
  }
}

const MAX_TOKEN_LINKS = 20

function sanitizeTokens(tokens: PreparedMapToken[]): PreparedMapToken[] {
  return tokens.slice(0, MAX_TOKENS).map((raw) => {
    const token = normalizePreparedToken(raw)
    return {
      ...token,
      name: token.name.slice(0, 80),
      linked_campaign_doc_id: token.linked_campaign_doc_id || null,
      source: token.source ? String(token.source).slice(0, 40) : null,
      is_dynamic: Boolean(token.is_dynamic),
      can_move: Boolean(token.can_move),
      can_participate_in_combat: Boolean(token.can_participate_in_combat),
      interactable: Boolean(token.interactable),
      object_state: token.object_state ? String(token.object_state).slice(0, 40) : null,
      icon: token.icon.slice(0, 8),
      x: Math.round(token.x),
      y: Math.round(token.y),
      size: Math.min(10, Math.max(0.5, token.size)),
      color: /^#[0-9a-fA-F]{6}$/.test(token.color) ? token.color : '#a1a1aa',
      description: token.description.slice(0, 2000),
      dm_notes: token.dm_notes.slice(0, 4000),
      prep_notes: normalizePrepNotes(token.prep_notes, 'token', token.id),
      player_notes: token.player_notes.slice(0, 2000),
      status: STATUSES.includes(token.status) ? token.status : 'draft',
      tags: normalizeTags(token.tags),
      links: normalizePrepLinks(token.links, 'token', token.id).slice(0, MAX_TOKEN_LINKS),
      resource: normalizeTokenResource(token.resource),
    }
  })
}

function sanitizeNotes(notes: PreparedMapNote[]): PreparedMapNote[] {
  return normalizePrepNotes(notes, 'map').slice(0, MAX_NOTES)
}

function sanitizeLinks(links: PreparedMapLink[]): PreparedMapLink[] {
  return normalizePrepLinks(links, 'map').slice(0, MAX_LINKS)
}

export async function createPreparedMap(
  campaignId: string,
  adventureId: string,
  chapterId: string,
  input: { title: string; description?: string },
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const title = input.title?.trim()
  if (!title) return { error: 'Map title is required.' }

  // RLS (prepared_maps_dm_all) rejects this insert for non-DM members.
  const { data: map, error } = await supabase
    .from('prepared_maps')
    .insert({
      adventure_id: adventureId,
      chapter_id: chapterId,
      campaign_id: campaignId,
      title,
      description: input.description?.trim() || null,
    })
    .select()
    .single()

  if (error || !map) return { error: error?.message ?? 'Failed to create map.' }

  revalidatePrepPaths(campaignId, adventureId, chapterId)
  return { preparedMapId: map.id }
}

/** Single save for the prep editor: details, grid, tokens, notes, and links. */
export async function savePreparedMap(
  campaignId: string,
  adventureId: string,
  chapterId: string,
  preparedMapId: string,
  input: {
    title?: string
    description?: string | null
    status?: string
    grid_enabled?: boolean
    grid_size?: number
    tokens?: PreparedMapToken[]
    notes?: PreparedMapNote[]
    links?: PreparedMapLink[]
    tags?: string[]
  },
) {
  const supabase = await createClient()
  const update: PreparedMapUpdate = {}

  if (input.title !== undefined) {
    const title = input.title.trim()
    if (!title) return { error: 'Map title is required.' }
    update.title = title
  }
  if (input.description !== undefined) update.description = input.description?.trim() || null
  if (input.status !== undefined) {
    if (!STATUSES.includes(input.status as AdventureStatus)) {
      return { error: 'Invalid map status.' }
    }
    update.status = input.status
  }
  if (input.grid_enabled !== undefined) update.grid_enabled = input.grid_enabled
  if (input.grid_size !== undefined) {
    update.grid_size = Math.max(5, Math.round(input.grid_size))
  }
  if (input.tokens !== undefined) update.tokens = sanitizeTokens(input.tokens)
  if (input.notes !== undefined) update.notes = sanitizeNotes(input.notes)
  if (input.links !== undefined) update.links = sanitizeLinks(input.links)
  if (input.tags !== undefined) update.tags = normalizeTags(input.tags)

  const { error } = await supabase
    .from('prepared_maps')
    .update(update)
    .eq('id', preparedMapId)
    .eq('chapter_id', chapterId)
  if (error) return { error: error.message }

  revalidatePrepPaths(campaignId, adventureId, chapterId, preparedMapId)
  return { success: true }
}

/** Set (or replace) the background image after a client-side storage upload. */
export async function setPreparedMapImage(
  campaignId: string,
  adventureId: string,
  chapterId: string,
  preparedMapId: string,
  input: { storage_path: string; width: number; height: number },
) {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('prepared_maps')
    .select('storage_path')
    .eq('id', preparedMapId)
    .single()

  const { error } = await supabase
    .from('prepared_maps')
    .update({
      storage_path: input.storage_path,
      width: Math.max(0, Math.round(input.width)),
      height: Math.max(0, Math.round(input.height)),
    })
    .eq('id', preparedMapId)
    .eq('chapter_id', chapterId)
  if (error) return { error: error.message }

  // Best-effort cleanup of the replaced image.
  if (existing?.storage_path && existing.storage_path !== input.storage_path) {
    await supabase.storage.from('maps').remove([existing.storage_path])
  }

  revalidatePrepPaths(campaignId, adventureId, chapterId, preparedMapId)
  return { success: true }
}

export async function removePreparedMapImage(
  campaignId: string,
  adventureId: string,
  chapterId: string,
  preparedMapId: string,
) {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('prepared_maps')
    .select('storage_path')
    .eq('id', preparedMapId)
    .single()

  const { error } = await supabase
    .from('prepared_maps')
    .update({ storage_path: null, width: 0, height: 0 })
    .eq('id', preparedMapId)
    .eq('chapter_id', chapterId)
  if (error) return { error: error.message }

  if (existing?.storage_path) {
    await supabase.storage.from('maps').remove([existing.storage_path])
  }

  revalidatePrepPaths(campaignId, adventureId, chapterId, preparedMapId)
  return { success: true }
}

export async function deletePreparedMap(
  campaignId: string,
  adventureId: string,
  chapterId: string,
  preparedMapId: string,
) {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('prepared_maps')
    .select('storage_path')
    .eq('id', preparedMapId)
    .single()

  const { error } = await supabase
    .from('prepared_maps')
    .delete()
    .eq('id', preparedMapId)
    .eq('chapter_id', chapterId)
  if (error) return { error: error.message }

  if (existing?.storage_path) {
    await supabase.storage.from('maps').remove([existing.storage_path])
  }

  revalidatePrepPaths(campaignId, adventureId, chapterId)
  redirect(`/campaigns/${campaignId}/adventures/${adventureId}/chapters/${chapterId}`)
}

/**
 * How a prepared scene is pushed into the Live Map:
 *  - 'next_scene'    → create a new INACTIVE live map (players keep seeing the
 *                      current active map). The safe default.
 *  - 'duplicate'     → same, but the name gets a "(Copy)" suffix so repeated
 *                      independent deployments of the same prep stay distinct.
 *  - 'replace_active'→ create the new live map AND make it active, instantly
 *                      replacing what players see. Guard this in the UI.
 */
export type DeployMode = 'next_scene' | 'duplicate' | 'replace_active'
const DEPLOY_MODES: DeployMode[] = ['next_scene', 'duplicate', 'replace_active']

/**
 * Context for the "Send to Live Map" UI: the current active map's name (for the
 * overwrite warning) and how many live maps already came from this prep.
 */
export async function getLiveMapDeployContext(campaignId: string, preparedMapId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const [{ data: active }, { count }] = await Promise.all([
    supabase
      .from('maps')
      .select('name')
      .eq('campaign_id', campaignId)
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('maps')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('source_prepared_map_id', preparedMapId),
  ])

  return {
    activeMapName: active?.name ?? null,
    existingDeployCount: count ?? 0,
  }
}

/**
 * Instantiate this prepared scene as a live map: copies the image within the
 * 'maps' bucket and creates fresh, independent live `maps` + `tokens` rows. The
 * prepared original is never mutated, so it can be deployed again and live-session
 * edits can't flow back into prep. DM-only prep content (map notes/links) stays
 * in the DM-only prep tables; the live row only links back via
 * `source_prepared_map_id`. Per-token DM notes go to the DM-only token_dm_notes
 * table, and only 'visible' tokens deploy player-visible.
 */
export async function sendPreparedMapToLiveMap(
  campaignId: string,
  preparedMapId: string,
  options?: { mode?: DeployMode },
) {
  const mode: DeployMode =
    options?.mode && DEPLOY_MODES.includes(options.mode) ? options.mode : 'next_scene'
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data } = await supabase
    .from('prepared_maps')
    .select('*')
    .eq('id', preparedMapId)
    .eq('campaign_id', campaignId)
    .single()
  if (!data) return { error: 'Prepared map not found.' }
  const prepared = data as unknown as PreparedMap

  if (!prepared.storage_path || !prepared.width || !prepared.height) {
    return { error: 'Add a background image before sending this map to the Live Map.' }
  }

  // Capture the current active map up front so we can report what we replaced.
  let replacedMapName: string | null = null
  if (mode === 'replace_active') {
    const { data: active } = await supabase
      .from('maps')
      .select('name')
      .eq('campaign_id', campaignId)
      .eq('is_active', true)
      .maybeSingle()
    replacedMapName = active?.name ?? null
  }

  // Copy the image so deleting the prepared map later never breaks the live map.
  const ext = prepared.storage_path.split('.').pop() || 'png'
  const livePath = `${campaignId}/${crypto.randomUUID()}.${ext}`
  const { error: copyError } = await supabase.storage
    .from('maps')
    .copy(prepared.storage_path, livePath)
  if (copyError) return { error: `Could not copy map image: ${copyError.message}` }

  const liveName = mode === 'duplicate' ? `${prepared.title} (Copy)` : prepared.title

  const { data: liveMap, error: mapError } = await supabase
    .from('maps')
    .insert({
      campaign_id: campaignId,
      name: liveName,
      storage_path: livePath,
      width: prepared.width,
      height: prepared.height,
      // Always insert inactive; 'replace_active' activates atomically below.
      is_active: false,
      source_prepared_map_id: preparedMapId,
      created_by: user.id,
    })
    .select()
    .single()
  if (mapError || !liveMap) {
    await supabase.storage.from('maps').remove([livePath])
    return { error: mapError?.message ?? 'Failed to create live map.' }
  }

  // Apply prepared grid settings to the live map.
  await supabase
    .from('maps')
    .update({ grid_enabled: prepared.grid_enabled, grid_size: prepared.grid_size })
    .eq('id', liveMap.id)

  // Instantiate prepared tokens as live tokens. Prep-only types map to the
  // closest live concept (item→object, clue→note, location→custom), and
  // reveal_state collapses to the live visibility flag — only 'visible'
  // deploys as player-visible; hidden/revealed/dm_only start unseen and are
  // revealed from Live Map. Player-facing notes become the public description.
  const tokens = sanitizeTokens(prepared.tokens ?? [])
  if (tokens.length > 0) {
    const { data: liveTokens, error: tokenError } = await supabase
      .from('tokens')
      .insert(
        tokens.map((token) => ({
          campaign_id: campaignId,
          map_id: liveMap.id,
          token_type: toLiveTokenType(token.token_type),
          name: token.name,
          x: token.x,
          y: token.y,
          size: token.size,
          color: token.color,
          visible_to_players: revealStateIsPlayerVisible(token.reveal_state),
          public_description: token.player_notes || token.description || null,
          movement_locked: token.can_move === false,
          interactable: Boolean(token.interactable),
          object_state: token.object_state || null,
          requires_approval: Boolean(token.interactable),
        })),
      )
      .select('id')
    if (tokenError) {
      return {
        error: `Live map "${prepared.title}" was created, but tokens failed to copy: ${tokenError.message}`,
        liveMapId: liveMap.id,
      }
    }

    // Carry DM-only token notes into the live token_dm_notes table
    // (unpublished, DM-only — same privacy model as prep). RETURNING
    // preserves insert order, so indexes line up.
    const dmNoteRows = (liveTokens ?? [])
      .map((live, index) => ({ live, prep: tokens[index] }))
      .filter(({ prep }) => prep?.dm_notes?.trim())
      .map(({ live, prep }) => ({
        token_id: live.id,
        campaign_id: campaignId,
        content: prep.dm_notes.trim(),
      }))
    if (dmNoteRows.length > 0) {
      // Best-effort: a failure here should not fail the whole deploy.
      await supabase.from('token_dm_notes').insert(dmNoteRows)
    }

    const linkedPrepTokens = (liveTokens ?? [])
      .map((live, index) => ({ live, prep: tokens[index] }))
      .filter(({ prep }) => prep?.linked_campaign_doc_id)

    if (linkedPrepTokens.length > 0) {
      const linkedDocIds = Array.from(
        new Set(linkedPrepTokens.map(({ prep }) => prep.linked_campaign_doc_id).filter(Boolean) as string[]),
      )
      const { data: linkedDocs } = await supabase
        .from('campaign_docs')
        .select('id, visibility')
        .eq('campaign_id', campaignId)
        .in('id', linkedDocIds)
      const visibilityByDoc = new Map(
        (linkedDocs ?? []).map((doc) => [doc.id, doc.visibility ?? 'dm_only']),
      )

      await supabase.from('campaign_doc_links').insert(
        linkedPrepTokens.map(({ live, prep }) => {
          const liveObjectType = prep.is_dynamic === false ? 'object' : 'token'
          const docVisibility = visibilityByDoc.get(prep.linked_campaign_doc_id!) ?? 'dm_only'
          return {
            campaign_id: campaignId,
            source_doc_id: prep.linked_campaign_doc_id!,
            live_object_type: liveObjectType,
            live_object_id: live.id,
            live_object_label: prep.name,
            relationship_type: liveObjectType === 'object' ? 'object_doc' : 'token_doc',
            visibility: docVisibility === 'revealed' || docVisibility === 'player_safe'
              ? docVisibility
              : 'dm_only',
            created_by: user.id,
          }
        }),
      )
    }
  }

  // 'replace_active': atomically deactivate the prior active map and activate
  // this one (the old map is kept, just no longer shown — nothing is destroyed).
  let activated = false
  if (mode === 'replace_active') {
    const { error: activateError } = await supabase.rpc('set_active_map', {
      p_campaign_id: campaignId,
      p_map_id: liveMap.id,
    })
    if (activateError) {
      return {
        error: `Live map "${liveName}" was created, but activating it failed: ${activateError.message}`,
        liveMapId: liveMap.id,
        mode,
      }
    }
    activated = true
  }

  revalidatePath(`/campaigns/${campaignId}/live-map`)
  if (activated) revalidatePath(`/campaigns/${campaignId}/live-map/${liveMap.id}`)
  return { liveMapId: liveMap.id, mode, activated, replacedMapName }
}
