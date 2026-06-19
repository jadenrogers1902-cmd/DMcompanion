'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { instantiatePreparedMap, syncPreparedTokensToLiveMap } from '@/lib/maps/deploy'
import type { Database } from '@/lib/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PreparedMap } from '@/lib/types/adventure'

export type TransportTravelResult =
  | { error: string }
  | { ok: true; traveled: true; liveMapId: string }
  | { ok: true; traveled: false; confirmed: number; needed: number }

/**
 * Resolve a player tapping a transport ('portal') token. Travel is automatic
 * (no DM gate): in freeroam/solo it fires immediately; in group-party mode it
 * records the caller's confirmation and only travels once every player with a
 * character on the map has confirmed the SAME transport. Revisiting a map
 * reuses its existing live instance (fog/positions preserved); first visits
 * deploy a fresh copy. Runs the deploy/activate with the service role since
 * players cannot read the DM-only prepared map.
 */
export async function travelThroughTransport(
  campaignId: string,
  tokenId: string,
): Promise<TransportTravelResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: membership } = await supabase
    .from('campaign_members')
    .select('role')
    .eq('campaign_id', campaignId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) return { error: 'You are not a member of this campaign.' }
  const isDm = membership.role === 'dm'

  const admin = createAdminClient()
  if (!admin) return { error: 'Travel is not configured on the server.' }

  // Load the transport token (service role — players cannot read all columns).
  const { data: token } = await admin
    .from('tokens')
    .select('id, campaign_id, map_id, token_type, destination_prepared_map_id')
    .eq('id', tokenId)
    .maybeSingle()
  if (!token || token.campaign_id !== campaignId) return { error: 'Transport not found.' }
  if (token.token_type !== 'portal') return { error: 'That token is not a transport.' }
  if (!token.destination_prepared_map_id) {
    return { error: 'This transport has no destination set yet.' }
  }

  const destination = token.destination_prepared_map_id

  // The party travels FROM the campaign's active map (where the players are).
  // A player can only use a portal that's on their active map; the DM can send
  // the party from any portal (e.g. while prepping another scene) and the party
  // still leaves from their current active map.
  const { data: activeMap } = await admin
    .from('maps')
    .select('id, travel_mode')
    .eq('campaign_id', campaignId)
    .eq('is_active', true)
    .maybeSingle()

  if (!isDm && (!activeMap || activeMap.id !== token.map_id)) {
    return { error: 'This transport is not on the active map.' }
  }
  if (!isDm && activeMap?.travel_mode === 'combat') {
    return { error: 'Travel is locked during combat.' }
  }

  const partyMapId = activeMap?.id ?? null
  const partyTravelMode = activeMap?.travel_mode ?? 'freeroam'

  // The set of "voters": players who control a character token on the party map.
  const voters = new Set<string>()
  if (partyMapId) {
    const { data: playerTokens } = await admin
      .from('tokens')
      .select('controlled_by_user_id')
      .eq('map_id', partyMapId)
      .eq('token_type', 'player')
      .not('controlled_by_user_id', 'is', null)
    for (const row of playerTokens ?? []) {
      if (row.controlled_by_user_id) voters.add(row.controlled_by_user_id)
    }
  }

  const callerIsVoter = voters.has(user.id)
  // Only someone with a character on the map (or the DM) can move the table.
  if (!isDm && !callerIsVoter) {
    return { error: 'You need a character on this map to travel.' }
  }
  // Group-party mode with more than one player present requires unanimity.
  const needsVote = partyTravelMode === 'group_party' && voters.size > 1 && !isDm

  if (needsVote && partyMapId) {
    // Record / update this player's confirmation for this transport.
    const { error: upsertError } = await admin
      .from('map_transport_confirmations')
      .upsert(
        {
          campaign_id: campaignId,
          map_id: partyMapId,
          token_id: token.id,
          destination_prepared_map_id: destination,
          user_id: user.id,
        },
        { onConflict: 'map_id,user_id' },
      )
    if (upsertError) return { error: `Could not record your vote: ${upsertError.message}` }

    const { data: confirmations } = await admin
      .from('map_transport_confirmations')
      .select('user_id, token_id')
      .eq('map_id', partyMapId)

    const confirmedVoters = new Set(
      (confirmations ?? [])
        .filter((row) => row.token_id === token.id && voters.has(row.user_id))
        .map((row) => row.user_id),
    )
    const confirmed = confirmedVoters.size
    const needed = voters.size

    if (confirmed < needed) {
      return { ok: true, traveled: false, confirmed, needed }
    }
  }

  const result = await resolveDestinationMap(admin, campaignId, destination, user.id)
  if ('error' in result) return result

  // Carry the party's character tokens onto the destination so players land
  // with their tokens (prepared maps never contain player tokens).
  if (partyMapId) {
    const carry = await carryPlayerTokens(admin, campaignId, partyMapId, result.liveMapId, user.id)
    if ('error' in carry) return carry
  }

  const activation = await activateLiveMap(admin, campaignId, result.liveMapId)
  if ('error' in activation) return activation

  // Travel succeeded — now clear the votes (kept until success so a failed
  // deploy doesn't lose everyone's confirmation).
  if (needsVote && partyMapId) {
    await admin.from('map_transport_confirmations').delete().eq('map_id', partyMapId)
  }

  revalidatePath(`/campaigns/${campaignId}/live-map`)
  return { ok: true, traveled: true, liveMapId: result.liveMapId }
}

/**
 * Ensure every player who had a character token on the origin map also has one
 * on the destination. Creates a centered token only when that player has none
 * there yet — so first visits spawn the party and revisits keep each map's own
 * token positions (no duplicates). Scene tokens and fog stay per-map.
 */
async function carryPlayerTokens(
  admin: SupabaseClient<Database>,
  campaignId: string,
  originMapId: string,
  destMapId: string,
  createdBy: string,
): Promise<{ ok: true } | { error: string }> {
  if (originMapId === destMapId) return { ok: true }

  const { data: originPlayers } = await admin
    .from('tokens')
    .select('controlled_by_user_id, name, color, size, linked_character_id')
    .eq('map_id', originMapId)
    .eq('token_type', 'player')
    .not('controlled_by_user_id', 'is', null)
  if (!originPlayers || originPlayers.length === 0) return { ok: true }

  const { data: destPlayers } = await admin
    .from('tokens')
    .select('controlled_by_user_id, x, y')
    .eq('map_id', destMapId)
    .eq('token_type', 'player')
  const present = new Set((destPlayers ?? []).map((t) => t.controlled_by_user_id))
  const originUserIds = new Set(
    originPlayers.map((token) => token.controlled_by_user_id).filter((id): id is string => Boolean(id)),
  )
  const revealPoints: { x: number; y: number }[] = (destPlayers ?? [])
    .filter((token) => token.controlled_by_user_id && originUserIds.has(token.controlled_by_user_id))
    .map((token) => ({ x: token.x, y: token.y }))

  // One token per user that isn't already on the destination.
  const seen = new Set<string>()
  const missing = originPlayers.filter((t) => {
    const uid = t.controlled_by_user_id
    if (!uid || seen.has(uid) || present.has(uid)) return false
    seen.add(uid)
    return true
  })

  const { data: destMap } = await admin
    .from('maps')
    .select('width, height, grid_size, grid_scale_feet')
    .eq('id', destMapId)
    .maybeSingle()
  const w = destMap?.width || 1000
  const h = destMap?.height || 1000
  const gap = destMap?.grid_size || 50
  const scale = Math.max(1, destMap?.grid_scale_feet || 5)
  const revealRadius = (7 / scale) * gap
  const cx = w / 2
  const cy = h / 2

  const rows = missing.map((t, i) => ({
    campaign_id: campaignId,
    map_id: destMapId,
    token_type: 'player',
    name: t.name || 'Player',
    color: t.color || '#3b82f6',
    size: t.size || 1,
    x: Math.round(cx + (i - (missing.length - 1) / 2) * gap),
    y: Math.round(cy),
    visible_to_players: true,
    controlled_by_user_id: t.controlled_by_user_id,
    linked_character_id: t.linked_character_id ?? null,
  }))
  if (rows.length > 0) {
    const { data: inserted, error: insertError } = await admin
      .from('tokens')
      .insert(rows)
      .select('x, y')
    if (insertError) return { error: `Could not carry party tokens to the destination: ${insertError.message}` }
    revealPoints.push(...((inserted ?? []) as { x: number; y: number }[]))
  }

  if (revealPoints.length === 0) return { ok: true }

  const { error: revealError } = await admin.from('map_revealed_areas').insert(
    revealPoints.map((point) => ({
      campaign_id: campaignId,
      map_id: destMapId,
      shape_type: 'circle',
      x: point.x,
      y: point.y,
      radius: revealRadius,
      visible_to_players: true,
      created_by: createdBy,
    })),
  )
  if (revealError) return { error: `Could not reveal the party arrival area: ${revealError.message}` }
  return { ok: true }
}

/**
 * Resolve a destination prepared map to a live map id: reuse the existing live
 * instance if one exists, otherwise deploy a fresh copy. Does NOT activate it.
 */
async function resolveDestinationMap(
  admin: SupabaseClient<Database>,
  campaignId: string,
  destinationPreparedMapId: string,
  createdBy: string,
): Promise<{ liveMapId: string } | { error: string }> {
  const { data: prepRow } = await admin
    .from('prepared_maps')
    .select('*')
    .eq('id', destinationPreparedMapId)
    .eq('campaign_id', campaignId)
    .maybeSingle()
  if (!prepRow) return { error: 'Destination map not found.' }
  const prepared = prepRow as unknown as PreparedMap

  const { data: existing } = await admin
    .from('maps')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('source_prepared_map_id', destinationPreparedMapId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing?.id) {
    const synced = await syncPreparedTokensToLiveMap(admin, {
      campaignId,
      prepared,
      liveMapId: existing.id,
      createdBy,
    })
    if ('error' in synced) return synced
    return { liveMapId: existing.id }
  }

  const result = await instantiatePreparedMap(admin, {
    campaignId,
    prepared,
    liveName: prepared.title,
    createdBy,
  })
  return result
}

/**
 * Make an already-resolved live map the campaign's active live map.
 */
async function activateLiveMap(
  admin: SupabaseClient<Database>,
  campaignId: string,
  liveMapId: string,
): Promise<{ liveMapId: string } | { error: string }> {
  // Activate it only after the destination is ready. Players refresh as soon as
  // the active map changes, so token carry/reveal work must happen first.
  await admin.from('maps').update({ is_active: false }).eq('campaign_id', campaignId).eq('is_active', true)
  const { error: activateError } = await admin
    .from('maps')
    .update({ is_active: true })
    .eq('id', liveMapId)
    .eq('campaign_id', campaignId)
  if (activateError) return { error: `Could not activate the destination map: ${activateError.message}` }

  return { liveMapId }
}

/**
 * DM-only: resolve where a portal leads to a live map id WITHOUT activating it,
 * so the DM can jump to (scout) the destination without moving the players'
 * active scene. Returns the live map id to navigate to.
 */
export async function goToTransportDestination(
  campaignId: string,
  tokenId: string,
): Promise<{ error: string } | { ok: true; liveMapId: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: membership } = await supabase
    .from('campaign_members')
    .select('role')
    .eq('campaign_id', campaignId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (membership?.role !== 'dm') return { error: 'Only the DM can do that.' }

  const admin = createAdminClient()
  if (!admin) return { error: 'Travel is not configured on the server.' }

  const { data: token } = await admin
    .from('tokens')
    .select('id, campaign_id, token_type, destination_prepared_map_id')
    .eq('id', tokenId)
    .maybeSingle()
  if (!token || token.campaign_id !== campaignId) return { error: 'Transport not found.' }
  if (token.token_type !== 'portal' || !token.destination_prepared_map_id) {
    return { error: 'This transport has no destination set.' }
  }

  const resolved = await resolveDestinationMap(admin, campaignId, token.destination_prepared_map_id, user.id)
  if ('error' in resolved) return resolved
  return { ok: true, liveMapId: resolved.liveMapId }
}

/**
 * Clear a player's travel confirmation on a map (e.g. they changed their mind).
 */
export async function clearTransportConfirmation(campaignId: string, mapId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('map_transport_confirmations')
    .delete()
    .eq('map_id', mapId)
    .eq('user_id', user.id)
  if (error) return { error: error.message }
  return { ok: true }
}
