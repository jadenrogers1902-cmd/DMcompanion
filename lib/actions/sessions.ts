'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/**
 * Start a live tabletop session for the campaign (DM only). Can be triggered
 * from any live map. If a session is already active, that one is returned —
 * there is at most one active session per campaign. Players see the Tabletop
 * tab + live indicator once this is active.
 */
export async function startCampaignSession(campaignId: string, mapId?: string | null) {
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
  if (membership?.role !== 'dm') return { error: 'Only the DM can start a session.' }

  // Starting a session makes the map it was started from the active scene, so
  // players land directly in the tabletop instead of "no map shared yet".
  if (mapId) {
    await supabase.rpc('set_active_map', { p_campaign_id: campaignId, p_map_id: mapId })
  }

  const { data: existing } = await supabase
    .from('campaign_sessions')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('status', 'active')
    .maybeSingle()
  if (existing) {
    revalidatePath(`/campaigns/${campaignId}/live-map`)
    return { ok: true, sessionId: existing.id, alreadyActive: true }
  }

  const { data, error } = await supabase
    .from('campaign_sessions')
    .insert({
      campaign_id: campaignId,
      status: 'active',
      map_id: mapId ?? null,
      started_by: user.id,
    })
    .select('id')
    .single()
  if (error) return { error: 'Could not start the session. Please try again.' }

  revalidatePath(`/campaigns/${campaignId}`)
  revalidatePath(`/campaigns/${campaignId}/live-map`)
  return { ok: true, sessionId: data.id }
}

/** End the campaign's active session (DM only). */
export async function endCampaignSession(campaignId: string) {
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
  if (membership?.role !== 'dm') return { error: 'Only the DM can end a session.' }

  const { error } = await supabase
    .from('campaign_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('campaign_id', campaignId)
    .eq('status', 'active')
  if (error) return { error: 'Could not end the session. Please try again.' }

  revalidatePath(`/campaigns/${campaignId}`)
  revalidatePath(`/campaigns/${campaignId}/live-map`)
  return { ok: true }
}
