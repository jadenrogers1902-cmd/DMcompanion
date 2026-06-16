'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { createChapter } from '@/lib/actions/chapters'

interface CreateChapterButtonProps {
  campaignId: string
  adventureId: string
  size?: 'sm' | 'md' | 'lg'
}

export function CreateChapterButton({ campaignId, adventureId, size = 'sm' }: CreateChapterButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function close() {
    if (saving) return
    setOpen(false)
    setTitle('')
    setDescription('')
    setError(null)
  }

  async function handleCreate() {
    if (!title.trim()) {
      setError('Give your chapter a title.')
      return
    }
    setSaving(true)
    setError(null)
    const result = await createChapter(campaignId, adventureId, { title, description })
    if (result?.error) {
      setError(result.error)
      setSaving(false)
      return
    }
    router.push(`/campaigns/${campaignId}/adventures/${adventureId}/chapters/${result.chapterId}`)
  }

  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}>
        Create Chapter
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
          onClick={close}
        >
          <div
            className="w-full max-h-[90dvh] overflow-y-auto rounded-t-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl sm:max-w-md sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-zinc-100">New Chapter</h2>
                <p className="mt-0.5 text-sm text-zinc-500">
                  A major section of this adventure — a session, a location, an encounter.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-md p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <Input
                label="Title"
                placeholder="Dungeon Entrance"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                autoFocus
              />
              <Textarea
                label="Description"
                placeholder="What happens in this chapter? (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={500}
              />

              {error && (
                <p className="rounded-lg border border-red-800/60 bg-red-900/20 px-3 py-2 text-sm text-red-300">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={close} disabled={saving}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleCreate} loading={saving}>
                  Create Chapter
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
