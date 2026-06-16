'use client'

import { useEffect, useState } from 'react'
import {
  getRollOutcomeDisplay,
  type RollOutcomeDisplay,
  type RollOutcomeVariant,
} from '@/lib/utils/roll-outcome-display'

/**
 * Tracks the user's `prefers-reduced-motion` preference so celebratory /
 * punishing animations can be swapped for static badges and glows.
 */
function readPrefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(readPrefersReducedMotion)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handleChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', handleChange)
      return () => query.removeEventListener('change', handleChange)
    }
    // Older Safari fallback
    query.addListener(handleChange)
    return () => query.removeListener(handleChange)
  }, [])

  return reduced
}

/** Compact, color-independent label for an outcome — never rely on color alone. */
export function RollOutcomeBadge({ display }: { display: RollOutcomeDisplay }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${display.badgeClass}`}
    >
      {display.shortLabel}
    </span>
  )
}

const THUMB_POSITIONS = [12, 30, 50, 68, 84, 22]
const FLAME_POSITIONS = [8, 28, 50, 72, 90]

/**
 * Decorative animation layer for critical outcomes.
 *
 * - Natural 1 / critical failure: a brief, once-only burst of thumbs-down
 *   emoji that pop off the result and fade — never loops.
 * - Natural 20 / critical success: a soft, looping flicker of green flame
 *   emoji behind the result — subtle enough not to impair readability.
 *
 * Renders nothing when the user prefers reduced motion; callers should fall
 * back to the static badge/glow styling already present on the panel.
 */
export function RollOutcomeEffects({
  display,
  reducedMotion,
}: {
  display: RollOutcomeDisplay
  reducedMotion: boolean
}) {
  if (reducedMotion) return null

  if (display.showThumbsDown) {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg" aria-hidden="true">
        {THUMB_POSITIONS.map((left, index) => (
          <span
            key={index}
            className="roll-fx-thumb"
            style={{ left: `${left}%`, animationDelay: `${index * 90}ms` }}
          >
            👎
          </span>
        ))}
      </div>
    )
  }

  if (display.showFlames) {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg" aria-hidden="true">
        {FLAME_POSITIONS.map((left, index) => (
          <span
            key={index}
            className="roll-fx-flame"
            style={{ left: `${left}%`, animationDelay: `${index * 220}ms` }}
          >
            🔥
          </span>
        ))}
      </div>
    )
  }

  return null
}

export interface PlayerRollOutcomeData {
  variant: RollOutcomeVariant
  /** Heading for the roll/attack (e.g. the request label or action summary). */
  title: string
  naturalRoll: number
  secondNaturalRoll: number | null
  usedNaturalRoll: number
  modifier: number
  total: number
  targetNumber: number | null
  /** Player-safe outcome summary — must already be gated for hidden DM data. */
  summary: string
  /** Damage total, only ever populated when it is already safe to show the player. */
  damageTotal?: number | null
  damageType?: string | null
  /** Whether the wider action is still awaiting DM review/resolution. */
  reviewPending: boolean
  /** Whether the DM has finished resolving/revealing this action. */
  resolved: boolean
}

/**
 * Persistent result panel rendered inside the player roll popup (and reusable
 * anywhere else outcomes are surfaced — see Phase 5 "consistency across
 * surfaces"). Stays mounted across "outcome displayed" → "waiting for DM
 * review" → "resolved/revealed" so the roll result never disappears.
 */
export function PlayerRollOutcomePanel({
  data,
  onContinue,
}: {
  data: PlayerRollOutcomeData
  onContinue: () => void
}) {
  const reducedMotion = usePrefersReducedMotion()
  const display = getRollOutcomeDisplay(data.variant)
  const modifierText = data.modifier >= 0 ? `+${data.modifier}` : String(data.modifier)
  const secondRollText = data.secondNaturalRoll !== null ? ` / ${data.secondNaturalRoll}` : ''

  return (
    <div
      className={`relative mt-4 overflow-hidden rounded-lg border p-3 ${display.panelClass} ${
        display.shake && !reducedMotion ? 'roll-fx-shake-once' : ''
      }`}
    >
      <RollOutcomeEffects display={display} reducedMotion={reducedMotion} />

      <div className="relative flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-zinc-400">{data.title}</p>
          <h3 className={`mt-0.5 text-base font-bold ${display.textClass}`}>{display.label}</h3>
        </div>
        <RollOutcomeBadge display={display} />
      </div>

      <dl className="relative mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-zinc-300 sm:grid-cols-4">
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-zinc-500">Natural roll</dt>
          <dd className="font-semibold text-zinc-100">
            {data.naturalRoll}
            {secondRollText}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-zinc-500">Used</dt>
          <dd className="font-semibold text-zinc-100">{data.usedNaturalRoll}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-zinc-500">Modifier</dt>
          <dd className="font-semibold text-zinc-100">{modifierText}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-zinc-500">Total</dt>
          <dd className={`text-sm font-bold ${display.textClass}`}>{data.total}</dd>
        </div>
      </dl>

      {data.targetNumber !== null && (
        <p className="relative mt-1.5 text-[11px] text-zinc-500">Target number: {data.targetNumber}</p>
      )}

      <p className="relative mt-2 text-sm text-zinc-100">{data.summary}</p>

      {typeof data.damageTotal === 'number' && (
        <p className="relative mt-1 text-xs text-zinc-300">
          Damage dealt: <span className="font-semibold text-zinc-100">{data.damageTotal}</span>
          {data.damageType ? ` ${data.damageType}` : ''}
        </p>
      )}

      {data.reviewPending && (
        <p className="relative mt-3 rounded-md border border-amber-700/50 bg-amber-950/30 px-2.5 py-1.5 text-[11px] font-medium text-amber-200">
          Waiting for DM Review — your result is locked in and visible here while the DM reviews
          this action.
        </p>
      )}

      {!data.reviewPending && data.resolved && (
        <p className="relative mt-3 rounded-md border border-zinc-700 bg-zinc-900/60 px-2.5 py-1.5 text-[11px] font-medium text-zinc-300">
          The DM has resolved this action. This is your final result.
        </p>
      )}

      <div className="relative mt-3 flex justify-end">
        <button
          type="button"
          onClick={onContinue}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-100 transition hover:border-zinc-500"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
