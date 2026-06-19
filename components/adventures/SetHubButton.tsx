'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setPreparedMapHub } from '@/lib/actions/prepared-maps'

/**
 * Toggle whether this prepared map is its chapter's hub (entry) map. One hub per
 * chapter — setting this map as hub clears any previous one server-side.
 */
export function SetHubButton({
  campaignId,
  adventureId,
  chapterId,
  preparedMapId,
  isHub,
}: {
  campaignId: string
  adventureId: string
  chapterId: string
  preparedMapId: string
  isHub: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    setBusy(true)
    setError(null)
    const result = await setPreparedMapHub(campaignId, adventureId, chapterId, preparedMapId, !isHub)
    setBusy(false)
    if (result?.error) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
          isHub
            ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
            : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100'
        }`}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
        {busy ? 'Saving…' : isHub ? 'Hub map ✓ — clear' : 'Set as hub'}
      </button>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  )
}
