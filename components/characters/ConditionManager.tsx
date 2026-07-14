'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CircleAlert, Plus, X } from 'lucide-react'
import { addCondition, removeCondition } from '@/lib/actions/characters'
import { STANDARD_CONDITIONS, type Condition } from '@/lib/types/database'

interface ConditionManagerProps {
  campaignId: string
  characterId: string
  conditions: Condition[]
  canEdit: boolean
}

export function ConditionManager({
  campaignId,
  characterId,
  conditions,
  canEdit,
}: ConditionManagerProps) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [custom, setCustom] = useState('')

  const activeNames = new Set(conditions.map((c) => c.name.toLowerCase()))

  async function add(name: string) {
    if (!name.trim()) return
    setAdding(true)
    await addCondition(campaignId, characterId, name)
    setAdding(false)
    setCustom('')
    setShowPicker(false)
    router.refresh()
  }

  async function remove(id: string) {
    setAdding(true)
    await removeCondition(campaignId, id)
    setAdding(false)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-faint">
          <CircleAlert className="h-4 w-4 text-warning" aria-hidden="true" />
          Conditions
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowPicker((v) => !v)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-accent transition hover:bg-accent/10 hover:text-accent-hover"
          >
            {showPicker ? <X className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            {showPicker ? 'Close' : 'Add'}
          </button>
        )}
      </div>

      {conditions.length === 0 ? (
        <p className="text-sm text-faint">None</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {conditions.map((c) => (
            <span
              key={c.id}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-orange-500/30 bg-orange-500/15 py-1 pl-3 text-xs font-medium text-orange-300"
            >
              {c.name}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  disabled={adding}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-orange-400/70 transition hover:bg-orange-500/15 hover:text-orange-200 disabled:opacity-50"
                  aria-label={`Remove ${c.name}`}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {canEdit && showPicker && (
        <div className="flex flex-col gap-3 p-3 rounded-lg bg-shell border border-border">
          <div className="flex flex-wrap gap-2">
            {STANDARD_CONDITIONS.map((name) => {
              const isActive = activeNames.has(name.toLowerCase())
              return (
                <button
                  key={name}
                  type="button"
                  disabled={isActive || adding}
                  onClick={() => add(name)}
                  className={`min-h-11 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-panel-raised text-faint border-border cursor-not-allowed'
                      : 'bg-panel text-muted border-border-strong hover:border-orange-500/50 hover:text-orange-300'
                  }`}
                >
                  {name}
                </button>
              )
            })}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  add(custom)
                }
              }}
              placeholder="Custom condition…"
              className="min-h-11 flex-1 rounded-lg border border-border-strong bg-panel px-3 py-2 text-sm text-content outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => add(custom)}
              disabled={adding || !custom.trim()}
              className="min-h-11 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
