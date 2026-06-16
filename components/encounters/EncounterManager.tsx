'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useRealtimeRefresh } from '@/lib/hooks/useRealtimeRefresh'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Checkbox } from '@/components/ui/Checkbox'
import { Badge } from '@/components/ui/Badge'
import {
  addCharacterParticipant,
  addEncounterCondition,
  addManualParticipant,
  addTokenParticipant,
  deleteParticipant,
  endEncounter,
  moveEncounterTurn,
  removeEncounterCondition,
  startEncounter,
  updateParticipant,
  upsertParticipantDmNote,
} from '@/lib/actions/encounters'
import {
  STANDARD_CONDITIONS,
  type Character,
  type Encounter,
  type EncounterParticipantWithConditions,
  type GameMap,
  type Token,
} from '@/lib/types/database'

interface EncounterManagerProps {
  campaignId: string
  encounter: Encounter
  participants: EncounterParticipantWithConditions[]
  dmNotes: Record<string, string>
  characters: Character[]
  maps: GameMap[]
  tokens: Token[]
  isDM: boolean
}

function hpTone(current: number, max: number) {
  if (max <= 0) return 'bg-zinc-700'
  const pct = current / max
  if (pct <= 0.25) return 'bg-red-500'
  if (pct <= 0.5) return 'bg-orange-500'
  return 'bg-emerald-500'
}

function sortParticipants(participants: EncounterParticipantWithConditions[]) {
  return [...participants].sort((a, b) => {
    const initA = a.initiative ?? -999
    const initB = b.initiative ?? -999
    if (initB !== initA) return initB - initA
    return a.created_at.localeCompare(b.created_at)
  })
}

function statusVariant(status: string) {
  if (status === 'active') return 'success'
  if (status === 'completed') return 'default'
  return 'warning'
}

export function EncounterManager({
  campaignId,
  encounter,
  participants,
  dmNotes,
  characters,
  maps,
  tokens,
  isDM,
}: EncounterManagerProps) {
  const router = useRouter()

  // Live sync: round/turn changes, participant add/remove/HP/condition
  // changes, and linked-character/token HP changes should all reach every
  // connected viewer (DM and players) without a refresh.
  useRealtimeRefresh(`encounter-${encounter.id}`, [
    { table: 'encounters', filter: `id=eq.${encounter.id}` },
    { table: 'encounter_participants', filter: `encounter_id=eq.${encounter.id}` },
    { table: 'encounter_conditions', filter: `encounter_id=eq.${encounter.id}` },
    { table: 'characters', filter: `campaign_id=eq.${campaignId}` },
    { table: 'tokens', filter: `campaign_id=eq.${campaignId}` },
  ])

  const ordered = useMemo(() => sortParticipants(participants), [participants])
  const [selectedCharacterId, setSelectedCharacterId] = useState('')
  const [selectedTokenId, setSelectedTokenId] = useState('')
  const [customCondition, setCustomCondition] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const current = participants.find(
    (p) => p.id === encounter.current_turn_participant_id,
  )

  async function run(action: () => Promise<{ error?: string } | void>) {
    setBusy(true)
    setError(null)
    const result = await action()
    setBusy(false)
    if (result?.error) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  async function handleAddCharacter() {
    if (!selectedCharacterId) return
    await run(() =>
      addCharacterParticipant(campaignId, encounter.id, selectedCharacterId),
    )
    setSelectedCharacterId('')
  }

  async function handleAddToken() {
    if (!selectedTokenId) return
    await run(() => addTokenParticipant(campaignId, encounter.id, selectedTokenId))
    setSelectedTokenId('')
  }

  async function handleManual(formData: FormData) {
    await run(() => addManualParticipant(campaignId, encounter.id, formData))
  }

  async function patchParticipant(
    participantId: string,
    patch: Parameters<typeof updateParticipant>[3],
  ) {
    await run(() =>
      updateParticipant(campaignId, encounter.id, participantId, patch),
    )
  }

  async function addCondition(participantId: string, name: string) {
    await run(() =>
      addEncounterCondition(campaignId, encounter.id, participantId, name),
    )
    setCustomCondition((prev) => ({ ...prev, [participantId]: '' }))
  }

  const visibleTokens = tokens.filter((t) => {
    if (!encounter.map_id) return false
    return t.map_id === encounter.map_id
  })

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold text-zinc-100">{encounter.name}</h1>
            <Badge variant={statusVariant(encounter.status)}>
              {encounter.status}
            </Badge>
            {encounter.map_id && (
              <span className="text-xs text-zinc-500">
                {maps.find((m) => m.id === encounter.map_id)?.name ?? 'Linked map'}
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-500 mt-1">
            Round {encounter.current_round}
            {current ? ` - ${current.name}'s turn` : ' - no active turn'}
          </p>
        </div>

        {isDM && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || ordered.length === 0}
              onClick={() => run(() => moveEncounterTurn(campaignId, encounter.id, 'previous'))}
            >
              Back
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => run(() => startEncounter(campaignId, encounter.id))}
            >
              {encounter.status === 'draft' ? 'Start' : 'Restart'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || ordered.length === 0}
              onClick={() => run(() => moveEncounterTurn(campaignId, encounter.id, 'next'))}
            >
              Next Turn
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={busy || encounter.status === 'completed'}
              onClick={() => run(() => endEncounter(campaignId, encounter.id))}
            >
              End
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-5">
        <aside className="flex flex-col gap-4">
          <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-zinc-200 mb-3">Turn Order</h2>
            {ordered.length === 0 ? (
              <p className="text-sm text-zinc-500">No participants yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {ordered.map((p, index) => {
                  const isCurrent = p.id === encounter.current_turn_participant_id
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-3 rounded-md border px-3 py-2 ${
                        isCurrent
                          ? 'border-amber-500 bg-amber-500/10'
                          : 'border-zinc-800 bg-zinc-950'
                      }`}
                    >
                      <span className="w-6 text-center text-xs text-zinc-500">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-100">
                          {p.name}
                        </p>
                        <p className="text-xs text-zinc-500">
                          Init {p.initiative ?? '-'}
                        </p>
                      </div>
                      {p.is_defeated && <Badge variant="warning">Defeated</Badge>}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {isDM && (
            <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h2 className="text-sm font-semibold text-zinc-200 mb-3">
                Add Participants
              </h2>
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <Select
                    aria-label="Character"
                    value={selectedCharacterId}
                    onChange={(e) => setSelectedCharacterId(e.target.value)}
                  >
                    <option value="">Character...</option>
                    {characters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!selectedCharacterId || busy}
                    onClick={handleAddCharacter}
                  >
                    Add
                  </Button>
                </div>

                <div className="flex gap-2">
                  <Select
                    aria-label="Map token"
                    value={selectedTokenId}
                    onChange={(e) => setSelectedTokenId(e.target.value)}
                  >
                    <option value="">Map token...</option>
                    {visibleTokens.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name || t.token_type}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!selectedTokenId || busy}
                    onClick={handleAddToken}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </section>
          )}
        </aside>

        <main className="flex flex-col gap-4">
          {isDM && (
            <form
              action={handleManual}
              className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 grid grid-cols-1 md:grid-cols-6 gap-3"
            >
              <div className="md:col-span-2">
                <Input name="name" label="Manual participant" placeholder="Goblin" />
              </div>
              <Select name="participant_type" label="Type" defaultValue="enemy">
                <option value="player">Player</option>
                <option value="npc">NPC</option>
                <option value="enemy">Enemy</option>
              </Select>
              <Input name="initiative" label="Init" type="number" />
              <Input name="armor_class" label="AC" type="number" defaultValue={10} />
              <Input name="max_hp" label="Max HP" type="number" defaultValue={0} />
              <Input name="current_hp" label="HP" type="number" />
              <Input name="temp_hp" label="Temp" type="number" defaultValue={0} />
              <Input name="speed" label="Speed" type="number" defaultValue={30} />
              <div className="md:col-span-2 flex items-end">
                <Checkbox
                  name="is_visible_to_players"
                  label="Visible to players"
                  defaultChecked
                />
              </div>
              <div className="md:col-span-4">
                <Textarea name="notes" label="Player-visible note" rows={2} />
              </div>
              <div className="md:col-span-2 flex items-end">
                <Button type="submit" disabled={busy} className="w-full">
                  Add Manual
                </Button>
              </div>
            </form>
          )}

          {ordered.map((participant) => {
            const isCurrent = participant.id === encounter.current_turn_participant_id
            const pct =
              participant.max_hp > 0
                ? Math.max(0, Math.min(100, (participant.current_hp / participant.max_hp) * 100))
                : 0
            return (
              <section
                key={participant.id}
                className={`rounded-lg border bg-zinc-900 p-4 ${
                  isCurrent ? 'border-amber-500' : 'border-zinc-800'
                } ${participant.is_defeated ? 'opacity-60' : ''}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-zinc-100">{participant.name}</h3>
                      <Badge variant={participant.participant_type === 'enemy' ? 'warning' : 'default'}>
                        {participant.participant_type}
                      </Badge>
                      {isCurrent && <Badge variant="warning">Current</Badge>}
                      {participant.is_defeated && <Badge variant="warning">Defeated</Badge>}
                      {!participant.is_visible_to_players && isDM && (
                        <Badge variant="default">Hidden</Badge>
                      )}
                    </div>
                    {participant.notes && (
                      <p className="text-sm text-zinc-500 mt-1">{participant.notes}</p>
                    )}
                  </div>

                  {isDM && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        run(() =>
                          deleteParticipant(campaignId, encounter.id, participant.id),
                        )
                      }
                    >
                      Remove
                    </Button>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 md:grid-cols-6 gap-3">
                  {isDM ? (
                    <>
                      <Input
                        label="Init"
                        type="number"
                        defaultValue={participant.initiative ?? ''}
                        onBlur={(e) =>
                          patchParticipant(participant.id, {
                            initiative:
                              e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                      />
                      <Input
                        label="AC"
                        type="number"
                        defaultValue={participant.armor_class}
                        onBlur={(e) =>
                          patchParticipant(participant.id, {
                            armor_class: Number(e.target.value) || 0,
                          })
                        }
                      />
                      <Input
                        label="HP"
                        type="number"
                        defaultValue={participant.current_hp}
                        onBlur={(e) =>
                          patchParticipant(participant.id, {
                            current_hp: Number(e.target.value) || 0,
                          })
                        }
                      />
                      <Input
                        label="Max"
                        type="number"
                        defaultValue={participant.max_hp}
                        onBlur={(e) =>
                          patchParticipant(participant.id, {
                            max_hp: Number(e.target.value) || 0,
                          })
                        }
                      />
                      <Input
                        label="Temp"
                        type="number"
                        defaultValue={participant.temp_hp}
                        onBlur={(e) =>
                          patchParticipant(participant.id, {
                            temp_hp: Number(e.target.value) || 0,
                          })
                        }
                      />
                      <Input
                        label="Speed"
                        type="number"
                        defaultValue={participant.speed}
                        onBlur={(e) =>
                          patchParticipant(participant.id, {
                            speed: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </>
                  ) : (
                    <>
                      <Stat label="Initiative" value={participant.initiative ?? '-'} />
                      <Stat label="AC" value={participant.armor_class} />
                      <Stat
                        label="HP"
                        value={`${participant.current_hp}/${participant.max_hp}`}
                      />
                      <Stat label="Temp" value={participant.temp_hp} />
                      <Stat label="Speed" value={`${participant.speed} ft`} />
                    </>
                  )}
                </div>

                <div className="mt-3 h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full ${hpTone(participant.current_hp, participant.max_hp)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {isDM && (
                  <div className="mt-4 flex flex-wrap gap-4">
                    <Checkbox
                      label="Visible to players"
                      checked={participant.is_visible_to_players}
                      onChange={(e) =>
                        patchParticipant(participant.id, {
                          is_visible_to_players: e.target.checked,
                        })
                      }
                    />
                    <Checkbox
                      label="Defeated"
                      checked={participant.is_defeated}
                      onChange={(e) =>
                        patchParticipant(participant.id, {
                          is_defeated: e.target.checked,
                        })
                      }
                    />
                  </div>
                )}

                <div className="mt-4 flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    {participant.encounter_conditions.map((condition) => (
                      <button
                        key={condition.id}
                        type="button"
                        disabled={!isDM}
                        onClick={() =>
                          isDM &&
                          run(() =>
                            removeEncounterCondition(
                              campaignId,
                              encounter.id,
                              condition.id,
                            ),
                          )
                        }
                        className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200 disabled:cursor-default"
                      >
                        {condition.name}
                      </button>
                    ))}
                    {participant.encounter_conditions.length === 0 && (
                      <span className="text-xs text-zinc-600">No conditions</span>
                    )}
                  </div>

                  {isDM && (
                    <div className="flex flex-wrap gap-2">
                      {STANDARD_CONDITIONS.map((condition) => (
                        <Button
                          key={condition}
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => addCondition(participant.id, condition)}
                        >
                          {condition}
                        </Button>
                      ))}
                      <div className="flex gap-2">
                        <Input
                          aria-label="Custom condition"
                          placeholder="Custom"
                          value={customCondition[participant.id] ?? ''}
                          onChange={(e) =>
                            setCustomCondition((prev) => ({
                              ...prev,
                              [participant.id]: e.target.value,
                            }))
                          }
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            addCondition(
                              participant.id,
                              customCondition[participant.id] ?? '',
                            )
                          }
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {isDM && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Textarea
                      label="Player-visible note"
                      rows={2}
                      defaultValue={participant.notes ?? ''}
                      onBlur={(e) =>
                        patchParticipant(participant.id, { notes: e.target.value })
                      }
                    />
                    <Textarea
                      label="DM note"
                      rows={2}
                      defaultValue={dmNotes[participant.id] ?? ''}
                      onBlur={(e) =>
                        run(() =>
                          upsertParticipantDmNote(
                            campaignId,
                            encounter.id,
                            participant.id,
                            e.target.value,
                          ),
                        )
                      }
                    />
                  </div>
                )}
              </section>
            )
          })}
        </main>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2">
      <p className="text-xs text-zinc-600">{label}</p>
      <p className="text-sm font-medium text-zinc-200">{value}</p>
    </div>
  )
}
