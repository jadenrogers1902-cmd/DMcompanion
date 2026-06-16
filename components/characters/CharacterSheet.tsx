'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRealtimeRefresh } from '@/lib/hooks/useRealtimeRefresh'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Tabs } from '@/components/ui/Tabs'
import { HPControl } from './HPControl'
import { ConditionManager } from './ConditionManager'
import { InventoryTab } from './InventoryTab'
import { SpellsTab } from './SpellsTab'
import { AbilitiesTab } from './AbilitiesTab'
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  type Ability,
  type Character,
  type Condition,
  type InventoryItem,
  type Spell,
} from '@/lib/types/database'
import { abilityMod, formatMod } from '@/lib/utils/character'
import { deleteCharacter } from '@/lib/actions/characters'

interface CharacterSheetProps {
  campaignId: string
  character: Character
  inventory: InventoryItem[]
  spells: Spell[]
  abilities: Ability[]
  conditions: Condition[]
  isOwner: boolean
  isDM: boolean
  ownerName?: string
}

function CoreStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center justify-center py-2.5 rounded-lg bg-zinc-950 border border-zinc-800">
      <span className="text-lg font-bold text-zinc-100">{value}</span>
      <span className="text-[10px] text-zinc-500 uppercase tracking-wider text-center px-1">{label}</span>
    </div>
  )
}

export function CharacterSheet({
  campaignId,
  character,
  inventory,
  spells,
  abilities,
  conditions,
  isOwner,
  isDM,
  ownerName,
}: CharacterSheetProps) {
  const [deleting, setDeleting] = useState(false)

  // Live sync: HP/temp HP/AC/speed/conditions/inventory/spells/abilities
  // changes (by either the owner or the DM) should appear for every viewer
  // of this sheet without a refresh.
  useRealtimeRefresh(`character-${character.id}`, [
    { table: 'characters', filter: `id=eq.${character.id}` },
    { table: 'character_conditions', filter: `character_id=eq.${character.id}` },
    { table: 'character_inventory_items', filter: `character_id=eq.${character.id}` },
    { table: 'character_spells', filter: `character_id=eq.${character.id}` },
    { table: 'character_abilities', filter: `character_id=eq.${character.id}` },
  ])

  // Owner can edit everything. DM can edit vitals/conditions only.
  const canEditChildren = isOwner
  const canEditVitals = isOwner || isDM

  async function handleDelete() {
    if (!confirm(`Delete ${character.name}? This cannot be undone.`)) return
    setDeleting(true)
    await deleteCharacter(campaignId, character.id)
  }

  const subtitle = [
    character.race,
    character.class && `${character.class}${character.level ? ` ${character.level}` : ''}`,
    character.background,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold text-zinc-100">{character.name}</h1>
            {isOwner && <Badge variant="player">Your character</Badge>}
            {!isOwner && isDM && ownerName && (
              <Badge variant="default">{ownerName}</Badge>
            )}
          </div>
          {subtitle && <p className="text-sm text-zinc-500 mt-1">{subtitle}</p>}
        </div>
        {isOwner && (
          <div className="flex gap-2 shrink-0">
            <Link href={`/campaigns/${campaignId}/characters/${character.id}/edit`}>
              <Button variant="secondary" size="sm">Edit</Button>
            </Link>
            <Button variant="danger" size="sm" loading={deleting} onClick={handleDelete}>
              Delete
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: vitals + stats */}
        <div className="flex flex-col gap-6 lg:col-span-1">
          <Card>
            <HPControl
              campaignId={campaignId}
              characterId={character.id}
              currentHp={character.current_hp}
              maxHp={character.max_hp}
              tempHp={character.temp_hp}
              canEdit={canEditVitals}
            />
          </Card>

          <Card>
            <ConditionManager
              campaignId={campaignId}
              characterId={character.id}
              conditions={conditions}
              canEdit={canEditVitals}
            />
          </Card>

          <Card>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <CoreStat label="AC" value={character.armor_class} />
              <CoreStat label="Speed" value={`${character.speed}ft`} />
              <CoreStat label="Init" value={formatMod(character.initiative_bonus)} />
              <CoreStat label="Pass. Perc" value={character.passive_perception} />
              <CoreStat label="Prof" value={formatMod(character.proficiency_bonus)} />
              <CoreStat label="Level" value={character.level} />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {ABILITY_KEYS.map((key) => {
                const score = character[key]
                const mod = abilityMod(score)
                return (
                  <div
                    key={key}
                    className="flex flex-col items-center py-2 rounded-lg bg-zinc-950 border border-zinc-800"
                  >
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
                      {ABILITY_LABELS[key]}
                    </span>
                    <span className="text-lg font-bold text-zinc-100 leading-tight">{score}</span>
                    <span className="text-xs text-amber-400/80 font-mono">{formatMod(mod)}</span>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>

        {/* Right column: tabs */}
        <div className="lg:col-span-2">
          <Card>
            <Tabs
              tabs={[
                {
                  id: 'inventory',
                  label: 'Inventory',
                  badge: inventory.length,
                  content: (
                    <InventoryTab
                      characterId={character.id}
                      items={inventory}
                      canEdit={canEditChildren}
                    />
                  ),
                },
                {
                  id: 'spells',
                  label: 'Spells',
                  badge: spells.length,
                  content: (
                    <SpellsTab
                      characterId={character.id}
                      spells={spells}
                      canEdit={canEditChildren}
                    />
                  ),
                },
                {
                  id: 'abilities',
                  label: 'Abilities',
                  badge: abilities.length,
                  content: (
                    <AbilitiesTab
                      characterId={character.id}
                      abilities={abilities}
                      canEdit={canEditChildren}
                    />
                  ),
                },
                {
                  id: 'notes',
                  label: 'Notes',
                  content: character.notes ? (
                    <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
                      {character.notes}
                    </p>
                  ) : (
                    <p className="text-sm text-zinc-600">No notes yet.</p>
                  ),
                },
              ]}
            />
          </Card>
        </div>
      </div>
    </div>
  )
}
