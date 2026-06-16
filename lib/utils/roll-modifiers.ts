import type {
  Ability,
  AbilityKey,
  Character,
  CharacterAttack,
  Condition,
  InventoryItem,
  RollType,
  Spell,
} from '@/lib/types/database'

export type RollModifierSource = 'manual' | 'calculated' | 'override'

export interface RollModifierSelection {
  rollType: RollType
  ability?: AbilityKey
  skill?: string
  savingThrow?: AbilityKey
  tool?: string
  weaponId?: string
  spellId?: string
}

export interface RollModifierResult {
  modifier: number
  source: RollModifierSource
  label: string
  breakdown: string[]
  notes: string[]
  warnings: string[]
  rollContext: Record<string, string | number | boolean | null>
}

export interface RollModifierContext {
  character: Character
  attacks: CharacterAttack[]
  spells: Spell[]
  abilities: Ability[]
  inventory: InventoryItem[]
  conditions: Condition[]
}

const ABILITY_NAMES: Record<AbilityKey, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  intel: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
}

const SKILL_ABILITIES: Record<string, AbilityKey> = {
  acrobatics: 'dex',
  'animal handling': 'wis',
  arcana: 'intel',
  athletics: 'str',
  deception: 'cha',
  history: 'intel',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'intel',
  medicine: 'wis',
  nature: 'intel',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'intel',
  'sleight of hand': 'dex',
  stealth: 'dex',
  survival: 'wis',
}

const SPELLCASTING_ABILITIES: AbilityKey[] = ['cha', 'wis', 'intel']

export const ROLL_TYPE_LABELS: Record<RollType, string> = {
  generic: 'Generic',
  ability_check: 'Ability check',
  attack: 'Attack',
  weapon_attack: 'Weapon attack',
  spell_attack: 'Spell attack',
  skill_check: 'Skill check',
  saving_throw: 'Saving throw',
  tool_check: 'Tool check',
  damage: 'Damage',
  custom: 'Custom',
}

export const SKILL_OPTIONS = Object.keys(SKILL_ABILITIES)

export function abilityModifier(score: number) {
  return Math.floor((score - 10) / 2)
}

export function formatRollModifier(value: number) {
  return value >= 0 ? `+${value}` : String(value)
}

export function abilityLabel(key: AbilityKey) {
  return ABILITY_NAMES[key]
}

function normalized(value: string | null | undefined) {
  return (value ?? '').toLowerCase().replace(/[_-]+/g, ' ').trim()
}

function scoreFor(character: Character, ability: AbilityKey) {
  return character[ability]
}

function sectionJson(notes: string | null, heading: string): unknown {
  if (!notes) return null
  const headingIndex = notes.toLowerCase().indexOf(heading.toLowerCase())
  if (headingIndex < 0) return null
  const openIndex = notes.indexOf('{', headingIndex)
  if (openIndex < 0) return null

  let depth = 0
  for (let index = openIndex; index < notes.length; index += 1) {
    const char = notes[index]
    if (char === '{') depth += 1
    if (char === '}') depth -= 1
    if (depth === 0) {
      try {
        return JSON.parse(notes.slice(openIndex, index + 1))
      } catch {
        return null
      }
    }
  }
  return null
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function numberValue(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) ? Math.trunc(number) : null
}

function proficiencyLabel(proficiencyBonus: number, kind: 'proficiency' | 'expertise') {
  return kind === 'expertise'
    ? `expertise ${formatRollModifier(proficiencyBonus * 2)}`
    : `proficiency ${formatRollModifier(proficiencyBonus)}`
}

function skillRecord(character: Character, skill: string) {
  const skills = record(sectionJson(character.notes, 'Skills'))
  const exact = Object.keys(skills).find((key) => normalized(key) === normalized(skill))
  return exact ? record(skills[exact]) : {}
}

function savingThrowRecord(character: Character, ability: AbilityKey) {
  const saves = record(sectionJson(character.notes, 'Saving Throws'))
  const exact = Object.keys(saves).find((key) => normalized(key) === normalized(ability) || normalized(key) === normalized(ABILITY_NAMES[ability]))
  return exact ? record(saves[exact]) : {}
}

function proficiencyText(character: Character) {
  const proficiencies = record(sectionJson(character.notes, 'Proficiencies And Languages'))
  return [
    ...stringArray(proficiencies.armor),
    ...stringArray(proficiencies.weapons),
    ...stringArray(proficiencies.tools),
    ...stringArray(proficiencies.languages),
    ...stringArray(proficiencies.other),
    character.notes ?? '',
  ].join(' ').toLowerCase()
}

function hasToolProficiency(context: RollModifierContext, tool: string) {
  const needle = normalized(tool)
  const fromNotes = proficiencyText(context.character).includes(needle)
  const fromInventory = context.inventory.some((item) =>
    `${item.name} ${item.description ?? ''} ${item.notes ?? ''}`.toLowerCase().includes(needle),
  )
  return fromNotes || fromInventory
}

function conditionWarnings(conditions: Condition[]) {
  return conditions.map((condition) =>
    `Active condition may affect rolls: ${condition.name}${condition.notes ? ` (${condition.notes})` : ''}`,
  )
}

function armorWarnings(context: RollModifierContext, selection: RollModifierSelection) {
  if (selection.skill !== 'stealth' && selection.ability !== 'dex' && selection.savingThrow !== 'dex') return []
  const worn = context.inventory.find((item) => {
    const text = `${item.name} ${item.description ?? ''} ${item.notes ?? ''}`.toLowerCase()
    return item.equipped && (text.includes('chain mail') || text.includes('scale mail') || text.includes('half plate') || text.includes('plate armor'))
  })
  return worn ? [`${worn.name} may impose disadvantage on stealth or Dexterity checks.`] : []
}

function spellcastingAbility(context: RollModifierContext) {
  const text = context.abilities
    .map((ability) => `${ability.name} ${ability.description ?? ''} ${ability.notes ?? ''}`)
    .join(' ')
    .toLowerCase()

  for (const ability of SPELLCASTING_ABILITIES) {
    if (text.includes(ABILITY_NAMES[ability].toLowerCase())) return ability
  }
  return null
}

function parsedSpellAttackBonus(context: RollModifierContext) {
  const text = context.abilities
    .map((ability) => `${ability.name} ${ability.description ?? ''} ${ability.notes ?? ''}`)
    .join(' ')
  const match = text.match(/spell attack bonus[^+-]*([+-]\s*\d+)/i)
  return match ? numberValue(match[1].replace(/\s+/g, '')) : null
}

function parsedSpellSaveDc(context: RollModifierContext) {
  const text = context.abilities
    .map((ability) => `${ability.name} ${ability.description ?? ''} ${ability.notes ?? ''}`)
    .join(' ')
  const match = text.match(/spell save dc[^0-9]*(\d+)/i)
  return match ? numberValue(match[1]) : null
}

function baseResult(label: string, selection: RollModifierSelection): RollModifierResult {
  return {
    modifier: 0,
    source: 'manual',
    label,
    breakdown: [],
    notes: [],
    warnings: [],
    rollContext: { rollType: selection.rollType },
  }
}

function withCommonWarnings(result: RollModifierResult, context: RollModifierContext, selection: RollModifierSelection) {
  result.warnings.push(...armorWarnings(context, selection), ...conditionWarnings(context.conditions))
  return result
}

export function calculateRollModifier(
  context: RollModifierContext,
  selection: RollModifierSelection,
): RollModifierResult {
  const character = context.character
  const proficiencyBonus = character.proficiency_bonus || 2

  if (selection.rollType === 'custom' || selection.rollType === 'generic' || selection.rollType === 'damage') {
    const result = baseResult(selection.rollType === 'damage' ? 'Damage roll' : 'Generic d20 roll', selection)
    result.notes.push('No automatic modifier is applied for this roll type.')
    return withCommonWarnings(result, context, selection)
  }

  if (selection.rollType === 'ability_check') {
    const ability = selection.ability ?? 'str'
    const mod = abilityModifier(scoreFor(character, ability))
    const result = baseResult(`${ABILITY_NAMES[ability]} check`, selection)
    result.modifier = mod
    result.source = 'calculated'
    result.breakdown.push(`${ABILITY_NAMES[ability]} ${scoreFor(character, ability)} (${formatRollModifier(mod)})`)
    result.rollContext = { ...result.rollContext, ability }
    return withCommonWarnings(result, context, selection)
  }

  if (selection.rollType === 'skill_check') {
    const skill = normalized(selection.skill || 'perception')
    const ability = SKILL_ABILITIES[skill] ?? 'wis'
    const stored = skillRecord(character, skill)
    const storedModifier = numberValue(stored.modifier)
    const result = baseResult(`${skill} check`, selection)
    result.rollContext = { ...result.rollContext, skill, ability }

    if (storedModifier !== null) {
      result.modifier = storedModifier
      result.source = 'calculated'
      result.breakdown.push(`Stored ${skill} modifier ${formatRollModifier(storedModifier)}`)
      if (stored.proficient === true) result.notes.push('Character data marks this skill proficient.')
      if (stored.expertise === true) result.notes.push('Character data marks this skill as expertise.')
      return withCommonWarnings(result, context, selection)
    }

    const abilityMod = abilityModifier(scoreFor(character, ability))
    const expertise = stored.expertise === true
    const proficient = expertise || stored.proficient === true
    const prof = expertise ? proficiencyBonus * 2 : proficient ? proficiencyBonus : 0
    result.modifier = abilityMod + prof
    result.source = 'calculated'
    result.breakdown.push(`${ABILITY_NAMES[ability]} ${scoreFor(character, ability)} (${formatRollModifier(abilityMod)})`)
    if (prof) result.breakdown.push(proficiencyLabel(proficiencyBonus, expertise ? 'expertise' : 'proficiency'))
    if (!proficient) result.warnings.push(`No saved proficiency data found for ${skill}; using ability modifier only.`)
    return withCommonWarnings(result, context, selection)
  }

  if (selection.rollType === 'saving_throw') {
    const ability = selection.savingThrow ?? selection.ability ?? 'dex'
    const stored = savingThrowRecord(character, ability)
    const storedModifier = numberValue(stored.modifier)
    const result = baseResult(`${ABILITY_NAMES[ability]} saving throw`, selection)
    result.rollContext = { ...result.rollContext, ability }

    if (storedModifier !== null) {
      result.modifier = storedModifier
      result.source = 'calculated'
      result.breakdown.push(`Stored ${ABILITY_NAMES[ability]} save ${formatRollModifier(storedModifier)}`)
      if (stored.proficient === true) result.notes.push('Character data marks this saving throw proficient.')
      return withCommonWarnings(result, context, selection)
    }

    const abilityMod = abilityModifier(scoreFor(character, ability))
    const proficient = stored.proficient === true
    result.modifier = abilityMod + (proficient ? proficiencyBonus : 0)
    result.source = 'calculated'
    result.breakdown.push(`${ABILITY_NAMES[ability]} ${scoreFor(character, ability)} (${formatRollModifier(abilityMod)})`)
    if (proficient) result.breakdown.push(proficiencyLabel(proficiencyBonus, 'proficiency'))
    if (!proficient) result.warnings.push(`No saved proficiency data found for ${ABILITY_NAMES[ability]} saves; using ability modifier only.`)
    return withCommonWarnings(result, context, selection)
  }

  if (selection.rollType === 'tool_check') {
    const ability = selection.ability ?? 'dex'
    const tool = selection.tool?.trim() || 'Selected tool'
    const abilityMod = abilityModifier(scoreFor(character, ability))
    const proficient = hasToolProficiency(context, tool)
    const result = baseResult(`${tool} check`, selection)
    result.modifier = abilityMod + (proficient ? proficiencyBonus : 0)
    result.source = 'calculated'
    result.breakdown.push(`${ABILITY_NAMES[ability]} ${scoreFor(character, ability)} (${formatRollModifier(abilityMod)})`)
    if (proficient) result.breakdown.push(proficiencyLabel(proficiencyBonus, 'proficiency'))
    if (!proficient) result.warnings.push(`No proficiency match found for ${tool}; using ability modifier only.`)
    result.rollContext = { ...result.rollContext, ability, tool }
    return withCommonWarnings(result, context, selection)
  }

  if (selection.rollType === 'weapon_attack' || selection.rollType === 'attack') {
    const attack = context.attacks.find((item) => item.id === selection.weaponId) ?? context.attacks[0]
    const result = baseResult(attack ? `${attack.name} attack` : 'Weapon attack', selection)
    if (!attack) {
      result.warnings.push('No weapon or attack option is saved for this character.')
      return withCommonWarnings(result, context, selection)
    }

    if (attack.attack_bonus_override !== null) {
      result.modifier = attack.attack_bonus_override
      result.source = 'calculated'
      result.breakdown.push(`Stored attack bonus ${formatRollModifier(attack.attack_bonus_override)}`)
      result.notes.push('Using the saved attack bonus override.')
      result.rollContext = { ...result.rollContext, weaponId: attack.id, weaponName: attack.name }
      return withCommonWarnings(result, context, selection)
    }

    const notes = normalized(attack.notes)
    let ability = attack.ability_modifier === 'custom' ? null : attack.ability_modifier
    if (!ability && attack.attack_type === 'ranged') ability = 'dex'
    if (!ability && attack.attack_type === 'melee') ability = 'str'
    if (notes.includes('finesse')) {
      ability = abilityModifier(character.dex) > abilityModifier(character.str) ? 'dex' : 'str'
      result.notes.push('Finesse detected; using the better Strength/Dexterity modifier.')
    }
    if (!ability) {
      result.warnings.push('This attack uses a custom ability; enter an override if needed.')
      return withCommonWarnings(result, context, selection)
    }

    const abilityMod = abilityModifier(scoreFor(character, ability))
    result.modifier = abilityMod + (attack.proficient ? proficiencyBonus : 0)
    result.source = 'calculated'
    result.breakdown.push(`${ABILITY_NAMES[ability]} ${scoreFor(character, ability)} (${formatRollModifier(abilityMod)})`)
    if (attack.proficient) result.breakdown.push(proficiencyLabel(proficiencyBonus, 'proficiency'))
    if (!attack.proficient) result.warnings.push(`${attack.name} is not marked proficient.`)
    result.rollContext = { ...result.rollContext, weaponId: attack.id, weaponName: attack.name, ability }
    return withCommonWarnings(result, context, selection)
  }

  if (selection.rollType === 'spell_attack') {
    const spell = context.spells.find((item) => item.id === selection.spellId) ?? context.spells[0]
    const stored = parsedSpellAttackBonus(context)
    const result = baseResult(spell ? `${spell.name} spell attack` : 'Spell attack', selection)
    if (stored !== null) {
      result.modifier = stored
      result.source = 'calculated'
      result.breakdown.push(`Stored spell attack bonus ${formatRollModifier(stored)}`)
    } else {
      const ability = spellcastingAbility(context)
      if (!ability) {
        result.warnings.push('No spellcasting ability was found; enter an override if needed.')
        return withCommonWarnings(result, context, selection)
      }
      const abilityMod = abilityModifier(scoreFor(character, ability))
      result.modifier = abilityMod + proficiencyBonus
      result.source = 'calculated'
      result.breakdown.push(`${ABILITY_NAMES[ability]} ${scoreFor(character, ability)} (${formatRollModifier(abilityMod)})`)
      result.breakdown.push(proficiencyLabel(proficiencyBonus, 'proficiency'))
      result.rollContext = { ...result.rollContext, ability }
    }
    const saveDc = parsedSpellSaveDc(context)
    if (saveDc !== null) result.notes.push(`Spell save DC found: ${saveDc}`)
    if (!spell) result.warnings.push('No spell was selected; using character spellcasting data only.')
    result.rollContext = { ...result.rollContext, spellId: spell?.id ?? null, spellName: spell?.name ?? null }
    return withCommonWarnings(result, context, selection)
  }

  return withCommonWarnings(baseResult('Roll request', selection), context, selection)
}
