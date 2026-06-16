'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Checkbox } from '@/components/ui/Checkbox'
import { EmptyState } from '@/components/ui/EmptyState'
import { addSpell, deleteSpell } from '@/lib/actions/characters'
import type { Spell } from '@/lib/types/database'

interface SpellsTabProps {
  characterId: string
  spells: Spell[]
  canEdit: boolean
}

function spellLevelLabel(level: number): string {
  if (level === 0) return 'Cantrip'
  return `Level ${level}`
}

export function SpellsTab({ characterId, spells, canEdit }: SpellsTabProps) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const form = e.currentTarget
    const result = await addSpell(characterId, new FormData(form))
    setLoading(false)
    if (result?.error) {
      setError(result.error)
    } else {
      form.reset()
      setShowForm(false)
      router.refresh()
    }
  }

  async function handleDelete(id: string) {
    await deleteSpell(id)
    router.refresh()
  }

  // group by level
  const sorted = [...spells].sort((a, b) => a.spell_level - b.spell_level || a.name.localeCompare(b.name))

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" variant="secondary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : '+ Add Spell'}
          </Button>
        </div>
      )}

      {canEdit && showForm && (
        <form
          onSubmit={handleAdd}
          className="flex flex-col gap-4 p-4 rounded-lg bg-zinc-950 border border-zinc-800"
        >
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <Input label="Spell name" name="name" placeholder="Fireball" required />
            </div>
            <Select label="Level" name="spell_level" defaultValue="0">
              <option value="0">Cantrip</option>
              {Array.from({ length: 9 }, (_, i) => i + 1).map((l) => (
                <option key={l} value={l}>Level {l}</option>
              ))}
            </Select>
          </div>
          <Input label="Uses / Slots" name="uses" placeholder="e.g. 3/4 or 2 slots" hint="Tracked manually." />
          <Textarea label="Description" name="description" rows={2} placeholder="Optional — your own words only" />
          <Checkbox label="Prepared" name="prepared" />
          <Button type="submit" size="sm" loading={loading} className="self-start">
            Add Spell
          </Button>
        </form>
      )}

      {sorted.length === 0 ? (
        <EmptyState title="No spells yet" description={canEdit ? 'Add your first spell above.' : 'This character has no spells.'} />
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((spell) => (
            <li
              key={spell.id}
              className="flex items-start justify-between gap-3 p-3 rounded-lg bg-zinc-950 border border-zinc-800"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-zinc-200">{spell.name}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                    {spellLevelLabel(spell.spell_level)}
                  </span>
                  {spell.prepared && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">Prepared</span>
                  )}
                  {spell.uses && (
                    <span className="text-xs text-zinc-500">{spell.uses}</span>
                  )}
                </div>
                {spell.description && (
                  <p className="text-xs text-zinc-500 mt-1">{spell.description}</p>
                )}
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => handleDelete(spell.id)}
                  className="text-zinc-600 hover:text-red-400 shrink-0"
                  aria-label="Delete spell"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
