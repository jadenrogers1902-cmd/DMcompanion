'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────
function num(formData: FormData, key: string, fallback = 0): number {
  const raw = formData.get(key)
  if (raw === null || raw === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}

function str(formData: FormData, key: string): string | null {
  const raw = (formData.get(key) as string | null)?.trim()
  return raw && raw.length > 0 ? raw : null
}

function bool(formData: FormData, key: string): boolean {
  return formData.get(key) === 'on' || formData.get(key) === 'true'
}

function buildCharacterFields(formData: FormData) {
  return {
    name: (formData.get('name') as string)?.trim() ?? '',
    class: str(formData, 'class'),
    level: num(formData, 'level', 1),
    race: str(formData, 'race'),
    background: str(formData, 'background'),
    armor_class: num(formData, 'armor_class', 10),
    max_hp: num(formData, 'max_hp', 0),
    current_hp: num(formData, 'current_hp', 0),
    temp_hp: num(formData, 'temp_hp', 0),
    speed: num(formData, 'speed', 30),
    initiative_bonus: num(formData, 'initiative_bonus', 0),
    passive_perception: num(formData, 'passive_perception', 10),
    proficiency_bonus: num(formData, 'proficiency_bonus', 2),
    str: num(formData, 'str', 10),
    dex: num(formData, 'dex', 10),
    con: num(formData, 'con', 10),
    intel: num(formData, 'intel', 10),
    wis: num(formData, 'wis', 10),
    cha: num(formData, 'cha', 10),
    notes: str(formData, 'notes'),
  }
}

// ────────────────────────────────────────────────────────────
// Character CRUD
// ────────────────────────────────────────────────────────────
export async function createCharacter(campaignId: string, formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const fields = buildCharacterFields(formData)
  if (!fields.name || fields.name.length < 1) {
    return { error: 'Character name is required.' }
  }

  const { data: character, error } = await supabase
    .from('characters')
    .insert({ ...fields, campaign_id: campaignId, user_id: user.id })
    .select()
    .single()

  if (error || !character) {
    return { error: error?.message ?? 'Failed to create character.' }
  }

  redirect(`/campaigns/${campaignId}/characters/${character.id}`)
}

export async function updateCharacter(
  campaignId: string,
  characterId: string,
  formData: FormData,
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const fields = buildCharacterFields(formData)
  if (!fields.name || fields.name.length < 1) {
    return { error: 'Character name is required.' }
  }

  // RLS allows owner (or DM). We additionally scope to owner for full edits.
  const { error } = await supabase
    .from('characters')
    .update(fields)
    .eq('id', characterId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  revalidatePath(`/campaigns/${campaignId}/characters/${characterId}`)
  redirect(`/campaigns/${campaignId}/characters/${characterId}`)
}

export async function deleteCharacter(campaignId: string, characterId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('characters')
    .delete()
    .eq('id', characterId)
    .eq('user_id', user.id)

  if (error) return { error: error.message }

  redirect(`/campaigns/${campaignId}/characters`)
}

// Quick vitals update — usable by owner OR DM (RLS enforces this).
export async function updateVitals(
  campaignId: string,
  characterId: string,
  vitals: { current_hp?: number; temp_hp?: number; max_hp?: number },
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('characters')
    .update(vitals)
    .eq('id', characterId)

  if (error) return { error: error.message }

  revalidatePath(`/campaigns/${campaignId}/characters/${characterId}`)
  revalidatePath(`/campaigns/${campaignId}/characters`)
  return { success: true }
}

// ────────────────────────────────────────────────────────────
// Inventory
// ────────────────────────────────────────────────────────────
export async function addInventoryItem(characterId: string, formData: FormData) {
  const supabase = await createClient()
  const name = (formData.get('name') as string)?.trim()
  if (!name) return { error: 'Item name is required.' }

  const { error } = await supabase.from('character_inventory_items').insert({
    character_id: characterId,
    name,
    quantity: num(formData, 'quantity', 1),
    description: str(formData, 'description'),
    equipped: bool(formData, 'equipped'),
    magical: bool(formData, 'magical'),
    visible_to_dm: formData.get('visible_to_dm') === null ? true : bool(formData, 'visible_to_dm'),
    notes: str(formData, 'notes'),
  })

  if (error) return { error: error.message }
  revalidatePath(`/campaigns`)
  return { success: true }
}

export async function deleteInventoryItem(itemId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('character_inventory_items')
    .delete()
    .eq('id', itemId)
  if (error) return { error: error.message }
  return { success: true }
}

// ────────────────────────────────────────────────────────────
// Spells
// ────────────────────────────────────────────────────────────
export async function addSpell(characterId: string, formData: FormData) {
  const supabase = await createClient()
  const name = (formData.get('name') as string)?.trim()
  if (!name) return { error: 'Spell name is required.' }

  const { error } = await supabase.from('character_spells').insert({
    character_id: characterId,
    name,
    spell_level: num(formData, 'spell_level', 0),
    prepared: bool(formData, 'prepared'),
    uses: str(formData, 'uses'),
    description: str(formData, 'description'),
    notes: str(formData, 'notes'),
  })

  if (error) return { error: error.message }
  return { success: true }
}

export async function deleteSpell(spellId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('character_spells')
    .delete()
    .eq('id', spellId)
  if (error) return { error: error.message }
  return { success: true }
}

// ────────────────────────────────────────────────────────────
// Abilities / Features
// ────────────────────────────────────────────────────────────
export async function addAbility(characterId: string, formData: FormData) {
  const supabase = await createClient()
  const name = (formData.get('name') as string)?.trim()
  if (!name) return { error: 'Ability name is required.' }

  const { error } = await supabase.from('character_abilities').insert({
    character_id: characterId,
    name,
    source: str(formData, 'source'),
    uses: str(formData, 'uses'),
    reset_type: str(formData, 'reset_type'),
    description: str(formData, 'description'),
    notes: str(formData, 'notes'),
  })

  if (error) return { error: error.message }
  return { success: true }
}

export async function deleteAbility(abilityId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('character_abilities')
    .delete()
    .eq('id', abilityId)
  if (error) return { error: error.message }
  return { success: true }
}

// ────────────────────────────────────────────────────────────
// Conditions — owner or DM (RLS enforces)
// ────────────────────────────────────────────────────────────
export async function addCondition(
  campaignId: string,
  characterId: string,
  name: string,
) {
  const supabase = await createClient()
  const trimmed = name.trim()
  if (!trimmed) return { error: 'Condition name is required.' }

  const { error } = await supabase.from('character_conditions').insert({
    character_id: characterId,
    name: trimmed,
  })

  if (error) return { error: error.message }
  revalidatePath(`/campaigns/${campaignId}/characters/${characterId}`)
  revalidatePath(`/campaigns/${campaignId}/characters`)
  return { success: true }
}

export async function removeCondition(
  campaignId: string,
  conditionId: string,
) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('character_conditions')
    .delete()
    .eq('id', conditionId)

  if (error) return { error: error.message }
  revalidatePath(`/campaigns/${campaignId}/characters`)
  return { success: true }
}
