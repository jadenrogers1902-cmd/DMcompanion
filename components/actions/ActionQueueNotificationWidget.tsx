'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ActionQueueDmControls } from './ActionQueueDmControls'
import { ClearActionBoardButton } from './ClearActionBoardButton'
import { applyPendingStateUpdate, rejectPendingStateUpdate } from '@/lib/actions/state-updates'
import type { ActionAttackResult, ActionIntent, ActionIntentStatus, ActionRollResult, Character, GameMap, PendingStateUpdate, Profile, Token } from '@/lib/types/database'

type NotificationItem = {
  id: string
  actionType: string
  playerName?: string
  characterName?: string
  targetName?: string
  selectedToolType?: string | null
  selectedToolName?: string | null
  locationName?: string
  summary: string
  message?: string
  status: ActionIntentStatus
  dmResponse?: string | null
  dmOnlyNote?: string | null
  rollResult?: ActionRollResult | null
  attackResult?: ActionAttackResult | null
  pendingUpdate?: PendingStateUpdate | null
  createdAt: string
}

/** Compact "Suggested Update" card for the global DM popup (Phase 4). */
function PendingUpdateMiniCard({ campaignId, update, onChanged }: { campaignId: string; update: PendingStateUpdate; onChanged: () => void }) {
  const [busy, setBusy] = useState<'apply' | 'reject' | null>(null)

  if (update.status !== 'pending_dm_review') {
    return (
      <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs text-zinc-400">
        Map update {update.status === 'applied' ? 'applied' : 'rejected'}: {update.summary}
      </div>
    )
  }

  return (
    <div className="mt-2 rounded-md border border-amber-800/60 bg-amber-950/20 px-2.5 py-2 text-xs text-amber-100">
      <p className="font-medium text-amber-200">Suggested Update</p>
      <p className="mt-1">{update.summary}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={async () => {
            setBusy('apply')
            await applyPendingStateUpdate(campaignId, update.id)
            setBusy(null)
            onChanged()
          }}
          className="rounded-md bg-amber-500 px-2 py-1 text-[11px] font-semibold text-zinc-950 transition hover:bg-amber-400 disabled:opacity-60"
        >
          {busy === 'apply' ? 'Applying…' : 'Apply Update'}
        </button>
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={async () => {
            setBusy('reject')
            await rejectPendingStateUpdate(campaignId, update.id)
            setBusy(null)
            onChanged()
          }}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] font-semibold text-zinc-200 transition hover:border-red-500/60 hover:text-red-300 disabled:opacity-60"
        >
          {busy === 'reject' ? 'Rejecting…' : 'Reject Update'}
        </button>
      </div>
      <p className="mt-1.5 text-[10px] text-amber-200/70">Open the full Action Queue to edit values before applying.</p>
    </div>
  )
}

const QUEUED_STATUSES: ActionIntentStatus[] = [
  'pending',
  'needs_roll',
  'approved',
  'approved_waiting_for_roll',
  'rolling',
  'rolled_waiting_for_dm',
  'resolving',
]

function campaignIdFromPath(pathname: string) {
  const match = pathname.match(/^\/campaigns\/([^/]+)/)
  return match?.[1] && match[1] !== 'new' ? match[1] : null
}

function timeAgo(value: string) {
  const elapsed = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(elapsed) || elapsed < 0) return 'Just now'
  const minutes = Math.floor(elapsed / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ')
}

function buildSummary(item: Omit<NotificationItem, 'summary'>) {
  const actor = item.characterName ?? item.playerName ?? 'A player'
  const action = item.actionType.toLowerCase()
  const target = item.targetName ? ` ${item.targetName}` : ''
  if (item.selectedToolName) {
    if (item.actionType === 'Attack') return `${actor} wants to attack${target} with ${item.selectedToolName}`
    if (item.actionType === 'Cast Spell') return `${actor} wants to cast ${item.selectedToolName}${item.targetName ? ` at ${item.targetName}` : ''}`
    if (item.actionType === 'Use Item') return `${actor} wants to use ${item.selectedToolName}${item.targetName ? ` on ${item.targetName}` : ''}`
    return `${actor} wants to ${action}${target} with ${item.selectedToolName}`
  }
  return `${actor} wants to ${action}${target}`
}

export function ActionQueueNotificationWidget({ userId }: { userId: string }) {
  const pathname = usePathname()
  const campaignId = useMemo(() => campaignIdFromPath(pathname), [pathname])
  const [isDM, setIsDM] = useState(false)
  const [latest, setLatest] = useState<NotificationItem | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [dismissedIds, setDismissedIds] = useState<string[]>([])
  const [realtimeReady, setRealtimeReady] = useState(true)
  const [dmActionsOpen, setDmActionsOpen] = useState(false)
  const widgetRef = useRef<HTMLElement>(null)

  const storageKey = campaignId ? `latest-action-dismissed:${campaignId}` : null

  useEffect(() => {
    if (!storageKey) {
      queueMicrotask(() => setDismissedIds([]))
      return
    }

    queueMicrotask(() => {
      try {
        const stored = sessionStorage.getItem(storageKey)
        setDismissedIds(stored ? (JSON.parse(stored) as string[]) : [])
      } catch {
        setDismissedIds([])
      }
    })
  }, [storageKey])

  const loadLatest = useCallback(async () => {
    if (!campaignId) {
      setIsDM(false)
      setLatest(null)
      setPendingCount(0)
      setTotalCount(0)
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
    if (!dm) {
      setLatest(null)
      setPendingCount(0)
      setTotalCount(0)
      return
    }

    const [{ data: latestIntent }, { count }, { count: boardCount }] = await Promise.all([
      supabase
        .from('action_intents')
        .select('*')
        .eq('campaign_id', campaignId)
        .in('status', QUEUED_STATUSES)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('action_intents')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .in('status', QUEUED_STATUSES),
      supabase
        .from('action_intents')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId),
    ])

    setPendingCount(count ?? 0)
    setTotalCount(boardCount ?? 0)

    const intent = (latestIntent ?? null) as ActionIntent | null
    if (!intent) {
      setLatest(null)
      return
    }

    const [
      { data: character },
      { data: target },
      { data: profile },
      { data: map },
      { data: dmNote },
      { data: rollResult },
      { data: attackResult },
      { data: pendingUpdate },
    ] = await Promise.all([
      supabase
        .from('characters')
        .select('id, name, user_id')
        .eq('id', intent.actor_character_id)
        .maybeSingle(),
      supabase
        .from('tokens')
        .select('id, name, token_type')
        .eq('id', intent.target_token_id)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('id, display_name')
        .eq('id', intent.actor_user_id)
        .maybeSingle(),
      supabase
        .from('maps')
        .select('id, name')
        .eq('id', intent.map_id)
        .maybeSingle(),
      supabase
        .from('action_intent_dm_notes')
        .select('content')
        .eq('intent_id', intent.id)
        .maybeSingle(),
      supabase
        .from('action_roll_results')
        .select('*')
        .eq('action_intent_id', intent.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('action_attack_results')
        .select('*')
        .eq('action_intent_id', intent.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('pending_state_updates')
        .select('*')
        .eq('action_intent_id', intent.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    const itemBase = {
      id: intent.id,
      actionType: intent.action_type,
      playerName: ((profile ?? null) as Pick<Profile, 'id' | 'display_name'> | null)?.display_name ?? undefined,
      characterName: ((character ?? null) as Pick<Character, 'id' | 'name' | 'user_id'> | null)?.name ?? undefined,
      targetName:
        ((target ?? null) as Pick<Token, 'id' | 'name' | 'token_type'> | null)?.name ??
        ((target ?? null) as Pick<Token, 'id' | 'name' | 'token_type'> | null)?.token_type ??
        undefined,
      locationName: ((map ?? null) as Pick<GameMap, 'id' | 'name'> | null)?.name ?? undefined,
      message: intent.message ?? undefined,
      selectedToolType: intent.selected_tool_type,
      selectedToolName: intent.selected_tool_name,
      status: intent.status,
      dmResponse: intent.dm_response,
      dmOnlyNote: (dmNote as { content?: string | null } | null)?.content ?? null,
      rollResult: (rollResult ?? null) as ActionRollResult | null,
      attackResult: (attackResult ?? null) as ActionAttackResult | null,
      pendingUpdate: (pendingUpdate ?? null) as PendingStateUpdate | null,
      createdAt: intent.created_at,
    }

    setLatest({
      ...itemBase,
      summary: buildSummary(itemBase),
    })
  }, [campaignId, userId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadLatest()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadLatest])

  useEffect(() => {
    if (!campaignId || !isDM) return

    const supabase = createClient()
    const channel = supabase
      .channel(`global-action-queue-${campaignId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'action_intents',
          filter: `campaign_id=eq.${campaignId}`,
        },
        () => {
          setRealtimeReady(true)
          void loadLatest()
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'action_roll_results',
          filter: `campaign_id=eq.${campaignId}`,
        },
        () => {
          setRealtimeReady(true)
          void loadLatest()
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'action_attack_results',
          filter: `campaign_id=eq.${campaignId}`,
        },
        () => {
          setRealtimeReady(true)
          void loadLatest()
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pending_state_updates',
          filter: `campaign_id=eq.${campaignId}`,
        },
        () => {
          setRealtimeReady(true)
          void loadLatest()
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeReady(true)
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRealtimeReady(false)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [campaignId, isDM, loadLatest])

  useEffect(() => {
    if (!dmActionsOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (widgetRef.current?.contains(event.target as Node)) return
      setDmActionsOpen(false)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [dmActionsOpen])

  useEffect(() => {
    if (!campaignId || !isDM || realtimeReady) return
    const interval = window.setInterval(() => {
      void loadLatest()
    }, 30000)
    return () => window.clearInterval(interval)
  }, [campaignId, isDM, loadLatest, realtimeReady])

  function dismiss() {
    if (!latest || !storageKey) return
    const next = [...new Set([...dismissedIds, latest.id])].slice(-25)
    setDismissedIds(next)
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      // Session storage is only UI memory; failing to write it should not break the widget.
    }
  }

  if (!campaignId || !isDM || !latest || dismissedIds.includes(latest.id)) {
    return null
  }

  return (
    <aside
      ref={widgetRef}
      className="fixed inset-x-3 bottom-24 z-40 mx-auto max-w-sm rounded-xl border border-amber-500/30 bg-zinc-950 p-3 shadow-2xl shadow-black/40 animate-in fade-in slide-in-from-bottom-2 md:inset-x-auto md:bottom-5 md:left-[16.5rem] md:mx-0 md:w-80"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.85)]" />
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">
              New Player Action
            </p>
            {pendingCount > 1 && (
              <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">
                {pendingCount}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm font-medium leading-snug text-zinc-100">
            {latest.summary}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-md px-1.5 py-1 text-xs text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-200"
          aria-label="Dismiss latest action notification"
        >
          Close
        </button>
      </div>

      {latest.message && (
        <p className="mt-2 line-clamp-2 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs text-zinc-300">
          {latest.message}
        </p>
      )}

      {latest.rollResult && (
        <div className="mt-2 rounded-md border border-emerald-800/60 bg-emerald-950/20 px-2.5 py-2 text-xs text-emerald-100">
          <p className="font-medium">Roll submitted: {latest.rollResult.total}</p>
          <p className="mt-1 text-emerald-200/80">
            Natural {latest.rollResult.used_natural_roll} {latest.rollResult.modifier >= 0 ? '+' : ''}
            {latest.rollResult.modifier} / {latest.rollResult.result.replace(/_/g, ' ')}
          </p>
        </div>
      )}

      {latest.attackResult && (
        <div className="mt-2 rounded-md border border-emerald-800/60 bg-emerald-950/20 px-2.5 py-2 text-xs text-emerald-100">
          <p className="font-medium">Attack: {latest.attackResult.outcome.replace(/_/g, ' ')}</p>
          <p className="mt-1 text-emerald-200/80">
            Total {latest.attackResult.attack_total}
            {latest.attackResult.damage_total !== null
              ? ` / ${latest.attackResult.damage_total} ${latest.attackResult.damage_type ?? 'damage'}`
              : ''}
          </p>
        </div>
      )}

      {latest.pendingUpdate && (
        <PendingUpdateMiniCard campaignId={campaignId} update={latest.pendingUpdate} onChanged={() => void loadLatest()} />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
        {latest.playerName && <span>{latest.playerName}</span>}
        {latest.locationName && <span>Location: {latest.locationName}</span>}
        <span>{statusLabel(latest.status)}</span>
        <span>{timeAgo(latest.createdAt)}</span>
        {!realtimeReady && <span>Polling</span>}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setDmActionsOpen((open) => !open)}
          className="inline-flex items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-zinc-100 transition hover:border-amber-500/60 hover:text-amber-200"
        >
          DM Actions
        </button>
        <Link
          href={`/campaigns/${campaignId}/actions`}
          className="inline-flex items-center justify-center rounded-md bg-amber-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400"
        >
          View Action Queue
        </Link>
        <ClearActionBoardButton
          campaignId={campaignId}
          count={totalCount}
          disabled={totalCount === 0}
          size="sm"
          className="sm:col-span-2"
          onCleared={() => {
            setLatest(null)
            setPendingCount(0)
            setTotalCount(0)
            setDismissedIds([])
            setDmActionsOpen(false)
          }}
        />
      </div>

      {dmActionsOpen && (
        <div className="absolute inset-x-0 bottom-[calc(100%+0.5rem)] rounded-xl border border-zinc-700 bg-zinc-950 p-3 shadow-2xl shadow-black/50 animate-in fade-in slide-in-from-bottom-1 md:left-0 md:right-auto md:w-[22rem]">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">DM Actions</h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                {latest.actionType} / {statusLabel(latest.status)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDmActionsOpen(false)}
              className="rounded-md px-1.5 py-1 text-xs text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-200"
            >
              Close
            </button>
          </div>
          <ActionQueueDmControls
            campaignId={campaignId}
            intentId={latest.id}
            status={latest.status}
            initialDmResponse={latest.dmResponse}
            initialDmNote={latest.dmOnlyNote}
            selectedToolType={latest.selectedToolType}
            selectedToolName={latest.selectedToolName}
            compact
            onActionComplete={() => {
              setDmActionsOpen(false)
              void loadLatest()
            }}
          />
        </div>
      )}
    </aside>
  )
}
