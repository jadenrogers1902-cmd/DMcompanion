import type { AttackOutcome, RollResultValue } from '@/lib/types/database'

/**
 * Shared outcome-styling vocabulary for player-facing roll/attack results.
 *
 * This is intentionally presentation-only: it does not change roll math, data
 * models, or visibility rules. It maps the existing `RollResultValue` /
 * `AttackOutcome` enums (plus the natural die value, for the Natural 1 / 20
 * special cases) onto a small set of display variants that every surface
 * (player roll popup today, other surfaces later per Phase 5) can reuse so the
 * styling stays consistent.
 */
export type RollOutcomeVariant =
  | 'success'
  | 'major_success'
  | 'failure'
  | 'major_failure'
  | 'critical_failure'
  | 'critical_success'
  | 'unknown'

export interface RollOutcomeVariantInput {
  /** Generic d20 roll result, when this is not an attack roll. */
  resultValue?: RollResultValue | null
  /** Weapon attack outcome, when this is an attack roll. */
  attackOutcome?: AttackOutcome | null
  /** The natural die value actually used (post advantage/disadvantage). */
  naturalRoll?: number | null
}

/**
 * Determines the display variant for a roll/attack outcome.
 *
 * Natural 1 and Natural 20 always win — they are called out explicitly in the
 * requirement regardless of whether the underlying engine also classified the
 * roll as a plain failure/success (e.g. a natural 20 that still misses a very
 * high AC should still get the celebratory critical-success treatment for the
 * die roll itself; a natural 1 always reads as a critical failure).
 */
export function getRollOutcomeVariant(input: RollOutcomeVariantInput): RollOutcomeVariant {
  const { resultValue, attackOutcome, naturalRoll } = input

  if (naturalRoll === 1) return 'critical_failure'
  if (naturalRoll === 20) return 'critical_success'

  if (attackOutcome) {
    switch (attackOutcome) {
      case 'critical_miss':
        return 'critical_failure'
      case 'miss':
        return 'failure'
      case 'hit':
        return 'success'
      case 'critical_hit':
        return 'critical_success'
      default:
        return 'unknown'
    }
  }

  switch (resultValue) {
    case 'critical_failure':
      return 'critical_failure'
    case 'failure':
      return 'failure'
    case 'success':
      return 'success'
    case 'major_success':
      return 'major_success'
    case 'critical_success':
      return 'critical_success'
    default:
      return 'unknown'
  }
}

export interface RollOutcomeDisplay {
  variant: RollOutcomeVariant
  /** Long, accessible label shown in the result panel (never rely on color alone). */
  label: string
  /** Short label for compact badges. */
  shortLabel: string
  /** Container/panel border + background classes. */
  panelClass: string
  /** Badge border + background + text classes. */
  badgeClass: string
  /** Emphasis text color class for headline numbers. */
  textClass: string
  /** Whether to play the once-only thumb-down "pop" burst (Natural 1 / critical failure). */
  showThumbsDown: boolean
  /** Whether to show the looping-but-subtle green flame effect (Natural 20 / critical success). */
  showFlames: boolean
  /** Whether to play a brief one-shot shake on the result panel. */
  shake: boolean
}

const VARIANT_DISPLAY: Record<
  RollOutcomeVariant,
  Pick<RollOutcomeDisplay, 'label' | 'shortLabel' | 'panelClass' | 'badgeClass' | 'textClass'>
> = {
  success: {
    label: 'Success',
    shortLabel: 'Success',
    panelClass: 'border-emerald-700 bg-emerald-950/40',
    badgeClass: 'border-emerald-600 bg-emerald-900/60 text-emerald-200',
    textClass: 'text-emerald-100',
  },
  major_success: {
    label: 'Major Success',
    shortLabel: 'Major Success',
    panelClass: 'border-emerald-500 bg-emerald-900/50 shadow-[0_0_20px_-4px_rgba(52,211,153,0.5)]',
    badgeClass: 'border-emerald-400 bg-emerald-800/70 text-emerald-100',
    textClass: 'text-emerald-50',
  },
  failure: {
    label: 'Failure',
    shortLabel: 'Failure',
    panelClass: 'border-red-800 bg-red-950/40',
    badgeClass: 'border-red-700 bg-red-900/60 text-red-200',
    textClass: 'text-red-100',
  },
  major_failure: {
    label: 'Major Failure',
    shortLabel: 'Major Failure',
    panelClass: 'border-red-600 bg-red-900/50 shadow-[0_0_20px_-4px_rgba(248,113,113,0.5)]',
    badgeClass: 'border-red-500 bg-red-800/70 text-red-100',
    textClass: 'text-red-50',
  },
  critical_failure: {
    label: 'Critical Failure (Natural 1)',
    shortLabel: 'Critical Failure',
    panelClass: 'border-red-500 bg-red-950/60 shadow-[0_0_26px_-4px_rgba(248,113,113,0.6)]',
    badgeClass: 'border-red-400 bg-red-900/80 text-red-100',
    textClass: 'text-red-50',
  },
  critical_success: {
    label: 'Natural 20 — Critical Success',
    shortLabel: 'Critical Success',
    panelClass: 'border-emerald-400 bg-emerald-950/60 shadow-[0_0_30px_-4px_rgba(74,222,128,0.65)]',
    badgeClass: 'border-emerald-300 bg-emerald-800/80 text-emerald-50',
    textClass: 'text-emerald-50',
  },
  unknown: {
    label: 'Result Recorded',
    shortLabel: 'Recorded',
    panelClass: 'border-zinc-700 bg-zinc-900/60',
    badgeClass: 'border-zinc-600 bg-zinc-800/70 text-zinc-300',
    textClass: 'text-zinc-200',
  },
}

/** Resolves the full display spec (copy + styling + animation flags) for a variant. */
export function getRollOutcomeDisplay(variant: RollOutcomeVariant): RollOutcomeDisplay {
  const base = VARIANT_DISPLAY[variant]
  return {
    variant,
    ...base,
    showThumbsDown: variant === 'critical_failure',
    showFlames: variant === 'critical_success',
    shake: variant === 'critical_failure',
  }
}
