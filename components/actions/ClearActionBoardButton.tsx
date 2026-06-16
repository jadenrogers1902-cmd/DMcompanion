'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { clearActionBoard } from '@/lib/actions/action-intents'

interface ClearActionBoardButtonProps {
  campaignId: string
  disabled?: boolean
  count?: number
  size?: 'sm' | 'md'
  className?: string
  onCleared?: () => void
}

export function ClearActionBoardButton({
  campaignId,
  disabled = false,
  count = 0,
  size = 'md',
  className = '',
  onCleared,
}: ClearActionBoardButtonProps) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const blocked = disabled || count <= 0 || clearing
  const buttonSize = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-2 text-sm'

  async function confirmClear() {
    setClearing(true)
    setError(null)
    const result = await clearActionBoard(campaignId)
    setClearing(false)

    if (result?.error) {
      setError(result.error)
      return
    }

    try {
      sessionStorage.removeItem(`latest-action-dismissed:${campaignId}`)
    } catch {
      // Session storage is optional UI memory.
    }

    setConfirming(false)
    onCleared?.()
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        disabled={blocked}
        onClick={() => setConfirming(true)}
        className={`inline-flex items-center justify-center rounded-md border border-red-800/60 bg-red-950/25 font-semibold text-red-200 transition hover:border-red-600 hover:bg-red-900/35 disabled:cursor-not-allowed disabled:opacity-45 ${buttonSize} ${className}`}
      >
        {clearing ? 'Clearing...' : 'Clear Board'}
      </button>

      {confirming && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-action-board-title"
        >
          <div className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-950 p-4 shadow-2xl shadow-black/50">
            <h2 id="clear-action-board-title" className="text-base font-semibold text-zinc-100">
              Clear Action Board?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              This removes all action requests from the DM board, clears the latest-action preview,
              resets queue counts, and removes linked roll/result board state for this campaign.
            </p>
            {count > 0 && (
              <p className="mt-2 text-xs text-amber-200">
                {count} action {count === 1 ? 'request' : 'requests'} will be cleared.
              </p>
            )}
            {error && (
              <p className="mt-3 rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-200">
                {error}
              </p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={clearing}
                onClick={() => {
                  setConfirming(false)
                  setError(null)
                }}
                className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-500 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={clearing}
                onClick={confirmClear}
                className="rounded-md border border-red-700 bg-red-900/60 px-3 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-800 disabled:opacity-50"
              >
                {clearing ? 'Clearing...' : 'Yes, Clear Board'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
