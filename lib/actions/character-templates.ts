'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  getCharacterTemplate,
  type CharacterTemplate,
  type TemplateAttack,
} from '@/lib/character-templates'
import type { AbilityKey } from '@/lib/types/database'

function str(formData: FormData, key: string): string | null {
  const raw = (formData.get(key) as string | null)?.trim()
  return raw && raw.length > 0 ? raw : null
}

function values(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .map((value) => String(value).trim())
    .filter(Boolean)
}

function listText(formData: FormData, key: string): string[] {
  return (str(formData, key) ?? '')
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function abilityScore(template: CharacterTemplate, key: string): number {
  return template.abilityScores[key]?.score ?? 10
}

function parseDamage(damage: string): { dice: string; modifier: number } {
  const match = damage.match(/^(.+?)(?:\s*([+-])\s*(\d+))?$/)
  if (!match) return { dice: damage, modifier: 0 }
  return {
    dice: match[1].trim(),
    modifier: match[2] === '-' ? -Number(match[3] ?? 0) : Number(match[3] ?? 0),
  }
}

function attackType(attack: TemplateAttack): 'melee' | 'ranged' | 'spell' | 'custom' {
  if (attack.properties?.includes('ranged') || attack.properties?.includes('thrown')) return 'ranged'
  if (attack.properties?.includes('melee')) return 'melee'
  return 'custom'
}

function attackNotes(attack: TemplateAttack): string | null {
  const notes = [
    attack.properties?.length ? `Properties: ${attack.properties.join(', ')}` : null,
    attack.quantity ? `Quantity: ${attack.quantity}` : null,
    attack.range ? `Range: ${attack.range.normal}/${attack.range.long} ${attack.range.unit}` : null,
    attack.longRangeRule ?? null,
    attack.notes ?? null,
  ].filter(Boolean)
  return notes.length ? notes.join('\n') : null
}

function spellLevel(label: string): number {
  if (label.toLowerCase().startsWith('1')) return 1
  if (label.toLowerCase().startsWith('2')) return 2
  if (label.toLowerCase().startsWith('3')) return 3
  if (label.toLowerCase().startsWith('4')) return 4
  if (label.toLowerCase().startsWith('5')) return 5
  if (label.toLowerCase().startsWith('6')) return 6
  if (label.toLowerCase().startsWith('7')) return 7
  if (label.toLowerCase().startsWith('8')) return 8
  if (label.toLowerCase().startsWith('9')) return 9
  return 1
}

function flattenEquipment(equipment: Record<string, unknown>) {
  const rows: Array<{ name: string; description: string | null; notes: string | null }> = []
  Object.entries(equipment).forEach(([category, value]) => {
    if (category === 'notes') return
    if (Array.isArray(value)) {
      value.forEach((item) => {
        rows.push({
          name: String(item),
          description: category.replace(/([A-Z])/g, ' $1').toLowerCase(),
          notes: null,
        })
      })
    }
  })
  return rows
}

function templateNotes(template: CharacterTemplate, formData: FormData, preparedSpells: string[]): string {
  const customSections = [
    ['Player name', str(formData, 'player_name')],
    ['Appearance', str(formData, 'appearance')],
    ['Pronouns', str(formData, 'pronouns')],
    ['Personality adjustments', str(formData, 'personality_notes')],
    ['Backstory additions', str(formData, 'backstory_additions')],
    ['Personal goal adjustments', str(formData, 'personal_goal_adjustments')],
    ['Equipment notes', str(formData, 'equipment_notes')],
    ['Campaign notes', str(formData, 'campaign_notes')],
    ['Custom notes', str(formData, 'custom_notes')],
  ].filter(([, value]) => value)

  return [
    `Source template: ${template.templateName} (${template.id})`,
    `Source pages: ${(template.sourcePages ?? []).join(', ') || 'Starter Set character sheet'}`,
    '',
    'Player Customizations',
    ...customSections.map(([label, value]) => `${label}: ${value}`),
    preparedSpells.length ? `Prepared spells selected: ${preparedSpells.join(', ')}` : null,
    '',
    'Template Identity',
    `${template.identity.race} ${template.identity.class} ${template.identity.level}, ${template.identity.background}, ${template.identity.alignment}`,
    '',
    'Personality',
    `Traits: ${template.personality.traits.join(' / ')}`,
    `Ideal: ${template.personality.ideal}`,
    `Bond: ${template.personality.bond}`,
    `Flaw: ${template.personality.flaw}`,
    '',
    'Narrative And Goals',
    JSON.stringify(template.loreAndCampaignHooks, null, 2),
    '',
    'Skills',
    JSON.stringify(template.skills, null, 2),
    '',
    'Saving Throws',
    JSON.stringify(template.savingThrows, null, 2),
    '',
    'Proficiencies And Languages',
    JSON.stringify(template.proficienciesAndLanguages, null, 2),
    '',
    'Level Advancement 1-5',
    JSON.stringify(template.levelingPlan, null, 2),
    '',
    'Template Customization Rules',
    JSON.stringify(template.customization, null, 2),
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
}

export async function finalizeCharacterTemplate(campaignId: string, templateId: string, formData: FormData) {
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
    .single()

  if (!membership) return { error: 'You must be a campaign member to create a character.' }

  const template = getCharacterTemplate(templateId)
  if (!template) return { error: 'Template not found.' }

  const characterName = str(formData, 'character_name')
  if (!characterName) return { error: 'Character name is required.' }

  const preparedSpells = [...new Set([...values(formData, 'prepared_spells'), ...listText(formData, 'prepared_spells_text')])]
  const { data: character, error } = await supabase
    .from('characters')
    .insert({
      campaign_id: campaignId,
      user_id: user.id,
      name: characterName,
      class: template.identity.class,
      level: template.identity.level,
      race: [template.identity.race, template.identity.subrace].filter(Boolean).join(' / '),
      background: template.identity.background,
      armor_class: template.coreStats.armorClass,
      max_hp: template.coreStats.hitPointMaximum,
      current_hp: template.coreStats.hitPointMaximum,
      temp_hp: 0,
      speed: template.coreStats.speed.value,
      initiative_bonus: template.coreStats.initiative,
      passive_perception: template.coreStats.passiveWisdomPerception,
      proficiency_bonus: template.coreStats.proficiencyBonus,
      str: abilityScore(template, 'strength'),
      dex: abilityScore(template, 'dexterity'),
      con: abilityScore(template, 'constitution'),
      intel: abilityScore(template, 'intelligence'),
      wis: abilityScore(template, 'wisdom'),
      cha: abilityScore(template, 'charisma'),
      notes: templateNotes(template, formData, preparedSpells),
    })
    .select('id')
    .single()

  if (error || !character) {
    return { error: error?.message ?? 'Failed to create character from template.' }
  }

  const characterId = character.id as string
  const equipmentNotes = Array.isArray(template.equipment.notes) ? template.equipment.notes.join('\n') : null
  const equipment = flattenEquipment(template.equipment).map((item) => ({
    character_id: characterId,
    name: item.name,
    quantity: 1,
    description: item.description,
    equipped: ['weapons', 'armor'].includes(item.description ?? ''),
    magical: false,
    visible_to_dm: true,
    notes: [item.notes, equipmentNotes].filter(Boolean).join('\n') || null,
  }))

  if (equipment.length > 0) {
    const { error: equipmentError } = await supabase.from('character_inventory_items').insert(equipment)
    if (equipmentError) return { error: equipmentError.message }
  }

  const abilities = template.featuresAndTraits.map((feature) => ({
    character_id: characterId,
    name: feature.name,
    source: feature.source,
    uses: feature.uses ?? feature.actionType ?? null,
    reset_type: feature.uses?.toLowerCase().includes('rest') ? 'Rest' : null,
    description: feature.description,
    notes: feature.actionType ? `Action type: ${feature.actionType}` : null,
  }))

  if (abilities.length > 0) {
    const { error: abilityError } = await supabase.from('character_abilities').insert(abilities)
    if (abilityError) return { error: abilityError.message }
  }

  const spellcasting = template.attacksAndSpellcasting.spellcasting
  const spells = spellcasting
    ? [
        ...(spellcasting.cantripsKnown ?? []).map((name) => ({
          character_id: characterId,
          name,
          spell_level: 0,
          prepared: true,
          uses: 'At will',
          description: null,
          notes: `Source template: ${template.templateName}`,
        })),
        ...Object.entries(spellcasting.alwaysPreparedDomainSpells ?? {}).flatMap(([levelLabel, spellNames]) =>
          spellNames.map((name) => ({
            character_id: characterId,
            name,
            spell_level: spellLevel(levelLabel),
            prepared: true,
            uses: spellcasting.spellSlots ? JSON.stringify(spellcasting.spellSlots) : null,
            description: null,
            notes: 'Always prepared domain spell.',
          })),
        ),
        ...(spellcasting.spellbook ?? []).map((name) => ({
          character_id: characterId,
          name,
          spell_level: 1,
          prepared: preparedSpells.includes(name),
          uses: spellcasting.spellSlots ? JSON.stringify(spellcasting.spellSlots) : null,
          description: null,
          notes: spellcasting.preparedSpellsRule ?? 'Spellbook spell.',
        })),
        ...preparedSpells
          .filter((name) => !(spellcasting.spellbook ?? []).includes(name))
          .map((name) => ({
            character_id: characterId,
            name,
            spell_level: 1,
            prepared: true,
            uses: spellcasting.spellSlots ? JSON.stringify(spellcasting.spellSlots) : null,
            description: null,
            notes: spellcasting.preparedSpellsRule ?? 'Player-selected prepared spell.',
          })),
      ]
    : []

  if (spells.length > 0) {
    const { error: spellError } = await supabase.from('character_spells').insert(spells)
    if (spellError) return { error: spellError.message }
  }

  const attacks = template.attacksAndSpellcasting.attacks.map((attack) => {
    const damage = parseDamage(attack.damage)
    return {
      character_id: characterId,
      name: attack.name,
      attack_type: attackType(attack),
      ability_modifier: 'custom' as AbilityKey | 'custom',
      proficient: true,
      attack_bonus_override: attack.attackBonus,
      damage_dice: damage.dice,
      damage_modifier: damage.modifier,
      damage_type: attack.damageType,
      range_normal: attack.range?.normal ?? null,
      range_long: attack.range?.long ?? null,
      equipped: true,
      ammo_required: Boolean(attack.properties?.includes('ranged') || attack.properties?.includes('thrown')),
      notes: attackNotes(attack),
    }
  })

  if (attacks.length > 0) {
    const { error: attackError } = await supabase.from('character_attacks').insert(attacks)
    if (attackError) return { error: attackError.message }
  }

  revalidatePath(`/campaigns/${campaignId}/characters`)
  redirect(`/campaigns/${campaignId}/characters/${characterId}`)
}
