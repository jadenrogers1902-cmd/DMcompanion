'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { ModalDialog } from '@/components/ui/ModalDialog'
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
        <ModalDialog
          labelledBy="create-chapter-title"
          describedBy="create-chapter-description"
          onClose={close}
          overlayClassName="z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
          panelClassName="w-full max-h-[90dvh] overflow-y-auto rounded-t-2xl border border-border bg-canvas p-5 shadow-2xl sm:max-w-md sm:rounded-2xl"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="create-chapter-title" className="text-lg font-semibold text-content">New Chapter</h2>
                <p id="create-chapter-description" className="mt-0.5 text-sm text-faint">
                  A major section of this adventure — a session, a location, an encounter.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-faint hover:bg-panel-raised hover:text-content"
                aria-label="Close new chapter dialog"
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
                data-dialog-initial-focus
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
                <p role="alert" className="rounded-lg border border-red-800/60 bg-red-900/20 px-3 py-2 text-sm text-red-300">
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
        </ModalDialog>
      )}
    </>
  )
}
