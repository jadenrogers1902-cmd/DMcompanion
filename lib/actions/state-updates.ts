'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Database, PendingStateUpdate } from '@/lib/types/database'

type TokenUpdate = Database['public']['Tables']['tokens']['Update']

const ACTIONS_PATH = (campaignId: string) => `/campaigns/${campaignId}/actions`

async function getClientAndUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

function clampInt(value: unknown, fallback = 0) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.round(num)
}

/**
 * Apply a DM-reviewed pending state update.
 *
 * This is the only path that mutates token/object state from the action
 * resolution pipeline — it never runs automatically. The DM may optionally
 * pass `overrides.after` to edit the suggested values before applying
 * (e.g. lowering damage from 7 to 5, or choosing not to mark a token
 * defeated). Token mutations reuse the same `tokens` row that the existing
 * map/token editor and realtime sync already operate on, so no parallel
 * state model is introduced.
 */
export async function applyPendingStateUpdate(
  campaignId: string,
  updateId: string,
  overrides?: { after?: Record<string, unknown> },
) {
  const { supabase, user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: updateRaw } = await supabase
    .from('pending_state_updates')
    .select('*')
    .eq('id', updateId)
    .eq('campaign_id', campaignId)
    .single()

  const update = (updateRaw ?? null) as PendingStateUpdate | null
  if (!update) return { error: 'Suggested update not found.' }
  if (update.status !== 'pending_dm_review') {
    return { error: 'This suggested update has already been resolved.' }
  }

  const after: Record<string, unknown> = {
    ...(update.after ?? {}),
    ...(overrides?.after ?? {}),
  }

  let mapId: string | null = null

  if (update.target_kind === 'token' && update.target_id) {
    const { data: tokenRaw } = await supabase
      .from('tokens')
      .select('id, map_id, max_hp, resolver_config')
      .eq('id', update.target_id)
      .eq('campaign_id', campaignId)
      .maybeSingle()

    if (!tokenRaw) return { error: 'Target token no longer exists.' }
    mapId = (tokenRaw.map_id as string) ?? null

    const tokenPatch: TokenUpdate = {}
    const existingMaxHp = clampInt(tokenRaw.max_hp, 0)
    const resolvedMaxHp = 'max_hp' in after ? clampInt(after.max_hp, existingMaxHp) : existingMaxHp

    if ('max_hp' in after) tokenPatch.max_hp = Math.max(0, resolvedMaxHp)
    if ('current_hp' in after) {
      const ceiling = resolvedMaxHp > 0 ? resolvedMaxHp : Math.max(clampInt(after.current_hp, 0), 0)
      tokenPatch.current_hp = Math.max(0, Math.min(clampInt(after.current_hp, 0), ceiling))
    }
    if ('temp_hp' in after) tokenPatch.temp_hp = Math.max(0, clampInt(after.temp_hp, 0))
    if ('is_defeated' in after) tokenPatch.is_defeated = Boolean(after.is_defeated)
    if ('object_state' in after) {
      tokenPatch.object_state = after.object_state ? String(after.object_state) : null
    }
    if ('visible_to_players' in after) tokenPatch.visible_to_players = Boolean(after.visible_to_players)
    if (update.update_type === 'set_awareness' && 'awareness' in after) {
      const baseConfig = (tokenRaw.resolver_config ?? {}) as Record<string, unknown>
      tokenPatch.resolver_config = { ...baseConfig, awareness: after.awareness }
    }

    if (Object.keys(tokenPatch).length > 0) {
      const { error: tokenError } = await supabase
        .from('tokens')
        .update(tokenPatch)
        .eq('id', update.target_id)
        .eq('campaign_id', campaignId)

      if (tokenError) return { error: tokenError.message }
    }
  }

  const { error: updateError } = await supabase
    .from('pending_state_updates')
    .update({
      status: 'applied',
      after,
      applied_at: new Date().toISOString(),
      applied_by_dm_id: user.id,
    })
    .eq('id', updateId)
    .eq('campaign_id', campaignId)

  if (updateError) return { error: updateError.message }

  revalidatePath(ACTIONS_PATH(campaignId))
  if (mapId) revalidatePath(`/campaigns/${campaignId}/live-map/${mapId}`)
  return { success: true }
}

/** Reject a suggested update without mutating any token/object state. */
export async function rejectPendingStateUpdate(campaignId: string, updateId: string) {
  const { supabase, user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('pending_state_updates')
    .update({
      status: 'rejected',
      applied_at: new Date().toISOString(),
      applied_by_dm_id: user.id,
    })
    .eq('id', updateId)
    .eq('campaign_id', campaignId)
    .eq('status', 'pending_dm_review')

  if (error) return { error: error.message }
  revalidatePath(ACTIONS_PATH(campaignId))
  return { success: true }
}
