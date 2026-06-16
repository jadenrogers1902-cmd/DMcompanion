'use client'

import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import type {
  PrepImportantLink,
  PrepLinkType,
  PrepNote,
  PrepNoteVisibility,
} from '@/lib/types/adventure'
import {
  createPrepLink,
  createPrepNote,
  detectPrepLinkType,
  nowIso,
  tagsFromInput,
} from './prep-metadata'

const LINK_TYPES: { value: PrepLinkType; label: string }[] = [
  { value: 'wiki', label: 'Wiki' },
  { value: 'dnd_beyond', label: 'D&D Beyond' },
  { value: 'srd', label: 'SRD' },
  { value: 'roll20', label: 'Roll20' },
  { value: 'custom', label: 'Custom' },
]

interface PrepDatabasePanelProps {
  title: string
  parentType: PrepNote['parentType']
  parentId: string
  tags: string[]
  notes: PrepNote[]
  links: PrepImportantLink[]
  onTagsChange: (tags: string[]) => void
  onNotesChange: (notes: PrepNote[]) => void
  onLinksChange: (links: PrepImportantLink[]) => void
}

export function PrepDatabasePanel({
  title,
  parentType,
  parentId,
  tags,
  notes,
  links,
  onTagsChange,
  onNotesChange,
  onLinksChange,
}: PrepDatabasePanelProps) {
  const pinnedNotes = notes.filter((note) => note.pinned)
  const pinnedLinks = links.filter((link) => link.pinned)

  function updateNote(id: string, patch: Partial<PrepNote>) {
    onNotesChange(
      notes.map((note) =>
        note.id === id ? { ...note, ...patch, updatedAt: nowIso() } : note,
      ),
    )
  }

  function updateLink(id: string, patch: Partial<PrepImportantLink>) {
    onLinksChange(
      links.map((link) =>
        link.id === id ? { ...link, ...patch, updatedAt: nowIso() } : link,
      ),
    )
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            {title}
          </h2>
          <p className="mt-1 text-xs text-zinc-600">
            Prep notes, important links, tags, and pinned items stay DM-side.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onNotesChange([...notes, createPrepNote(parentType, parentId)])}
          >
            Add Note
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onLinksChange([...links, createPrepLink(parentType, parentId)])}
          >
            Add Link
          </Button>
        </div>
      </div>

      {(pinnedNotes.length > 0 || pinnedLinks.length > 0) && (
        <div className="mb-4 rounded-lg border border-amber-800/50 bg-amber-950/20 p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-300">
            Pinned
          </h3>
          <div className="flex flex-col gap-1.5 text-sm">
            {pinnedNotes.map((note) => (
              <div key={note.id} className="text-zinc-300">
                {note.title || 'Untitled note'}
              </div>
            ))}
            {pinnedLinks.map((link) => (
              <a
                key={link.id}
                href={link.url || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-amber-300 hover:text-amber-200"
              >
                {link.title || link.url || 'Untitled link'}
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4">
        <Input
          label="Tags"
          value={tags.join(', ')}
          placeholder="boss, social, session-3"
          onChange={(e) => onTagsChange(tagsFromInput(e.target.value))}
          hint="Comma-separated prep tags."
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Notes <span className="text-zinc-700">({notes.length})</span>
            </h3>
          </div>
          {notes.length === 0 ? (
            <p className="text-xs text-zinc-600">No prep notes yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {notes.map((note, index) => (
                <div key={note.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                  <div className="mb-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
                    <Input
                      aria-label={`Note ${index + 1} title`}
                      placeholder="Note title"
                      value={note.title}
                      maxLength={120}
                      onChange={(e) => updateNote(note.id, { title: e.target.value })}
                    />
                    <Select
                      aria-label={`Note ${index + 1} visibility`}
                      value={note.visibility}
                      onChange={(e) =>
                        updateNote(note.id, {
                          visibility: e.target.value as PrepNoteVisibility,
                        })
                      }
                    >
                      <option value="dm_only">DM-only</option>
                      <option value="player_visible">Player-facing</option>
                    </Select>
                  </div>
                  <Textarea
                    aria-label={`Note ${index + 1} body`}
                    rows={3}
                    maxLength={4000}
                    value={note.body}
                    placeholder="Prep detail, read-aloud text, secret, clue, or reminder."
                    onChange={(e) => updateNote(note.id, { body: e.target.value })}
                  />
                  <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                    <Input
                      aria-label={`Note ${index + 1} tags`}
                      placeholder="tags"
                      value={note.tags.join(', ')}
                      onChange={(e) => updateNote(note.id, { tags: tagsFromInput(e.target.value) })}
                    />
                    <label className="flex items-center gap-2 rounded-lg border border-zinc-800 px-2 text-xs text-zinc-300">
                      <input
                        type="checkbox"
                        checked={note.pinned}
                        onChange={(e) => updateNote(note.id, { pinned: e.target.checked })}
                        className="h-4 w-4 accent-amber-500"
                      />
                      Pinned
                    </label>
                    <button
                      type="button"
                      onClick={() => onNotesChange(notes.filter((item) => item.id !== note.id))}
                      className="rounded-lg border border-zinc-800 px-2 text-xs text-zinc-500 hover:border-red-800 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Important Links <span className="text-zinc-700">({links.length})</span>
          </h3>
          {links.length === 0 ? (
            <p className="text-xs text-zinc-600">No important links yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {links.map((link, index) => (
                <div key={link.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                  <div className="mb-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
                    <Input
                      aria-label={`Link ${index + 1} title`}
                      placeholder="Link title"
                      value={link.title}
                      maxLength={120}
                      onChange={(e) => updateLink(link.id, { title: e.target.value })}
                    />
                    <Select
                      aria-label={`Link ${index + 1} type`}
                      value={link.type}
                      onChange={(e) => updateLink(link.id, { type: e.target.value as PrepLinkType })}
                    >
                      {LINK_TYPES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Input
                    aria-label={`Link ${index + 1} URL`}
                    placeholder="https://..."
                    value={link.url}
                    maxLength={1000}
                    onChange={(e) => {
                      const url = e.target.value
                      updateLink(link.id, {
                        url,
                        ...(link.type === 'custom' && url ? { type: detectPrepLinkType(url) } : {}),
                      })
                    }}
                  />
                  <Textarea
                    aria-label={`Link ${index + 1} description`}
                    rows={2}
                    maxLength={500}
                    value={link.description}
                    placeholder="Why this matters during prep or play."
                    onChange={(e) => updateLink(link.id, { description: e.target.value })}
                    className="mt-2"
                  />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-xs text-zinc-300">
                      <input
                        type="checkbox"
                        checked={link.pinned}
                        onChange={(e) => updateLink(link.id, { pinned: e.target.checked })}
                        className="h-4 w-4 accent-amber-500"
                      />
                      Pinned
                    </label>
                    <div className="flex items-center gap-2">
                      {link.url && /^https?:\/\//.test(link.url) && (
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-amber-400 hover:text-amber-300"
                        >
                          Open
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => onLinksChange(links.filter((item) => item.id !== link.id))}
                        className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-500 hover:border-red-800 hover:text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
