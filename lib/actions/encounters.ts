'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type {
  Database,
  EncounterParticipant,
  ParticipantType,
} from '@/lib/types/database'

type ParticipantUpdate =
  Database['public']['Tables']['encounter_participants']['Update']

const ENCOUNTER_PATH = (campaignId: string, encounterId: string) =>
  `/campaigns/${campaignId}/encounters/${encounterId}`

function initiativeValue(value: number | null) {
  return value ?? -999
}

function sortParticipants(participants: EncounterParticipant[]) {
  return [...participants].sort((a, b) => {
    const byInitiative = initiativeValue(b.initiative) - initiativeValue(a.initiative)
    if (byInitiative !== 0) return byInitiative
    return a.created_at.localeCompare(b.created_at)
  })
}

async function getUserId() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, userId: user?.id ?? null }
}

export async function createEncounter(campaignId: string, formData: FormData) {
  const { supabase, userId } = await getUserId()
  if (!userId) return { error: 'Not authenticated' }

  const name = (formData.get('name') as string)?.trim()
  const mapId = (formData.get('map_id') as string)?.trim() || null

  if (!name || name.length < 2) {
    return { error: 'Encounter name must be at least 2 characters.' }
  }

  const { data, error } = await supabase
    .from('encounters')
    .insert({
      campaign_id: campaignId,
      name,
      map_id: mapId,
      created_by: userId,
    })
    .select()
    .single()

  if (error || !data) {
    return { error: error?.message ?? 'Failed to create encounter.' }
  }

  redirect(ENCOUNTER_PATH(campaignId, data.id))
}

export async function addManualParticipant(
  campaignId: string,
  encounterId: string,
  formData: FormData,
) {
  const { supabase } = await getUserId()
  const name = (formData.get('name') as string)?.trim()
  if (!name) return { error: 'Participant name is required.' }

  const maxHp = Number(formData.get('max_hp')) || 0
  const currentHpRaw = formData.get('current_hp')
  const currentHp =
    currentHpRaw === null || currentHpRaw === '' ? maxHp : Number(currentHpRaw)

  const { error } = await supabase.from('encounter_participants').insert({
    campaign_id: campaignId,
    encounter_id: encounterId,
    name,
    participant_type:
      ((formData.get('participant_type') as ParticipantType) || 'enemy'),
    initiative:
      formData.get('initiative') === ''
        ? null
        : Number(formData.get('initiative')),
    armor_class: Number(formData.get('armor_class')) || 10,
    max_hp: maxHp,
    current_hp: Number.isFinite(currentHp) ? currentHp : maxHp,
    temp_hp: Number(formData.get('temp_hp')) || 0,
    speed: Number(formData.get('speed')) || 30,
    is_visible_to_players: formData.get('is_visible_to_players') === 'on',
    notes: ((formData.get('notes') as string) || '').trim() || null,
  })

  if (error) return { error: error.message }
  revalidatePath(ENCOUNTER_PATH(campaignId, encounterId))
  return { success: true }
}

export async function addCharacterParticipant(
  campaignId: string,
  encounterId: string,
  characterId: string,
) {
  const { supabase } = await getUserId()
  const { data: character } = await supabase
    .from('characters')
    .select('*')
    .eq('id', characterId)
    .single()

  if (!character) return { error: 'Character not found.' }

  const { error } = await supabase.from('encounter_participants').insert({
    campaign_id: campaignId,
    encounter_id: encounterId,
    character_id: character.id,
    name: character.name,
    participant_type: 'player',
    armor_class: character.armor_class,
    max_hp: character.max_hp,
    current_hp: character.current_hp,
    temp_hp: character.temp_hp,
    speed: character.speed,
    is_visible_to_players: true,
    notes: character.class
      ? `${character.class}${character.level ? ` ${character.level}` : ''}`
      : null,
  })

  if (error) return { error: error.message }
  revalidatePath(ENCOUNTER_PATH(campaignId, encounterId))
  return { success: true }
}

export async function addTokenParticipant(
  campaignId: string,
  encounterId: string,
  tokenId: string,
) {
  const { supabase } = await getUserId()
  const { data: token } = await supabase
    .from('tokens')
    .select('*, characters (*)')
    .eq('id', tokenId)
    .single()

  if (!token) return { error: 'Token not found.' }

  const linked = (token as unknown as { characters?: { armor_class?: number; max_hp?: number; current_hp?: number; temp_hp?: number; speed?: number } | null }).characters

  const { error } = await supabase.from('encounter_participants').insert({
    campaign_id: campaignId,
    encounter_id: encounterId,
    token_id: token.id,
    character_id: token.linked_character_id,
    name: token.name || 'Token',
    participant_type:
      token.token_type === 'player'
        ? 'player'
        : token.token_type === 'enemy'
          ? 'enemy'
          : 'npc',
    armor_class: linked?.armor_class ?? 10,
    max_hp: linked?.max_hp ?? 0,
    current_hp: linked?.current_hp ?? 0,
    temp_hp: linked?.temp_hp ?? 0,
    speed: linked?.speed ?? 30,
    is_visible_to_players: token.visible_to_players,
    notes: token.notes,
  })

  if (error) return { error: error.message }
  revalidatePath(ENCOUNTER_PATH(campaignId, encounterId))
  return { success: true }
}

export async function updateParticipant(
  campaignId: string,
  encounterId: string,
  participantId: string,
  patch: ParticipantUpdate,
) {
  const { supabase } = await getUserId()
  const { error } = await supabase
    .from('encounter_participants')
    .update(patch)
    .eq('id', participantId)

  if (error) return { error: error.message }
  revalidatePath(ENCOUNTER_PATH(campaignId, encounterId))
  return { success: true }
}

export async function deleteParticipant(
  campaignId: string,
  encounterId: string,
  participantId: string,
) {
  const { supabase } = await getUserId()
  const { error } = await supabase
    .from('encounter_participants')
    .delete()
    .eq('id', participantId)

  if (error) return { error: error.message }
  revalidatePath(ENCOUNTER_PATH(campaignId, encounterId))
  return { success: true }
}

export async function upsertParticipantDmNote(
  campaignId: string,
  encounterId: string,
  participantId: string,
  content: string,
) {
  const { supabase } = await getUserId()
  const { error } = await supabase
    .from('encounter_participant_dm_notes')
    .upsert(
      { participant_id: participantId, campaign_id: campaignId, content },
      { onConflict: 'participant_id' },
    )

  if (error) return { error: error.message }
  revalidatePath(ENCOUNTER_PATH(campaignId, encounterId))
  return { success: true }
}

export async function addEncounterCondition(
  campaignId: string,
  encounterId: string,
  participantId: string,
  name: string,
) {
  const { supabase } = await getUserId()
  const trimmed = name.trim()
  if (!trimmed) return { error: 'Condition name is required.' }

  const { error } = await supabase.from('encounter_conditions').insert({
    campaign_id: campaignId,
    encounter_id: encounterId,
    participant_id: participantId,
    name: trimmed,
  })

  if (error) return { error: error.message }
  revalidatePath(ENCOUNTER_PATH(campaignId, encounterId))
  return { success: true }
}

export async function removeEncounterCondition(
  campaignId: string,
  encounterId: string,
  conditionId: string,
) {
  const { supabase } = await getUserId()
  const { error } = await supabase
    .from('encounter_conditions')
    .delete()
    .eq('id', conditionId)

  if (error) return { error: error.message }
  revalidatePath(ENCOUNTER_PATH(campaignId, encounterId))
  return { success: true }
}

export async function startEncounter(campaignId: string, encounterId: string) {
  const { supabase } = await getUserId()
  const { data: participants } = await supabase
    .from('encounter_participants')
    .select('*')
    .eq('encounter_id', encounterId)

  const first = sortParticipants((participants ?? []) as EncounterParticipant[])[0]

  const { error } = await supabase
    .from('encounters')
    .update({
      status: 'active',
      current_round: 1,
      current_turn_participant_id: first?.id ?? null,
    })
    .eq('id', encounterId)

  if (error) return { error: error.message }
  revalidatePath(ENCOUNTER_PATH(campaignId, encounterId))
  return { success: true }
}

export async function endEncounter(campaignId: string, encounterId: string) {
  const { supabase } = await getUserId()
  const { error } = await supabase
    .from('encounters')
    .update({ status: 'completed', current_turn_participant_id: null })
    .eq('id', encounterId)

  if (error) return { error: error.message }
  revalidatePath(ENCOUNTER_PATH(campaignId, encounterId))
  revalidatePath(`/campaigns/${campaignId}/encounters`)
  return { success: true }
}

export async function moveEncounterTurn(
  campaignId: string,
  encounterId: string,
  direction: 'next' | 'previous',
) {
  const { supabase } = await getUserId()

  const [{ data: encounter }, { data: participants }] = await Promise.all([
    supabase.from('encounters').select('*').eq('id', encounterId).single(),
    supabase
      .from('encounter_participants')
      .select('*')
      .eq('encounter_id', encounterId),
  ])

  if (!encounter) return { error: 'Encounter not found.' }

  const ordered = sortParticipants((participants ?? []) as EncounterParticipant[])
  if (ordered.length === 0) return { error: 'Add participants before tracking turns.' }

  const currentIndex = Math.max(
    0,
    ordered.findIndex((p) => p.id === encounter.current_turn_participant_id),
  )
  const delta = direction === 'next' ? 1 : -1
  let nextIndex = currentIndex + delta
  let nextRound = encounter.current_round

  if (nextIndex >= ordered.length) {
    nextIndex = 0
    nextRound += 1
  } else if (nextIndex < 0) {
    nextIndex = ordered.length - 1
    nextRound = Math.max(1, nextRound - 1)
  }

  const { error } = await supabase
    .from('encounters')
    .update({
      status: encounter.status === 'draft' ? 'active' : encounter.status,
      current_round: nextRound,
      current_turn_participant_id: ordered[nextIndex].id,
    })
    .eq('id', encounterId)

  if (error) return { error: error.message }
  revalidatePath(ENCOUNTER_PATH(campaignId, encounterId))
  return { success: true }
}
