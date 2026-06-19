'use client'

import { useState } from 'react'
import { deleteMap } from '@/lib/actions/maps'

/**
 * Remove a deployed live map from the Live Map section. Deletes the live copy
 * and its tokens (the prepared map in Adventure Maker is untouched). Sits on top
 * of the map card link, so it stops the click from navigating.
 */
export function RemoveLiveMapButton({
  campaignId,
  mapId,
  storagePath,
  mapName,
}: {
  campaignId: string
  mapId: string
  storagePath: string
  mapName: string
}) {
  const [busy, setBusy] = useState(false)

  async function remove(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (
      !confirm(
        `Remove "${mapName}" from the Live Map? This deletes the live copy and its tokens. Your prepared version in Adventure Maker is not affected.`,
      )
    ) {
      return
    }
    setBusy(true)
    await deleteMap(campaignId, mapId, storagePath)
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      aria-label={`Remove ${mapName} from Live Map`}
      title="Remove from Live Map"
      className="absolute right-2 top-2 z-10 rounded-md border border-zinc-700 bg-zinc-950/80 p-1.5 text-zinc-400 transition hover:border-red-500/60 hover:text-red-400 disabled:opacity-50"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
      </svg>
    </button>
  )
}
