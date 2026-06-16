import type { AbilityKey, Character } from '@/lib/types/database'

// D&D ability modifier: floor((score - 10) / 2)
export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2)
}

// Format a modifier with an explicit sign, e.g. +2 or -1
export function formatMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`
}

export function abilityModFor(character: Character, key: AbilityKey): number {
  return abilityMod(character[key])
}

// HP color band for quick visual health status
export function hpColor(current: number, max: number): string {
  if (max <= 0) return 'text-zinc-400'
  const ratio = current / max
  if (ratio <= 0) return 'text-red-500'
  if (ratio <= 0.25) return 'text-red-400'
  if (ratio <= 0.5) return 'text-orange-400'
  return 'text-emerald-400'
}

export function hpBarColor(current: number, max: number): string {
  if (max <= 0) return 'bg-zinc-600'
  const ratio = current / max
  if (ratio <= 0.25) return 'bg-red-500'
  if (ratio <= 0.5) return 'bg-orange-500'
  return 'bg-emerald-500'
}
