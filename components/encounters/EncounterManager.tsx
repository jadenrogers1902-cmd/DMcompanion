'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CircleDot,
  Dices,
  Footprints,
  HeartPulse,
  MapPinned,
  Play,
  RotateCcw,
  Shield,
  SkipBack,
  SkipForward,
  Square,
  Swords,
  UserPlus,
  X,
} from 'lucide-react'
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
  if (max <= 0) return 'bg-control'
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
    ...(isDM
      ? [{ table: 'tokens', filter: `campaign_id=eq.${campaignId}` }]
      : encounter.map_id
        ? [{ table: 'player_safe_map_events', filter: `map_id=eq.${encounter.map_id}` }]
        : []),
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
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold text-content">{encounter.name}</h1>
            <Badge variant={statusVariant(encounter.status)}>
              {encounter.status}
            </Badge>
            {encounter.map_id && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-panel px-2 py-1 text-xs text-faint">
                <MapPinned className="h-3.5 w-3.5" aria-hidden="true" />
                {maps.find((m) => m.id === encounter.map_id)?.name ?? 'Linked map'}
              </span>
            )}
          </div>
          <div className="mt-4 grid max-w-2xl gap-2 sm:grid-cols-[10rem_minmax(0,1fr)]" aria-live="polite">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-panel px-3 py-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-border-strong bg-canvas text-accent">
                <RotateCcw className="h-5 w-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-faint">Round</span>
                <span className="block text-xl font-bold leading-tight text-content">{encounter.current_round}</span>
              </span>
            </div>
            <div className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${current ? 'border-accent/60 bg-accent/10' : 'border-border bg-panel'}`}>
              <span className={`flex h-10 w-10 items-center justify-center rounded-lg border ${current ? 'border-accent/50 bg-accent/15 text-accent' : 'border-border-strong bg-canvas text-faint'}`}>
                <Swords className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-faint">Current turn</span>
                <span className="block truncate text-base font-bold text-content">{current?.name ?? 'No active turn'}</span>
              </span>
            </div>
          </div>
        </div>

        {isDM && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || ordered.length === 0}
              onClick={() => run(() => moveEncounterTurn(campaignId, encounter.id, 'previous'))}
            >
              <SkipBack className="h-4 w-4" aria-hidden="true" />
              Back
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => run(() => startEncounter(campaignId, encounter.id))}
            >
              {encounter.status === 'draft' ? <Play className="h-4 w-4" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
              {encounter.status === 'draft' ? 'Start' : 'Restart'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || ordered.length === 0}
              onClick={() => run(() => moveEncounterTurn(campaignId, encounter.id, 'next'))}
            >
              <SkipForward className="h-4 w-4" aria-hidden="true" />
              Next Turn
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={busy || encounter.status === 'completed'}
              onClick={() => run(() => endEncounter(campaignId, encounter.id))}
            >
              <Square className="h-4 w-4" aria-hidden="true" />
              End
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-5">
        <aside className="flex flex-col gap-4">
          <section className="bg-panel border border-border rounded-lg p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-content">
              <Dices className="h-4 w-4 text-accent" aria-hidden="true" />
              Turn Order
            </h2>
            {ordered.length === 0 ? (
              <p className="text-sm text-faint">No participants yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {ordered.map((p, index) => {
                  const isCurrent = p.id === encounter.current_turn_participant_id
                  return (
                    <div
                      key={p.id}
                      aria-current={isCurrent ? 'step' : undefined}
                      className={`relative flex min-h-16 items-center gap-3 overflow-hidden rounded-lg border px-3 py-2.5 ${
                        isCurrent
                          ? 'border-accent bg-accent/10 ring-1 ring-accent/25'
                          : 'border-border bg-shell'
                      }`}
                    >
                      {isCurrent && <span className="absolute inset-y-0 left-0 w-1 bg-accent" aria-hidden="true" />}
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-strong bg-canvas text-xs font-semibold text-faint">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-content">
                          {p.name}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {isCurrent && <span className="text-[10px] font-semibold uppercase tracking-wide text-accent">Current turn</span>}
                          {p.is_defeated && <span className="text-[10px] font-semibold uppercase tracking-wide text-warning">Defeated</span>}
                        </div>
                      </div>
                      <span className="shrink-0 text-right">
                        <span className="block text-lg font-bold leading-none text-content">{p.initiative ?? '-'}</span>
                        <span className="mt-1 block text-[9px] font-semibold uppercase tracking-wider text-faint">Initiative</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {isDM && (
            <section className="bg-panel border border-border rounded-lg p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-content">
                <UserPlus className="h-4 w-4 text-accent" aria-hidden="true" />
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
              className="bg-panel border border-border rounded-lg p-4 grid grid-cols-1 md:grid-cols-6 gap-3"
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
                className={`overflow-hidden rounded-xl border bg-panel ${
                  isCurrent ? 'border-accent ring-1 ring-accent/25' : 'border-border'
                } ${participant.is_defeated ? 'opacity-60' : ''}`}
              >
                {isCurrent && (
                  <div className="flex items-center gap-2 border-b border-accent/30 bg-accent/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-accent">
                    <Swords className="h-4 w-4" aria-hidden="true" />
                    Current turn
                  </div>
                )}
                <div className="flex flex-wrap items-start justify-between gap-3 p-4 pb-0">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-content">{participant.name}</h3>
                      <Badge variant={participant.participant_type === 'enemy' ? 'warning' : 'default'}>
                        {participant.participant_type}
                      </Badge>
                      {participant.is_defeated && <Badge variant="warning">Defeated</Badge>}
                      {!participant.is_visible_to_players && isDM && (
                        <Badge variant="default">Hidden</Badge>
                      )}
                    </div>
                    {participant.notes && (
                      <p className="text-sm text-faint mt-1">{participant.notes}</p>
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
                      <X className="h-4 w-4" aria-hidden="true" />
                      Remove
                    </Button>
                  )}
                </div>

                <div className={`mx-4 mt-4 grid grid-cols-2 gap-3 ${isDM ? 'md:grid-cols-6' : 'sm:grid-cols-5'}`}>
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
                      <Stat label="Initiative" value={participant.initiative ?? '-'} icon={<Dices className="h-4 w-4" />} emphasized={isCurrent} />
                      <Stat label="AC" value={participant.armor_class} icon={<Shield className="h-4 w-4" />} />
                      <Stat
                        label="HP"
                        value={`${participant.current_hp}/${participant.max_hp}`}
                        icon={<HeartPulse className="h-4 w-4" />}
                      />
                      <Stat label="Temp" value={participant.temp_hp} icon={<CircleDot className="h-4 w-4" />} />
                      <Stat label="Speed" value={`${participant.speed} ft`} icon={<Footprints className="h-4 w-4" />} />
                    </>
                  )}
                </div>

                <div
                  className="mx-4 mt-3 h-2 overflow-hidden rounded-full bg-panel-raised"
                  role="progressbar"
                  aria-label={`${participant.name} hit points`}
                  aria-valuemin={participant.max_hp > 0 ? 0 : undefined}
                  aria-valuemax={participant.max_hp > 0 ? participant.max_hp : undefined}
                  aria-valuenow={participant.max_hp > 0
                    ? Math.max(0, Math.min(participant.max_hp, participant.current_hp))
                    : undefined}
                  aria-valuetext={participant.max_hp > 0
                    ? undefined
                    : `${Math.max(0, participant.current_hp)} HP; maximum not set`}
                >
                  <div
                    className={`h-full ${hpTone(participant.current_hp, participant.max_hp)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {isDM && (
                  <div className="mx-4 mt-4 flex flex-wrap gap-4">
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

                <div className="mx-4 mt-4 flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    {participant.encounter_conditions.map((condition) =>
                      isDM ? (
                        <button
                          key={condition.id}
                          type="button"
                          onClick={() =>
                            run(() =>
                              removeEncounterCondition(
                                campaignId,
                                encounter.id,
                                condition.id,
                              ),
                            )
                          }
                          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-medium text-accent transition hover:border-danger/50 hover:bg-danger/10 hover:text-danger"
                          aria-label={`Remove ${condition.name}`}
                        >
                          {condition.name}
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      ) : (
                        <span key={condition.id} className="inline-flex min-h-11 items-center rounded-full border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-medium text-accent">
                          {condition.name}
                        </span>
                      ),
                    )}
                    {participant.encounter_conditions.length === 0 && (
                      <span className="text-xs text-faint">No conditions</span>
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
                  <div className="mx-4 mt-4 grid grid-cols-1 gap-3 pb-4 md:grid-cols-2">
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
                {!isDM && <div className="h-4" aria-hidden="true" />}
              </section>
            )
          })}
        </main>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  icon,
  emphasized = false,
}: {
  label: string
  value: React.ReactNode
  icon?: React.ReactNode
  emphasized?: boolean
}) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${emphasized ? 'border-accent/60 bg-accent/10' : 'border-border bg-shell'}`}>
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">
        {icon && <span className={emphasized ? 'text-accent' : 'text-muted'} aria-hidden="true">{icon}</span>}
        {label}
      </p>
      <p className="mt-1 text-lg font-bold leading-tight text-content">{value}</p>
    </div>
  )
}
