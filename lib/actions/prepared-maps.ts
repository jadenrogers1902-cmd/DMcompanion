'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Database, FogMode, FogStyle } from '@/lib/types/database'
import type {
  AdventureStatus,
  PreparedMap,
  PreparedMapLink,
  PreparedMapNote,
  PreparedMapRoomRegion,
  PreparedMapToken,
} from '@/lib/types/adventure'
import {
  normalizePreparedRoomRegions,
  normalizePrepLinks,
  normalizePrepNotes,
  normalizeTags,
} from '@/components/adventures/prep-metadata'
import { instantiatePreparedMap, sanitizeRoomRegions, sanitizeTokens } from '@/lib/maps/deploy'

type PreparedMapUpdate = Database['public']['Tables']['prepared_maps']['Update']

const STATUSES: AdventureStatus[] = ['draft', 'ready', 'active', 'archived']
const MAX_NOTES = 100
const MAX_LINKS = 50
const MAX_ROOM_REGIONS = 100

function revalidatePrepPaths(campaignId: string, adventureId: string, chapterId: string, mapId?: string) {
  revalidatePath(`/campaigns/${campaignId}/adventures/${adventureId}`)
  revalidatePath(`/campaigns/${campaignId}/adventures/${adventureId}/chapters/${chapterId}`)
  if (mapId) {
    revalidatePath(
      `/campaigns/${campaignId}/adventures/${adventureId}/chapters/${chapterId}/maps/${mapId}`,
    )
  }
}

function sanitizeNotes(notes: PreparedMapNote[]): PreparedMapNote[] {
  return normalizePrepNotes(notes, 'map').slice(0, MAX_NOTES)
}

function sanitizeLinks(links: PreparedMapLink[]): PreparedMapLink[] {
  return normalizePrepLinks(links, 'map').slice(0, MAX_LINKS)
}

function sanitizePreparedRoomRegions(roomRegions: PreparedMapRoomRegion[]): PreparedMapRoomRegion[] {
  return sanitizeRoomRegions(normalizePreparedRoomRegions(roomRegions)).slice(0, MAX_ROOM_REGIONS)
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
    room_regions?: PreparedMapRoomRegion[]
    fog_regions?: PreparedMapRoomRegion[]
    fog_mode?: FogMode
    fog_style?: FogStyle
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
  if (input.room_regions !== undefined) update.room_regions = sanitizePreparedRoomRegions(input.room_regions)
  if (input.fog_regions !== undefined) update.fog_regions = sanitizePreparedRoomRegions(input.fog_regions)
  if (input.fog_mode !== undefined) {
    update.fog_mode = (['none', 'rooms', 'hidden'] as FogMode[]).includes(input.fog_mode)
      ? input.fog_mode
      : 'rooms'
  }
  if (input.fog_style !== undefined) {
    update.fog_style = (['blackout', 'dim'] as FogStyle[]).includes(input.fog_style)
      ? input.fog_style
      : 'blackout'
  }
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
 * Designate (or clear) a prepared map as its chapter's hub — the entry map
 * players land on when the DM opens the chapter for play. One hub per chapter.
 */
export async function setPreparedMapHub(
  campaignId: string,
  adventureId: string,
  chapterId: string,
  preparedMapId: string,
  makeHub: boolean,
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  if (makeHub) {
    // Clear any existing hub in this chapter first (one hub per chapter).
    await supabase
      .from('prepared_maps')
      .update({ is_hub: false })
      .eq('chapter_id', chapterId)
      .eq('is_hub', true)
    const { error } = await supabase
      .from('prepared_maps')
      .update({ is_hub: true })
      .eq('id', preparedMapId)
      .eq('campaign_id', campaignId)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase
      .from('prepared_maps')
      .update({ is_hub: false })
      .eq('id', preparedMapId)
      .eq('campaign_id', campaignId)
    if (error) return { error: error.message }
  }

  revalidatePrepPaths(campaignId, adventureId, chapterId, preparedMapId)
  return { ok: true }
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

  const liveName = mode === 'duplicate' ? `${prepared.title} (Copy)` : prepared.title

  const result = await instantiatePreparedMap(supabase, {
    campaignId,
    prepared,
    liveName,
    createdBy: user.id,
  })
  if ('error' in result) return result
  const liveMapId = result.liveMapId

  // 'replace_active': atomically deactivate the prior active map and activate
  // this one (the old map is kept, just no longer shown — nothing is destroyed).
  let activated = false
  if (mode === 'replace_active') {
    const { error: activateError } = await supabase.rpc('set_active_map', {
      p_campaign_id: campaignId,
      p_map_id: liveMapId,
    })
    if (activateError) {
      return {
        error: `Live map "${liveName}" was created, but activating it failed: ${activateError.message}`,
        liveMapId,
        mode,
      }
    }
    activated = true
  }

  revalidatePath(`/campaigns/${campaignId}/live-map`)
  if (activated) revalidatePath(`/campaigns/${campaignId}/live-map/${liveMapId}`)
  return { liveMapId, mode, activated, replacedMapName }
}
