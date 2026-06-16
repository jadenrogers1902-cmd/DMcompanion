'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          Conditions
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowPicker((v) => !v)}
            className="text-xs text-amber-400 hover:text-amber-300"
          >
            {showPicker ? 'Close' : '+ Add'}
          </button>
        )}
      </div>

      {conditions.length === 0 ? (
        <p className="text-sm text-zinc-600">None</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {conditions.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-orange-500/15 text-orange-300 border border-orange-500/30"
            >
              {c.name}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  disabled={adding}
                  className="text-orange-400/70 hover:text-orange-200"
                  aria-label={`Remove ${c.name}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {canEdit && showPicker && (
        <div className="flex flex-col gap-3 p-3 rounded-lg bg-zinc-950 border border-zinc-800">
          <div className="flex flex-wrap gap-2">
            {STANDARD_CONDITIONS.map((name) => {
              const isActive = activeNames.has(name.toLowerCase())
              return (
                <button
                  key={name}
                  type="button"
                  disabled={isActive || adding}
                  onClick={() => add(name)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                    isActive
                      ? 'bg-zinc-800 text-zinc-600 border-zinc-800 cursor-not-allowed'
                      : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-orange-500/50 hover:text-orange-300'
                  }`}
                >
                  {name}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-2">
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
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-500"
            />
            <button
              type="button"
              onClick={() => add(custom)}
              disabled={adding || !custom.trim()}
              className="px-3 py-1.5 rounded-lg bg-amber-500 text-zinc-950 text-sm font-semibold hover:bg-amber-400 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
