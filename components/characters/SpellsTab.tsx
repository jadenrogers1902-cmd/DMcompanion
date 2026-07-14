'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Sparkles, Trash2, X } from 'lucide-react'
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
            {showForm ? <X className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            {showForm ? 'Cancel' : 'Add Spell'}
          </Button>
        </div>
      )}

      {canEdit && showForm && (
        <form
          onSubmit={handleAdd}
          className="flex flex-col gap-4 p-4 rounded-lg bg-shell border border-border"
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
        <EmptyState
          icon={<Sparkles className="h-12 w-12" aria-hidden="true" />}
          title="No spells yet"
          description={canEdit ? 'Add your first spell above.' : 'This character has no spells.'}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((spell) => (
            <li
              key={spell.id}
              className="flex items-start justify-between gap-3 p-3 rounded-lg bg-shell border border-border"
            >
              <div className="flex min-w-0 gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-content">{spell.name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-panel-raised text-muted">
                      {spellLevelLabel(spell.spell_level)}
                    </span>
                    {spell.prepared && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-accent/15 text-accent">Prepared</span>
                    )}
                    {spell.uses && (
                      <span className="text-xs text-faint">{spell.uses}</span>
                    )}
                  </div>
                  {spell.description && (
                    <p className="text-xs text-faint mt-1">{spell.description}</p>
                  )}
                </div>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => handleDelete(spell.id)}
                  className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-faint transition hover:bg-danger/10 hover:text-danger"
                  aria-label="Delete spell"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
