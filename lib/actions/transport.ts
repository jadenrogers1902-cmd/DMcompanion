'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { instantiatePreparedMap } from '@/lib/maps/deploy'
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

  const { data: map } = await admin
    .from('maps')
    .select('id, campaign_id, is_active, travel_mode')
    .eq('id', token.map_id)
    .maybeSingle()
  if (!map || map.campaign_id !== campaignId) return { error: 'Map not found.' }
  if (!map.is_active) return { error: 'This transport is not on the active map.' }
  if (map.travel_mode === 'combat') return { error: 'Travel is locked during combat.' }

  const destination = token.destination_prepared_map_id

  // The set of "voters": players who control a character token on this map.
  const { data: playerTokens } = await admin
    .from('tokens')
    .select('controlled_by_user_id')
    .eq('map_id', map.id)
    .eq('token_type', 'player')
    .not('controlled_by_user_id', 'is', null)
  const voters = new Set(
    (playerTokens ?? [])
      .map((row) => row.controlled_by_user_id)
      .filter((id): id is string => Boolean(id)),
  )

  const callerIsVoter = voters.has(user.id)
  // Only someone with a character on the map (or the DM) can move the table.
  if (!isDm && !callerIsVoter) {
    return { error: 'You need a character on this map to travel.' }
  }
  // Group-party mode with more than one player present requires unanimity.
  const needsVote = map.travel_mode === 'group_party' && voters.size > 1 && !isDm

  if (needsVote) {
    // Record / update this player's confirmation for this transport.
    const { error: upsertError } = await admin
      .from('map_transport_confirmations')
      .upsert(
        {
          campaign_id: campaignId,
          map_id: map.id,
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
      .eq('map_id', map.id)

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

  const result = await executeTravel(admin, campaignId, destination, user.id)
  if ('error' in result) return result

  // Carry the party's character tokens onto the destination so players land
  // with their tokens (prepared maps never contain player tokens).
  await carryPlayerTokens(admin, campaignId, map.id, result.liveMapId)

  // Travel succeeded — now clear the votes (kept until success so a failed
  // deploy doesn't lose everyone's confirmation).
  if (needsVote) {
    await admin.from('map_transport_confirmations').delete().eq('map_id', map.id)
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
) {
  if (originMapId === destMapId) return

  const { data: originPlayers } = await admin
    .from('tokens')
    .select('controlled_by_user_id, name, color, size, linked_character_id')
    .eq('map_id', originMapId)
    .eq('token_type', 'player')
    .not('controlled_by_user_id', 'is', null)
  if (!originPlayers || originPlayers.length === 0) return

  const { data: destPlayers } = await admin
    .from('tokens')
    .select('controlled_by_user_id')
    .eq('map_id', destMapId)
    .eq('token_type', 'player')
  const present = new Set((destPlayers ?? []).map((t) => t.controlled_by_user_id))

  // One token per user that isn't already on the destination.
  const seen = new Set<string>()
  const missing = originPlayers.filter((t) => {
    const uid = t.controlled_by_user_id
    if (!uid || seen.has(uid) || present.has(uid)) return false
    seen.add(uid)
    return true
  })
  if (missing.length === 0) return

  const { data: destMap } = await admin
    .from('maps')
    .select('width, height, grid_size')
    .eq('id', destMapId)
    .maybeSingle()
  const w = destMap?.width || 1000
  const h = destMap?.height || 1000
  const gap = destMap?.grid_size || 50
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
  await admin.from('tokens').insert(rows)
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
  const { data: existing } = await admin
    .from('maps')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('source_prepared_map_id', destinationPreparedMapId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existing?.id) return { liveMapId: existing.id }

  const { data: prepRow } = await admin
    .from('prepared_maps')
    .select('*')
    .eq('id', destinationPreparedMapId)
    .eq('campaign_id', campaignId)
    .maybeSingle()
  if (!prepRow) return { error: 'Destination map not found.' }
  const prepared = prepRow as unknown as PreparedMap

  const result = await instantiatePreparedMap(admin, {
    campaignId,
    prepared,
    liveName: prepared.title,
    createdBy,
  })
  return result
}

/**
 * Make `destinationPreparedMapId` the campaign's active live map (reuse-or-deploy
 * then activate). Service-role client throughout.
 */
async function executeTravel(
  admin: SupabaseClient<Database>,
  campaignId: string,
  destinationPreparedMapId: string,
  createdBy: string,
): Promise<{ liveMapId: string } | { error: string }> {
  const resolved = await resolveDestinationMap(admin, campaignId, destinationPreparedMapId, createdBy)
  if ('error' in resolved) return resolved
  const liveMapId = resolved.liveMapId

  // Activate it: deactivate the current active map, then flip this one on.
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
