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
  // Group-party mode with more than one player present requires unanimity.
  const needsVote = map.travel_mode === 'group_party' && voters.size > 1 && !isDm

  if (needsVote) {
    if (!callerIsVoter) {
      return { error: 'You need a character on this map to vote to travel.' }
    }

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
    // Unanimous — clear this map's confirmations and travel.
    await admin.from('map_transport_confirmations').delete().eq('map_id', map.id)
  }

  const result = await executeTravel(admin, campaignId, destination, user.id)
  if ('error' in result) return result

  revalidatePath(`/campaigns/${campaignId}/live-map`)
  return { ok: true, traveled: true, liveMapId: result.liveMapId }
}

/**
 * Make `destinationPreparedMapId` the campaign's active live map. Reuses an
 * existing live instance for that prepared map if one exists; otherwise deploys
 * a fresh copy. Uses the service-role client throughout.
 */
async function executeTravel(
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

  let liveMapId = existing?.id ?? null

  if (!liveMapId) {
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
    if ('error' in result) return result
    liveMapId = result.liveMapId
  }

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
