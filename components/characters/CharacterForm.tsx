'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Input, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { createCharacter, updateCharacter } from '@/lib/actions/characters'
import { ABILITY_KEYS, ABILITY_LABELS, type Character } from '@/lib/types/database'
import { abilityMod, formatMod } from '@/lib/utils/character'

interface CharacterFormProps {
  campaignId: string
  character?: Character // present = edit mode
}

export function CharacterForm({ campaignId, character }: CharacterFormProps) {
  const isEdit = !!character
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [abilityScores, setAbilityScores] = useState<Record<string, number>>({
    str: character?.str ?? 10,
    dex: character?.dex ?? 10,
    con: character?.con ?? 10,
    intel: character?.intel ?? 10,
    wis: character?.wis ?? 10,
    cha: character?.cha ?? 10,
  })

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const result = isEdit
      ? await updateCharacter(campaignId, character!.id, formData)
      : await createCharacter(campaignId, formData)

    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  const backHref = isEdit
    ? `/campaigns/${campaignId}/characters/${character!.id}`
    : `/campaigns/${campaignId}/characters`

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error && <Alert message={error} />}

      {/* Identity */}
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Input
              label="Character name"
              name="name"
              defaultValue={character?.name ?? ''}
              placeholder="Aelar Moonwhisper"
              required
              autoFocus={!isEdit}
            />
          </div>
          <Input label="Class" name="class" defaultValue={character?.class ?? ''} placeholder="Wizard" />
          <Input
            label="Level"
            name="level"
            type="number"
            min={1}
            max={30}
            defaultValue={character?.level ?? 1}
          />
          <Input label="Race / Species" name="race" defaultValue={character?.race ?? ''} placeholder="High Elf" />
          <Input label="Background" name="background" defaultValue={character?.background ?? ''} placeholder="Sage" />
        </div>
      </Card>

      {/* Combat stats */}
      <Card>
        <CardHeader>
          <CardTitle>Combat &amp; Core Stats</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Input label="Armor Class" name="armor_class" type="number" defaultValue={character?.armor_class ?? 10} />
          <Input label="Speed" name="speed" type="number" defaultValue={character?.speed ?? 30} hint="ft." />
          <Input label="Max HP" name="max_hp" type="number" defaultValue={character?.max_hp ?? 0} />
          <Input label="Current HP" name="current_hp" type="number" defaultValue={character?.current_hp ?? 0} />
          <Input label="Temp HP" name="temp_hp" type="number" defaultValue={character?.temp_hp ?? 0} />
          <Input label="Initiative Bonus" name="initiative_bonus" type="number" defaultValue={character?.initiative_bonus ?? 0} />
          <Input label="Passive Perception" name="passive_perception" type="number" defaultValue={character?.passive_perception ?? 10} />
          <Input label="Proficiency Bonus" name="proficiency_bonus" type="number" defaultValue={character?.proficiency_bonus ?? 2} />
        </div>
      </Card>

      {/* Ability scores */}
      <Card>
        <CardHeader>
          <CardTitle>Ability Scores</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {ABILITY_KEYS.map((key) => {
            const mod = abilityMod(abilityScores[key] ?? 10)
            return (
              <div key={key} className="flex flex-col items-center gap-1.5">
                <label htmlFor={key} className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  {ABILITY_LABELS[key]}
                </label>
                <input
                  id={key}
                  name={key}
                  type="number"
                  min={1}
                  max={30}
                  value={abilityScores[key]}
                  onChange={(e) =>
                    setAbilityScores((prev) => ({
                      ...prev,
                      [key]: Number(e.target.value) || 0,
                    }))
                  }
                  className="w-full text-center rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-base font-semibold text-zinc-100 outline-none focus:border-amber-500"
                />
                <span className="text-xs text-zinc-500 font-mono">{formatMod(mod)}</span>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <Textarea
          name="notes"
          defaultValue={character?.notes ?? ''}
          rows={4}
          placeholder="Personality, backstory, goals, anything you want to remember..."
        />
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Link href={backHref} className="flex-1 sm:flex-none">
          <Button variant="secondary" type="button" className="w-full">
            Cancel
          </Button>
        </Link>
        <Button type="submit" loading={loading} className="flex-1 sm:flex-none">
          {isEdit ? 'Save changes' : 'Create character'}
        </Button>
      </div>
    </form>
  )
}
