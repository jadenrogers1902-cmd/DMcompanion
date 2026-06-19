export type HpEffectKind = 'damage' | 'healing'

export interface HpSnapshot {
  current_hp: number
  max_hp: number
  temp_hp: number
  is_defeated?: boolean
}

export interface HpChangeResult {
  current_hp: number
  max_hp: number
  temp_hp: number
  is_defeated: boolean
}

function toInt(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number) : fallback
}

export function hpPercent(currentHp: number, maxHp: number) {
  if (maxHp <= 0) return 0
  return Math.max(0, Math.min(100, (currentHp / maxHp) * 100))
}

export function hpTone(currentHp: number, maxHp: number, defeated = false) {
  const percent = hpPercent(currentHp, maxHp)
  if (defeated || currentHp <= 0) return 'defeated'
  if (percent <= 25) return 'critical'
  if (percent <= 50) return 'bloodied'
  return 'healthy'
}

export function hpBarClass(currentHp: number, maxHp: number, defeated = false) {
  const tone = hpTone(currentHp, maxHp, defeated)
  if (tone === 'defeated') return 'bg-red-700'
  if (tone === 'critical') return 'bg-red-500'
  if (tone === 'bloodied') return 'bg-amber-500'
  return 'bg-emerald-500'
}

export function applyHpEffect(snapshot: HpSnapshot, kind: HpEffectKind, amount: number): HpChangeResult {
  const currentHp = Math.max(0, toInt(snapshot.current_hp))
  const maxHp = Math.max(0, toInt(snapshot.max_hp))
  const tempHp = Math.max(0, toInt(snapshot.temp_hp))
  const safeAmount = Math.max(0, toInt(amount))

  if (kind === 'healing') {
    const nextCurrent = maxHp > 0 ? Math.min(maxHp, currentHp + safeAmount) : currentHp + safeAmount
    return {
      current_hp: nextCurrent,
      max_hp: maxHp,
      temp_hp: tempHp,
      is_defeated: nextCurrent <= 0,
    }
  }

  const tempDamage = Math.min(tempHp, safeAmount)
  const remainingDamage = Math.max(0, safeAmount - tempDamage)
  const nextTemp = Math.max(0, tempHp - tempDamage)
  const nextCurrent = Math.max(0, currentHp - remainingDamage)
  return {
    current_hp: nextCurrent,
    max_hp: maxHp,
    temp_hp: nextTemp,
    is_defeated: nextCurrent <= 0,
  }
}
