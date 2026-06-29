'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  markRollRequestRolling,
  submitAttackRollResult,
  submitHpEffectRollResult,
  submitRollResult,
} from '@/lib/actions/roll-requests'
import type {
  ActionIntent,
  ActionIntentStatus,
  ActionRollRequest,
  AdvantageState,
  AttackOutcome,
  Character,
  GameMap,
  RollResultValue,
  Token,
} from '@/lib/types/database'
import { getRollOutcomeVariant, type RollOutcomeVariant } from '@/lib/utils/roll-outcome-display'
import { PlayerRollOutcomePanel, type PlayerRollOutcomeData } from '@/components/actions/RollOutcomeEffects'
import { Card, CardDescription, CardEyebrow } from '@/components/ui/Card'

type RollPopupItem = ActionRollRequest & {
  actionSummary: string
  targetName?: string
  characterName?: string
  locationName?: string
}

type RollOutcomeState = PlayerRollOutcomeData & {
  rollRequestId: string
  actionIntentId: string
}

const REVIEW_PENDING_STATUSES: ActionIntentStatus[] = ['rolled_waiting_for_dm', 'resolving']

function campaignIdFromPath(pathname: string) {
  const match = pathname.match(/^\/campaigns\/([^/]+)/)
  return match?.[1] && match[1] !== 'new' ? match[1] : null
}

function formatModifier(value: number) {
  return value >= 0 ? `+${value}` : String(value)
}

function usedRoll(advantageState: AdvantageState, first: number, second: number | null) {
  if (advantageState === 'advantage') return Math.max(first, second ?? first)
  if (advantageState === 'disadvantage') return Math.min(first, second ?? first)
  return first
}

function randomD20() {
  return Math.floor(Math.random() * 20) + 1
}

function hpEffectFromContext(context: Record<string, unknown> | null | undefined) {
  const raw = context?.hpEffect
  if (!raw || typeof raw !== 'object') return null
  const effect = raw as Record<string, unknown>
  const kind = effect.kind === 'healing' ? 'healing' : effect.kind === 'damage' ? 'damage' : null
  const formula = typeof effect.formula === 'string' ? effect.formula : ''
  if (!kind || !formula.trim()) return null
  return {
    kind,
    formula: formula.trim(),
    label: typeof effect.label === 'string' ? effect.label : null,
  }
}

/**
 * Player-safe outcome summary for generic (non-attack) rolls.
 *
 * `submitRollResult` only returns the total and result classification — there
 * is no hidden DM data to gate here (the player already knows their own roll),
 * so this is purely descriptive copy that keeps the accessible text label
 * requirement satisfied without duplicating the badge.
 */
function buildGenericOutcomeSummary(variant: RollOutcomeVariant, total: number, targetNumber: number | null) {
  const targetText = targetNumber !== null ? ` Target number was ${targetNumber}.` : ''
  switch (variant) {
    case 'critical_failure':
      return `You rolled a natural 1 — critical failure. Your total was ${total}.${targetText}`
    case 'failure':
      return `Your total was ${total}. The attempt falls short.${targetText}`
    case 'success':
      return `Your total was ${total}. The attempt succeeds.${targetText}`
    case 'major_success':
      return `Your total was ${total}. A resounding success!${targetText}`
    case 'critical_success':
      return `You rolled a natural 20 — critical success! Your total was ${total}.${targetText}`
    default:
      return `Your total was ${total}.${targetText}`
  }
}

export function PlayerRollRequestPopup({ userId }: { userId: string }) {
  const pathname = usePathname()
  const campaignId = useMemo(() => campaignIdFromPath(pathname), [pathname])
  const [item, setItem] = useState<RollPopupItem | null>(null)
  const [isDM, setIsDM] = useState(false)
  const [mode, setMode] = useState<'choice' | 'manual' | 'rolling' | 'damage' | 'result'>('choice')
  const [rollOne, setRollOne] = useState('')
  const [rollTwo, setRollTwo] = useState('')
  const [damageDiceTotal, setDamageDiceTotal] = useState('')
  const [pendingDamage, setPendingDamage] = useState<{
    formula: string
    diceCount: number
    dieSize: number
    critical: boolean
    naturalRoll: number
    secondNaturalRoll: number | null
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [animationNumber, setAnimationNumber] = useState<number | null>(null)
  const [realtimeReady, setRealtimeReady] = useState(true)
  const [outcome, setOutcome] = useState<RollOutcomeState | null>(null)
  const rollRequestId = item?.id ?? null

  const refreshOutcomeReviewStatus = useCallback(async (actionIntentId: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('action_intents')
      .select('status')
      .eq('id', actionIntentId)
      .maybeSingle()
    const status = (data?.status ?? null) as ActionIntentStatus | null
    if (!status) return
    setOutcome((prev) => {
      if (!prev || prev.actionIntentId !== actionIntentId) return prev
      const reviewPending = REVIEW_PENDING_STATUSES.includes(status)
      const resolved = status === 'resolved' || status === 'denied' || status === 'cancelled'
      if (prev.reviewPending === reviewPending && prev.resolved === resolved) return prev
      return { ...prev, reviewPending, resolved }
    })
  }, [])

  const loadRollRequest = useCallback(async () => {
    if (!campaignId) {
      setItem(null)
      return
    }

    const supabase = createClient()
    const { data: membership } = await supabase
      .from('campaign_members')
      .select('role')
      .eq('campaign_id', campaignId)
      .eq('user_id', userId)
      .maybeSingle()

    const dm = membership?.role === 'dm'
    setIsDM(dm)
    if (dm) {
      setItem(null)
      return
    }

    const { data: requestRaw } = await supabase
      .from('action_roll_requests')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('player_id', userId)
      .eq('status', 'waiting_for_player')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    const request = (requestRaw ?? null) as ActionRollRequest | null
    if (!request) {
      setItem(null)
      return
    }

    const [{ data: intentRaw }, { data: characterRaw }] = await Promise.all([
      supabase.from('action_intents').select('*').eq('id', request.action_intent_id).maybeSingle(),
      supabase.from('characters').select('id, name').eq('id', request.character_id).maybeSingle(),
    ])
    const intent = (intentRaw ?? null) as ActionIntent | null
    const [{ data: targetRaw }, { data: mapRaw }] = await Promise.all([
      intent ? supabase.from('tokens').select('id, name, token_type').eq('id', intent.target_token_id).maybeSingle() : Promise.resolve({ data: null }),
      intent ? supabase.from('maps').select('id, name').eq('id', intent.map_id).maybeSingle() : Promise.resolve({ data: null }),
    ])
    const character = (characterRaw ?? null) as Pick<Character, 'id' | 'name'> | null
    const target = (targetRaw ?? null) as Pick<Token, 'id' | 'name' | 'token_type'> | null
    const map = (mapRaw ?? null) as Pick<GameMap, 'id' | 'name'> | null

    setItem({
      ...request,
      characterName: character?.name,
      targetName: target?.name ?? target?.token_type ?? undefined,
      locationName: map?.name,
      actionSummary: intent
        ? `${intent.action_type}${target?.name || target?.token_type ? ` ${target.name ?? target.token_type}` : ''}`
        : request.label,
    })
  }, [campaignId, userId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRollRequest()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadRollRequest])

  useEffect(() => {
    if (!rollRequestId || !campaignId) return
    const timer = window.setTimeout(() => {
      setMode('choice')
      setRollOne('')
      setRollTwo('')
      setDamageDiceTotal('')
      setPendingDamage(null)
      setError(null)
      // A newer roll request replaces any previously-displayed outcome — but
      // never clear the result the player is currently looking at for this
      // same request (e.g. a realtime refresh while it's still displayed).
      setOutcome((prev) => (prev && prev.rollRequestId === rollRequestId ? prev : null))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [campaignId, rollRequestId])

  useEffect(() => {
    if (!campaignId || isDM) return

    const supabase = createClient()
    const channel = supabase
      .channel(`player-roll-requests-${campaignId}-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'action_roll_requests',
          filter: `player_id=eq.${userId}`,
        },
        () => {
          setRealtimeReady(true)
          void loadRollRequest()
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeReady(true)
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setRealtimeReady(false)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [campaignId, isDM, loadRollRequest, userId])

  useEffect(() => {
    if (!campaignId || isDM || realtimeReady) return
    const interval = window.setInterval(() => {
      void loadRollRequest()
    }, 30000)
    return () => window.clearInterval(interval)
  }, [campaignId, isDM, loadRollRequest, realtimeReady])

  // Track DM review/resolution for the action behind the displayed outcome so
  // the result panel can move from "waiting for DM review" to "resolved" in
  // place — the roll result itself never disappears while this happens.
  const outcomeIntentId = outcome?.actionIntentId ?? null
  useEffect(() => {
    if (!campaignId || isDM || !outcomeIntentId) return
    const initialCheck = window.setTimeout(() => {
      void refreshOutcomeReviewStatus(outcomeIntentId)
    }, 0)

    const supabase = createClient()
    const channel = supabase
      .channel(`player-roll-outcome-intent-${campaignId}-${outcomeIntentId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'action_intents',
          filter: `id=eq.${outcomeIntentId}`,
        },
        () => {
          void refreshOutcomeReviewStatus(outcomeIntentId)
        },
      )
      .subscribe()

    const interval = window.setInterval(() => {
      void refreshOutcomeReviewStatus(outcomeIntentId)
    }, 20000)

    return () => {
      window.clearTimeout(initialCheck)
      supabase.removeChannel(channel)
      window.clearInterval(interval)
    }
  }, [campaignId, isDM, outcomeIntentId, refreshOutcomeReviewStatus])

  if (!campaignId || isDM) return null
  if (!item && !outcome) return null

  const first = Number(rollOne)
  const second = rollTwo ? Number(rollTwo) : null
  const used = item && rollOne ? usedRoll(item.advantage_state, first, second) : null
  const manualTotal = item && used !== null ? used + item.modifier : null
  const needsSecond = item ? item.advantage_state !== 'normal' : false
  const isAttackRoll = item ? item.roll_type === 'weapon_attack' || item.roll_type === 'attack' : false
  const hpEffect = item ? hpEffectFromContext(item.roll_context) : null
  const isHpEffectRoll = Boolean(hpEffect)

  function setAttackOutcome(
    activeItem: RollPopupItem,
    outcomeValue: AttackOutcome,
    naturalRoll: number,
    secondNaturalRoll: number | null,
    total: number,
    summary: string,
    damageTotal: number | null,
  ) {
    const variant = getRollOutcomeVariant({ attackOutcome: outcomeValue, naturalRoll })
    setOutcome({
      rollRequestId: activeItem.id,
      actionIntentId: activeItem.action_intent_id,
      variant,
      title: activeItem.actionSummary,
      naturalRoll,
      secondNaturalRoll,
      usedNaturalRoll: usedRoll(activeItem.advantage_state, naturalRoll, secondNaturalRoll),
      modifier: activeItem.modifier,
      total,
      targetNumber: activeItem.target_number,
      summary,
      damageTotal,
      damageType: null,
      reviewPending: true,
      resolved: false,
    })
  }

  function setGenericOutcome(
    activeItem: RollPopupItem,
    resultValue: RollResultValue,
    naturalRoll: number,
    secondNaturalRoll: number | null,
    total: number,
  ) {
    const variant = getRollOutcomeVariant({ resultValue, naturalRoll })
    setOutcome({
      rollRequestId: activeItem.id,
      actionIntentId: activeItem.action_intent_id,
      variant,
      title: activeItem.actionSummary,
      naturalRoll,
      secondNaturalRoll,
      usedNaturalRoll: usedRoll(activeItem.advantage_state, naturalRoll, secondNaturalRoll),
      modifier: activeItem.modifier,
      total,
      targetNumber: activeItem.target_number,
      summary: buildGenericOutcomeSummary(variant, total, activeItem.target_number),
      damageTotal: null,
      damageType: null,
      reviewPending: true,
      resolved: false,
    })
  }

  async function submitAttack(
    rollMode: 'manual' | 'automatic',
    naturalRoll: number,
    secondNaturalRoll: number | null,
    manualDamageDiceTotal?: number | null,
  ) {
    if (!item || !campaignId) return
    const activeItem = item
    const result = await submitAttackRollResult(campaignId, activeItem.id, {
      rollMode,
      naturalRoll,
      secondNaturalRoll,
      damageMode: manualDamageDiceTotal === undefined ? undefined : 'manual',
      manualDamageDiceTotal: manualDamageDiceTotal ?? null,
    })
    if ('error' in result) {
      setError(result.error)
      return
    }
    if ('needsDamage' in result) {
      setPendingDamage({
        formula: result.damageFormula,
        diceCount: result.damageDiceCount,
        dieSize: result.damageDieSize,
        critical: result.critical,
        naturalRoll,
        secondNaturalRoll,
      })
      setMode('damage')
      return
    }
    setAttackOutcome(activeItem, result.outcome, naturalRoll, secondNaturalRoll, result.total, result.summary, result.damageTotal)
    setMode('result')
  }

  async function submitManual() {
    if (!item || !campaignId) return
    const activeItem = item
    setBusy(true)
    setError(null)
    void markRollRequestRolling(campaignId, activeItem.id)
    if (isHpEffectRoll) {
      const result = await submitHpEffectRollResult(campaignId, activeItem.id, {
        rollMode: 'manual',
        manualDiceTotal: Number(rollOne),
      })
      setBusy(false)
      if ('error' in result) {
        setError(result.error)
        return
      }
      setGenericOutcome(activeItem, 'success', 10, null, result.total)
      setOutcome((prev) => prev ? { ...prev, summary: result.summary, damageTotal: null } : prev)
      setMode('result')
      return
    }
    if (isAttackRoll) {
      await submitAttack('manual', Number(rollOne), needsSecond ? Number(rollTwo) : null)
      setBusy(false)
      return
    }

    const naturalRoll = Number(rollOne)
    const secondNaturalRoll = needsSecond ? Number(rollTwo) : null
    const result = await submitRollResult(campaignId, activeItem.id, {
      rollMode: 'manual',
      naturalRoll,
      secondNaturalRoll,
    })
    setBusy(false)
    if (result?.error) {
      setError(result.error)
      return
    }
    if (result?.result && typeof result.total === 'number') {
      setGenericOutcome(activeItem, result.result, naturalRoll, secondNaturalRoll, result.total)
    }
    setMode('result')
  }

  async function rollForMe() {
    if (!item || !campaignId) return
    const activeItem = item
    setMode('rolling')
    setBusy(true)
    setError(null)
    void markRollRequestRolling(campaignId, activeItem.id)
    const interval = window.setInterval(() => setAnimationNumber(randomD20()), 80)
    const naturalRoll = randomD20()
    const secondNaturalRoll = needsSecond ? randomD20() : null
    window.setTimeout(async () => {
      window.clearInterval(interval)
      if (isHpEffectRoll) {
        const result = await submitHpEffectRollResult(campaignId, activeItem.id, {
          rollMode: 'automatic',
        })
        setBusy(false)
        if ('error' in result) {
          setMode('choice')
          setError(result.error)
          return
        }
        setAnimationNumber(result.total)
        setGenericOutcome(activeItem, 'success', 10, null, result.total)
        setOutcome((prev) => prev ? { ...prev, summary: result.summary, damageTotal: null } : prev)
        setMode('result')
        return
      }
      if (isAttackRoll) {
        await submitAttack('automatic', naturalRoll, secondNaturalRoll)
        setBusy(false)
        setAnimationNumber(naturalRoll + activeItem.modifier)
        return
      }
      const result = await submitRollResult(campaignId, activeItem.id, {
        rollMode: 'automatic',
        naturalRoll,
        secondNaturalRoll,
      })
      setBusy(false)
      if (result?.error) {
        setMode('choice')
        setError(result.error)
        return
      }
      setAnimationNumber(result.total ?? naturalRoll + activeItem.modifier)
      if (result?.result && typeof result.total === 'number') {
        setGenericOutcome(activeItem, result.result, naturalRoll, secondNaturalRoll, result.total)
      }
      setMode('result')
    }, 1020)
  }

  async function submitManualDamage() {
    if (!pendingDamage) return
    setBusy(true)
    setError(null)
    await submitAttack(
      'manual',
      pendingDamage.naturalRoll,
      pendingDamage.secondNaturalRoll,
      Number(damageDiceTotal),
    )
    setBusy(false)
  }

  function handleContinue() {
    setOutcome(null)
    setMode('choice')
    void loadRollRequest()
  }

  return (
    <aside className="fixed inset-x-3 bottom-24 z-50 mx-auto max-w-sm rounded-xl border border-amber-500/30 bg-zinc-950 p-4 shadow-2xl shadow-black/40 md:bottom-5 md:left-[16.5rem] md:right-auto md:mx-0 md:w-80 md:max-h-[calc(100vh-2.5rem)] md:overflow-y-auto">
      {item && (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardEyebrow className="text-amber-300">
                {isAttackRoll ? 'Attack roll requested' : 'Roll requested'}
              </CardEyebrow>
              <h2 className="mt-1 text-base font-semibold text-zinc-100">{item.actionSummary}</h2>
              {item.characterName && <p className="mt-0.5 text-xs text-zinc-500">{item.characterName}</p>}
            </div>
            {!realtimeReady && <span className="text-[10px] text-zinc-600">Polling</span>}
          </div>

          {!outcome && (
            <Card tone="panel" rounded="lg" padding="xs" className="mt-3">
              <p className="text-sm text-zinc-200">{item.label}</p>
              <CardDescription className="mt-1">
                {isHpEffectRoll
                  ? `${hpEffect?.kind === 'healing' ? 'Healing' : 'Damage'} ${hpEffect?.formula}`
                  : `d20 ${formatModifier(item.modifier)}`}
                {!isAttackRoll && !isHpEffectRoll && item.target_number !== null ? ` / Target ${item.target_number}` : ''}
              </CardDescription>
              <CardDescription className="mt-1 capitalize">{item.advantage_state.replace('_', ' ')}</CardDescription>
              {item.locationName && <CardDescription className="mt-1 text-zinc-600">Location: {item.locationName}</CardDescription>}
              {((item.modifier_breakdown ?? []).length > 0 || (item.modifier_notes ?? []).length > 0 || (item.modifier_warnings ?? []).length > 0) && (
                <details className="mt-2 rounded-md border border-zinc-800 bg-zinc-950/70 px-2 py-1.5">
                  <summary className="cursor-pointer text-[11px] text-zinc-400">
                    Modifier details
                  </summary>
                  {(item.modifier_breakdown ?? []).length > 0 && (
                    <ul className="mt-2 list-disc pl-4 text-[11px] text-zinc-500">
                      {(item.modifier_breakdown ?? []).map((line) => <li key={line}>{line}</li>)}
                    </ul>
                  )}
                  {(item.modifier_notes ?? []).length > 0 && (
                    <p className="mt-2 text-[11px] text-zinc-500">{(item.modifier_notes ?? []).join(' ')}</p>
                  )}
                  {(item.modifier_warnings ?? []).length > 0 && (
                    <p className="mt-2 text-[11px] text-amber-200">{(item.modifier_warnings ?? []).join(' ')}</p>
                  )}
                </details>
              )}
            </Card>
          )}
        </>
      )}

      {!item && outcome && (
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardEyebrow className="text-amber-300">Roll result</CardEyebrow>
            <h2 className="mt-1 text-base font-semibold text-zinc-100">{outcome.title}</h2>
          </div>
          {!realtimeReady && <span className="text-[10px] text-zinc-600">Polling</span>}
        </div>
      )}

      {error && <p className="mt-3 rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-200">{error}</p>}

      {item && !outcome && mode === 'choice' && (
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={busy}
            onClick={rollForMe}
            className="rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 disabled:opacity-50"
          >
            Roll for Me
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode('manual')}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-500 disabled:opacity-50"
          >
            I Rolled Manually
          </button>
        </div>
      )}

      {item && mode === 'rolling' && (
        <div className="mt-4 flex items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 py-6">
          <div className="h-16 w-16 animate-pulse rounded-xl border border-amber-400/50 bg-zinc-950 text-center text-3xl font-bold leading-[4rem] text-amber-300">
            {animationNumber ?? '?'}
          </div>
        </div>
      )}

      {item && mode === 'manual' && (
        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
              {isHpEffectRoll ? 'Dice total' : 'Natural d20 roll'}
            <input
              type="number"
              min={isHpEffectRoll ? 0 : 1}
              max={isHpEffectRoll ? undefined : 20}
              value={rollOne}
              onChange={(event) => setRollOne(event.target.value)}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
            />
          </label>
          {needsSecond && (
            <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
              Second d20 roll
              <input
                type="number"
                min={1}
                max={20}
                value={rollTwo}
                onChange={(event) => setRollTwo(event.target.value)}
                className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
              />
            </label>
          )}
          <p className="text-xs text-zinc-500">
            {isHpEffectRoll
              ? `Formula: ${hpEffect?.formula}. Enter the dice total before modifiers.`
              : `Used roll: ${used ?? '-'} / Modifier: ${formatModifier(item.modifier)} / Total: ${manualTotal ?? '-'}`}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('choice')}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              Back
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={submitManual}
              className="rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
            >
              Submit Roll
            </button>
          </div>
        </div>
      )}

      {item && mode === 'damage' && pendingDamage && (
        <div className="mt-4 flex flex-col gap-3">
          <div className="rounded-md border border-emerald-800/60 bg-emerald-950/30 p-3">
            <p className="text-xs font-medium text-emerald-100">Attack hits. Damage needed.</p>
            <p className="mt-1 text-xs text-zinc-400">
              Damage formula: {pendingDamage.formula}
            </p>
            {pendingDamage.critical && (
              <p className="mt-1 text-[11px] text-amber-200">Critical hit: damage dice are doubled; modifier is added once.</p>
            )}
          </div>
          <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
            Damage dice total
            <input
              type="number"
              min={pendingDamage.diceCount}
              max={pendingDamage.diceCount * pendingDamage.dieSize}
              value={damageDiceTotal}
              onChange={(event) => setDamageDiceTotal(event.target.value)}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={submitManualDamage}
            className="rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
          >
            Submit Damage
          </button>
        </div>
      )}

      {outcome && <PlayerRollOutcomePanel data={outcome} onContinue={handleContinue} />}
    </aside>
  )
}
