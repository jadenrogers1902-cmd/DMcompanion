'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, CheckCircle2, CircleAlert, Clock3, MessageSquareText, ShieldQuestion, Swords } from 'lucide-react'
import { useRealtimeRefresh } from '@/lib/hooks/useRealtimeRefresh'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Badge } from '@/components/ui/Badge'
import { ActionQueueDmControls } from './ActionQueueDmControls'
import { ClearActionBoardButton } from './ClearActionBoardButton'
import { RollOutcomeBadge, RollOutcomeEffects, usePrefersReducedMotion } from './RollOutcomeEffects'
import { revealAttackResult } from '@/lib/actions/roll-requests'
import { applyPendingStateUpdate, rejectPendingStateUpdate } from '@/lib/actions/state-updates'
import { acknowledgeActionNudge } from '@/lib/actions/party-messages'
import type {
  ActionAttackResult,
  ActionAttackResultDmDetail,
  ActionHpEffectResult,
  ActionIntent,
  ActionRollRequest,
  ActionRollResult,
  ActionResult,
  Character,
  CharacterAttack,
  CombatLog,
  GameMap,
  PendingStateUpdate,
  Profile,
  Token,
} from '@/lib/types/database'
import { getRollOutcomeDisplay, getRollOutcomeVariant } from '@/lib/utils/roll-outcome-display'

type IntentDetails = ActionIntent & {
  actor_character?: Pick<Character, 'id' | 'name' | 'user_id'> | null
  target_token?: Pick<Token, 'id' | 'name' | 'token_type' | 'armor_class' | 'current_hp' | 'max_hp' | 'temp_hp' | 'is_defeated' | 'object_state'> | null
  actor_profile?: Pick<Profile, 'id' | 'display_name'> | null
  action_results?: ActionResult[]
  combat_logs?: CombatLog[]
  action_roll_requests?: ActionRollRequest[]
  action_roll_results?: ActionRollResult[]
  action_attack_results?: ActionAttackResult[]
  action_attack_result_dm_details?: ActionAttackResultDmDetail[]
  action_hp_effect_results?: ActionHpEffectResult[]
  pending_state_updates?: PendingStateUpdate[]
}

interface ActionCenterProps {
  campaignId: string
  isDM: boolean
  map: GameMap | null
  tokens: Token[]
  characters: Character[]
  intents: IntentDetails[]
  dmNotes: Record<string, string>
  attacks: CharacterAttack[]
  actionResults: ActionResult[]
  combatLogs: CombatLog[]
  currentUserId: string
  /** Intent ids with a recent player "Nudge DM" — DM cards highlight red. */
  nudgedIntentIds?: string[]
}

function statusVariant(status: string) {
  if (status === 'pending' || status === 'needs_roll' || status === 'approved_waiting_for_roll' || status === 'rolling') return 'warning'
  if (status === 'approved' || status === 'resolved') return 'success'
  return 'default'
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ')
}

function isFinalStatus(status: string) {
  return status === 'denied' || status === 'resolved' || status === 'cancelled'
}

function statusTone(status: string) {
  if (status === 'resolved' || status === 'approved') return 'border-emerald-700/60 bg-emerald-950/20'
  if (status === 'denied' || status === 'cancelled') return 'border-red-800/60 bg-red-950/20'
  if (status === 'rolled_waiting_for_dm' || status === 'resolving') return 'border-blue-700/60 bg-blue-950/20'
  return 'border-amber-800/60 bg-amber-950/20'
}

function actionTypeIcon(actionType: string) {
  if (actionType.toLowerCase().includes('attack')) return Swords
  if (actionType.toLowerCase().includes('roll')) return ShieldQuestion
  return MessageSquareText
}

function selectedToolPhrase(intent: IntentDetails) {
  const playerName = intent.actor_profile?.display_name ?? 'Player'
  const targetName = intent.target_token?.name || intent.target_token?.token_type || null
  const toolName = intent.selected_tool_name
  if (!toolName) return null
  if (intent.action_type === 'Attack') return `${playerName} wants to attack ${targetName ?? 'the target'} with ${toolName}.`
  if (intent.action_type === 'Use Item') return `${playerName} wants to use ${toolName}${targetName ? ` on ${targetName}` : ''}.`
  if (intent.action_type === 'Cast Spell') return `${playerName} wants to cast ${toolName}${targetName ? ` at ${targetName}` : ''}.`
  if (intent.action_type === 'Talk') return `${playerName} wants to talk to ${targetName ?? toolName}.`
  if (intent.action_type === 'Investigate') return `${playerName} wants to investigate ${toolName}.`
  if (intent.action_type === 'Interact') return `${playerName} wants to interact with ${toolName}.`
  return `${playerName} wants to ${intent.action_type.toLowerCase()}${targetName ? ` ${targetName}` : ''} with ${toolName}.`
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function latestRollRequest(intent: IntentDetails) {
  return [...(intent.action_roll_requests ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0] ?? null
}

function latestRollResult(intent: IntentDetails) {
  return [...(intent.action_roll_results ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0] ?? null
}

function pendingDecisionLabel(intent: IntentDetails) {
  const waitingRoll = intent.action_roll_requests?.find((request) => request.status === 'waiting_for_player')
  if (waitingRoll) return `Waiting for player roll: ${waitingRoll.label}`
  if (intent.status === 'rolled_waiting_for_dm') return 'Roll submitted. DM decision needed.'
  if (intent.status === 'approved' && intent.action_type === 'Attack') return 'Approved. Waiting for player attack roll.'
  if (intent.status === 'resolving') return 'Resolving action.'
  if (intent.pending_state_updates?.some((update) => update.status === 'pending_dm_review')) return 'Map update needs DM review.'
  return null
}

function formatModifier(value: number) {
  return value >= 0 ? `+${value}` : String(value)
}

function RollResultPanel({ result }: { result: ActionRollResult }) {
  const reducedMotion = usePrefersReducedMotion()
  const display = getRollOutcomeDisplay(getRollOutcomeVariant({
    resultValue: result.result,
    naturalRoll: result.used_natural_roll,
  }))

  return (
    <div className={`relative mt-3 overflow-hidden rounded-md border p-3 ${display.panelClass} ${
      display.shake && !reducedMotion ? 'roll-fx-shake-once' : ''
    }`}>
      <RollOutcomeEffects display={display} reducedMotion={reducedMotion} />
      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-zinc-200">Roll Result</p>
        <RollOutcomeBadge display={display} />
      </div>
      <div className="relative mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-300">
        <span>Mode: {result.roll_mode}</span>
        <span>Natural: {result.natural_roll}</span>
        {result.second_natural_roll !== null && <span>Second: {result.second_natural_roll}</span>}
        <span>Used: {result.used_natural_roll}</span>
        <span>Modifier: {formatModifier(result.modifier)}</span>
        <span>Total: {result.total}</span>
        {result.target_number !== null && <span>Target: {result.target_number}</span>}
        <span className="capitalize">Result: {result.result.replace(/_/g, ' ')}</span>
      </div>
      <p className="relative mt-2 text-[11px] text-zinc-500">
        Submitted: {new Date(result.created_at).toLocaleString()}
      </p>
    </div>
  )
}

function RollRequestSummary({ request }: { request: ActionRollRequest }) {
  const breakdown = request.modifier_breakdown ?? []
  const warnings = request.modifier_warnings ?? []

  return (
    <div className="mt-3 rounded-md border border-amber-800/60 bg-amber-950/30 p-3 text-xs text-amber-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">Roll requested. Waiting for player response.</span>
        <span>{formatModifier(request.modifier)}</span>
      </div>
      <p className="mt-1 text-amber-200/80">{request.label}</p>
      {breakdown.length > 0 && (
        <ul className="mt-2 list-disc pl-4 text-[11px] text-amber-100/75">
          {breakdown.map((line) => <li key={line}>{line}</li>)}
        </ul>
      )}
      {warnings.length > 0 && (
        <p className="mt-2 text-[11px] text-amber-200">{warnings.join(' ')}</p>
      )}
    </div>
  )
}

function AttackResultPanel({
  campaignId,
  result,
  detail,
  isDM,
}: {
  campaignId: string
  result: ActionAttackResult
  detail?: ActionAttackResultDmDetail
  isDM: boolean
}) {
  const [revealing, setRevealing] = useState(false)
  const reducedMotion = usePrefersReducedMotion()
  const display = getRollOutcomeDisplay(getRollOutcomeVariant({
    attackOutcome: result.outcome,
    naturalRoll: result.used_natural_roll,
  }))

  async function reveal() {
    setRevealing(true)
    await revealAttackResult(campaignId, result.id)
    setRevealing(false)
  }

  return (
    <div className={`relative mt-3 overflow-hidden rounded-md border p-3 ${display.panelClass} ${
      display.shake && !reducedMotion ? 'roll-fx-shake-once' : ''
    }`}>
      <RollOutcomeEffects display={display} reducedMotion={reducedMotion} />
      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-zinc-200">Attack Result</p>
        <RollOutcomeBadge display={display} />
      </div>
      {isDM && detail ? (
        <pre className="relative mt-2 whitespace-pre-wrap rounded-md border border-zinc-800 bg-zinc-950 p-2 text-[11px] leading-relaxed text-zinc-300">
          {detail.dm_summary}
        </pre>
      ) : (
        <p className={`relative mt-2 text-xs ${display.textClass}`}>{result.player_visible_summary}</p>
      )}
      <div className="relative mt-2 grid grid-cols-2 gap-2 text-[11px] text-zinc-500">
        <span>Weapon: {result.weapon_name}</span>
        <span>Total: {result.attack_total}</span>
        <span>Natural: {result.natural_roll}</span>
        <span>Modifier: {formatModifier(result.attack_modifier)}</span>
        {result.damage_total !== null && <span>Damage: {result.damage_total} {result.damage_type ?? ''}</span>}
        {result.damage_formula && <span>Formula: {result.damage_formula}</span>}
      </div>
      {isDM && !result.revealed_to_player && (
        <div className="mt-3">
          <Button size="sm" loading={revealing} onClick={reveal}>Reveal Result</Button>
        </div>
      )}
      {isDM && result.damage_total !== null && (
        <p className="mt-2 text-[11px] text-zinc-600">
          A pending HP update has been queued below and applies when you approve this rolled result.
        </p>
      )}
    </div>
  )
}

const TOKEN_UPDATE_TYPES = new Set(['damage_token', 'heal_token', 'set_token_state', 'set_object_state', 'reveal_object', 'set_awareness'])

function StateUpdateValue(value: unknown) {
  if (value === null || value === undefined) return 'unknown'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  return String(value)
}

/**
 * Phase 4: compact "Suggested Update" review card. Shown only to the DM —
 * pending_state_updates rows are DM-only via RLS, so players never see a
 * suggestion (hidden HP, AC, etc.) until the DM applies and the resulting
 * token/object change becomes visible through the normal tokens RLS rules.
 */
function SuggestedStateUpdatePanel({
  campaignId,
  update,
}: {
  campaignId: string
  update: PendingStateUpdate
}) {
  const [busy, setBusy] = useState<'apply' | 'reject' | null>(null)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const before = update.before ?? {}
  const after = update.after ?? {}
  const isDamage = update.update_type === 'damage_token'
  const isHealing = update.update_type === 'heal_token'
  const isObject = update.update_type === 'set_object_state' || update.update_type === 'reveal_object' || update.update_type === 'set_token_state'
  const isAwareness = update.update_type === 'set_awareness'

  const [editedHp, setEditedHp] = useState(() => StateUpdateValue(after.current_hp))
  const [editedDefeated, setEditedDefeated] = useState(() => Boolean(after.is_defeated))
  const [editedObjectState, setEditedObjectState] = useState(() => StateUpdateValue(after.object_state))

  async function apply(overrides?: Record<string, unknown>) {
    setBusy('apply')
    setError(null)
    const result = await applyPendingStateUpdate(campaignId, update.id, overrides ? { after: overrides } : undefined)
    if (result && 'error' in result && result.error) setError(result.error)
    setBusy(null)
    setEditing(false)
  }

  async function reject() {
    setBusy('reject')
    setError(null)
    const result = await rejectPendingStateUpdate(campaignId, update.id)
    if (result && 'error' in result && result.error) setError(result.error)
    setBusy(null)
  }

  if (update.status !== 'pending_dm_review') {
    return (
      <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-zinc-400">Map Update</p>
          <Badge variant={update.status === 'applied' ? 'success' : 'default'}>
            {update.status === 'applied' ? 'Applied' : 'Rejected'}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-zinc-500">{update.summary}</p>
        {update.status === 'applied' && update.applied_at && (
          <p className="mt-1 text-[11px] text-zinc-600">
            Applied {new Date(update.applied_at).toLocaleString()} — audit trail recorded.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-md border border-amber-800/60 bg-amber-950/20 p-3">
      <p className="text-xs font-medium text-amber-200">
        {isDamage || isHealing ? 'Pending HP Update' : `Suggested ${isAwareness ? 'Awareness' : 'Object'} Update`}
      </p>
      <p className="mt-1 text-xs text-amber-100">{update.summary}</p>
      <div className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-zinc-400 sm:grid-cols-2">
        {(isDamage || isHealing) && (
          <span>
            {update.target_name ?? 'Token'} HP: {StateUpdateValue(before.current_hp)} -&gt; {StateUpdateValue(after.current_hp)}
          </span>
        )}
        {isDamage && Boolean(after.is_defeated) && !before.is_defeated && <span>State: defeated</span>}
        {isObject && (
          <span>
            {update.target_name ?? 'Object'}: {StateUpdateValue(before.object_state)} -&gt; {StateUpdateValue(after.object_state)}
          </span>
        )}
        {isAwareness && (
          <span>
            Awareness: {StateUpdateValue(before.awareness)} -&gt; {StateUpdateValue(after.awareness)}
          </span>
        )}
      </div>

      {(isDamage || isHealing) ? (
        <p className="mt-3 rounded-md border border-amber-700/50 bg-zinc-950 px-2 py-1.5 text-[11px] text-amber-100">
          This HP change applies automatically when you approve the rolled result.
        </p>
      ) : editing ? (
        <div className="mt-3 grid gap-2 rounded-md border border-zinc-800 bg-zinc-950 p-2">
          {isDamage && (
            <>
              <label className="text-[11px] text-zinc-500">
                New HP
                <input
                  type="number"
                  value={editedHp}
                  onChange={(event) => setEditedHp(event.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                />
              </label>
              <Checkbox
                label="Mark defeated"
                checked={editedDefeated}
                onChange={(event) => setEditedDefeated(event.target.checked)}
              />
            </>
          )}
          {isObject && (
            <label className="text-[11px] text-zinc-500">
              New object state
              <input
                type="text"
                value={editedObjectState}
                onChange={(event) => setEditedObjectState(event.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
              />
            </label>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              loading={busy === 'apply'}
              onClick={() => {
                const overrides: Record<string, unknown> = {}
                if (isDamage) {
                  const parsed = Number(editedHp)
                  if (Number.isFinite(parsed)) overrides.current_hp = Math.max(0, Math.round(parsed))
                  overrides.is_defeated = editedDefeated
                }
                if (isObject && editedObjectState.trim() && editedObjectState !== 'unknown') {
                  overrides.object_state = editedObjectState.trim()
                }
                apply(Object.keys(overrides).length ? overrides : undefined)
              }}
            >
              Apply Edited Update
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button size="sm" loading={busy === 'apply'} onClick={() => apply()}>Apply Update</Button>
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit Before Applying</Button>
          <Button size="sm" variant="danger" loading={busy === 'reject'} onClick={reject}>Reject Update</Button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {!TOKEN_UPDATE_TYPES.has(update.update_type) && (
        <p className="mt-2 text-[11px] text-zinc-600">
          Custom updates are recorded for audit only and do not automatically change token/object state.
        </p>
      )}
    </div>
  )
}

function HpEffectResultPanel({ result }: { result: ActionHpEffectResult }) {
  return (
    <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-zinc-200">
          {result.effect_kind === 'healing' ? 'Healing Result' : 'Damage Result'}
        </p>
        <Badge variant={result.effect_kind === 'healing' ? 'success' : 'default'}>
          {result.total}
        </Badge>
      </div>
      <p className="mt-2 text-xs text-zinc-300">{result.player_visible_summary}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-zinc-500">
        <span>Formula: {result.formula}</span>
        <span>Roll: {result.dice_rolled.join(', ') || '-'}</span>
      </div>
    </div>
  )
}

export function ActionCenter({
  campaignId,
  intents,
  dmNotes,
  actionResults,
  combatLogs,
  nudgedIntentIds = [],
}: ActionCenterProps) {
  // Live sync: re-fetch (RLS-scoped) action data whenever a relevant row
  // changes — covers a player submitting/rolling, the DM responding, object
  // state changes after resolution, and HP/condition changes. This page is now
  // DM-only (players use the live-map guided action flow).
  useRealtimeRefresh(`actions-${campaignId}`, [
    { table: 'action_intents', filter: `campaign_id=eq.${campaignId}` },
    { table: 'action_roll_requests', filter: `campaign_id=eq.${campaignId}` },
    { table: 'action_roll_results', filter: `campaign_id=eq.${campaignId}` },
    { table: 'action_attack_results', filter: `campaign_id=eq.${campaignId}` },
    { table: 'action_attack_result_dm_details', filter: `campaign_id=eq.${campaignId}` },
    { table: 'pending_state_updates', filter: `campaign_id=eq.${campaignId}` },
    { table: 'action_results', filter: `campaign_id=eq.${campaignId}` },
    { table: 'combat_logs', filter: `campaign_id=eq.${campaignId}` },
    { table: 'character_attacks' },
    { table: 'tokens', filter: `campaign_id=eq.${campaignId}` },
    { table: 'characters', filter: `campaign_id=eq.${campaignId}` },
    { table: 'character_conditions' },
    // New nudges re-derive the red card highlight on the server.
    { table: 'party_messages', filter: `campaign_id=eq.${campaignId}` },
  ])

  return (
    <DMActionQueue
      campaignId={campaignId}
      intents={intents}
      dmNotes={dmNotes}
      actionResults={actionResults}
      combatLogs={combatLogs}
      nudgedIntentIds={nudgedIntentIds}
    />
  )
}

const PHASE_STEPS = ['Request', 'Roll', 'Review', 'Resolved'] as const

/**
 * The synchronized action phase, mirroring the player's request → roll →
 * review → resolved flow (NOT an order/tracker layout). Lets the DM see exactly
 * which phase the player is in and who the action is waiting on.
 */
function actionPhase(intent: IntentDetails): {
  step: number
  label: string
  waitingOn: 'dm' | 'player' | 'none'
  ended: boolean
} {
  switch (intent.status) {
    case 'denied':
      return { step: 0, label: 'Denied by DM.', waitingOn: 'none', ended: true }
    case 'cancelled':
      return { step: 0, label: 'Cancelled.', waitingOn: 'none', ended: true }
    case 'resolved':
      return { step: 3, label: 'Resolved and revealed to the player.', waitingOn: 'none', ended: false }
    case 'resolving':
      return { step: 2, label: 'Resolving the action.', waitingOn: 'dm', ended: false }
    case 'rolled_waiting_for_dm':
      return { step: 2, label: 'Roll submitted — review the outcome.', waitingOn: 'dm', ended: false }
    case 'rolling':
      return { step: 1, label: 'Player is rolling…', waitingOn: 'player', ended: false }
    case 'needs_roll':
    case 'approved_waiting_for_roll':
      return { step: 1, label: 'Roll requested — waiting for the player.', waitingOn: 'player', ended: false }
    case 'approved':
      return intent.action_type === 'Attack'
        ? { step: 1, label: 'Approved — waiting for the player attack roll.', waitingOn: 'player', ended: false }
        : { step: 3, label: 'Approved.', waitingOn: 'none', ended: false }
    default:
      return { step: 0, label: 'New request — waiting for your decision.', waitingOn: 'dm', ended: false }
  }
}

function ActionPhaseStrip({ intent }: { intent: IntentDetails }) {
  const phase = actionPhase(intent)
  return (
    <div className="mb-3 rounded-md border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Action phase (synced with player)
        </p>
        {phase.waitingOn !== 'none' && !phase.ended && (
          <span
            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
              phase.waitingOn === 'dm'
                ? 'border-amber-800/60 bg-amber-950/40 text-amber-300'
                : 'border-blue-800/60 bg-blue-950/40 text-blue-300'
            }`}
          >
            {phase.waitingOn === 'dm' ? 'Waiting on you' : 'Waiting on player'}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        {PHASE_STEPS.map((stepLabel, index) => {
          const active = index === phase.step && !phase.ended
          const done = index < phase.step && !phase.ended
          return (
            <div
              key={stepLabel}
              className={`flex-1 rounded-full px-2 py-1 text-center text-[10px] font-medium ${
                phase.ended
                  ? 'bg-zinc-900 text-zinc-600'
                  : active
                    ? 'border border-amber-500/40 bg-amber-500/20 text-amber-200'
                    : done
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-zinc-900 text-zinc-600'
              }`}
            >
              {stepLabel}
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-zinc-400">{phase.label}</p>
    </div>
  )
}

function DMActionQueue({
  campaignId,
  intents,
  dmNotes,
  actionResults,
  combatLogs,
  nudgedIntentIds,
}: {
  campaignId: string
  intents: IntentDetails[]
  dmNotes: Record<string, string>
  actionResults: ActionResult[]
  combatLogs: CombatLog[]
  nudgedIntentIds: string[]
}) {
  const firstActiveIntent = intents.find((intent) => !isFinalStatus(intent.status)) ?? intents[0] ?? null
  const [expandedIntentId, setExpandedIntentId] = useState<string | null>(firstActiveIntent?.id ?? null)
  const [clearedAfter, setClearedAfter] = useState<number | null>(null)
  // Nudge highlight clears (locally) once the DM opens or acts on a card. New
  // nudges re-derive server-side via the party_messages realtime subscription.
  const [dismissedNudges, setDismissedNudges] = useState<Record<string, true>>({})
  const nudgedSet = useMemo(() => new Set(nudgedIntentIds), [nudgedIntentIds])
  const dismissNudge = (intentId: string) => {
    setDismissedNudges((prev) => (prev[intentId] ? prev : { ...prev, [intentId]: true }))
    // Durably acknowledge so the red highlight doesn't resurrect after a
    // refresh. Only fire for genuinely-nudged cards, and clear by sender (the
    // highlight is sender-scoped). Fire-and-forget; degrades quietly if the
    // handled_at migration isn't applied yet.
    if (!nudgedSet.has(intentId)) return
    const intent = intents.find((i) => i.id === intentId)
    if (intent?.actor_user_id) {
      void acknowledgeActionNudge(campaignId, intent.id)
    }
  }
  const isNudged = (intent: IntentDetails) =>
    nudgedSet.has(intent.id) && !dismissedNudges[intent.id] && !isFinalStatus(intent.status)
  const openCard = (intentId: string | null) => {
    setExpandedIntentId(intentId)
    if (intentId) dismissNudge(intentId)
  }
  const filteredIntents = clearedAfter
    ? intents.filter((intent) => new Date(intent.created_at).getTime() > clearedAfter)
    : intents
  // Newest card at the BOTTOM of the stack (intents arrive newest-first).
  const visibleIntents = [...filteredIntents].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )
  const nudgedCount = visibleIntents.filter((intent) => isNudged(intent)).length
  const visibleActionResults = clearedAfter
    ? actionResults.filter((result) => new Date(result.created_at).getTime() > clearedAfter)
    : actionResults
  const visibleCombatLogs = clearedAfter
    ? combatLogs.filter((log) => new Date(log.created_at).getTime() > clearedAfter)
    : combatLogs
  const openCount = visibleIntents.filter((intent) => !isFinalStatus(intent.status)).length
  const waitingForDmCount = visibleIntents.filter((intent) =>
    intent.status === 'pending' || intent.status === 'rolled_waiting_for_dm',
  ).length

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Action Queue</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Review player intent and decide what happens at the table.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-300">
            {openCount} active
          </span>
          <span className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-300">
            {waitingForDmCount} need DM
          </span>
          {nudgedCount > 0 && (
            <span className="rounded-md border border-red-700/70 bg-red-950/40 px-3 py-2 font-medium text-red-300">
              {nudgedCount} nudged
            </span>
          )}
          <ClearActionBoardButton
            campaignId={campaignId}
            count={visibleIntents.length}
            disabled={visibleIntents.length === 0}
            size="sm"
            onCleared={() => {
              setClearedAfter(Date.now())
              setExpandedIntentId(null)
            }}
          />
        </div>
      </div>

      {visibleIntents.length === 0 ? (
        <EmptyActionState title="No action requests" detail="Player intents will appear here." />
      ) : (
        <div className="flex flex-col gap-3">
          {visibleIntents.map((intent) => {
            const expanded = expandedIntentId === intent.id
            const Icon = actionTypeIcon(intent.action_type)
            const pendingLabel = pendingDecisionLabel(intent)
            const waitingRoll = latestRollRequest(intent)
            const submittedRoll = latestRollResult(intent)
            const toolPhrase = selectedToolPhrase(intent)
            const nudged = isNudged(intent)

            return (
              <article
                key={intent.id}
                className={`rounded-lg border bg-zinc-900/80 shadow-sm transition-colors ${
                  nudged
                    ? 'action-nudge-highlight'
                    : expanded
                      ? 'border-amber-500/50'
                      : 'border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <button
                  type="button"
                  onClick={() => openCard(expanded ? null : intent.id)}
                  className="grid w-full grid-cols-1 gap-3 px-4 py-3 text-left transition hover:bg-zinc-800/35 md:grid-cols-[minmax(0,1.35fr)_minmax(11rem,0.55fr)_minmax(10rem,0.5fr)_auto]"
                  aria-expanded={expanded}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${statusTone(intent.status)}`}>
                      <Icon className="h-4 w-4 text-zinc-100" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold text-zinc-100">{intent.action_type}</h2>
                        <Badge variant={statusVariant(intent.status)} className="capitalize">{statusLabel(intent.status)}</Badge>
                        {nudged && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-red-600 bg-red-950/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-300">
                            <CircleAlert className="h-3 w-3" aria-hidden="true" />
                            Nudged
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        {intent.actor_profile?.display_name ?? 'Player'}
                        {intent.actor_character?.name ? ` / ${intent.actor_character.name}` : ''}
                      </p>
                      {intent.message && (
                        <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{intent.message}</p>
                      )}
                      {toolPhrase && (
                        <p className="mt-1 line-clamp-2 text-xs font-medium text-amber-200">{toolPhrase}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs md:block">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-zinc-600">Target</p>
                      <p className="mt-0.5 text-zinc-300">
                        {intent.target_token?.name || intent.target_token?.token_type || 'None'}
                      </p>
                    </div>
                    <div className="md:mt-2">
                      <p className="text-[10px] uppercase tracking-wide text-zinc-600">Range</p>
                      <p className="mt-0.5 text-zinc-400">{intent.distance_feet ?? '-'} ft / {intent.range_feet ?? '-'} ft</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs md:block">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-zinc-600">Received</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-zinc-400">
                        <Clock3 className="h-3 w-3" aria-hidden="true" />
                        {formatDateTime(intent.created_at)}
                      </p>
                    </div>
                    <div className="md:mt-2">
                      <p className="text-[10px] uppercase tracking-wide text-zinc-600">Roll state</p>
                      <p className="mt-0.5 text-zinc-400">
                        {submittedRoll
                          ? `${submittedRoll.total} (${submittedRoll.result.replace(/_/g, ' ')})`
                          : waitingRoll
                            ? waitingRoll.label
                            : pendingLabel ?? 'No roll pending'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 md:justify-end">
                    {pendingLabel && (
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-800/60 bg-amber-950/25 px-2 py-1 text-[11px] text-amber-200">
                        <CircleAlert className="h-3 w-3" aria-hidden="true" />
                        Attention
                      </span>
                    )}
                    {isFinalStatus(intent.status) && (
                      <CheckCircle2 className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                    )}
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${expanded ? 'rotate-180 text-amber-300' : ''}`}
                      aria-hidden="true"
                    />
                  </div>
                </button>

                <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                  <div className="overflow-hidden">
                    <div className="border-t border-zinc-800 px-4 pb-4 pt-3">
                      <ActionPhaseStrip intent={intent} />

                      {pendingLabel && (
                        <p className="mb-3 rounded-md border border-amber-800/60 bg-amber-950/25 px-3 py-2 text-xs text-amber-100">
                          {pendingLabel}
                        </p>
                      )}

                      {intent.target_token && (
                        <div className="mb-3 grid gap-2 rounded-md border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-400 sm:grid-cols-3">
                          <span>Target: {intent.target_token.name || intent.target_token.token_type}</span>
                          <span>{intent.selected_tool_type ?? 'Tool'}: {intent.selected_tool_name ?? 'None selected'}</span>
                          <span>HP {intent.target_token.current_hp}/{intent.target_token.max_hp}{intent.target_token.temp_hp > 0 ? ` +${intent.target_token.temp_hp} temp` : ''}</span>
                          <span>AC {intent.target_token.armor_class}{intent.target_token.is_defeated ? ' / defeated' : ''}</span>
                        </div>
                      )}

                      {toolPhrase && (
                        <p className="mb-3 rounded-md border border-amber-800/50 bg-amber-950/20 p-3 text-sm text-amber-100">
                          {toolPhrase}
                        </p>
                      )}

                      {intent.message && (
                        <p className="mb-3 rounded-md border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-300">
                          {intent.message}
                        </p>
                      )}

                      {intent.action_results?.length ? (
                        <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950 p-3">
                          <p className="mb-2 text-xs font-medium text-zinc-400">Results</p>
                          {intent.action_results.map((result) => (
                            <p key={result.id} className="text-xs text-emerald-200">
                              {result.result_summary}
                            </p>
                          ))}
                        </div>
                      ) : null}

                      {intent.action_roll_requests
                        ?.filter((request) => request.status === 'waiting_for_player')
                        .map((request) => <RollRequestSummary key={request.id} request={request} />)}

                      {intent.action_roll_results?.map((result) => (
                        <RollResultPanel key={result.id} result={result} />
                      ))}

                      {intent.action_attack_results?.map((result) => (
                        <AttackResultPanel
                          key={result.id}
                          campaignId={campaignId}
                          result={result}
                          detail={intent.action_attack_result_dm_details?.find((detail) => detail.attack_result_id === result.id)}
                          isDM
                        />
                      ))}

                      {intent.action_hp_effect_results?.map((result) => (
                        <HpEffectResultPanel key={result.id} result={result} />
                      ))}

                      {intent.pending_state_updates?.map((update) => (
                        <SuggestedStateUpdatePanel key={update.id} campaignId={campaignId} update={update} />
                      ))}

                      <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
                        <ActionQueueDmControls
                          campaignId={campaignId}
                          intentId={intent.id}
                          status={intent.status}
                          initialDmResponse={intent.dm_response}
                          initialDmNote={dmNotes[intent.id] ?? ''}
                          selectedToolType={intent.selected_tool_type}
                          selectedToolId={intent.selected_tool_id}
                          selectedToolName={intent.selected_tool_name}
                          hasRollResult={Boolean(submittedRoll) || (intent.action_attack_results?.length ?? 0) > 0 || (intent.action_hp_effect_results?.length ?? 0) > 0}
                          compact
                          onActionComplete={() => dismissNudge(intent.id)}
                        />
                      </div>
                      {intent.action_type === 'Attack' && intent.status === 'approved' && (
                        <p className="mt-2 text-xs text-amber-200">
                          Waiting for the player to choose an attack option and roll. No second DM approval is required.
                        </p>
                      )}
                      <p className="mt-2 text-[11px] text-zinc-600">
                        Approve resolves the request and reveals your response to the player. Rolled damage or healing applies its pending HP update at the same time.
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
      {(visibleActionResults.length > 0 || visibleCombatLogs.length > 0) && (
        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-sm font-semibold text-zinc-200">Recent Action Log</h2>
          <div className="mt-3 grid gap-2">
            {visibleActionResults.slice(0, 8).map((result) => (
              <div key={result.id} className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
                <p className="text-xs text-zinc-500">{result.action_type} / {result.result_type}</p>
                <p className="text-sm text-zinc-300">{result.result_summary}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function EmptyActionState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-900 p-8 text-center">
      <h2 className="font-semibold text-zinc-200">{title}</h2>
      <p className="text-sm text-zinc-500 mt-1">{detail}</p>
    </div>
  )
}
