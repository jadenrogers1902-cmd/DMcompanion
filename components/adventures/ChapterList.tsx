'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { moveChapter } from '@/lib/actions/chapters'
import type { Chapter } from '@/lib/types/adventure'
import {
  adventureStatusBadgeVariant,
  adventureStatusLabel,
} from './adventure-status'

interface ChapterListProps {
  campaignId: string
  adventureId: string
  chapters: Chapter[]
  /** Map/scene count per chapter id (scenes arrive in a later phase). */
  sceneCounts?: Record<string, number>
}

function lastEdited(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function ChapterList({ campaignId, adventureId, chapters, sceneCounts = {} }: ChapterListProps) {
  const router = useRouter()
  const [movingId, setMovingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleMove(chapterId: string, direction: 'up' | 'down') {
    setMovingId(chapterId)
    setError(null)
    const result = await moveChapter(campaignId, adventureId, chapterId, direction)
    setMovingId(null)
    if (result?.error) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-2.5">
      {error && (
        <p className="rounded-lg border border-red-800/60 bg-red-900/20 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      {chapters.map((chapter, index) => {
        const sceneCount = sceneCounts[chapter.id] ?? 0
        return (
          <div
            key={chapter.id}
            className="relative flex items-stretch gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4 pl-3 transition-colors hover:border-zinc-600"
          >
            {/* Reorder rail */}
            <div className="relative z-10 flex flex-col items-center justify-center gap-1">
              <button
                type="button"
                onClick={() => handleMove(chapter.id, 'up')}
                disabled={index === 0 || movingId !== null}
                className="rounded-md p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label={`Move "${chapter.title}" up`}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                </svg>
              </button>
              <span className="text-[11px] font-semibold text-zinc-600">{index + 1}</span>
              <button
                type="button"
                onClick={() => handleMove(chapter.id, 'down')}
                disabled={index === chapters.length - 1 || movingId !== null}
                className="rounded-md p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label={`Move "${chapter.title}" down`}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
            </div>

            <div className="min-w-0 flex-1">
              {/* Stretched link: the whole card opens the chapter workspace. */}
              <Link
                href={`/campaigns/${campaignId}/adventures/${adventureId}/chapters/${chapter.id}`}
                className="absolute inset-0 rounded-xl"
                aria-label={`Open chapter "${chapter.title}"`}
              />
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-zinc-100">{chapter.title}</h3>
                <Badge variant={adventureStatusBadgeVariant(chapter.status)}>
                  {adventureStatusLabel(chapter.status)}
                </Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-zinc-500">
                {chapter.description || 'No description yet.'}
              </p>
              <div className="mt-2.5 flex items-center gap-3 text-xs text-zinc-600">
                <span>
                  {sceneCount} {sceneCount === 1 ? 'map' : 'maps'}
                </span>
                <span aria-hidden>·</span>
                <span>Edited {lastEdited(chapter.updated_at)}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
