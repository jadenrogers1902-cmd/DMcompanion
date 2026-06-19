'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchNotionPage } from '@/lib/notion/client'
import {
  buildNpcRevealPayload,
  buildNpcSummary,
  extractNpcProfileFromPage,
  isNpcDocType,
  normalizeNpcProfile,
  pageTitle,
  type NpcProfile,
  type NpcRevealPayload,
} from '@/lib/notion/npc-profile'
import type { ActionIntent, ActionIntentStatus, CampaignDoc, CharacterAttack, Token } from '@/lib/types/database'
import { actionsForToken, distanceFeet } from '@/lib/utils/actions'

const ACTIONS_PATH = (campaignId: string) => `/campaigns/${campaignId}/actions`
const GUIDED_PLAYER_ACTIONS = [
  'Attack',
  'Interact',
  'Talk',
  'Investigate',
  'Use Item',
  'Cast Spell',
  'Custom Action',
]

async function getClientAndUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

function resolverForAction(actionType: string) {
  if (actionType === 'Attack') return 'attack'
  if (
    [
      'Open',
      'Close',
      'Lockpick',
      'Disarm',
      'Activate',
      'Use',
      'Use Item',
      'Push',
      'Pull',
      'Break',
      'Take',
    ].includes(actionType)
  ) {
    return 'object_state'
  }
  return 'manual'
}

function stateForAction(actionType: string) {
  const map: Record<string, string> = {
    Open: 'open',
    Close: 'closed',
    Lockpick: 'unlocked',
    Disarm: 'disarmed',
    Activate: 'activated',
    Use: 'activated',
    'Use Item': 'activated',
    Push: 'activated',
    Pull: 'activated',
    Break: 'broken',
    Take: 'looted',
  }
  return map[actionType] ?? null
}

function npcProfileHasContent(profile: NpcProfile) {
  return Boolean(profile.role || profile.personality || profile.appearance || profile.wares.length > 0)
}

async function getNotionTokenForCampaign(campaignId: string) {
  const admin = createAdminClient()
  if (!admin) return null
  const { data } = await admin
    .from('campaign_notion_connections')
    .select('access_token, is_enabled')
    .eq('campaign_id', campaignId)
    .maybeSingle()
  if (!data?.is_enabled || !data.access_token) return null
  return data.access_token
}

async function buildTalkNpcReveal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  intent: ActionIntent,
  dmResponse: string,
  revealedBy: string,
): Promise<{ payload: NpcRevealPayload; summary: string }> {
  const { data: targetRaw } = await supabase
    .from('tokens')
    .select('id, name, token_type, public_description')
    .eq('id', intent.target_token_id)
    .eq('campaign_id', intent.campaign_id)
    .maybeSingle()

  const target = (targetRaw ?? null) as Pick<Token, 'id' | 'name' | 'token_type' | 'public_description'> | null
  const fallbackTitle = target?.name || target?.token_type || 'NPC'
  const fallbackProfile = normalizeNpcProfile({
    role: target?.token_type ?? null,
    appearance: target?.public_description ?? null,
  })

  const { data: linksRaw } = await supabase
    .from('campaign_doc_links')
    .select('source_doc_id')
    .eq('campaign_id', intent.campaign_id)
    .eq('live_object_id', intent.target_token_id)
    .in('live_object_type', ['token', 'object'])

  const docIds = Array.from(new Set((linksRaw ?? []).map((link) => link.source_doc_id).filter(Boolean)))
  let doc: CampaignDoc | null = null
  if (docIds.length > 0) {
    const { data: docsRaw } = await supabase
      .from('campaign_docs')
      .select('*')
      .eq('campaign_id', intent.campaign_id)
      .in('id', docIds)
    doc = ((docsRaw ?? []) as CampaignDoc[]).find((row) => isNpcDocType(row.doc_type)) ?? null
  }

  if (!doc) {
    const fallbackSummary = target?.public_description ?? (dmResponse.trim() || null)
    const payload = buildNpcRevealPayload({
      title: fallbackTitle,
      summary: fallbackSummary,
      docId: null,
      profile: fallbackProfile,
      sourceStatus: 'token_fallback',
    })
    return {
      payload,
      summary: dmResponse.trim() || `Talk approved. ${payload.title} is ready to talk.`,
    }
  }

  let title = doc.title || fallbackTitle
  let profile = normalizeNpcProfile(doc.npc_profile)
  let summary = doc.player_summary?.trim() || target?.public_description || null
  let sourceStatus: NpcRevealPayload['sourceStatus'] = 'cached_codex'

  if (doc.source === 'notion' && doc.source_page_id) {
    const token = await getNotionTokenForCampaign(intent.campaign_id)
    if (token) {
      const pageResult = await fetchNotionPage(token, doc.source_page_id)
      if (pageResult.ok) {
        title = pageTitle(pageResult.data, title)
        const freshProfile = extractNpcProfileFromPage(pageResult.data)
        if (npcProfileHasContent(freshProfile)) profile = freshProfile
        summary = doc.player_summary?.trim() || buildNpcSummary(title, profile, target?.public_description)
        sourceStatus = 'fresh_notion'

        await supabase
          .from('campaign_docs')
          .update({
            title,
            player_summary: summary,
            npc_profile: profile,
            last_synced_at: new Date().toISOString(),
            sync_status: 'success',
            sync_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', doc.id)
          .eq('campaign_id', intent.campaign_id)
      } else {
        await supabase
          .from('campaign_docs')
          .update({
            sync_status: 'failed',
            sync_error: pageResult.message,
            updated_at: new Date().toISOString(),
          })
          .eq('id', doc.id)
          .eq('campaign_id', intent.campaign_id)
      }
    }
  }

  if (!summary) summary = buildNpcSummary(title, profile, target?.public_description)

  await supabase.from('codex_reveals').insert({
    campaign_id: intent.campaign_id,
    doc_id: doc.id,
    revealed_to_scope: 'player',
    revealed_to_player_id: intent.actor_user_id,
    revealed_by: revealedBy,
    reveal_message: dmResponse.trim() || `Talk approved: ${title}`,
    reveal_type: 'manual',
  })

  const payload = buildNpcRevealPayload({
    title,
    summary,
    docId: doc.id,
    profile,
    sourceStatus,
  })

  return {
    payload,
    summary: dmResponse.trim() || `Talk approved. ${title} is ready to talk.`,
  }
}

export async function submitActionIntent(
  campaignId: string,
  mapId: string,
  actorCharacterId: string,
  targetTokenId: string,
  actionType: string,
  message: string,
  selectedTool?: {
    type?: string | null
    id?: string | null
    name?: string | null
  },
) {
  const { supabase, user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated' }

  const [{ data: actor }, { data: target }, { data: map }, { data: encounter }] =
    await Promise.all([
      supabase
        .from('tokens')
        .select('*')
        .eq('map_id', mapId)
        .eq('linked_character_id', actorCharacterId)
        .eq('controlled_by_user_id', user.id)
        .maybeSingle(),
      supabase
        .from('tokens')
        .select('*')
        .eq('id', targetTokenId)
        .eq('map_id', mapId)
        .eq('visible_to_players', true)
        .single(),
      supabase.from('maps').select('*').eq('id', mapId).single(),
      supabase
        .from('encounters')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('status', 'active')
        .maybeSingle(),
    ])

  if (!actor) return { error: 'You do not control that character token.' }
  if (!target) return { error: 'Target is not available.' }
  if (!map) return { error: 'Map not found.' }
  if (target.id === actor.id) return { error: 'Choose a different target.' }

  const targetToken = target as Token
  const isGuidedAction = GUIDED_PLAYER_ACTIONS.includes(actionType)
  if (!targetToken.interactable && !isGuidedAction) {
    return { error: 'The DM has not made that available for interaction.' }
  }
  const availableActions = actionsForToken(targetToken)
  if (!availableActions.includes(actionType) && !isGuidedAction) {
    return { error: 'That action is not available for this target.' }
  }

  const range = targetToken.interaction_range_feet ?? (isGuidedAction ? 60 : 5)
  const distance = distanceFeet(
    actor as Token,
    targetToken,
    map.grid_size,
    map.grid_scale_feet,
  )

  if (distance > range) {
    return { error: `${targetToken.name || 'Target'} is ${distance} ft away; range is ${range} ft.` }
  }

  const { data: intent, error } = await supabase.from('action_intents').insert({
    campaign_id: campaignId,
    map_id: mapId,
    encounter_id: encounter?.id ?? null,
    actor_character_id: actorCharacterId,
    actor_user_id: user.id,
    target_token_id: targetToken.id,
    action_type: actionType,
    message: message.trim() || null,
    selected_tool_type: selectedTool?.type ?? null,
    selected_tool_id: selectedTool?.id ?? null,
    selected_tool_name: selectedTool?.name?.trim() || null,
    distance_feet: distance,
    range_feet: range,
    resolver_type: resolverForAction(actionType),
    resolver_status: 'idle',
  }).select('id').single()

  if (error) return { error: error.message }

  revalidatePath(ACTIONS_PATH(campaignId))
  return { success: true, intentId: intent.id as string }
}

// Player cancels their own still-pending request. RLS only allows
// pending → cancelled, and only for the actor's own row, so the player can
// never approve/deny/resolve their own request through this path.
export async function cancelActionIntent(campaignId: string, intentId: string) {
  const { supabase, user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('action_intents')
    .update({ status: 'cancelled' })
    .eq('id', intentId)
    .eq('actor_user_id', user.id)
    .eq('status', 'pending')

  if (error) return { error: error.message }
  revalidatePath(ACTIONS_PATH(campaignId))
  return { success: true }
}

export async function clearActionBoard(campaignId: string) {
  const { supabase, user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: membership } = await supabase
    .from('campaign_members')
    .select('role')
    .eq('campaign_id', campaignId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (membership?.role !== 'dm') return { error: 'Only the DM can clear the action board.' }

  const { data: intents, error: selectError } = await supabase
    .from('action_intents')
    .select('id')
    .eq('campaign_id', campaignId)

  if (selectError) return { error: selectError.message }

  const intentIds = (intents ?? []).map((intent) => intent.id)
  if (intentIds.length === 0) {
    revalidatePath(ACTIONS_PATH(campaignId))
    return { success: true, cleared: 0 }
  }

  const { error: logError } = await supabase
    .from('combat_logs')
    .delete()
    .eq('campaign_id', campaignId)
    .in('action_intent_id', intentIds)

  if (logError) return { error: logError.message }

  const { error: deleteError } = await supabase
    .from('action_intents')
    .delete()
    .eq('campaign_id', campaignId)

  if (deleteError) return { error: deleteError.message }

  revalidatePath(ACTIONS_PATH(campaignId))
  return { success: true, cleared: intentIds.length }
}

export async function updateActionIntentStatus(
  campaignId: string,
  intentId: string,
  status: ActionIntentStatus,
  dmResponse: string,
) {
  const { supabase, user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: intent } = await supabase
    .from('action_intents')
    .select('*')
    .eq('id', intentId)
    .single()

  if (!intent) return { error: 'Action request not found.' }

  if (status === 'approved' && intent.resolver_type === 'attack') {
    const { error } = await supabase
      .from('action_intents')
      .update({
        status: 'approved',
        dm_response: dmResponse.trim() || null,
        response_visibility: 'actor',
        resolver_status: 'pending_player',
        resolved_by: user.id,
      })
      .eq('id', intentId)

    if (error) return { error: error.message }
    revalidatePath(ACTIONS_PATH(campaignId))
    return { success: true }
  }

  if (status === 'approved' && intent.resolver_type === 'object_state') {
    const nextState = stateForAction(intent.action_type)
    if (nextState) {
      const { error: tokenError } = await supabase
        .from('tokens')
        .update({
          object_state: nextState,
          is_defeated: nextState === 'defeated',
        })
        .eq('id', intent.target_token_id)
      if (tokenError) return { error: tokenError.message }
    }

    const summary =
      dmResponse.trim() ||
      `${intent.action_type} approved${nextState ? `; target is now ${nextState}.` : '.'}`

    const { error: resultError } = await supabase.from('action_results').insert({
      action_intent_id: intent.id,
      campaign_id: intent.campaign_id,
      map_id: intent.map_id,
      actor_user_id: intent.actor_user_id,
      actor_character_id: intent.actor_character_id,
      target_type: 'token',
      target_id: intent.target_token_id,
      action_type: intent.action_type,
      result_type: 'object_state',
      result_summary: summary,
      public_result: true,
    })
    if (resultError) return { error: resultError.message }

    const { error } = await supabase
      .from('action_intents')
      .update({
        status: 'resolved',
        dm_response: summary,
        response_visibility: 'public',
        resolver_status: 'applied',
        resolved_at: new Date().toISOString(),
        resolved_by: user.id,
      })
      .eq('id', intentId)

    if (error) return { error: error.message }
    revalidatePath(ACTIONS_PATH(campaignId))
    return { success: true }
  }

  if (status === 'resolved' && intent.action_type === 'Talk') {
    const { payload, summary } = await buildTalkNpcReveal(supabase, intent as ActionIntent, dmResponse, user.id)

    const { error: resultError } = await supabase.from('action_results').insert({
      action_intent_id: intent.id,
      campaign_id: intent.campaign_id,
      map_id: intent.map_id,
      actor_user_id: intent.actor_user_id,
      actor_character_id: intent.actor_character_id,
      target_type: 'token',
      target_id: intent.target_token_id,
      action_type: intent.action_type,
      result_type: 'npc_profile',
      result_summary: summary,
      reveal_payload: payload,
      public_result: false,
    })
    if (resultError) return { error: resultError.message }

    const { error } = await supabase
      .from('action_intents')
      .update({
        status: 'resolved',
        dm_response: summary,
        response_visibility: 'actor',
        resolver_status: 'manual',
        resolved_at: new Date().toISOString(),
        resolved_by: user.id,
      })
      .eq('id', intentId)

    if (error) return { error: error.message }
    revalidatePath(ACTIONS_PATH(campaignId))
    return { success: true }
  }

  if (status === 'denied' || status === 'resolved') {
    const summary =
      dmResponse.trim() ||
      (status === 'denied' ? 'The DM denied this request.' : 'The DM resolved this manually.')

    const { error: resultError } = await supabase.from('action_results').insert({
      action_intent_id: intent.id,
      campaign_id: intent.campaign_id,
      map_id: intent.map_id,
      actor_user_id: intent.actor_user_id,
      actor_character_id: intent.actor_character_id,
      target_type: 'token',
      target_id: intent.target_token_id,
      action_type: intent.action_type,
      result_type: status === 'denied' ? 'denied' : 'manual',
      result_summary: summary,
      public_result: status === 'resolved',
    })
    if (resultError) return { error: resultError.message }
  }

  const resolved = status === 'denied' || status === 'resolved' || status === 'cancelled'

  const { error } = await supabase
    .from('action_intents')
    .update({
      status,
      dm_response: dmResponse.trim() || null,
      response_visibility: status === 'resolved' ? 'public' : 'actor',
      resolver_status:
        status === 'needs_roll' ? 'pending_player' : status === 'resolved' ? 'manual' : 'idle',
      resolved_at: resolved ? new Date().toISOString() : null,
      resolved_by: user.id,
    })
    .eq('id', intentId)

  if (error) return { error: error.message }
  revalidatePath(ACTIONS_PATH(campaignId))
  return { success: true }
}

function abilityMod(score: number) {
  return Math.floor((score - 10) / 2)
}

function parseDice(dice: string) {
  const match = dice.trim().match(/^(\d+)d(\d+)$/i)
  if (!match) return { count: 1, sides: 6 }
  return {
    count: Math.max(1, Math.min(20, Number(match[1]))),
    sides: Math.max(2, Math.min(100, Number(match[2]))),
  }
}

function rollDie(sides: number) {
  return Math.floor(Math.random() * sides) + 1
}

function applyDamage(target: Pick<Token, 'current_hp' | 'temp_hp'>, damage: number) {
  const tempDamage = Math.min(Math.max(0, target.temp_hp), damage)
  const remaining = Math.max(0, damage - tempDamage)
  const temp_hp = Math.max(0, target.temp_hp - tempDamage)
  const current_hp = Math.max(0, target.current_hp - remaining)
  return { temp_hp, current_hp, is_defeated: current_hp === 0 }
}

export async function resolveAttackIntent(
  campaignId: string,
  intentId: string,
  attackId: string | null,
) {
  const { supabase, user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated' }

  const [{ data: intent }, { data: attacksRaw }] = await Promise.all([
    supabase.from('action_intents').select('*').eq('id', intentId).single(),
    attackId
      ? supabase.from('character_attacks').select('*').eq('id', attackId).limit(1)
      : Promise.resolve({ data: [] }),
  ])

  if (!intent) return { error: 'Action request not found.' }
  if (intent.actor_user_id !== user.id) return { error: 'You can only resolve your own attack request.' }
  if (intent.action_type !== 'Attack') return { error: 'This request is not an attack.' }
  if (intent.status !== 'approved' || intent.resolver_status !== 'pending_player') {
    return { error: 'The DM has not approved this attack yet.' }
  }

  const [{ data: character }, { data: target }] = await Promise.all([
    supabase.from('characters').select('*').eq('id', intent.actor_character_id).single(),
    supabase.from('tokens').select('*').eq('id', intent.target_token_id).single(),
  ])

  if (!character) return { error: 'Character not found.' }
  if (!target) return { error: 'Target not found.' }

  const attack = ((attacksRaw ?? []) as CharacterAttack[])[0] ?? null
  const abilityKey = attack?.ability_modifier && attack.ability_modifier !== 'custom'
    ? attack.ability_modifier
    : 'str'
  const attackModifier =
    attack?.attack_bonus_override ??
    abilityMod(character[abilityKey]) +
      (attack?.proficient === false ? 0 : character.proficiency_bonus)

  const d20 = rollDie(20)
  const attackTotal = d20 + attackModifier
  const hit = attackTotal >= target.armor_class
  const diceText = attack?.damage_dice ?? '1d6'
  const dice = parseDice(diceText)
  const damageRolls = hit ? Array.from({ length: dice.count }, () => rollDie(dice.sides)) : []
  const totalDamage = hit
    ? Math.max(0, damageRolls.reduce((sum, value) => sum + value, 0) + (attack?.damage_modifier ?? abilityMod(character[abilityKey])))
    : 0
  const hpBefore = target.current_hp
  const hpAfter = hit ? applyDamage(target, totalDamage) : {
    current_hp: target.current_hp,
    temp_hp: target.temp_hp,
    is_defeated: target.is_defeated,
  }

  await supabase
    .from('action_intents')
    .update({ status: 'resolving', resolver_status: 'rolling' })
    .eq('id', intent.id)

  if (hit) {
    const { error: tokenError } = await supabase
      .from('tokens')
      .update({
        current_hp: hpAfter.current_hp,
        temp_hp: hpAfter.temp_hp,
        is_defeated: hpAfter.is_defeated,
        object_state: hpAfter.is_defeated ? 'defeated' : target.object_state,
      })
      .eq('id', target.id)
    if (tokenError) return { error: tokenError.message }
  }

  const summary = hit
    ? `Hit! ${attackTotal} vs AC ${target.armor_class}. ${totalDamage} ${attack?.damage_type ?? ''} damage.`
    : `Miss. ${attackTotal} vs AC ${target.armor_class}.`

  const { error: logError } = await supabase.from('combat_logs').insert({
    campaign_id: intent.campaign_id,
    map_id: intent.map_id,
    encounter_id: intent.encounter_id,
    action_intent_id: intent.id,
    actor_user_id: intent.actor_user_id,
    actor_character_id: intent.actor_character_id,
    target_token_id: intent.target_token_id,
    attack_id: attack?.id ?? null,
    d20_roll: d20,
    attack_modifier: attackModifier,
    attack_total: attackTotal,
    target_ac: target.armor_class,
    result: hit ? 'hit' : 'miss',
    damage_dice: diceText,
    damage_rolls: damageRolls,
    damage_modifier: attack?.damage_modifier ?? abilityMod(character[abilityKey]),
    total_damage: totalDamage,
    damage_type: attack?.damage_type ?? null,
    hp_before: hpBefore,
    hp_after: hpAfter.current_hp,
    target_defeated: hpAfter.is_defeated,
  })
  if (logError) return { error: logError.message }

  const { error: resultError } = await supabase.from('action_results').insert({
    action_intent_id: intent.id,
    campaign_id: intent.campaign_id,
    map_id: intent.map_id,
    actor_user_id: intent.actor_user_id,
    actor_character_id: intent.actor_character_id,
    target_type: 'token',
    target_id: intent.target_token_id,
    action_type: intent.action_type,
    result_type: 'attack',
    result_summary: summary,
    private_dm_details: null,
    public_result: target.visible_on_cast,
  })
  if (resultError) return { error: resultError.message }

  const { error } = await supabase
    .from('action_intents')
    .update({
      status: 'resolved',
      dm_response: summary,
      response_visibility: target.visible_on_cast ? 'public' : 'actor',
      resolver_status: 'applied',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', intent.id)

  if (error) return { error: error.message }
  revalidatePath(ACTIONS_PATH(campaignId))
  return { success: true }
}

export async function upsertActionIntentDmNote(
  campaignId: string,
  intentId: string,
  content: string,
) {
  const { supabase } = await getClientAndUser()
  const { error } = await supabase.from('action_intent_dm_notes').upsert(
    {
      campaign_id: campaignId,
      intent_id: intentId,
      content,
    },
    { onConflict: 'intent_id' },
  )

  if (error) return { error: error.message }
  revalidatePath(ACTIONS_PATH(campaignId))
  return { success: true }
}

export async function createCharacterAttack(campaignId: string, formData: FormData) {
  const { supabase, user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated' }

  const characterId = String(formData.get('character_id') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  if (!characterId) return { error: 'Choose a character.' }
  if (!name) return { error: 'Attack name is required.' }

  const { error } = await supabase.from('character_attacks').insert({
    character_id: characterId,
    name,
    attack_type: String(formData.get('attack_type') ?? 'melee'),
    ability_modifier: String(formData.get('ability_modifier') ?? 'str'),
    proficient: formData.get('proficient') === 'on',
    attack_bonus_override: formData.get('attack_bonus_override')
      ? Number(formData.get('attack_bonus_override'))
      : null,
    damage_dice: String(formData.get('damage_dice') ?? '1d6').trim() || '1d6',
    damage_modifier: Number(formData.get('damage_modifier') ?? 0) || 0,
    damage_type: String(formData.get('damage_type') ?? '').trim() || null,
    equipped: formData.get('equipped') === 'on',
    notes: String(formData.get('notes') ?? '').trim() || null,
  })

  if (error) return { error: error.message }
  revalidatePath(ACTIONS_PATH(campaignId))
  return { success: true }
}

export async function deleteCharacterAttack(campaignId: string, attackId: string) {
  const { supabase } = await getClientAndUser()
  const { error } = await supabase.from('character_attacks').delete().eq('id', attackId)
  if (error) return { error: error.message }
  revalidatePath(ACTIONS_PATH(campaignId))
  return { success: true }
}
