'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setChapterLive } from '@/lib/actions/chapters'

/**
 * Open a chapter for players: marks it the campaign's live chapter and activates
 * its hub map as the live map. Disabled until the chapter has a hub with an
 * image. The live session indicator stays a separate control (Start session).
 */
export function ChapterLiveButton({
  campaignId,
  adventureId,
  chapterId,
  isLive,
  hasHub,
  hubHasImage,
}: {
  campaignId: string
  adventureId: string
  chapterId: string
  isLive: boolean
  hasHub: boolean
  hubHasImage: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)

  const blockedReason = !hasHub
    ? 'Set one map as the hub first.'
    : !hubHasImage
      ? 'The hub map needs a background image.'
      : null

  async function open() {
    setBusy(true)
    setError(null)
    const result = await setChapterLive(campaignId, adventureId, chapterId)
    setBusy(false)
    if (result?.error) {
      setError(result.error)
      return
    }
    setFlash(true)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={open}
          disabled={busy || Boolean(blockedReason)}
          className="inline-flex items-center gap-2 rounded-lg border border-blue-500/60 bg-blue-500/15 px-4 py-2 text-sm font-semibold text-blue-100 transition hover:border-blue-400 hover:bg-blue-500/25 disabled:cursor-not-allowed disabled:opacity-50"
          title={blockedReason ?? undefined}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
          </svg>
          {busy ? 'Opening…' : isLive ? 'Re-open hub for players' : 'Open chapter for players'}
        </button>
        {isLive && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Live for players
          </span>
        )}
      </div>
      {blockedReason && <p className="text-xs text-zinc-500">{blockedReason}</p>}
      {error && <p className="text-xs text-red-300">{error}</p>}
      {flash && !error && (
        <p className="text-xs text-emerald-300">Hub is now the active map — players can open it from Live Map.</p>
      )}
    </div>
  )
}
