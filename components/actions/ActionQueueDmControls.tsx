'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import {
  updateActionIntentStatus,
  upsertActionIntentDmNote,
} from '@/lib/actions/action-intents'
import {
  calculateRollRequestModifier,
  createRollRequest,
  getRollModifierOptions,
  type RollModifierOptions,
} from '@/lib/actions/roll-requests'
import type { AbilityKey, ActionIntentStatus, AdvantageState, RollType } from '@/lib/types/database'
import {
  formatRollModifier,
  ROLL_TYPE_LABELS,
  type RollModifierResult,
} from '@/lib/utils/roll-modifiers'

const FINAL_STATUSES: ActionIntentStatus[] = ['denied', 'resolved', 'cancelled']
const ROLL_IN_PROGRESS_STATUSES: ActionIntentStatus[] = [
  'approved_waiting_for_roll',
  'rolling',
  'rolled_waiting_for_dm',
]

export function ActionQueueDmControls({
  campaignId,
  intentId,
  status,
  initialDmResponse,
  initialDmNote,
  selectedToolType,
  selectedToolId,
  selectedToolName,
  hasRollResult = false,
  compact = false,
  onActionComplete,
}: {
  campaignId: string
  intentId: string
  status: ActionIntentStatus
  initialDmResponse?: string | null
  initialDmNote?: string | null
  selectedToolType?: string | null
  selectedToolId?: string | null
  selectedToolName?: string | null
  /** A roll/attack result already exists — enables "Request Another Roll". */
  hasRollResult?: boolean
  compact?: boolean
  onActionComplete?: () => void
}) {
  const [dmResponse, setDmResponse] = useState(initialDmResponse ?? '')
  const [dmNote, setDmNote] = useState(initialDmNote ?? '')
  const [busyStatus, setBusyStatus] = useState<ActionIntentStatus | null>(null)
  const [noteSaving, setNoteSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rollLabel, setRollLabel] = useState('Generic d20 roll')
  const [rollType, setRollType] = useState<RollType>('generic')
  const [modifier, setModifier] = useState(0)
  const [overrideModifier, setOverrideModifier] = useState(false)
  const [targetNumber, setTargetNumber] = useState('')
  const [advantageState, setAdvantageState] = useState<AdvantageState>('normal')
  const [options, setOptions] = useState<RollModifierOptions | null>(null)
  const [modifierResult, setModifierResult] = useState<RollModifierResult | null>(null)
  const [selectedAbility, setSelectedAbility] = useState<AbilityKey>('dex')
  const [selectedSkill, setSelectedSkill] = useState('perception')
  const [selectedSave, setSelectedSave] = useState<AbilityKey>('dex')
  const [selectedTool, setSelectedTool] = useState('')
  const [selectedWeaponId, setSelectedWeaponId] = useState('')
  const [selectedSpellId, setSelectedSpellId] = useState('')
  const [revealTargetACToPlayers, setRevealTargetACToPlayers] = useState(false)
  const [autoRollDamageOnHit, setAutoRollDamageOnHit] = useState(true)
  const [requireDmReviewBeforeReveal, setRequireDmReviewBeforeReveal] = useState(true)
  const [hpEffectKind, setHpEffectKind] = useState<'none' | 'damage' | 'healing'>('none')
  const [hpEffectFormula, setHpEffectFormula] = useState('')
  const noteTimerRef = useRef<number | null>(null)
  const buttonsDisabled = Boolean(busyStatus) || FINAL_STATUSES.includes(status)
  const rollButtonsDisabled = buttonsDisabled || ROLL_IN_PROGRESS_STATUSES.includes(status)
  const effectiveModifier = overrideModifier ? modifier : modifierResult?.modifier ?? modifier
  const selectedWeapon = options?.weapons.find((weapon) => weapon.value === selectedWeaponId) ?? null
  const isAttackRoll = rollType === 'weapon_attack' || rollType === 'attack'
  const isDcRoll = !isAttackRoll
  const resolveLabel = hasRollResult || status === 'rolled_waiting_for_dm'
    ? 'Resolve Result'
    : status === 'resolving'
      ? 'Apply & Reveal'
      : 'Approve'

  function normalizedSelectedToolId(value?: string | null) {
    return (value ?? '').split(':').pop() ?? ''
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDmResponse(initialDmResponse ?? '')
      setDmNote(initialDmNote ?? '')
      setError(null)
      setOverrideModifier(false)
      setModifierResult(null)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [intentId, initialDmResponse, initialDmNote])

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const result = await getRollModifierOptions(campaignId, intentId)
      if ('error' in result) {
        setError(result.error)
        return
      }

      setOptions(result.options)
      setRollLabel(result.options.defaultLabel)
      const toolId = normalizedSelectedToolId(selectedToolId)
      setSelectedTool(result.options.tools.find((tool) => tool.value === selectedToolName)?.value ?? result.options.tools[0]?.value ?? '')
      setSelectedWeaponId(result.options.weapons.find((weapon) => weapon.value === toolId || weapon.label === selectedToolName)?.value ?? result.options.weapons[0]?.value ?? '')
      setSelectedSpellId(result.options.spells.find((spell) => spell.value === toolId || spell.label === selectedToolName)?.value ?? result.options.spells[0]?.value ?? '')
      if (result.options.isAttackAction) {
        setRollType('weapon_attack')
        setRollLabel(`${selectedToolName ?? result.options.defaultLabel}: attack roll`)
        setTargetNumber(result.options.targetArmorClass === null ? '' : String(result.options.targetArmorClass))
        setHpEffectKind('none')
      } else if (selectedToolType === 'Spell') {
        setRollType('spell_attack')
        setRollLabel(`${selectedToolName ?? result.options.defaultLabel}: spell roll`)
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [campaignId, intentId, selectedToolId, selectedToolName, selectedToolType])

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const result = await calculateRollRequestModifier(campaignId, intentId, {
        rollType,
        ability: selectedAbility,
        skill: selectedSkill,
        savingThrow: selectedSave,
        tool: selectedTool,
        weaponId: selectedWeaponId,
        spellId: selectedSpellId,
      })

      if ('error' in result) {
        setModifierResult(null)
        setError(result.error)
        return
      }

      setModifierResult(result.result)
      if (!overrideModifier) setModifier(result.result.modifier)
    }, 150)
    return () => window.clearTimeout(timer)
  }, [
    campaignId,
    intentId,
    rollType,
    selectedAbility,
    selectedSkill,
    selectedSave,
    selectedTool,
    selectedWeaponId,
    selectedSpellId,
    overrideModifier,
  ])

  function saveNote(value: string) {
    if (noteTimerRef.current) window.clearTimeout(noteTimerRef.current)
    noteTimerRef.current = window.setTimeout(async () => {
      setNoteSaving(true)
      const result = await upsertActionIntentDmNote(campaignId, intentId, value)
      setNoteSaving(false)
      if (result?.error) setError(result.error)
    }, 450)
  }

  async function update(statusToSet: ActionIntentStatus) {
    setBusyStatus(statusToSet)
    setError(null)
    const result = await updateActionIntentStatus(campaignId, intentId, statusToSet, dmResponse)
    setBusyStatus(null)
    if (result?.error) {
      setError(result.error)
      return
    }
    onActionComplete?.()
  }

  async function requestRoll(statusToSet: ActionIntentStatus) {
    setBusyStatus(statusToSet)
    setError(null)
    const trimmedTarget = targetNumber.trim()
    if (isDcRoll && trimmedTarget) {
      const dc = Number(trimmedTarget)
      if (!Number.isInteger(dc) || dc < 0 || dc > 20) {
        setError('DC must be a whole number from 0 through 20, or blank if unknown.')
        setBusyStatus(null)
        return
      }
    }
    if (hpEffectKind !== 'none' && !hpEffectFormula.trim()) {
      setError('Enter an HP effect formula like 1d8+3 before requesting this roll.')
      setBusyStatus(null)
      return
    }
    const context = {
      ...(modifierResult?.rollContext ?? { rollType }),
      targetName: options?.targetName ?? null,
      selectedToolType: selectedToolType ?? null,
      selectedToolId: selectedToolId ?? null,
      selectedToolName: selectedToolName ?? null,
      targetAcSource: options?.targetArmorClassSource ?? 'unknown',
      revealTargetACToPlayers,
      autoRollDamageOnHit,
      requireDmReviewBeforeReveal,
      weaponId: selectedWeapon?.value ?? (selectedWeaponId || null),
      weaponName: selectedWeapon?.label ?? selectedToolName ?? null,
      damageDice: selectedWeapon?.damageDice ?? null,
      damageModifier: selectedWeapon?.damageModifier ?? 0,
      damageType: selectedWeapon?.damageType ?? null,
      rangeNormal: selectedWeapon?.rangeNormal ?? null,
      rangeLong: selectedWeapon?.rangeLong ?? null,
      weaponNotes: selectedWeapon?.notes ?? null,
      ...(hpEffectKind !== 'none'
        ? {
            hpEffect: {
              kind: hpEffectKind,
              formula: hpEffectFormula.trim(),
              targetTokenId: modifierResult?.rollContext?.targetTokenId ?? null,
              targetName: options?.targetName ?? null,
              label: `${hpEffectKind === 'healing' ? 'Healing' : 'Damage'} ${hpEffectFormula.trim()}${options?.targetName ? ` to ${options.targetName}` : ''}`,
            },
          }
        : {}),
    }
    const targetForRequest = isAttackRoll && !revealTargetACToPlayers
      ? null
      : targetNumber.trim()
        ? Number(targetNumber)
        : null
    const result = await createRollRequest(campaignId, intentId, {
      label: rollLabel,
      rollType,
      modifier: effectiveModifier,
      modifierSource: overrideModifier ? 'override' : modifierResult?.source ?? 'manual',
      modifierBreakdown: modifierResult?.breakdown ?? [],
      modifierNotes: modifierResult?.notes ?? [],
      modifierWarnings: modifierResult?.warnings ?? [],
      rollContext: context,
      targetNumber: targetForRequest,
      targetNumberType: targetForRequest !== null ? (isAttackRoll ? 'ac' : 'dc') : 'unknown',
      advantageState,
    })
    setBusyStatus(null)
    if (result?.error) {
      setError(result.error)
      return
    }
    onActionComplete?.()
  }

  return (
    <div className={compact ? 'flex flex-col gap-3' : 'flex flex-col gap-3'}>
      {error && (
        <p className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-200">
          {error}
        </p>
      )}

      {FINAL_STATUSES.includes(status) && (
        <p className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-500">
          This action is {status}; decision buttons are disabled.
        </p>
      )}

      <Textarea
        label="DM response"
        rows={compact ? 2 : 2}
        value={dmResponse}
        onChange={(event) => setDmResponse(event.target.value)}
        className={compact ? 'text-xs' : undefined}
      />

      <div className="relative">
        <Textarea
          label="DM-only note"
          rows={compact ? 2 : 2}
          value={dmNote}
          onChange={(event) => {
            const value = event.target.value
            setDmNote(value)
            saveNote(value)
          }}
          className={compact ? 'text-xs' : undefined}
        />
        {noteSaving && (
          <span className="absolute right-2 top-1 text-[10px] text-zinc-500">
            Saving...
          </span>
        )}
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Roll request
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-xs text-zinc-400 sm:col-span-2">
            Roll label
            <input
              value={rollLabel}
              onChange={(event) => setRollLabel(event.target.value)}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
            Roll type
            <select
              value={rollType}
              onChange={(event) => {
                const nextType = event.target.value as RollType
                setRollType(nextType)
                setOverrideModifier(nextType === 'custom' || nextType === 'generic')
              }}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
            >
              <option value="generic">Generic</option>
              <option value="ability_check">Ability check</option>
              <option value="skill_check">Skill check</option>
              <option value="saving_throw">Saving throw</option>
              <option value="tool_check">Tool check</option>
              <option value="weapon_attack">Weapon attack</option>
              <option value="spell_attack">Spell attack</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          {rollType === 'ability_check' && (
            <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
              Ability
              <select
                value={selectedAbility}
                onChange={(event) => setSelectedAbility(event.target.value as AbilityKey)}
                className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
              >
                {(options?.abilities ?? []).map((ability) => (
                  <option key={ability.value} value={ability.value}>{ability.label}</option>
                ))}
              </select>
            </label>
          )}
          {rollType === 'skill_check' && (
            <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
              Skill
              <select
                value={selectedSkill}
                onChange={(event) => setSelectedSkill(event.target.value)}
                className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
              >
                {(options?.skills ?? []).map((skill) => (
                  <option key={skill.value} value={skill.value}>{skill.label}</option>
                ))}
              </select>
            </label>
          )}
          {rollType === 'saving_throw' && (
            <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
              Save
              <select
                value={selectedSave}
                onChange={(event) => setSelectedSave(event.target.value as AbilityKey)}
                className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
              >
                {(options?.savingThrows ?? []).map((ability) => (
                  <option key={ability.value} value={ability.value}>{ability.label}</option>
                ))}
              </select>
            </label>
          )}
          {rollType === 'tool_check' && (
            <>
              <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
                Tool
                <select
                  value={selectedTool}
                  onChange={(event) => setSelectedTool(event.target.value)}
                  className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
                >
                  <option value="">Manual tool</option>
                  {(options?.tools ?? []).map((tool) => (
                    <option key={tool.value} value={tool.value}>{tool.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
                Tool ability
                <select
                  value={selectedAbility}
                  onChange={(event) => setSelectedAbility(event.target.value as AbilityKey)}
                  className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
                >
                  {(options?.abilities ?? []).map((ability) => (
                    <option key={ability.value} value={ability.value}>{ability.label}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          {rollType === 'weapon_attack' && (
            <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
              Weapon or attack
              <select
                value={selectedWeaponId}
                onChange={(event) => setSelectedWeaponId(event.target.value)}
                className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
              >
                <option value="">No saved weapon</option>
                {(options?.weapons ?? []).map((weapon) => (
                  <option key={weapon.value} value={weapon.value}>{weapon.label}</option>
                ))}
              </select>
            </label>
          )}
          {rollType === 'spell_attack' && (
            <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
              Spell
              <select
                value={selectedSpellId}
                onChange={(event) => setSelectedSpellId(event.target.value)}
                className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
              >
                <option value="">Character spell attack</option>
                {(options?.spells ?? []).map((spell) => (
                  <option key={spell.value} value={spell.value}>{spell.label}</option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
            Advantage
            <select
              value={advantageState}
              onChange={(event) => setAdvantageState(event.target.value as AdvantageState)}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
            >
              <option value="normal">Normal</option>
              <option value="advantage">Advantage</option>
              <option value="disadvantage">Disadvantage</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
            Modifier
            <input
              type="number"
              value={effectiveModifier}
              disabled={!overrideModifier}
              onChange={(event) => setModifier(Number(event.target.value) || 0)}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500 disabled:text-zinc-500"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-zinc-400">
            {isAttackRoll ? 'Target AC' : 'DC'}
            <input
              type="number"
              min={isAttackRoll ? undefined : 0}
              max={isAttackRoll ? undefined : 20}
              value={targetNumber}
              onChange={(event) => setTargetNumber(event.target.value)}
              placeholder={isAttackRoll ? 'Optional' : 'Optional 0-20'}
              className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
            />
          </label>
        </div>
        {!isAttackRoll && (
          <p className="mt-2 text-[11px] text-zinc-500">
            DC is optional, but when entered it must be 0-20.
          </p>
        )}
        {isAttackRoll && (
          <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-900 p-3">
            <p className="text-xs font-medium text-zinc-300">Attack resolution</p>
            <div className="mt-2 grid grid-cols-1 gap-2 text-[11px] text-zinc-500 sm:grid-cols-2">
              <span>Target: {options?.targetName ?? 'Unknown'}</span>
              <span>
                AC source: {options?.targetArmorClassSource === 'token' ? `Token AC ${options.targetArmorClass}` : 'Manual/unknown'}
              </span>
              {selectedWeapon && (
                <>
                  <span>Damage: {selectedWeapon.damageDice}{selectedWeapon.damageModifier ? ` ${selectedWeapon.damageModifier >= 0 ? '+' : '-'} ${Math.abs(selectedWeapon.damageModifier)}` : ''}</span>
                  <span>{selectedWeapon.damageType ?? 'Unspecified'} damage</span>
                </>
              )}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <label className="flex items-center gap-2 text-[11px] text-zinc-400">
                <input
                  type="checkbox"
                  checked={revealTargetACToPlayers}
                  onChange={(event) => setRevealTargetACToPlayers(event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-950"
                />
                Reveal AC
              </label>
              <label className="flex items-center gap-2 text-[11px] text-zinc-400">
                <input
                  type="checkbox"
                  checked={autoRollDamageOnHit}
                  onChange={(event) => setAutoRollDamageOnHit(event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-950"
                />
                Auto damage
              </label>
              <label className="flex items-center gap-2 text-[11px] text-zinc-400">
                <input
                  type="checkbox"
                  checked={requireDmReviewBeforeReveal}
                  onChange={(event) => setRequireDmReviewBeforeReveal(event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-950"
                />
                DM review
              </label>
            </div>
            {!revealTargetACToPlayers && targetNumber.trim() && options?.targetArmorClassSource !== 'token' && (
              <p className="mt-2 text-[11px] text-amber-200">
                Manual AC is only hidden when it can be resolved from target token data. Reveal AC or leave hit/miss unresolved for unknown targets.
              </p>
            )}
          </div>
        )}
        {!isAttackRoll && (
          <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-900 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-zinc-300">HP effect</p>
              <p className="text-[11px] text-zinc-500">Applies when you approve the rolled result.</p>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {(['none', 'damage', 'healing'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setHpEffectKind(kind)}
                  className={`rounded-md border px-2 py-1.5 text-xs font-semibold transition ${
                    hpEffectKind === kind
                      ? 'border-amber-400 bg-amber-500/15 text-amber-100'
                      : 'border-zinc-700 bg-zinc-950 text-zinc-400 hover:border-zinc-500'
                  }`}
                >
                  {kind === 'none' ? 'None' : kind === 'damage' ? 'Damage' : 'Healing'}
                </button>
              ))}
            </div>
            {hpEffectKind !== 'none' && (
              <label className="mt-3 flex flex-col gap-1.5 text-xs text-zinc-400">
                Formula
                <input
                  value={hpEffectFormula}
                  onChange={(event) => setHpEffectFormula(event.target.value)}
                  placeholder={hpEffectKind === 'healing' ? '1d8+3' : '2d6'}
                  className="rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
                />
                <span className="text-[11px] text-zinc-500">
                  {hpEffectKind === 'healing' ? 'Healing' : 'Damage'} target: {options?.targetName ?? 'selected token'}
                </span>
              </label>
            )}
          </div>
        )}
        <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-900 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-zinc-300">
              {ROLL_TYPE_LABELS[rollType]} modifier: {formatRollModifier(effectiveModifier)}
            </p>
            <label className="flex items-center gap-2 text-[11px] text-zinc-500">
              <input
                type="checkbox"
                checked={overrideModifier}
                onChange={(event) => setOverrideModifier(event.target.checked)}
                className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-950"
              />
              Override
            </label>
          </div>
          {modifierResult?.breakdown.length ? (
            <ul className="mt-2 list-disc pl-4 text-[11px] text-zinc-400">
              {modifierResult.breakdown.map((line) => <li key={line}>{line}</li>)}
            </ul>
          ) : (
            <p className="mt-2 text-[11px] text-zinc-600">No character modifier data is applied.</p>
          )}
          {modifierResult?.notes.length ? (
            <p className="mt-2 text-[11px] text-zinc-500">{modifierResult.notes.join(' ')}</p>
          ) : null}
          {modifierResult?.warnings.length ? (
            <div className="mt-2 rounded-md border border-amber-800/50 bg-amber-950/20 px-2 py-1.5 text-[11px] text-amber-200">
              {modifierResult.warnings.join(' ')}
            </div>
          ) : null}
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-2 ${compact ? '' : 'sm:grid-cols-3'}`}>
        <Button
          size="sm"
          loading={busyStatus === 'resolved'}
          disabled={buttonsDisabled}
          onClick={() => update('resolved')}
        >
          {resolveLabel}
        </Button>
        <Button
          size="sm"
          loading={busyStatus === 'needs_roll'}
          disabled={rollButtonsDisabled}
          onClick={() => requestRoll('needs_roll')}
        >
          Request Roll
        </Button>
        <Button
          size="sm"
          variant="danger"
          loading={busyStatus === 'denied'}
          disabled={buttonsDisabled}
          onClick={() => update('denied')}
        >
          Deny
        </Button>
      </div>

      {hasRollResult && !FINAL_STATUSES.includes(status) && (
        <Button
          size="sm"
          variant="secondary"
          loading={busyStatus === 'needs_roll'}
          disabled={Boolean(busyStatus)}
          onClick={() => requestRoll('needs_roll')}
        >
          Request Another Roll
        </Button>
      )}

      <p className="text-[11px] leading-relaxed text-zinc-600">
        Dismissal and popup controls never mark a request resolved by themselves. Approve resolves
        without a roll; Request Roll asks the player to roll first. Reviewing an outcome? Resolve
        Result completes it, Request Another Roll rerolls it, and Deny cancels it.
      </p>
    </div>
  )
}
