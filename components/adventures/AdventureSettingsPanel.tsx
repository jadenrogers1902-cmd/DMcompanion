'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { deleteAdventure, updateAdventure } from '@/lib/actions/adventures'
import type { Adventure } from '@/lib/types/adventure'
import { PrepDatabasePanel } from './PrepDatabasePanel'
import {
  ADVENTURE_STATUS_OPTIONS,
  adventureStatusBadgeVariant,
  adventureStatusLabel,
} from './adventure-status'
import { normalizePrepLinks, normalizePrepNotes, normalizeTags } from './prep-metadata'

interface AdventureSettingsPanelProps {
  adventure: Adventure
}

export function AdventureSettingsPanel({ adventure }: AdventureSettingsPanelProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(adventure.title)
  const [description, setDescription] = useState(adventure.description ?? '')
  const [status, setStatus] = useState(adventure.status)
  const [tags, setTags] = useState(() => normalizeTags(adventure.tags))
  const [notes, setNotes] = useState(() =>
    normalizePrepNotes(adventure.prep_notes, 'adventure', adventure.id),
  )
  const [links, setLinks] = useState(() =>
    normalizePrepLinks(adventure.important_links, 'adventure', adventure.id),
  )
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function cancelEdit() {
    setEditing(false)
    setTitle(adventure.title)
    setDescription(adventure.description ?? '')
    setStatus(adventure.status)
    setTags(normalizeTags(adventure.tags))
    setNotes(normalizePrepNotes(adventure.prep_notes, 'adventure', adventure.id))
    setLinks(normalizePrepLinks(adventure.important_links, 'adventure', adventure.id))
    setError(null)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const result = await updateAdventure(adventure.campaign_id, adventure.id, {
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
        `Delete "${adventure.title}"? This removes the adventure and all of its prep. This cannot be undone.`,
      )
    ) {
      return
    }
    setDeleting(true)
    setError(null)
    const result = await deleteAdventure(adventure.campaign_id, adventure.id)
    // deleteAdventure redirects on success; only an error returns here.
    if (result?.error) {
      setError(result.error)
      setDeleting(false)
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-bold text-zinc-100">{adventure.title}</h1>
          <Badge variant={adventureStatusBadgeVariant(adventure.status)}>
            {adventureStatusLabel(adventure.status)}
          </Badge>
        </div>
        {adventure.description && (
          <p className="max-w-2xl text-sm text-zinc-400">{adventure.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Edit Adventure
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
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as Adventure['status'])}>
          {ADVENTURE_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <PrepDatabasePanel
        title="Adventure Prep Database"
        parentType="adventure"
        parentId={adventure.id}
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
