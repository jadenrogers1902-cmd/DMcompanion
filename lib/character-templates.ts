import starterSetPack from '@/components/Character Templates/starter_set_character_templates_ingestible.json'

type UnknownRecord = Record<string, unknown>

export interface StarterTemplatePack {
  metadata?: UnknownRecord
  characterTemplates: CharacterTemplate[]
}

export interface CharacterTemplate {
  id: string
  templateName: string
  templateStatus?: string
  sourcePages?: unknown[]
  roleTags?: string[]
  playstyleSummary: string
  identity: {
    characterName: string | null
    playerName: string | null
    race: string
    subrace?: string | null
    class: string
    classLevelText?: string
    level: number
    background: string
    alignment: string
    experiencePoints: number | null
  }
  coreStats: {
    proficiencyBonus: number
    armorClass: number
    initiative: number
    speed: { value: number; unit: string }
    hitPointMaximum: number
    currentHitPoints: number | null
    temporaryHitPoints: number | null
    hitDice: { total: string; die: string; available: number | null }
    deathSaves: { successes: number; failures: number }
    passiveWisdomPerception: number
  }
  abilityScores: Record<string, { score: number; modifier: number }>
  savingThrows: Record<string, { modifier: number; proficient: boolean }>
  skills: Record<string, {
    ability: string
    modifier: number
    proficient: boolean
    expertise?: boolean
    notes?: string
  }>
  attacksAndSpellcasting: {
    attacks: TemplateAttack[]
    spellcasting: TemplateSpellcasting | null
  }
  currency: { cp: number; sp: number; ep: number; gp: number; pp: number }
  personality: {
    traits: string[]
    ideal: string
    bond: string
    flaw: string
  }
  proficienciesAndLanguages: {
    armor?: string[]
    weapons?: string[]
    tools?: string[]
    gamingSets?: string[]
    vehicles?: string[]
    languages?: string[]
  }
  equipment: Record<string, unknown>
  featuresAndTraits: TemplateFeature[]
  loreAndCampaignHooks: UnknownRecord
  levelingPlan: {
    hitPointGainPerLevel?: string
    levels: TemplateAdvancement[]
    improvingArmor?: unknown
  }
  customization: {
    requiredBeforePlay: string[]
    safePlayerEditableFields: string[]
    dmReviewRecommendedFor: string[]
  }
}

export interface TemplateAttack {
  name: string
  attackBonus: number
  damage: string
  damageType: string
  properties?: string[]
  quantity?: number
  range?: { normal: number; long: number; unit: string }
  longRangeRule?: string
  notes?: string
}

export interface TemplateSpellcasting {
  ability: string
  spellSaveDC: number
  spellAttackBonus: number
  cantripsKnown?: string[]
  cantripsAtWill?: boolean
  spellSlots?: Record<string, number>
  preparedSpellCountAtLevel1?: number
  preparedSpellsRule?: string
  alwaysPreparedDomainSpells?: Record<string, string[]>
  spellbook?: string[]
  arcaneRecovery?: string
}

export interface TemplateFeature {
  name: string
  source: string
  actionType?: string
  uses?: string
  description: string
}

export interface TemplateAdvancement {
  level: number
  xpRequired: number
  gains: Array<{ name: string; description: string }>
  subclassOrArchetype?: unknown
  subclassOrArcaneTradition?: unknown
}

const EXPECTED_TEMPLATE_IDS = [
  'starter_human_fighter_noble',
  'starter_hill_dwarf_cleric_soldier',
  'starter_lightfoot_halfling_rogue_criminal',
  'starter_high_elf_wizard_acolyte',
  'starter_human_fighter_folk_hero',
]

const ABILITY_NAMES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasString(record: UnknownRecord, key: string): boolean {
  return typeof record[key] === 'string' && record[key].trim().length > 0
}

function hasNumber(record: UnknownRecord, key: string): boolean {
  return typeof record[key] === 'number' && Number.isFinite(record[key])
}

function validateTemplate(template: unknown, seenIds: Set<string>): string[] {
  const errors: string[] = []
  if (!isRecord(template)) return ['Template entry is not an object.']

  if (!hasString(template, 'id')) errors.push('Missing template ID.')
  else if (seenIds.has(template.id as string)) errors.push(`Duplicate template ID: ${template.id}`)
  else seenIds.add(template.id as string)

  if (!hasString(template, 'templateName')) errors.push(`Missing display name for ${template.id ?? 'unknown template'}.`)

  const identity = template.identity
  if (!isRecord(identity)) {
    errors.push(`${template.id ?? 'unknown template'} is missing identity.`)
  } else {
    ;['race', 'class', 'background', 'alignment'].forEach((key) => {
      if (!hasString(identity, key)) errors.push(`${template.id} is missing identity.${key}.`)
    })
    if (!hasNumber(identity, 'level')) errors.push(`${template.id} is missing identity.level.`)
  }

  const coreStats = template.coreStats
  if (!isRecord(coreStats)) {
    errors.push(`${template.id ?? 'unknown template'} is missing coreStats.`)
  } else {
    ;['armorClass', 'initiative', 'hitPointMaximum', 'passiveWisdomPerception', 'proficiencyBonus'].forEach((key) => {
      if (!hasNumber(coreStats, key)) errors.push(`${template.id} has invalid coreStats.${key}.`)
    })
    if (!isRecord(coreStats.speed) || !hasNumber(coreStats.speed, 'value')) {
      errors.push(`${template.id} has invalid speed.`)
    }
  }

  const abilityScores = template.abilityScores
  if (!isRecord(abilityScores)) {
    errors.push(`${template.id ?? 'unknown template'} is missing ability scores.`)
  } else {
    ABILITY_NAMES.forEach((ability) => {
      const value = abilityScores[ability]
      if (!isRecord(value) || !hasNumber(value, 'score') || !hasNumber(value, 'modifier')) {
        errors.push(`${template.id} has invalid ability score: ${ability}.`)
      }
    })
  }

  if (!isRecord(template.savingThrows)) errors.push(`${template.id ?? 'unknown template'} is missing saving throws.`)
  if (!isRecord(template.skills)) errors.push(`${template.id ?? 'unknown template'} is missing skills.`)

  const attacksAndSpellcasting = template.attacksAndSpellcasting
  if (!isRecord(attacksAndSpellcasting) || !Array.isArray(attacksAndSpellcasting.attacks)) {
    errors.push(`${template.id ?? 'unknown template'} is missing attacks.`)
  } else {
    attacksAndSpellcasting.attacks.forEach((attack, index) => {
      if (!isRecord(attack) || !hasString(attack, 'name') || !hasNumber(attack, 'attackBonus')) {
        errors.push(`${template.id} has invalid attack at index ${index}.`)
      }
    })
  }

  if (!isRecord(template.levelingPlan) || !Array.isArray(template.levelingPlan.levels) || template.levelingPlan.levels.length < 4) {
    errors.push(`${template.id ?? 'unknown template'} is missing level advancement data through level 5.`)
  }

  const customization = template.customization
  if (!isRecord(customization) || !Array.isArray(customization.safePlayerEditableFields)) {
    errors.push(`${template.id ?? 'unknown template'} is missing editable field definitions.`)
  }

  return errors
}

export function getCharacterTemplates(): CharacterTemplate[] {
  const pack = starterSetPack as StarterTemplatePack
  const seenIds = new Set<string>()
  const allErrors = (pack.characterTemplates ?? []).flatMap((template) => validateTemplate(template, seenIds))
  const missingIds = EXPECTED_TEMPLATE_IDS.filter((id) => !seenIds.has(id))
  missingIds.forEach((id) => allErrors.push(`Expected starter template not found: ${id}`))

  if (allErrors.length > 0) {
    const message = `Character template validation failed:\n${allErrors.map((error) => `- ${error}`).join('\n')}`
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(message)
    }
    console.error(message)
  }

  return (pack.characterTemplates ?? []) as CharacterTemplate[]
}

export function getCharacterTemplate(templateId: string): CharacterTemplate | null {
  return getCharacterTemplates().find((template) => template.id === templateId) ?? null
}

export function getTemplateSummary(template: CharacterTemplate) {
  const spellcasting = template.attacksAndSpellcasting.spellcasting
  return {
    id: template.id,
    name: template.templateName,
    race: [template.identity.race, template.identity.subrace].filter(Boolean).join(' / '),
    className: template.identity.class,
    background: template.identity.background,
    alignment: template.identity.alignment,
    level: template.identity.level,
    role: template.playstyleSummary,
    combatStyle: template.roleTags?.join(', ') ?? 'Starter adventurer',
    magicType: spellcasting ? `${spellcasting.ability} caster` : 'Non-spellcaster',
    spellcaster: Boolean(spellcasting),
  }
}
