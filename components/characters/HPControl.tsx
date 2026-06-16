'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateVitals } from '@/lib/actions/characters'
import { hpColor, hpBarColor } from '@/lib/utils/character'

interface HPControlProps {
  campaignId: string
  characterId: string
  currentHp: number
  maxHp: number
  tempHp: number
  canEdit: boolean
}

export function HPControl({
  campaignId,
  characterId,
  currentHp,
  maxHp,
  tempHp,
  canEdit,
}: HPControlProps) {
  const router = useRouter()
  const [current, setCurrent] = useState(currentHp)
  const [temp, setTemp] = useState(tempHp)
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)

  async function apply(delta: number) {
    if (!canEdit) return
    const value = parseInt(amount || '0', 10)
    if (!value) return
    const next = Math.max(0, current + delta * value)
    setCurrent(next)
    setAmount('')
    setSaving(true)
    await updateVitals(campaignId, characterId, { current_hp: next })
    setSaving(false)
    router.refresh()
  }

  async function saveTemp(value: number) {
    if (!canEdit) return
    setTemp(value)
    setSaving(true)
    await updateVitals(campaignId, characterId, { temp_hp: value })
    setSaving(false)
    router.refresh()
  }

  const pct = maxHp > 0 ? Math.min(100, Math.max(0, (current / maxHp) * 100)) : 0

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          Hit Points
        </span>
        {saving && <span className="text-xs text-zinc-600">Saving…</span>}
      </div>

      <div className="flex items-baseline gap-1">
        <span className={`text-3xl font-bold ${hpColor(current, maxHp)}`}>
          {current}
        </span>
        <span className="text-lg text-zinc-500">/ {maxHp}</span>
        {temp > 0 && (
          <span className="ml-2 text-sm text-blue-400 font-medium">
            +{temp} temp
          </span>
        )}
      </div>

      {/* HP bar */}
      <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${hpBarColor(current, maxHp)}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {canEdit && (
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => apply(-1)}
              className="px-3 py-2 rounded-lg bg-red-900/40 text-red-300 hover:bg-red-800/50 border border-red-800/50 text-sm font-medium transition-colors"
              type="button"
            >
              − Damage
            </button>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="w-20 text-center rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500"
            />
            <button
              onClick={() => apply(1)}
              className="px-3 py-2 rounded-lg bg-emerald-900/40 text-emerald-300 hover:bg-emerald-800/50 border border-emerald-800/50 text-sm font-medium transition-colors"
              type="button"
            >
              + Heal
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-zinc-400">Temp HP</label>
            <input
              type="number"
              defaultValue={temp}
              min={0}
              onBlur={(e) => {
                const v = Math.max(0, parseInt(e.target.value || '0', 10))
                if (v !== temp) saveTemp(v)
              }}
              className="w-20 text-center rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-500"
            />
          </div>
        </div>
      )}
    </div>
  )
}
