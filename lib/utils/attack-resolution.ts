import type { AdvantageState } from '@/lib/types/database'

export type AttackOutcome = 'critical_miss' | 'miss' | 'hit' | 'critical_hit' | 'unknown'
export type DamageMode = 'automatic' | 'manual' | 'none'

export interface ParsedDamageFormula {
  diceCount: number
  dieSize: number
  modifier: number
  formula: string
}

export interface DamageRollResult {
  formula: string
  diceRolled: number[]
  modifier: number
  total: number
  critical: boolean
}

export interface AttackResolutionInput {
  naturalRoll: number
  secondNaturalRoll?: number | null
  advantageState: AdvantageState
  attackModifier: number
  targetAc?: number | null
}

export interface AttackResolutionResult {
  usedNaturalRoll: number
  attackTotal: number
  outcome: AttackOutcome
}

export function usedAttackRoll(advantageState: AdvantageState, first: number, second: number | null) {
  if (advantageState === 'advantage') return Math.max(first, second ?? first)
  if (advantageState === 'disadvantage') return Math.min(first, second ?? first)
  return first
}

export function resolveAttackRoll(input: AttackResolutionInput): AttackResolutionResult {
  const usedNaturalRoll = usedAttackRoll(input.advantageState, input.naturalRoll, input.secondNaturalRoll ?? null)
  const attackTotal = usedNaturalRoll + input.attackModifier

  if (usedNaturalRoll === 1) return { usedNaturalRoll, attackTotal, outcome: 'critical_miss' }
  if (usedNaturalRoll === 20) return { usedNaturalRoll, attackTotal, outcome: 'critical_hit' }
  if (input.targetAc === null || input.targetAc === undefined) {
    return { usedNaturalRoll, attackTotal, outcome: 'unknown' }
  }
  return { usedNaturalRoll, attackTotal, outcome: attackTotal >= input.targetAc ? 'hit' : 'miss' }
}

export function parseDamageFormula(damageDice: string, damageModifier = 0): ParsedDamageFormula | null {
  const text = damageDice.trim().toLowerCase().replace(/\s+/g, '')
  const match = text.match(/^(\d*)d(\d+)([+-]\d+)?$/)
  if (!match) return null

  const diceCount = Number(match[1] || 1)
  const dieSize = Number(match[2])
  const inlineModifier = match[3] ? Number(match[3]) : 0
  if (!Number.isInteger(diceCount) || !Number.isInteger(dieSize) || diceCount < 1 || diceCount > 20 || dieSize < 2) {
    return null
  }

  const modifier = inlineModifier + damageModifier
  const sign = modifier >= 0 ? '+' : '-'
  const formula = modifier === 0 ? `${diceCount}d${dieSize}` : `${diceCount}d${dieSize} ${sign} ${Math.abs(modifier)}`
  return { diceCount, dieSize, modifier, formula }
}

export function rollDamage(formula: ParsedDamageFormula, critical: boolean): DamageRollResult {
  const diceToRoll = critical ? formula.diceCount * 2 : formula.diceCount
  const diceRolled = Array.from({ length: diceToRoll }, () => Math.floor(Math.random() * formula.dieSize) + 1)
  const total = diceRolled.reduce((sum, roll) => sum + roll, 0) + formula.modifier
  return {
    formula: critical
      ? `${formula.diceCount * 2}d${formula.dieSize}${formula.modifier ? ` ${formula.modifier >= 0 ? '+' : '-'} ${Math.abs(formula.modifier)}` : ''}`
      : formula.formula,
    diceRolled,
    modifier: formula.modifier,
    total,
    critical,
  }
}

export function validateManualDamage(formula: ParsedDamageFormula, value: number, critical: boolean) {
  const diceCount = critical ? formula.diceCount * 2 : formula.diceCount
  const min = diceCount
  const max = diceCount * formula.dieSize
  if (!Number.isInteger(value) || value < min || value > max) {
    return `Damage dice total must be from ${min} through ${max}.`
  }
  return null
}

export function manualDamage(formula: ParsedDamageFormula, diceTotal: number, critical: boolean): DamageRollResult {
  return {
    formula: critical
      ? `${formula.diceCount * 2}d${formula.dieSize}${formula.modifier ? ` ${formula.modifier >= 0 ? '+' : '-'} ${Math.abs(formula.modifier)}` : ''}`
      : formula.formula,
    diceRolled: [diceTotal],
    modifier: formula.modifier,
    total: diceTotal + formula.modifier,
    critical,
  }
}

export function formatAttackOutcome(outcome: AttackOutcome) {
  const labels: Record<AttackOutcome, string> = {
    critical_miss: 'Critical miss',
    miss: 'Miss',
    hit: 'Hit',
    critical_hit: 'Critical hit',
    unknown: 'Rolled',
  }
  return labels[outcome]
}
