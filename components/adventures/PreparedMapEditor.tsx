'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapCanvas, type RenderToken } from '@/components/maps/MapCanvas'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import type { CodexPlayer } from '@/lib/actions/codex'
import { createClient } from '@/lib/supabase/client'
import {
  deletePreparedMap,
  removePreparedMapImage,
  savePreparedMap,
  setPreparedMapImage,
} from '@/lib/actions/prepared-maps'
import type {
  PreparedMap,
  PreparedMapLink,
  PreparedMapNote,
  PreparedMapToken,
} from '@/lib/types/adventure'
import type { CampaignDoc, CampaignDocLink } from '@/lib/types/database'
import {
  ADVENTURE_STATUS_OPTIONS,
  adventureStatusBadgeVariant,
  adventureStatusLabel,
} from './adventure-status'
import {
  createPrepLink,
  createPrepNote,
  normalizePrepLinks,
  normalizePrepNotes,
  normalizeTags,
  tagsFromInput,
} from './prep-metadata'
import {
  normalizePreparedToken,
  preparedTokenTypeMeta,
  toLiveTokenType,
} from './token-meta'
import { TokenDetailPanel } from './TokenDetailPanel'
import { TokenBuilderPanel, type StaticTokenTemplate } from './TokenBuilderPanel'
import { SendToLiveMapButton } from './SendToLiveMapDialog'

const MAX_BYTES = 15 * 1024 * 1024 // 15 MB
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

function loadImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image dimensions.'))
    }
    img.src = url
  })
}

interface PreparedMapEditorProps {
  map: PreparedMap
  imageUrl: string | null
  adventureTitle?: string
  chapterTitle?: string
  codexDocs?: CampaignDoc[]
  codexLinks?: CampaignDocLink[]
  players?: CodexPlayer[]
}

export function PreparedMapEditor({
  map,
  imageUrl,
  adventureTitle,
  chapterTitle,
  codexDocs = [],
  codexLinks = [],
  players = [],
}: PreparedMapEditorProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Editable state (saved together by the Save button)
  const [title, setTitle] = useState(map.title)
  const [description, setDescription] = useState(map.description ?? '')
  const [status, setStatus] = useState(map.status)
  const [gridEnabled, setGridEnabled] = useState(map.grid_enabled)
  const [gridSize, setGridSize] = useState(map.grid_size)
  // Normalize on load so pre-Phase-5 tokens (JSONB without icon/notes/links/
  // reveal_state) get sensible values.
  const [tokens, setTokens] = useState<PreparedMapToken[]>(() =>
    (map.tokens ?? []).map(normalizePreparedToken),
  )
  const [notes, setNotes] = useState<PreparedMapNote[]>(() =>
    normalizePrepNotes(map.notes, 'map', map.id),
  )
  const [links, setLinks] = useState<PreparedMapLink[]>(() =>
    normalizePrepLinks(map.links, 'map', map.id),
  )
  const [tags, setTags] = useState<string[]>(() => normalizeTags(map.tags))
  const [dirty, setDirty] = useState(false)

  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  const hasImage = Boolean(map.storage_path && imageUrl && map.width > 0 && map.height > 0)
  const selectedToken = tokens.find((token) => token.id === selectedTokenId) ?? null

  const renderTokens: RenderToken[] = useMemo(
    () =>
      tokens.map((token) => ({
        id: token.id,
        token_type: toLiveTokenType(token.token_type),
        name: token.name,
        x: token.x,
        y: token.y,
        size: token.size,
        color: token.color,
        visible_to_players: token.visible_to_players,
        icon: token.icon,
      })),
    [tokens],
  )

  const previewTokens = useMemo(
    () => renderTokens.filter((token) => token.visible_to_players),
    [renderTokens],
  )

  function touch() {
    setDirty(true)
    setSavedFlash(false)
  }

  function updateToken(id: string, patch: Partial<PreparedMapToken>) {
    setTokens((prev) => prev.map((token) => (token.id === id ? { ...token, ...patch } : token)))
    touch()
  }

  function addLinkedToken(doc: CampaignDoc) {
    const type = doc.doc_type === 'boss' || doc.doc_type === 'hostile_enemy'
      ? 'enemy'
      : doc.doc_type === 'character' || doc.doc_type === 'npc'
        ? 'npc'
        : doc.doc_type === 'item'
          ? 'item'
          : doc.doc_type === 'loot'
            ? 'loot'
            : doc.doc_type === 'location' || doc.doc_type === 'sub_location'
              ? 'location'
              : doc.doc_type === 'rumor' || doc.doc_type === 'handout' || doc.doc_type === 'map_note'
                ? 'clue'
                : 'custom'
    const meta = preparedTokenTypeMeta(type)
    const id = crypto.randomUUID()
    setTokens((prev) => [
      ...prev,
      {
        id,
        token_type: meta.value,
        linked_campaign_doc_id: doc.id,
        source: doc.source,
        is_dynamic: true,
        can_move: true,
        can_participate_in_combat: type === 'enemy' || type === 'npc',
        interactable: true,
        object_state: null,
        name: doc.title,
        icon: meta.icon,
        x: Math.round(map.width / 2) || 200,
        y: Math.round(map.height / 2) || 200,
        size: 1,
        color: meta.color,
        reveal_state: 'dm_only',
        visible_to_players: false,
        status: doc.status === 'archived' ? 'archived' : 'draft',
        tags: doc.tags ?? [],
        description: doc.player_summary ?? '',
        dm_notes: [doc.dm_summary, doc.dm_notes].filter(Boolean).join('\n\n'),
        prep_notes: [],
        player_notes: doc.player_summary ?? '',
        links: doc.source_url
          ? [{
              id: crypto.randomUUID(),
              title: doc.source === 'notion' ? 'Open Notion source' : 'Codex source',
              url: doc.source_url,
              type: 'wiki',
              description: '',
              pinned: true,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }]
          : [],
        resource: null,
      },
    ])
    setSelectedTokenId(id)
    touch()
  }

  function addStaticToken(template: StaticTokenTemplate) {
    const id = crypto.randomUUID()
    setTokens((prev) => [
      ...prev,
      {
        id,
        token_type: template.type,
        linked_campaign_doc_id: null,
        source: 'manual',
        is_dynamic: false,
        can_move: false,
        can_participate_in_combat: false,
        interactable: template.interactable,
        object_state: template.state ?? null,
        name: template.label,
        icon: template.icon,
        x: Math.round(map.width / 2) || 200,
        y: Math.round(map.height / 2) || 200,
        size: 1,
        color: template.color,
        reveal_state: 'dm_only',
        visible_to_players: false,
        status: 'draft',
        tags: [template.key],
        description: template.description,
        dm_notes: '',
        prep_notes: [],
        player_notes: '',
        links: [],
        resource: null,
      },
    ])
    setSelectedTokenId(id)
    touch()
  }

  function removeToken(id: string) {
    setTokens((prev) => prev.filter((token) => token.id !== id))
    if (selectedTokenId === id) setSelectedTokenId(null)
    touch()
  }

  function addNote() {
    setNotes((prev) => [...prev, createPrepNote('map', map.id)])
    touch()
  }

  function addLink() {
    setLinks((prev) => [...prev, createPrepLink('map', map.id)])
    touch()
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const result = await savePreparedMap(
      map.campaign_id,
      map.adventure_id,
      map.chapter_id,
      map.id,
      {
        title,
        description,
        status,
        grid_enabled: gridEnabled,
        grid_size: gridSize,
        tokens,
        notes,
        links,
        tags,
      },
    )
    setSaving(false)
    if (result?.error) {
      setError(result.error)
      return
    }
    setDirty(false)
    setSavedFlash(true)
    router.refresh()
  }

  async function handleImageChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!ACCEPTED.includes(file.type)) {
      setError('Please choose a PNG, JPG, WEBP, or GIF image.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('Image is too large (max 15 MB).')
      return
    }

    setUploading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { width, height } = await loadImageSize(file)
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
      const path = `${map.campaign_id}/prepared-${crypto.randomUUID()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('maps')
        .upload(path, file, { contentType: file.type, upsert: false })
      if (uploadError) {
        setError(`Upload failed: ${uploadError.message}`)
        setUploading(false)
        return
      }

      const result = await setPreparedMapImage(
        map.campaign_id,
        map.adventure_id,
        map.chapter_id,
        map.id,
        { storage_path: path, width, height },
      )
      if (result?.error) {
        await supabase.storage.from('maps').remove([path])
        setError(result.error)
        setUploading(false)
        return
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
    setUploading(false)
  }

  async function handleRemoveImage() {
    if (!confirm('Remove the background image? Tokens keep their positions.')) return
    setUploading(true)
    setError(null)
    const result = await removePreparedMapImage(
      map.campaign_id,
      map.adventure_id,
      map.chapter_id,
      map.id,
    )
    setUploading(false)
    if (result?.error) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  async function handleDelete() {
    if (
      !confirm(`Delete map "${map.title}"? This removes the scene and its image. This cannot be undone.`)
    ) {
      return
    }
    setError(null)
    const result = await deletePreparedMap(
      map.campaign_id,
      map.adventure_id,
      map.chapter_id,
      map.id,
    )
    if (result?.error) setError(result.error)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header: title, status, primary actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="truncate text-2xl font-bold text-zinc-100">{title || 'Untitled map'}</h1>
          <Badge variant={adventureStatusBadgeVariant(status)}>{adventureStatusLabel(status)}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setPreviewOpen(true)} disabled={!hasImage}>
            Preview
          </Button>
          <SendToLiveMapButton
            campaignId={map.campaign_id}
            preparedMapId={map.id}
            hasImage={hasImage}
            dirty={dirty}
          />
          <Button size="sm" onClick={handleSave} loading={saving}>
            {savedFlash && !dirty ? 'Saved ✓' : dirty ? 'Save changes' : 'Save'}
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-800/60 bg-red-900/20 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      {dirty && (
        <p className="text-xs text-amber-400/90">Unsaved changes — remember to save.</p>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(17rem,21rem)_minmax(0,1fr)_minmax(18rem,20rem)]">
        <TokenBuilderPanel
          campaignId={map.campaign_id}
          hasImage={hasImage}
          docs={codexDocs}
          tokens={tokens}
          selectedTokenId={selectedTokenId}
          onAddLinkedDoc={addLinkedToken}
          onAddStaticToken={addStaticToken}
          onSelectToken={setSelectedTokenId}
          onRemoveToken={removeToken}
        />

        {/* Canvas / image area */}
        <div className="h-[60vh] min-h-[360px] min-w-0 sm:h-[72vh] lg:h-[80vh]">
          {hasImage ? (
            <MapCanvas
              imageUrl={imageUrl!}
              width={map.width}
              height={map.height}
              gridEnabled={gridEnabled}
              gridSize={gridSize}
              tokens={renderTokens}
              mode="dm"
              selectedTokenId={selectedTokenId}
              onSelectToken={setSelectedTokenId}
              onMoveToken={(id, x, y) => updateToken(id, { x, y })}
              canDragToken={() => true}
            />
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-zinc-700 bg-zinc-950 text-center transition-colors hover:border-zinc-500 disabled:opacity-60"
            >
              <svg className="h-10 w-10 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <span className="text-sm text-zinc-300">
                {uploading ? 'Uploading…' : 'Add a background map image'}
              </span>
              <span className="text-xs text-zinc-600">PNG, JPG, WEBP, or GIF · up to 15 MB</span>
            </button>
          )}
        </div>

        {/* Prep sidebar */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* Details */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">Details</h2>
            <div className="flex flex-col gap-3">
              <Input label="Title" value={title} maxLength={120}
                onChange={(e) => { setTitle(e.target.value); touch() }} />
              <Textarea label="Description" rows={2} maxLength={500} value={description}
                onChange={(e) => { setDescription(e.target.value); touch() }} />
              <Select
                label="Status"
                hint='Set to "Ready" when this scene is prepped for the session.'
                value={status}
                onChange={(e) => { setStatus(e.target.value as PreparedMap['status']); touch() }}
              >
                {ADVENTURE_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
              <Input
                label="Tags"
                value={tags.join(', ')}
                placeholder="boss, social, session-3"
                onChange={(e) => {
                  setTags(tagsFromInput(e.target.value))
                  touch()
                }}
                hint="Comma-separated prep tags."
              />
            </div>
          </section>

          {/* Image + grid */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">Background &amp; Grid</h2>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" loading={uploading}
                  onClick={() => fileInputRef.current?.click()}>
                  {map.storage_path ? 'Replace Image' : 'Add Image'}
                </Button>
                {map.storage_path && (
                  <Button variant="danger" size="sm" onClick={handleRemoveImage} disabled={uploading}>
                    Remove Image
                  </Button>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={gridEnabled}
                  onChange={(e) => { setGridEnabled(e.target.checked); touch() }}
                  className="h-4 w-4 accent-amber-500"
                />
                Show grid
              </label>
              {gridEnabled && (
                <Input
                  label="Grid size (px per square)"
                  type="number"
                  min={5}
                  value={gridSize}
                  onChange={(e) => { setGridSize(Math.max(5, Number(e.target.value) || 50)); touch() }}
                />
              )}
            </div>
          </section>

          {/* DM notes */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                DM Notes <span className="text-zinc-600">({notes.length})</span>
              </h2>
              <Button variant="secondary" size="sm" onClick={addNote}>Add DM Note</Button>
            </div>
            {notes.length === 0 && (
              <p className="text-xs text-zinc-600">Private prep notes — players never see these.</p>
            )}
            <div className="flex flex-col gap-2.5">
              {notes.map((note, index) => (
                <div key={note.id} className="flex items-start gap-2">
                  <Textarea
                    aria-label={`DM note ${index + 1}`}
                    rows={2}
                    maxLength={2000}
                    value={note.body}
                    placeholder="Trap triggers when the lever is pulled…"
                    onChange={(e) => {
                      setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, body: e.target.value } : n)))
                      touch()
                    }}
                    className="flex-1"
                  />
                  <label className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
                    <input
                      type="checkbox"
                      checked={note.pinned}
                      onChange={(e) => {
                        setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, pinned: e.target.checked } : n)))
                        touch()
                      }}
                      className="h-4 w-4 accent-amber-500"
                    />
                    Pin
                  </label>
                  <button
                    type="button"
                    onClick={() => { setNotes((prev) => prev.filter((n) => n.id !== note.id)); touch() }}
                    className="mt-1 rounded-md p-1 text-zinc-600 hover:bg-zinc-800 hover:text-red-400"
                    aria-label={`Remove DM note ${index + 1}`}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Links */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                Links <span className="text-zinc-600">({links.length})</span>
              </h2>
              <Button variant="secondary" size="sm" onClick={addLink}>Add Link</Button>
            </div>
            {links.length === 0 && (
              <p className="text-xs text-zinc-600">Reference material: stat blocks, music, handouts.</p>
            )}
            <div className="flex flex-col gap-2.5">
              {links.map((link, index) => (
                <div key={link.id} className="flex items-start gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Input
                      aria-label={`Link ${index + 1} label`}
                      placeholder="Label (e.g. Goblin stat block)"
                      maxLength={120}
                      value={link.title}
                      onChange={(e) => {
                        setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, title: e.target.value } : l)))
                        touch()
                      }}
                    />
                    <Input
                      aria-label={`Link ${index + 1} URL`}
                      placeholder="https://…"
                      maxLength={1000}
                      value={link.url}
                      onChange={(e) => {
                        setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, url: e.target.value } : l)))
                        touch()
                      }}
                    />
                    {link.url && /^https?:\/\//.test(link.url) && (
                      <a href={link.url} target="_blank" rel="noopener noreferrer"
                        className="truncate text-xs text-amber-400/90 hover:text-amber-300">
                        Open link ↗
                      </a>
                    )}
                  </div>
                  <label className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
                    <input
                      type="checkbox"
                      checked={link.pinned}
                      onChange={(e) => {
                        setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, pinned: e.target.checked } : l)))
                        touch()
                      }}
                      className="h-4 w-4 accent-amber-500"
                    />
                    Pin
                  </label>
                  <button
                    type="button"
                    onClick={() => { setLinks((prev) => prev.filter((l) => l.id !== link.id)); touch() }}
                    className="mt-1 rounded-md p-1 text-zinc-600 hover:bg-zinc-800 hover:text-red-400"
                    aria-label={`Remove link ${index + 1}`}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Danger zone */}
          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <Button variant="danger" size="sm" onClick={handleDelete}>Delete Map</Button>
          </section>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        onChange={handleImageChosen}
        className="hidden"
      />

      {/* Notion-style token page (drawer on desktop, sheet on mobile) */}
      {selectedToken && (
        <TokenDetailPanel
          token={selectedToken}
          related={{
            adventureId: map.adventure_id,
            adventureTitle,
            chapterId: map.chapter_id,
            chapterTitle,
            preparedMapId: map.id,
            preparedMapTitle: title || map.title,
          }}
          campaignId={map.campaign_id}
          codexDocs={codexDocs}
          codexLinks={codexLinks}
          players={players}
          onChange={(patch) => updateToken(selectedToken.id, patch)}
          onRemove={() => removeToken(selectedToken.id)}
          onClose={() => setSelectedTokenId(null)}
        />
      )}

      {/* Player-style preview */}
      {previewOpen && hasImage && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/80 p-3 sm:p-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm text-zinc-300">
              Preview — roughly what players would see (hidden tokens excluded, no fog).
            </p>
            <Button variant="secondary" size="sm" onClick={() => setPreviewOpen(false)}>
              Close Preview
            </Button>
          </div>
          <div className="min-h-0 flex-1">
            <MapCanvas
              imageUrl={imageUrl!}
              width={map.width}
              height={map.height}
              gridEnabled={gridEnabled}
              gridSize={gridSize}
              tokens={previewTokens}
              mode="player"
            />
          </div>
        </div>
      )}
    </div>
  )
}
