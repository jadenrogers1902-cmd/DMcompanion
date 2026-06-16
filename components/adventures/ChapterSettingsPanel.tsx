'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { deleteChapter, updateChapter } from '@/lib/actions/chapters'
import type { Chapter } from '@/lib/types/adventure'
import { PrepDatabasePanel } from './PrepDatabasePanel'
import {
  ADVENTURE_STATUS_OPTIONS,
  adventureStatusBadgeVariant,
  adventureStatusLabel,
} from './adventure-status'
import { normalizePrepLinks, normalizePrepNotes, normalizeTags } from './prep-metadata'

interface ChapterSettingsPanelProps {
  chapter: Chapter
}

export function ChapterSettingsPanel({ chapter }: ChapterSettingsPanelProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(chapter.title)
  const [description, setDescription] = useState(chapter.description ?? '')
  const [status, setStatus] = useState(chapter.status)
  const [tags, setTags] = useState(() => normalizeTags(chapter.tags))
  const [notes, setNotes] = useState(() =>
    normalizePrepNotes(chapter.prep_notes, 'chapter', chapter.id),
  )
  const [links, setLinks] = useState(() =>
    normalizePrepLinks(chapter.important_links, 'chapter', chapter.id),
  )
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function cancelEdit() {
    setEditing(false)
    setTitle(chapter.title)
    setDescription(chapter.description ?? '')
    setStatus(chapter.status)
    setTags(normalizeTags(chapter.tags))
    setNotes(normalizePrepNotes(chapter.prep_notes, 'chapter', chapter.id))
    setLinks(normalizePrepLinks(chapter.important_links, 'chapter', chapter.id))
    setError(null)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const result = await updateChapter(chapter.campaign_id, chapter.adventure_id, chapter.id, {
      title,
      description,
      status,
      tags,
      prep_notes: notes,
      important_links: links,
    })
    setSaving(false)
    if (result?.error) {
      setError(result.error)
      return
    }
    setEditing(false)
    router.refresh()
  }

  async function handleDelete() {
    if (
      !confirm(
        `Delete chapter "${chapter.title}"? This removes the chapter and all of its prep. This cannot be undone.`,
      )
    ) {
      return
    }
    setDeleting(true)
    setError(null)
    const result = await deleteChapter(chapter.campaign_id, chapter.adventure_id, chapter.id)
    // deleteChapter redirects on success; only an error returns here.
    if (result?.error) {
      setError(result.error)
      setDeleting(false)
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-bold text-zinc-100">{chapter.title}</h1>
          <Badge variant={adventureStatusBadgeVariant(chapter.status)}>
            {adventureStatusLabel(chapter.status)}
          </Badge>
        </div>
        {chapter.description && (
          <p className="max-w-2xl text-sm text-zinc-400">{chapter.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Edit Chapter
          </Button>
          <Button variant="danger" size="sm" onClick={handleDelete} loading={deleting}>
            Delete
          </Button>
        </div>
        {error && (
          <p className="rounded-lg border border-red-800/60 bg-red-900/20 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex max-w-xl flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
        />
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={500}
        />
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as Chapter['status'])}
        >
          {ADVENTURE_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <PrepDatabasePanel
        title="Chapter Prep Database"
        parentType="chapter"
        parentId={chapter.id}
        tags={tags}
        notes={notes}
        links={links}
        onTagsChange={setTags}
        onNotesChange={setNotes}
        onLinksChange={setLinks}
      />

      {error && (
        <p className="rounded-lg border border-red-800/60 bg-red-900/20 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} loading={saving}>
          Save Changes
        </Button>
      </div>
    </div>
  )
}
