'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { ModalDialog } from '@/components/ui/ModalDialog'
import { createPreparedMap } from '@/lib/actions/prepared-maps'

interface CreatePreparedMapButtonProps {
  campaignId: string
  adventureId: string
  chapterId: string
  size?: 'sm' | 'md' | 'lg'
}

export function CreatePreparedMapButton({
  campaignId,
  adventureId,
  chapterId,
  size = 'sm',
}: CreatePreparedMapButtonProps) {
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
      setError('Give your map a title.')
      return
    }
    setSaving(true)
    setError(null)
    const result = await createPreparedMap(campaignId, adventureId, chapterId, {
      title,
      description,
    })
    if (result?.error) {
      setError(result.error)
      setSaving(false)
      return
    }
    router.push(
      `/campaigns/${campaignId}/adventures/${adventureId}/chapters/${chapterId}/maps/${result.preparedMapId}`,
    )
  }

  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}>
        Create Map
      </Button>

      {open && (
        <ModalDialog
          labelledBy="create-prepared-map-title"
          describedBy="create-prepared-map-description"
          onClose={close}
          overlayClassName="z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
          panelClassName="w-full max-h-[90dvh] overflow-y-auto rounded-t-2xl border border-border bg-canvas p-5 shadow-2xl sm:max-w-md sm:rounded-2xl"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="create-prepared-map-title" className="text-lg font-semibold text-content">New Prepared Map</h2>
                <p id="create-prepared-map-description" className="mt-0.5 text-sm text-faint">
                  A premade scene for this chapter — add the image, tokens, and notes next.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-faint hover:bg-panel-raised hover:text-content"
                aria-label="Close new prepared map dialog"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <Input
                label="Title"
                placeholder="Goblin Ambush — Forest Road"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                autoFocus
                data-dialog-initial-focus
              />
              <Textarea
                label="Description"
                placeholder="What is this scene? (optional)"
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
                  Create Map
                </Button>
              </div>
            </div>
        </ModalDialog>
      )}
    </>
  )
}
