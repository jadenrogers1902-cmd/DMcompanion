'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpenText, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { addAbility, deleteAbility } from '@/lib/actions/characters'
import type { Ability } from '@/lib/types/database'

interface AbilitiesTabProps {
  characterId: string
  abilities: Ability[]
  canEdit: boolean
}

export function AbilitiesTab({ characterId, abilities, canEdit }: AbilitiesTabProps) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const form = e.currentTarget
    const result = await addAbility(characterId, new FormData(form))
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
    await deleteAbility(id)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" variant="secondary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? <X className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            {showForm ? 'Cancel' : 'Add Ability'}
          </Button>
        </div>
      )}

      {canEdit && showForm && (
        <form
          onSubmit={handleAdd}
          className="flex flex-col gap-4 p-4 rounded-lg bg-shell border border-border"
        >
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Input label="Ability / Feature name" name="name" placeholder="Second Wind" required />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select label="Source" name="source" defaultValue="">
              <option value="">—</option>
              <option value="Class">Class</option>
              <option value="Race">Race</option>
              <option value="Feat">Feat</option>
              <option value="Homebrew">Homebrew</option>
            </Select>
            <Input label="Uses" name="uses" placeholder="e.g. 1/1" />
            <Select label="Reset" name="reset_type" defaultValue="">
              <option value="">—</option>
              <option value="Short Rest">Short Rest</option>
              <option value="Long Rest">Long Rest</option>
              <option value="Manual">Manual</option>
            </Select>
          </div>
          <Textarea label="Description" name="description" rows={2} placeholder="Optional — your own words only" />
          <Button type="submit" size="sm" loading={loading} className="self-start">
            Add Ability
          </Button>
        </form>
      )}

      {abilities.length === 0 ? (
        <EmptyState
          icon={<BookOpenText className="h-12 w-12" aria-hidden="true" />}
          title="No abilities yet"
          description={canEdit ? 'Add class features, racial traits, or feats above.' : 'This character has no abilities.'}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {abilities.map((ability) => (
            <li
              key={ability.id}
              className="flex items-start justify-between gap-3 p-3 rounded-lg bg-shell border border-border"
            >
              <div className="flex min-w-0 gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-panel text-muted">
                  <BookOpenText className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-content">{ability.name}</span>
                    {ability.source && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-panel-raised text-muted">{ability.source}</span>
                    )}
                    {ability.uses && (
                      <span className="text-xs text-faint">{ability.uses}</span>
                    )}
                    {ability.reset_type && (
                      <span className="text-xs text-faint">· {ability.reset_type}</span>
                    )}
                  </div>
                  {ability.description && (
                    <p className="text-xs text-faint mt-1">{ability.description}</p>
                  )}
                </div>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => handleDelete(ability.id)}
                  className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-faint transition hover:bg-danger/10 hover:text-danger"
                  aria-label="Delete ability"
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
