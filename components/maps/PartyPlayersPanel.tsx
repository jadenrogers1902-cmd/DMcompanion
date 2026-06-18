'use client'

import { useState } from 'react'
import { Crosshair, Lock, RotateCcw, Swords, Unlock, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { CodexPlayer } from '@/lib/actions/codex'
import type { MapTravelParty, MapTravelPartyMember, TravelMode, Token } from '@/lib/types/database'

type PanelTab = 'travel' | 'players'

interface PartyPlayersPanelProps {
  open: boolean
  onToggle: () => void
  busy: boolean
  feedback: string | null
  // Travel / party
  travelMode: TravelMode
  partyOptionsLocked: boolean
  groupMovementUnlimited: boolean
  freeroamMovementUnlimited: boolean
  parties: MapTravelParty[]
  members: MapTravelPartyMember[]
  players: CodexPlayer[]
  onUpdate: (input: {
    travelMode?: TravelMode
    partyOptionsLocked?: boolean
    groupMovementUnlimited?: boolean
    freeroamMovementUnlimited?: boolean
  }) => void
  onReviewParty: (partyId: string, approved: boolean) => void
  // Player roster
  tokens: Token[]
  selectedTokenId: string | null
  onFocusToken: (id: string) => void
  onToggleTokenLock: (id: string, next: boolean) => void
  onResetMovement: (id: string) => void
  onResetPosition: (id: string) => void
}

/**
 * Toggleable DM overlay for party + player management on the live map. Opens as
 * a clean card anchored to the LEFT of the map (the open margin beside the
 * board), with two tabs: Travel & Party (modes, movement rules, party
 * approvals) and Players (per-player token roster with HP, movement state, and
 * quick controls). Toggled by the party bubble bottom-left.
 */
export function PartyPlayersPanel({
  open,
  onToggle,
  busy,
  feedback,
  travelMode,
  partyOptionsLocked,
  groupMovementUnlimited,
  freeroamMovementUnlimited,
  parties,
  members,
  players,
  onUpdate,
  onReviewParty,
  tokens,
  selectedTokenId,
  onFocusToken,
  onToggleTokenLock,
  onResetMovement,
  onResetPosition,
}: PartyPlayersPanelProps) {
  const [tab, setTab] = useState<PanelTab>('travel')

  const pendingParties = parties.filter((party) => party.status === 'pending_dm')
  const activeParty = parties.find((party) => party.status === 'approved')
  const playerName = (userId: string) => players.find((p) => p.id === userId)?.name ?? 'Player'

  function partyMemberSummary(partyId: string) {
    const rows = members.filter((member) => member.party_id === partyId)
    if (rows.length === 0) return 'No accepted members yet'
    return rows.map((member) => `${playerName(member.user_id)} (${member.status})`).join(', ')
  }

  // One roster row per player, paired with the player token they control here.
  const roster = players.map((player) => {
    const token =
      tokens.find((t) => t.controlled_by_user_id === player.id && t.token_type === 'player') ??
      tokens.find((t) => t.controlled_by_user_id === player.id) ??
      null
    return { player, token }
  })
  const onMapCount = roster.filter((row) => row.token).length

  return (
    <>
      {open && (
        <div className="absolute left-3 top-3 z-30 flex max-h-[calc(100%-6rem)] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950/95 shadow-2xl backdrop-blur">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-zinc-400" aria-hidden="true" />
              <p className="text-sm font-semibold text-zinc-100">Party &amp; Players</p>
            </div>
            <button type="button" onClick={onToggle} className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" aria-label="Close panel">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-zinc-800 p-2">
            <TabButton active={tab === 'travel'} onClick={() => setTab('travel')}>
              Travel &amp; Party
            </TabButton>
            <TabButton active={tab === 'players'} onClick={() => setTab('players')}>
              Players ({onMapCount}/{players.length})
            </TabButton>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {tab === 'travel' ? (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-3 gap-2">
                  <TravelModeButton active={travelMode === 'group_party'} label="Group" icon={<Users className="h-4 w-4" />} disabled={busy} onClick={() => onUpdate({ travelMode: 'group_party' })} />
                  <TravelModeButton active={travelMode === 'freeroam'} label="Freeroam" icon={<Unlock className="h-4 w-4" />} disabled={busy} onClick={() => onUpdate({ travelMode: 'freeroam' })} />
                  <TravelModeButton active={travelMode === 'combat'} label="Combat" icon={<Swords className="h-4 w-4" />} disabled={busy} onClick={() => onUpdate({ travelMode: 'combat' })} />
                </div>
                <p className="text-[11px] text-zinc-500">1 square = 5 ft. Default travel allowance is 30 ft.</p>

                <div className="grid gap-2">
                  <ToggleRow label="Group infinite movement" checked={groupMovementUnlimited} disabled={busy} onChange={(v) => onUpdate({ groupMovementUnlimited: v })} />
                  <ToggleRow label="Freeroam infinite movement" checked={freeroamMovementUnlimited} disabled={busy} onChange={(v) => onUpdate({ freeroamMovementUnlimited: v })} />
                  <ToggleRow label="Lock party options" checked={partyOptionsLocked} disabled={busy || travelMode === 'combat'} onChange={(v) => onUpdate({ partyOptionsLocked: v })} />
                </div>

                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Party approvals</p>
                  {activeParty && (
                    <p className="mt-2 text-xs text-emerald-300">
                      Active: {activeParty.name} · led by {playerName(activeParty.leader_user_id)}
                    </p>
                  )}
                  {pendingParties.length === 0 ? (
                    <p className="mt-2 text-xs text-zinc-500">No parties waiting for approval.</p>
                  ) : (
                    <div className="mt-2 grid gap-2">
                      {pendingParties.map((party) => (
                        <div key={party.id} className="rounded-md border border-zinc-800 bg-zinc-950 p-2">
                          <p className="text-xs font-medium text-zinc-100">{party.name}</p>
                          <p className="mt-1 text-[11px] text-zinc-500">Leader: {playerName(party.leader_user_id)}</p>
                          <p className="mt-1 text-[11px] text-zinc-500">{partyMemberSummary(party.id)}</p>
                          <div className="mt-2 flex gap-2">
                            <Button size="sm" variant="secondary" onClick={() => onReviewParty(party.id, false)} loading={busy}>Deny</Button>
                            <Button size="sm" onClick={() => onReviewParty(party.id, true)} loading={busy}>Approve</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {feedback && (
                  <p className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-amber-200">{feedback}</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {roster.length === 0 && (
                  <p className="text-xs text-zinc-500">No players have joined this campaign yet.</p>
                )}
                {roster.map(({ player, token }) => (
                  <PlayerRow
                    key={player.id}
                    name={player.name}
                    token={token}
                    selected={token != null && token.id === selectedTokenId}
                    onFocus={() => token && onFocusToken(token.id)}
                    onToggleLock={() => token && onToggleTokenLock(token.id, !token.movement_locked)}
                    onResetMovement={() => token && onResetMovement(token.id)}
                    onResetPosition={() => token && onResetPosition(token.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toggle bubble — bottom-left, beside the + bubble */}
      <button
        type="button"
        onClick={onToggle}
        aria-label="Open party and player controls"
        className={`absolute bottom-4 left-24 z-20 flex h-14 w-14 items-center justify-center rounded-full border shadow-2xl transition focus:outline-none focus:ring-2 focus:ring-zinc-300 focus:ring-offset-2 focus:ring-offset-zinc-950 ${
          open ? 'border-zinc-300 bg-zinc-300 text-zinc-950' : 'border-zinc-600 bg-zinc-700 text-zinc-100 hover:bg-zinc-600'
        }`}
      >
        <Users className="h-6 w-6" aria-hidden="true" />
      </button>
    </>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
        active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
      }`}
    >
      {children}
    </button>
  )
}

function ToggleRow({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">
      <span>{label}</span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-amber-500" />
    </label>
  )
}

function TravelModeButton({ active, label, icon, disabled, onClick }: { active: boolean; label: string; icon: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-[11px] font-medium transition disabled:opacity-50 ${
        active ? 'border-amber-500/70 bg-amber-500/15 text-amber-200' : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function PlayerRow({
  name,
  token,
  selected,
  onFocus,
  onToggleLock,
  onResetMovement,
  onResetPosition,
}: {
  name: string
  token: Token | null
  selected: boolean
  onFocus: () => void
  onToggleLock: () => void
  onResetMovement: () => void
  onResetPosition: () => void
}) {
  if (!token) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-zinc-300">{name}</span>
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-zinc-600">No token here</span>
        </div>
      </div>
    )
  }

  const maxHp = token.max_hp || 0
  const hpPct = maxHp > 0 ? Math.max(0, Math.min(100, (token.current_hp / maxHp) * 100)) : 0
  const hpColor = hpPct > 50 ? 'bg-emerald-500' : hpPct > 25 ? 'bg-amber-500' : 'bg-red-500'

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${selected ? 'border-amber-500/60 bg-amber-500/5' : 'border-zinc-800 bg-zinc-900'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-100">{name}</p>
          <p className="truncate text-[11px] text-zinc-500">{token.name || 'Token'}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {token.movement_locked && <span className="rounded bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-medium text-orange-300">Locked</span>}
          {token.movement_override_allowed && <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-medium text-violet-300">Override</span>}
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">AC {token.armor_class}</span>
        </div>
      </div>

      {maxHp > 0 && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-[10px] text-zinc-500">
            <span>HP</span>
            <span>
              {token.current_hp}
              {token.temp_hp > 0 ? ` (+${token.temp_hp})` : ''} / {maxHp}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div className={`h-full rounded-full ${hpColor}`} style={{ width: `${hpPct}%` }} />
          </div>
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <RowAction label="Focus" icon={<Crosshair className="h-3.5 w-3.5" />} onClick={onFocus} />
        <RowAction
          label={token.movement_locked ? 'Unlock' : 'Lock'}
          icon={token.movement_locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          onClick={onToggleLock}
        />
        <RowAction label="Reset move" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={onResetMovement} />
        <RowAction label="Recall" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={onResetPosition} />
      </div>
    </div>
  )
}

function RowAction({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
    >
      {icon}
      {label}
    </button>
  )
}
