'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import type { CodexPlayer } from '@/lib/actions/codex'

type RevealScope = 'party' | 'player'

export type CodexRevealArgs = {
  scope: RevealScope
  playerId: string | null
  message: string
}

/**
 * Shared DM control for revealing a player-safe Codex doc. Lets the DM choose
 * to reveal to all players or a single player, attach an optional note, and
 * fires the caller-supplied reveal action. On success it refreshes the route so
 * the DM's own view reflects the new state; players are updated over realtime.
 */
export function CodexRevealControls({
  players,
  onReveal,
  disabled,
  disabledReason,
  compact,
}: {
  players: CodexPlayer[]
  onReveal: (args: CodexRevealArgs) => Promise<{ success?: boolean; error?: string }>
  disabled?: boolean
  disabledReason?: string
  compact?: boolean
}) {
  const router = useRouter()
  const [scope, setScope] = useState<RevealScope>('party')
  const [playerId, setPlayerId] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const canPickPlayer = players.length > 0
  const needsPlayer = scope === 'player' && !playerId

  async function reveal() {
    setBusy(true)
    setError(null)
    setDone(null)
    const result = await onReveal({
      scope,
      playerId: scope === 'player' ? playerId : null,
      message: message.trim(),
    })
    setBusy(false)
    if (result?.error) {
      setError(result.error)
      return
    }
    const who =
      scope === 'party'
        ? 'all players'
        : players.find((p) => p.id === playerId)?.name ?? 'that player'
    setDone(`Revealed to ${who}.`)
    setMessage('')
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-2">
      <div className={`grid gap-2 ${canPickPlayer ? 'sm:grid-cols-2' : ''}`}>
        <Select
          aria-label="Reveal to"
          value={scope}
          onChange={(event) => setScope(event.target.value as RevealScope)}
        >
          <option value="party">All players</option>
          {canPickPlayer && <option value="player">One player…</option>}
        </Select>
        {scope === 'player' && canPickPlayer && (
          <Select
            aria-label="Player to reveal to"
            value={playerId}
            onChange={(event) => setPlayerId(event.target.value)}
          >
            <option value="">Choose player…</option>
            {players.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
              </option>
            ))}
          </Select>
        )}
      </div>
      {!compact && (
        <Input
          aria-label="Optional reveal message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Optional note shown to players…"
        />
      )}
      {error && (
        <p className="rounded-md border border-red-800 bg-red-950/50 px-2.5 py-1.5 text-xs text-red-200">
          {error}
        </p>
      )}
      {done && (
        <p className="rounded-md border border-emerald-800/60 bg-emerald-950/40 px-2.5 py-1.5 text-xs text-emerald-200">
          {done}
        </p>
      )}
      <Button
        type="button"
        size="sm"
        onClick={reveal}
        loading={busy}
        disabled={disabled || needsPlayer}
      >
        {disabled && disabledReason ? disabledReason : 'Reveal to players'}
      </Button>
    </div>
  )
}
