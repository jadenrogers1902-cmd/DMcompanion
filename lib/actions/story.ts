'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { NoteVisibility, QuestStatus } from '@/lib/types/database'

const STORY_PATH = (campaignId: string) => `/campaigns/${campaignId}/story`

type ActionResult = { success?: boolean; error?: string; handoutId?: string }

function field(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function optionalField(formData: FormData, key: string) {
  const value = field(formData, key)
  return value.length > 0 ? value : null
}

function checkbox(formData: FormData, key: string) {
  return formData.get(key) === 'on'
}

async function getClientAndUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

export async function createQuest(
  campaignId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase } = await getClientAndUser()
  const title = field(formData, 'title')
  if (!title) return { error: 'Quest title is required.' }

  const status = (field(formData, 'status') || 'active') as QuestStatus
  const { error } = await supabase.from('quests').insert({
    campaign_id: campaignId,
    title,
    status,
    description: optionalField(formData, 'description'),
    player_visible_description: optionalField(formData, 'player_visible_description'),
    dm_notes: optionalField(formData, 'dm_notes'),
    rewards: optionalField(formData, 'rewards'),
    visible_to_players: checkbox(formData, 'visible_to_players'),
  })

  if (error) return { error: error.message }
  revalidatePath(STORY_PATH(campaignId))
  return { success: true }
}

export async function createNpc(
  campaignId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase } = await getClientAndUser()
  const name = field(formData, 'name')
  if (!name) return { error: 'NPC name is required.' }

  const { error } = await supabase.from('npcs').insert({
    campaign_id: campaignId,
    name,
    role: optionalField(formData, 'role'),
    relationship_to_party: optionalField(formData, 'relationship_to_party'),
    player_visible_notes: optionalField(formData, 'player_visible_notes'),
    dm_notes: optionalField(formData, 'dm_notes'),
    portrait_url: optionalField(formData, 'portrait_url'),
    location_id: optionalField(formData, 'location_id'),
    visible_to_players: checkbox(formData, 'visible_to_players'),
  })

  if (error) return { error: error.message }
  revalidatePath(STORY_PATH(campaignId))
  return { success: true }
}

export async function createLocation(
  campaignId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase } = await getClientAndUser()
  const name = field(formData, 'name')
  if (!name) return { error: 'Location name is required.' }

  const { error } = await supabase.from('locations').insert({
    campaign_id: campaignId,
    name,
    description: optionalField(formData, 'description'),
    player_visible_notes: optionalField(formData, 'player_visible_notes'),
    dm_notes: optionalField(formData, 'dm_notes'),
    map_id: optionalField(formData, 'map_id'),
    visible_to_players: checkbox(formData, 'visible_to_players'),
  })

  if (error) return { error: error.message }
  revalidatePath(STORY_PATH(campaignId))
  return { success: true }
}

export async function createStoryNote(
  campaignId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated.' }

  const title = field(formData, 'title')
  if (!title) return { error: 'Note title is required.' }

  const visibility = (field(formData, 'visibility') || 'dm') as NoteVisibility
  const { error } = await supabase.from('notes').insert({
    campaign_id: campaignId,
    title,
    content: optionalField(formData, 'content'),
    visibility,
    quest_id: optionalField(formData, 'quest_id'),
    npc_id: optionalField(formData, 'npc_id'),
    location_id: optionalField(formData, 'location_id'),
    map_id: optionalField(formData, 'map_id'),
    encounter_id: optionalField(formData, 'encounter_id'),
    created_by: user.id,
  })

  if (error) return { error: error.message }
  revalidatePath(STORY_PATH(campaignId))
  return { success: true }
}

export async function createSessionRecap(
  campaignId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase } = await getClientAndUser()
  const sessionTitle = field(formData, 'session_title')
  if (!sessionTitle) return { error: 'Session title is required.' }

  const { error } = await supabase.from('session_recaps').insert({
    campaign_id: campaignId,
    session_title: sessionTitle,
    session_date: optionalField(formData, 'session_date'),
    what_happened: optionalField(formData, 'what_happened'),
    important_npcs: optionalField(formData, 'important_npcs'),
    locations_visited: optionalField(formData, 'locations_visited'),
    loot_gained: optionalField(formData, 'loot_gained'),
    quest_updates: optionalField(formData, 'quest_updates'),
    open_threads: optionalField(formData, 'open_threads'),
    next_session_start: optionalField(formData, 'next_session_start'),
    dm_follow_up_notes: optionalField(formData, 'dm_follow_up_notes'),
    visible_to_players: checkbox(formData, 'visible_to_players'),
  })

  if (error) return { error: error.message }
  revalidatePath(STORY_PATH(campaignId))
  return { success: true }
}

export async function createHandoutRecord(
  campaignId: string,
  payload: {
    title: string
    description: string
    storage_path: string
    file_type: string
    file_size: number
    is_revealed: boolean
  },
): Promise<ActionResult> {
  const { supabase, user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated.' }
  if (!payload.title.trim()) return { error: 'Handout title is required.' }

  const { data, error } = await supabase
    .from('handouts')
    .insert({
      campaign_id: campaignId,
      title: payload.title.trim(),
      description: payload.description.trim() || null,
      storage_path: payload.storage_path,
      file_type: payload.file_type,
      file_size: payload.file_size,
      is_revealed: payload.is_revealed,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath(STORY_PATH(campaignId))
  return { success: true, handoutId: data.id }
}

export async function setQuestVisibility(campaignId: string, id: string, visible: boolean) {
  const { supabase } = await getClientAndUser()
  const { error } = await supabase
    .from('quests')
    .update({ visible_to_players: visible, status: visible ? 'active' : 'hidden' })
    .eq('id', id)
    .eq('campaign_id', campaignId)

  if (error) return { error: error.message }
  revalidatePath(STORY_PATH(campaignId))
  return { success: true }
}

export async function setNpcVisibility(campaignId: string, id: string, visible: boolean) {
  const { supabase } = await getClientAndUser()
  const { error } = await supabase
    .from('npcs')
    .update({ visible_to_players: visible })
    .eq('id', id)
    .eq('campaign_id', campaignId)

  if (error) return { error: error.message }
  revalidatePath(STORY_PATH(campaignId))
  return { success: true }
}

export async function setLocationVisibility(campaignId: string, id: string, visible: boolean) {
  const { supabase } = await getClientAndUser()
  const { error } = await supabase
    .from('locations')
    .update({ visible_to_players: visible })
    .eq('id', id)
    .eq('campaign_id', campaignId)

  if (error) return { error: error.message }
  revalidatePath(STORY_PATH(campaignId))
  return { success: true }
}

export async function setNoteVisibility(
  campaignId: string,
  id: string,
  visibility: NoteVisibility,
) {
  const { supabase } = await getClientAndUser()
  const { error } = await supabase
    .from('notes')
    .update({ visibility })
    .eq('id', id)
    .eq('campaign_id', campaignId)

  if (error) return { error: error.message }
  revalidatePath(STORY_PATH(campaignId))
  return { success: true }
}

export async function setHandoutRevealed(campaignId: string, id: string, revealed: boolean) {
  const { supabase } = await getClientAndUser()
  const { error } = await supabase
    .from('handouts')
    .update({ is_revealed: revealed })
    .eq('id', id)
    .eq('campaign_id', campaignId)

  if (error) return { error: error.message }
  revalidatePath(STORY_PATH(campaignId))
  return { success: true }
}

export async function setSessionRecapVisibility(
  campaignId: string,
  id: string,
  visible: boolean,
) {
  const { supabase } = await getClientAndUser()
  const { error } = await supabase
    .from('session_recaps')
    .update({ visible_to_players: visible })
    .eq('id', id)
    .eq('campaign_id', campaignId)

  if (error) return { error: error.message }
  revalidatePath(STORY_PATH(campaignId))
  return { success: true }
}

export async function deleteQuest(campaignId: string, id: string) {
  const { supabase } = await getClientAndUser()
  const { error } = await supabase.from('quests').delete().eq('id', id).eq('campaign_id', campaignId)
  if (error) return { error: error.message }
  revalidatePath(STORY_PATH(campaignId))
  return { success: true }
}

export async function deleteNpc(campaignId: string, id: string) {
  const { supabase } = await getClientAndUser()
  const { error } = await supabase.from('npcs').delete().eq('id', id).eq('campaign_id', campaignId)
  if (error) return { error: error.message }
  revalidatePath(STORY_PATH(campaignId))
  return { success: true }
}

export async function deleteLocation(campaignId: string, id: string) {
  const { supabase } = await getClientAndUser()
  const { error } = await supabase.from('locations').delete().eq('id', id).eq('campaign_id', campaignId)
  if (error) return { error: error.message }
  revalidatePath(STORY_PATH(campaignId))
  return { success: true }
}

export async function deleteStoryNote(campaignId: string, id: string) {
  const { supabase } = await getClientAndUser()
  const { error } = await supabase.from('notes').delete().eq('id', id).eq('campaign_id', campaignId)
  if (error) return { error: error.message }
  revalidatePath(STORY_PATH(campaignId))
  return { success: true }
}

export async function deleteSessionRecap(campaignId: string, id: string) {
  const { supabase } = await getClientAndUser()
  const { error } = await supabase.from('session_recaps').delete().eq('id', id).eq('campaign_id', campaignId)
  if (error) return { error: error.message }
  revalidatePath(STORY_PATH(campaignId))
  return { success: true }
}

export async function deleteHandout(campaignId: string, id: string) {
  const { supabase } = await getClientAndUser()
  const { data: handout } = await supabase
    .from('handouts')
    .select('storage_path')
    .eq('id', id)
    .eq('campaign_id', campaignId)
    .single()

  const { error } = await supabase.from('handouts').delete().eq('id', id).eq('campaign_id', campaignId)
  if (error) return { error: error.message }

  if (handout?.storage_path) {
    await supabase.storage.from('handouts').remove([handout.storage_path])
  }

  revalidatePath(STORY_PATH(campaignId))
  return { success: true }
}
