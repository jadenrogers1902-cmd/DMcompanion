'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type {
  ActionRollRequest,
  AdvantageState,
  Ability,
  Character,
  CharacterAttack,
  Condition,
  InventoryItem,
  RollMode,
  RollResultValue,
  RollType,
  Spell,
} from '@/lib/types/database'
import {
  formatAttackOutcome,
  manualDamage,
  parseDamageFormula,
  resolveAttackRoll,
  rollDamage,
  validateManualDamage,
  type AttackOutcome,
} from '@/lib/utils/attack-resolution'
import { applyHpEffect, type HpEffectKind } from '@/lib/utils/hp'
import {
  calculateRollModifier,
  SKILL_OPTIONS,
  type RollModifierResult,
  type RollModifierSelection,
} from '@/lib/utils/roll-modifiers'

const ACTIONS_PATH = (campaignId: string) => `/campaigns/${campaignId}/actions`
const ATTACK_SETTINGS = {
  revealTargetACToPlayers: false,
  autoRollDamageOnHit: true,
  requireDmReviewBeforeReveal: true,
}

async function getClientAndUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

function int(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.trunc(number) : fallback
}

function maybeInt(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? Math.trunc(number) : null
}

function rollResult(usedNaturalRoll: number, total: number, targetNumber: number | null): RollResultValue {
  if (usedNaturalRoll === 1) return 'critical_failure'
  if (usedNaturalRoll === 20) return 'critical_success'
  if (targetNumber === null) return 'unknown'
  if (total >= targetNumber + 5) return 'major_success'
  if (total >= targetNumber) return 'success'
  return 'failure'
}

function usedRoll(advantageState: AdvantageState, first: number, second: number | null) {
  if (advantageState === 'advantage') return Math.max(first, second ?? first)
  if (advantageState === 'disadvantage') return Math.min(first, second ?? first)
  return first
}

function validateD20(value: number, label: string) {
  if (!Number.isInteger(value) || value < 1 || value > 20) {
    return `${label} must be a natural d20 roll from 1 through 20.`
  }
  return null
}

function isAttackAction(actionType: string) {
  return ['attack', 'weapon attack', 'melee attack', 'ranged attack'].includes(actionType.trim().toLowerCase())
}

function contextString(context: Record<string, unknown>, key: string) {
  const value = context[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function contextBoolean(context: Record<string, unknown>, key: string, fallback: boolean) {
  const value = context[key]
  return typeof value === 'boolean' ? value : fallback
}

function hpEffectContext(context: Record<string, unknown>) {
  const raw = context.hpEffect
  if (!raw || typeof raw !== 'object') return null
  const effect = raw as Record<string, unknown>
  const kind: HpEffectKind | null =
    effect.kind === 'healing' ? 'healing' : effect.kind === 'damage' ? 'damage' : null
  const formula = typeof effect.formula === 'string' ? effect.formula.trim() : ''
  const targetId = typeof effect.targetTokenId === 'string' ? effect.targetTokenId : null
  const targetName = typeof effect.targetName === 'string' ? effect.targetName : null
  const label = typeof effect.label === 'string' ? effect.label : null
  if (!kind || !formula) return null
  return { kind, formula, targetId, targetName, label }
}

function rollHpEffectFormula(formulaText: string) {
  const parsed = parseDamageFormula(formulaText, 0)
  if (!parsed) return null
  const diceRolled = Array.from({ length: parsed.diceCount }, () => Math.floor(Math.random() * parsed.dieSize) + 1)
  const total = Math.max(0, diceRolled.reduce((sum, roll) => sum + roll, 0) + parsed.modifier)
  return { ...parsed, diceRolled, total }
}

function manualHpEffectFormula(formulaText: string, diceTotal: number) {
  const parsed = parseDamageFormula(formulaText, 0)
  if (!parsed) return null
  const error = validateManualDamage(parsed, diceTotal, false)
  if (error) return { error }
  return {
    ...parsed,
    diceRolled: [diceTotal],
    total: Math.max(0, diceTotal + parsed.modifier),
  }
}

function buildAttackPlayerSummary({
  outcome,
  attackTotal,
  targetName,
  damageTotal,
  damageType,
  targetAcVisible,
}: {
  outcome: AttackOutcome
  attackTotal: number
  targetName: string
  damageTotal: number | null
  damageType: string | null
  targetAcVisible: number | null
}) {
  const acText = targetAcVisible !== null ? ` against AC ${targetAcVisible}` : ''
  if (outcome === 'hit' || outcome === 'critical_hit') {
    const damageText = damageTotal !== null
      ? ` You deal ${damageTotal}${damageType ? ` ${damageType}` : ''} damage to ${targetName}.`
      : ''
    return `Your attack roll was ${attackTotal}${acText}. ${formatAttackOutcome(outcome)}.${damageText}`
  }
  return `Your attack roll was ${attackTotal}${acText}. ${formatAttackOutcome(outcome)}.`
}

function buildAttackDmSummary({
  characterName,
  targetName,
  weaponName,
  naturalRoll,
  usedNaturalRoll,
  attackModifier,
  attackTotal,
  targetAc,
  outcome,
  damageFormula,
  damageRolls,
  damageTotal,
  damageType,
}: {
  characterName: string
  targetName: string
  weaponName: string
  naturalRoll: number
  usedNaturalRoll: number
  attackModifier: number
  attackTotal: number
  targetAc: number | null
  outcome: AttackOutcome
  damageFormula: string | null
  damageRolls: number[]
  damageTotal: number | null
  damageType: string | null
}) {
  const sign = attackModifier >= 0 ? '+' : ''
  const lines = [
    `${characterName} attacks ${targetName} with ${weaponName}.`,
    `Attack Roll: natural ${naturalRoll}, used ${usedNaturalRoll}, modifier ${sign}${attackModifier}, total ${attackTotal}.`,
    `Target AC: ${targetAc ?? 'unknown'}. Outcome: ${formatAttackOutcome(outcome)}.`,
  ]
  if (damageTotal !== null) {
    lines.push(`Damage: ${damageFormula ?? 'unknown formula'}; roll ${damageRolls.join(', ') || '-'}; total ${damageTotal}${damageType ? ` ${damageType}` : ''}.`)
    lines.push(`${targetName} takes ${damageTotal}${damageType ? ` ${damageType}` : ''} damage.`)
  }
  return lines.join('\n')
}

export interface RollModifierOptions {
  abilities: { value: string; label: string }[]
  skills: { value: string; label: string }[]
  savingThrows: { value: string; label: string }[]
  tools: { value: string; label: string }[]
  weapons: {
    value: string
    label: string
    damageDice: string
    damageModifier: number
    damageType: string | null
    rangeNormal: number | null
    rangeLong: number | null
    notes: string | null
  }[]
  spells: { value: string; label: string }[]
  defaultLabel: string
  actionType: string
  targetName: string | null
  targetArmorClass: number | null
  targetArmorClassSource: 'token' | 'unknown'
  isAttackAction: boolean
}

const ABILITY_OPTIONS = [
  { value: 'str', label: 'Strength' },
  { value: 'dex', label: 'Dexterity' },
  { value: 'con', label: 'Constitution' },
  { value: 'intel', label: 'Intelligence' },
  { value: 'wis', label: 'Wisdom' },
  { value: 'cha', label: 'Charisma' },
]

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function uniqueOptions(values: string[]) {
  const seen = new Set<string>()
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((value) => ({ value, label: titleCase(value) }))
}

async function fetchIntentAndContext(campaignId: string, intentId: string) {
  const { supabase } = await getClientAndUser()
  const { data: intent } = await supabase
    .from('action_intents')
    .select('*')
    .eq('id', intentId)
    .eq('campaign_id', campaignId)
    .single()

  if (!intent) return { error: 'Action request not found.' as const }

  const characterId = String(intent.actor_character_id)
  const [
    { data: character },
    { data: attacks },
    { data: spells },
    { data: abilities },
    { data: inventory },
    { data: conditions },
    { data: target },
  ] = await Promise.all([
    supabase.from('characters').select('*').eq('id', characterId).single(),
    supabase.from('character_attacks').select('*').eq('character_id', characterId).order('name'),
    supabase.from('character_spells').select('*').eq('character_id', characterId).order('spell_level').order('name'),
    supabase.from('character_abilities').select('*').eq('character_id', characterId).order('name'),
    supabase.from('character_inventory_items').select('*').eq('character_id', characterId).order('name'),
    supabase.from('character_conditions').select('*').eq('character_id', characterId).order('name'),
    supabase.from('tokens').select('id, name, token_type, armor_class').eq('id', String(intent.target_token_id)).maybeSingle(),
  ])

  if (!character) return { error: 'Character data was not found for this action.' as const }

  return {
    intent,
    target: target as { id: string; name: string | null; token_type: string; armor_class: number | null } | null,
    context: {
      character: character as Character,
      attacks: (attacks ?? []) as CharacterAttack[],
      spells: (spells ?? []) as Spell[],
      abilities: (abilities ?? []) as Ability[],
      inventory: (inventory ?? []) as InventoryItem[],
      conditions: (conditions ?? []) as Condition[],
    },
  }
}

function toolCandidates(inventory: InventoryItem[], character: Character) {
  const values = inventory
    .filter((item) => {
      const text = `${item.name} ${item.description ?? ''} ${item.notes ?? ''}`.toLowerCase()
      return text.includes('tool') || text.includes('kit') || text.includes('supplies') || text.includes('instrument')
    })
    .map((item) => item.name)

  const notes = character.notes ?? ''
  const match = notes.match(/"tools"\s*:\s*\[([\s\S]*?)\]/i)
  if (match) {
    values.push(
      ...match[1]
        .split(',')
        .map((part) => part.replace(/["]/g, '').trim())
        .filter(Boolean),
    )
  }

  return uniqueOptions(values)
}

export async function getRollModifierOptions(campaignId: string, intentId: string): Promise<
  | { options: RollModifierOptions }
  | { error: string }
> {
  const { user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated' }

  const data = await fetchIntentAndContext(campaignId, intentId)
  if ('error' in data) return { error: data.error ?? 'Unable to load roll modifier options.' }

  return {
    options: {
      abilities: ABILITY_OPTIONS,
      skills: SKILL_OPTIONS.map((skill) => ({ value: skill, label: titleCase(skill) })),
      savingThrows: ABILITY_OPTIONS,
      tools: toolCandidates(data.context.inventory, data.context.character),
      weapons: data.context.attacks.map((attack) => ({
        value: attack.id,
        label: attack.name,
        damageDice: attack.damage_dice,
        damageModifier: attack.damage_modifier,
        damageType: attack.damage_type,
        rangeNormal: attack.range_normal,
        rangeLong: attack.range_long,
        notes: attack.notes,
      })),
      spells: data.context.spells.map((spell) => ({ value: spell.id, label: spell.name })),
      defaultLabel: `${data.intent.action_type} roll`,
      actionType: String(data.intent.action_type),
      targetName: data.target?.name ?? data.target?.token_type ?? null,
      targetArmorClass: data.target?.armor_class ?? null,
      targetArmorClassSource: data.target?.armor_class === null || data.target?.armor_class === undefined ? 'unknown' : 'token',
      isAttackAction: isAttackAction(String(data.intent.action_type)),
    },
  }
}

export async function calculateRollRequestModifier(
  campaignId: string,
  intentId: string,
  selection: RollModifierSelection,
): Promise<{ result: RollModifierResult } | { error: string }> {
  const { user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated' }

  const data = await fetchIntentAndContext(campaignId, intentId)
  if ('error' in data) return { error: data.error ?? 'Unable to calculate roll modifier.' }

  return { result: calculateRollModifier(data.context, selection) }
}

export async function createRollRequest(
  campaignId: string,
  intentId: string,
  input: {
    label?: string
    rollType?: RollType
    modifier?: number
    modifierSource?: 'manual' | 'calculated' | 'override'
    modifierBreakdown?: string[]
    modifierNotes?: string[]
    modifierWarnings?: string[]
    rollContext?: Record<string, unknown>
    targetNumber?: number | null
    targetNumberType?: 'dc' | 'ac' | 'unknown'
    advantageState?: AdvantageState
  },
) {
  const { supabase, user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: intent } = await supabase
    .from('action_intents')
    .select('*')
    .eq('id', intentId)
    .eq('campaign_id', campaignId)
    .single()

  if (!intent) return { error: 'Action request not found.' }

  const { data: existing } = await supabase
    .from('action_roll_requests')
    .select('id')
    .eq('action_intent_id', intentId)
    .eq('status', 'waiting_for_player')
    .maybeSingle()

  if (existing) return { error: 'This action already has a waiting roll request.' }

  const label = input.label?.trim() || `${intent.action_type} roll`
  const targetNumber = maybeInt(input.targetNumber)
  if (targetNumber !== null && input.targetNumberType === 'dc' && (targetNumber < 0 || targetNumber > 20)) {
    return { error: 'DC must be from 0 through 20.' }
  }

  const rollContext = input.rollContext ?? {}
  const hpEffect = hpEffectContext(rollContext)
  if (hpEffect && !parseDamageFormula(hpEffect.formula, 0)) {
    return { error: 'HP effect formula must look like 1d8, 2d6+3, or 1d4-1.' }
  }

  const { error: requestError } = await supabase.from('action_roll_requests').insert({
    action_intent_id: intent.id,
    campaign_id: intent.campaign_id,
    character_id: intent.actor_character_id,
    player_id: intent.actor_user_id,
    requested_by_dm_id: user.id,
    label,
    roll_type: input.rollType ?? 'generic',
    modifier: int(input.modifier, 0),
    modifier_source: input.modifierSource ?? 'manual',
    modifier_breakdown: input.modifierBreakdown ?? [],
    modifier_notes: input.modifierNotes ?? [],
    modifier_warnings: input.modifierWarnings ?? [],
    roll_context: rollContext,
    target_number: targetNumber,
    target_number_type: input.targetNumberType ?? (targetNumber === null ? 'unknown' : 'dc'),
    advantage_state: input.advantageState ?? 'normal',
    status: 'waiting_for_player',
  })

  if (requestError) return { error: requestError.message }

  const { error: intentError } = await supabase
    .from('action_intents')
    .update({
      status: 'approved_waiting_for_roll',
      resolver_status: 'pending_player',
      resolved_by: user.id,
    })
    .eq('id', intent.id)

  if (intentError) return { error: intentError.message }

  revalidatePath(ACTIONS_PATH(campaignId))
  return { success: true }
}

export async function markRollRequestRolling(campaignId: string, rollRequestId: string) {
  const { supabase, user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: request } = await supabase
    .from('action_roll_requests')
    .select('*')
    .eq('id', rollRequestId)
    .eq('campaign_id', campaignId)
    .single()

  const rollRequest = (request ?? null) as ActionRollRequest | null
  if (!rollRequest) return { error: 'Roll request not found.' }
  if (rollRequest.player_id !== user.id) return { error: 'This roll request is not assigned to you.' }
  if (rollRequest.status !== 'waiting_for_player') return { success: true }

  const [{ error: requestError }, { error: intentError }] = await Promise.all([
    supabase.from('action_roll_requests').update({ status: 'waiting_for_player' }).eq('id', rollRequestId),
    supabase
      .from('action_intents')
      .update({ status: 'rolling', resolver_status: 'rolling' })
      .eq('id', rollRequest.action_intent_id),
  ])

  if (requestError) return { error: requestError.message }
  if (intentError) return { error: intentError.message }

  revalidatePath(ACTIONS_PATH(campaignId))
  return { success: true }
}

export async function submitRollResult(
  campaignId: string,
  rollRequestId: string,
  input: {
    rollMode: RollMode
    naturalRoll: number
    secondNaturalRoll?: number | null
  },
) {
  const { supabase, user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: request } = await supabase
    .from('action_roll_requests')
    .select('*')
    .eq('id', rollRequestId)
    .eq('campaign_id', campaignId)
    .single()

  const rollRequest = (request ?? null) as ActionRollRequest | null
  if (!rollRequest) return { error: 'Roll request not found.' }
  if (rollRequest.player_id !== user.id) return { error: 'This roll request is not assigned to you.' }
  if (rollRequest.status !== 'waiting_for_player') return { error: 'This roll request is no longer waiting for a roll.' }

  const naturalRoll = int(input.naturalRoll)
  const secondNaturalRoll = input.secondNaturalRoll === null || input.secondNaturalRoll === undefined
    ? null
    : int(input.secondNaturalRoll)
  const firstError = validateD20(naturalRoll, 'Natural roll')
  if (firstError) return { error: firstError }

  if (rollRequest.advantage_state !== 'normal') {
    const secondError = validateD20(secondNaturalRoll ?? 0, 'Second natural roll')
    if (secondError) return { error: secondError }
  }

  const usedNaturalRoll = usedRoll(rollRequest.advantage_state, naturalRoll, secondNaturalRoll)
  const total = usedNaturalRoll + rollRequest.modifier
  const result = rollResult(usedNaturalRoll, total, rollRequest.target_number)

  const { error: resultError } = await supabase.from('action_roll_results').insert({
    roll_request_id: rollRequest.id,
    action_intent_id: rollRequest.action_intent_id,
    campaign_id: rollRequest.campaign_id,
    character_id: rollRequest.character_id,
    player_id: rollRequest.player_id,
    roll_mode: input.rollMode,
    natural_roll: naturalRoll,
    second_natural_roll: secondNaturalRoll,
    used_natural_roll: usedNaturalRoll,
    modifier: rollRequest.modifier,
    total,
    target_number: rollRequest.target_number,
    result,
  })

  if (resultError) return { error: resultError.message }

  const [{ error: requestError }, { error: intentError }] = await Promise.all([
    supabase.from('action_roll_requests').update({ status: 'rolled' }).eq('id', rollRequest.id),
    supabase
      .from('action_intents')
      .update({ status: 'rolled_waiting_for_dm', resolver_status: 'manual' })
      .eq('id', rollRequest.action_intent_id),
  ])

  if (requestError) return { error: requestError.message }
  if (intentError) return { error: intentError.message }

  revalidatePath(ACTIONS_PATH(campaignId))
  return { success: true, total, result }
}

export async function submitAttackRollResult(
  campaignId: string,
  rollRequestId: string,
  input: {
    rollMode: RollMode
    naturalRoll: number
    secondNaturalRoll?: number | null
    damageMode?: 'automatic' | 'manual'
    manualDamageDiceTotal?: number | null
  },
): Promise<
  | {
      success: true
      total: number
      outcome: AttackOutcome
      damageTotal: number | null
      summary: string
    }
  | {
      needsDamage: true
      total: number
      outcome: AttackOutcome
      damageFormula: string
      damageDieSize: number
      damageDiceCount: number
      critical: boolean
    }
  | { error: string }
> {
  const { supabase, user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: request } = await supabase
    .from('action_roll_requests')
    .select('*')
    .eq('id', rollRequestId)
    .eq('campaign_id', campaignId)
    .single()

  const rollRequest = (request ?? null) as ActionRollRequest | null
  if (!rollRequest) return { error: 'Roll request not found.' }
  if (rollRequest.player_id !== user.id) return { error: 'This roll request is not assigned to you.' }
  if (rollRequest.status !== 'waiting_for_player') return { error: 'This roll request is no longer waiting for a roll.' }
  if (rollRequest.roll_type !== 'weapon_attack' && rollRequest.roll_type !== 'attack') {
    return { error: 'This is not an attack roll request.' }
  }

  const naturalRoll = int(input.naturalRoll)
  const secondNaturalRoll = input.secondNaturalRoll === null || input.secondNaturalRoll === undefined
    ? null
    : int(input.secondNaturalRoll)
  const firstError = validateD20(naturalRoll, 'Natural roll')
  if (firstError) return { error: firstError }

  if (rollRequest.advantage_state !== 'normal') {
    const secondError = validateD20(secondNaturalRoll ?? 0, 'Second natural roll')
    if (secondError) return { error: secondError }
  }

  const context = rollRequest.roll_context ?? {}
  const [{ data: intentRaw }, { data: characterRaw }] = await Promise.all([
    supabase.from('action_intents').select('*').eq('id', rollRequest.action_intent_id).eq('campaign_id', campaignId).single(),
    supabase.from('characters').select('id, name').eq('id', rollRequest.character_id).maybeSingle(),
  ])
  if (!intentRaw) return { error: 'Action request not found.' }

  const { data: targetRaw } = await supabase
    .from('tokens')
    .select('id, name, token_type, armor_class, current_hp, max_hp, temp_hp, is_defeated, object_state')
    .eq('id', String(intentRaw.target_token_id))
    .maybeSingle()

  const revealTargetAc = contextBoolean(context, 'revealTargetACToPlayers', ATTACK_SETTINGS.revealTargetACToPlayers)
  const autoRollDamageOnHit = contextBoolean(context, 'autoRollDamageOnHit', ATTACK_SETTINGS.autoRollDamageOnHit)
  const requireDmReview = contextBoolean(context, 'requireDmReviewBeforeReveal', ATTACK_SETTINGS.requireDmReviewBeforeReveal)
  const targetAc = rollRequest.target_number ?? (typeof targetRaw?.armor_class === 'number' ? targetRaw.armor_class : null)
  const targetAcVisible = revealTargetAc ? targetAc : null
  const targetAcSource = rollRequest.target_number !== null ? 'manual' : targetRaw?.armor_class !== undefined && targetRaw?.armor_class !== null ? 'token' : 'unknown'
  const targetName = contextString(context, 'targetName') ?? targetRaw?.name ?? targetRaw?.token_type ?? 'Target'
  const weaponName = contextString(context, 'weaponName') ?? rollRequest.label
  const damageDice = contextString(context, 'damageDice')
  const damageModifier = int(context.damageModifier, 0)
  const damageType = contextString(context, 'damageType')
  const parsedDamage = damageDice ? parseDamageFormula(damageDice, damageModifier) : null

  const attack = resolveAttackRoll({
    naturalRoll,
    secondNaturalRoll,
    advantageState: rollRequest.advantage_state,
    attackModifier: rollRequest.modifier,
    targetAc,
  })

  const hits = attack.outcome === 'hit' || attack.outcome === 'critical_hit'
  const critical = attack.outcome === 'critical_hit'
  const requestedDamageMode = input.damageMode ?? (autoRollDamageOnHit ? 'automatic' : 'manual')

  if (hits && !parsedDamage) {
    return { error: 'This attack does not have a supported damage formula.' }
  }

  if (hits && parsedDamage && requestedDamageMode === 'manual' && input.manualDamageDiceTotal == null) {
    return {
      needsDamage: true,
      total: attack.attackTotal,
      outcome: attack.outcome,
      damageFormula: critical
        ? `${parsedDamage.diceCount * 2}d${parsedDamage.dieSize}${parsedDamage.modifier ? ` ${parsedDamage.modifier >= 0 ? '+' : '-'} ${Math.abs(parsedDamage.modifier)}` : ''}`
        : parsedDamage.formula,
      damageDieSize: parsedDamage.dieSize,
      damageDiceCount: critical ? parsedDamage.diceCount * 2 : parsedDamage.diceCount,
      critical,
    }
  }

  let damage = null as ReturnType<typeof rollDamage> | null
  let damageMode: 'automatic' | 'manual' | 'none' = 'none'
  if (hits && parsedDamage) {
    if (requestedDamageMode === 'manual') {
      const diceTotal = int(input.manualDamageDiceTotal)
      const damageError = validateManualDamage(parsedDamage, diceTotal, critical)
      if (damageError) return { error: damageError }
      damage = manualDamage(parsedDamage, diceTotal, critical)
      damageMode = 'manual'
    } else {
      damage = rollDamage(parsedDamage, critical)
      damageMode = 'automatic'
    }
  }

  const playerSummary = buildAttackPlayerSummary({
    outcome: attack.outcome,
    attackTotal: attack.attackTotal,
    targetName,
    damageTotal: damage?.total ?? null,
    damageType,
    targetAcVisible,
  })
  const dmSummary = buildAttackDmSummary({
    characterName: typeof characterRaw?.name === 'string' ? characterRaw.name : 'Character',
    targetName,
    weaponName,
    naturalRoll,
    usedNaturalRoll: attack.usedNaturalRoll,
    attackModifier: rollRequest.modifier,
    attackTotal: attack.attackTotal,
    targetAc,
    outcome: attack.outcome,
    damageFormula: damage?.formula ?? parsedDamage?.formula ?? null,
    damageRolls: damage?.diceRolled ?? [],
    damageTotal: damage?.total ?? null,
    damageType,
  })

  const attackResultId = randomUUID()
  const { error: attackError } = await supabase
    .from('action_attack_results')
    .insert({
      id: attackResultId,
      action_intent_id: rollRequest.action_intent_id,
      roll_request_id: rollRequest.id,
      campaign_id: rollRequest.campaign_id,
      character_id: rollRequest.character_id,
      player_id: rollRequest.player_id,
      target_id: targetRaw?.id ?? String(intentRaw.target_token_id),
      target_name: targetName,
      weapon_name: weaponName,
      natural_roll: naturalRoll,
      second_natural_roll: secondNaturalRoll,
      used_natural_roll: attack.usedNaturalRoll,
      attack_modifier: rollRequest.modifier,
      attack_total: attack.attackTotal,
      target_ac_visible: targetAcVisible,
      outcome: attack.outcome,
      damage_formula: damage?.formula ?? parsedDamage?.formula ?? null,
      damage_dice_rolled: damage?.diceRolled ?? [],
      damage_modifier: damage?.modifier ?? parsedDamage?.modifier ?? 0,
      damage_total: damage?.total ?? null,
      damage_type: damageType,
      critical,
      damage_mode: damageMode,
      player_visible_summary: playerSummary,
      revealed_to_player: !requireDmReview,
    })

  if (attackError) return { error: attackError.message }

  const { error: detailsError } = await supabase.from('action_attack_result_dm_details').insert({
    attack_result_id: attackResultId,
    campaign_id: rollRequest.campaign_id,
    target_ac: targetAc,
    target_ac_source: targetAcSource,
    dm_summary: dmSummary,
  })

  if (detailsError) return { error: detailsError.message }

  // Phase 4: when the attack lands damage on a known token, suggest a
  // map-state update for the DM to review instead of mutating HP directly.
  // The DM stays in control via the Action Queue "Suggested Update" panel.
  if (damage?.total && targetRaw?.id) {
    const beforeHp = typeof targetRaw.current_hp === 'number' ? targetRaw.current_hp : 0
    const maxHp = typeof targetRaw.max_hp === 'number' && targetRaw.max_hp > 0 ? targetRaw.max_hp : beforeHp
    const afterHp = Math.max(0, beforeHp - damage.total)
    const becomesDefeated = afterHp <= 0 && !targetRaw.is_defeated
    const before = {
      current_hp: beforeHp,
      max_hp: maxHp,
      is_defeated: Boolean(targetRaw.is_defeated),
    }
    const after = {
      current_hp: afterHp,
      max_hp: maxHp,
      is_defeated: becomesDefeated ? true : Boolean(targetRaw.is_defeated),
      hp_effect: {
        kind: 'damage',
        amount: damage.total,
        source: 'attack',
        roll_result_id: attackResultId,
      },
    }
    const damageLabel = damageType ? `${damage.total} ${damageType}` : `${damage.total}`
    const summary = becomesDefeated
      ? `${targetName} takes ${damageLabel} damage and is reduced to 0 HP (defeated).`
      : `${targetName} takes ${damageLabel} damage.`

    const { error: pendingError } = await supabase.from('pending_state_updates').insert({
      campaign_id: rollRequest.campaign_id,
      action_intent_id: rollRequest.action_intent_id,
      roll_result_id: attackResultId,
      update_type: 'damage_token',
      target_id: targetRaw.id,
      target_kind: 'token',
      target_name: targetName,
      before,
      after,
      summary,
      status: 'pending_dm_review',
    })

    if (pendingError) return { error: pendingError.message }
  }

  const [{ error: requestError }, { error: intentError }] = await Promise.all([
    supabase.from('action_roll_requests').update({ status: 'rolled' }).eq('id', rollRequest.id),
    supabase
      .from('action_intents')
      .update({ status: 'rolled_waiting_for_dm', resolver_status: 'manual' })
      .eq('id', rollRequest.action_intent_id),
  ])

  if (requestError) return { error: requestError.message }
  if (intentError) return { error: intentError.message }

  revalidatePath(ACTIONS_PATH(campaignId))
  return {
    success: true,
    total: attack.attackTotal,
    outcome: attack.outcome,
    damageTotal: damage?.total ?? null,
    summary: playerSummary,
  }
}

export async function revealAttackResult(campaignId: string, attackResultId: string) {
  const { supabase, user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('action_attack_results')
    .update({ revealed_to_player: true })
    .eq('id', attackResultId)
    .eq('campaign_id', campaignId)

  if (error) return { error: error.message }
  revalidatePath(ACTIONS_PATH(campaignId))
  return { success: true }
}

export async function submitHpEffectRollResult(
  campaignId: string,
  rollRequestId: string,
  input: {
    rollMode: RollMode
    manualDiceTotal?: number | null
  },
): Promise<{ success: true; total: number; summary: string } | { error: string }> {
  const { supabase, user } = await getClientAndUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: request } = await supabase
    .from('action_roll_requests')
    .select('*')
    .eq('id', rollRequestId)
    .eq('campaign_id', campaignId)
    .single()

  const rollRequest = (request ?? null) as ActionRollRequest | null
  if (!rollRequest) return { error: 'Roll request not found.' }
  if (rollRequest.player_id !== user.id) return { error: 'This roll request is not assigned to you.' }
  if (rollRequest.status !== 'waiting_for_player') return { error: 'This roll request is no longer waiting for a roll.' }

  const effect = hpEffectContext(rollRequest.roll_context ?? {})
  if (!effect) return { error: 'This roll request does not include a healing or damage effect.' }

  const roll = input.rollMode === 'manual'
    ? manualHpEffectFormula(effect.formula, int(input.manualDiceTotal, 0))
    : rollHpEffectFormula(effect.formula)
  if (!roll) return { error: 'HP effect formula must look like 1d8, 2d6+3, or 1d4-1.' }
  if ('error' in roll) return { error: roll.error }

  const { data: intentRaw } = await supabase
    .from('action_intents')
    .select('*')
    .eq('id', rollRequest.action_intent_id)
    .eq('campaign_id', campaignId)
    .single()
  if (!intentRaw) return { error: 'Action request not found.' }

  const targetId = effect.targetId ?? String(intentRaw.target_token_id)
  const { data: liveTargetRaw } = await supabase
    .from('tokens')
    .select('id, name, token_type, current_hp, max_hp, temp_hp, is_defeated')
    .eq('id', targetId)
    .eq('campaign_id', campaignId)
    .maybeSingle()
  const targetRaw = liveTargetRaw
  if (!targetRaw) return { error: 'Target token no longer exists.' }

  const targetName = effect.targetName ?? targetRaw.name ?? targetRaw.token_type ?? 'Target'
  const preview = applyHpEffect(
    {
      current_hp: targetRaw.current_hp ?? 0,
      max_hp: targetRaw.max_hp ?? 0,
      temp_hp: targetRaw.temp_hp ?? 0,
      is_defeated: Boolean(targetRaw.is_defeated),
    },
    effect.kind,
    roll.total,
  )
  const verb = effect.kind === 'healing' ? 'heals' : 'takes'
  const noun = effect.kind === 'healing' ? 'healing' : 'damage'
  const summary = `${targetName} ${verb} ${roll.total} ${noun}.`

  const effectResultId = randomUUID()
  const { error: resultError } = await supabase.from('action_hp_effect_results').insert({
    id: effectResultId,
    action_intent_id: rollRequest.action_intent_id,
    roll_request_id: rollRequest.id,
    campaign_id: rollRequest.campaign_id,
    character_id: rollRequest.character_id,
    player_id: rollRequest.player_id,
    target_id: targetRaw.id,
    target_name: targetName,
    effect_kind: effect.kind,
    formula: roll.formula,
    dice_rolled: roll.diceRolled,
    modifier: roll.modifier,
    total: roll.total,
    roll_mode: input.rollMode,
    player_visible_summary: summary,
  })
  if (resultError) return { error: resultError.message }

  const { error: pendingError } = await supabase.from('pending_state_updates').insert({
    campaign_id: rollRequest.campaign_id,
    action_intent_id: rollRequest.action_intent_id,
    roll_result_id: effectResultId,
    update_type: effect.kind === 'healing' ? 'heal_token' : 'damage_token',
    target_id: targetRaw.id,
    target_kind: 'token',
    target_name: targetName,
    before: {
      current_hp: targetRaw.current_hp ?? 0,
      max_hp: targetRaw.max_hp ?? 0,
      temp_hp: targetRaw.temp_hp ?? 0,
      is_defeated: Boolean(targetRaw.is_defeated),
    },
    after: {
      current_hp: preview.current_hp,
      max_hp: preview.max_hp,
      temp_hp: preview.temp_hp,
      is_defeated: preview.is_defeated,
      hp_effect: {
        kind: effect.kind,
        amount: roll.total,
        source: 'hp_effect_roll',
        roll_result_id: effectResultId,
      },
    },
    summary,
    status: 'pending_dm_review',
  })
  if (pendingError) return { error: pendingError.message }

  const [{ error: requestError }, { error: intentError }] = await Promise.all([
    supabase.from('action_roll_requests').update({ status: 'rolled' }).eq('id', rollRequest.id),
    supabase
      .from('action_intents')
      .update({ status: 'rolled_waiting_for_dm', resolver_status: 'manual' })
      .eq('id', rollRequest.action_intent_id),
  ])

  if (requestError) return { error: requestError.message }
  if (intentError) return { error: intentError.message }

  revalidatePath(ACTIONS_PATH(campaignId))
  return { success: true, total: roll.total, summary }
}
