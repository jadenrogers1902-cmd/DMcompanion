'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapCanvas, type RenderRoomRegion, type RenderToken, type RenderWall, type RoomDrawTool } from '@/components/maps/MapCanvas'
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
import { prepareMapImageUpload } from '@/lib/maps/image-compress'
import type {
  PreparedMap,
  PreparedMapLink,
  PreparedMapNote,
  PreparedMapRoomRegion,
  PreparedMapToken,
  PreparedMapWallRegion,
} from '@/lib/types/adventure'
import type { CampaignDoc, CampaignDocLink, FogMode, FogStyle } from '@/lib/types/database'
import {
  ADVENTURE_STATUS_OPTIONS,
  adventureStatusBadgeVariant,
  adventureStatusLabel,
} from './adventure-status'
import {
  createPrepLink,
  createPrepNote,
  createPreparedRoomRegion,
  createPreparedWallRegion,
  normalizePreparedRoomRegions,
  normalizePreparedWallRegions,
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

export type DestinationMapOption = {
  id: string
  title: string
  adventure_id: string
  chapter_id: string
  adventure_title?: string | null
  chapter_title?: string | null
}

interface PreparedMapEditorProps {
  map: PreparedMap
  imageUrl: string | null
  adventureTitle?: string
  chapterTitle?: string
  codexDocs?: CampaignDoc[]
  codexLinks?: CampaignDocLink[]
  players?: CodexPlayer[]
  /** Other prepared maps in the campaign — transport tokens link to these. */
  destinationMaps?: DestinationMapOption[]
}

export function PreparedMapEditor({
  map,
  imageUrl,
  adventureTitle,
  chapterTitle,
  codexDocs = [],
  codexLinks = [],
  players = [],
  destinationMaps = [],
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
  const [roomRegions, setRoomRegions] = useState<PreparedMapRoomRegion[]>(() =>
    normalizePreparedRoomRegions(map.room_regions ?? []),
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
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [subLocationsOpen, setSubLocationsOpen] = useState(false)
  const [roomDrawTool, setRoomDrawTool] = useState<RoomDrawTool>(null)
  const [draftRoomPolygonPoints, setDraftRoomPolygonPoints] = useState<{ x: number; y: number }[]>([])
  const [roomEditMode, setRoomEditMode] = useState(false)
  // Whether the current draw / selection targets a sub-location room or a fog mask.
  const [drawTarget, setDrawTarget] = useState<'room' | 'fog' | 'wall'>('room')
  // ─── Fog controls (base fog + painted fog masks) ───
  const [fogRegions, setFogRegions] = useState<PreparedMapRoomRegion[]>(() =>
    normalizePreparedRoomRegions(map.fog_regions ?? []),
  )
  const [fogMode, setFogMode] = useState<FogMode>(map.fog_mode ?? 'rooms')
  const [fogStyle, setFogStyle] = useState<FogStyle>(map.fog_style ?? 'blackout')
  const [fogOpen, setFogOpen] = useState(false)
  const [selectedFogId, setSelectedFogId] = useState<string | null>(null)
  // ─── Wall controls (movement-blocking dungeon walls) ───
  const [wallRegions, setWallRegions] = useState<PreparedMapWallRegion[]>(() =>
    normalizePreparedWallRegions(map.wall_regions ?? []),
  )
  const [wallsOpen, setWallsOpen] = useState(false)
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  const hasImage = Boolean(map.storage_path && imageUrl && map.width > 0 && map.height > 0)
  const selectedToken = tokens.find((token) => token.id === selectedTokenId) ?? null
  const selectedRoom = roomRegions.find((room) => room.id === selectedRoomId) ?? null
  const selectedFog = fogRegions.find((region) => region.id === selectedFogId) ?? null
  const doorTokens = tokens.filter((token) => token.token_type === 'door')
  const subLocationDocs = codexDocs.filter((doc) => doc.doc_type === 'sub_location')

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
  // Rooms and fog masks both render through MapCanvas's room layer (fog masks
  // are just unlabeled masks), so they share one selection + border-edit path.
  const renderRooms: RenderRoomRegion[] = useMemo(
    () =>
      [...roomRegions, ...fogRegions].map((room) => ({
        id: room.id,
        name: room.name,
        shape_type: room.shape_type,
        x: room.x,
        y: room.y,
        width: room.width ?? null,
        height: room.height ?? null,
        points: room.points,
        reveal_mode: room.reveal_mode,
        mask_style: room.mask_style,
        border_style: room.border_style,
        border_color: room.border_color ?? null,
        player_label_visible: room.player_label_visible,
        is_revealed: room.is_revealed_by_default,
        visible_to_players: room.visible_to_players,
      })),
    [roomRegions, fogRegions],
  )

  const renderWalls: RenderWall[] = useMemo(
    () =>
      wallRegions.map((wall) => ({
        id: wall.id,
        name: wall.name,
        shape_type: wall.shape_type,
        x: wall.x,
        y: wall.y,
        width: wall.width ?? null,
        height: wall.height ?? null,
        points: wall.points,
        border_style: wall.border_style,
        border_color: wall.border_color ?? null,
      })),
    [wallRegions],
  )

  function touch() {
    setDirty(true)
    setSavedFlash(false)
  }

  function updateToken(id: string, patch: Partial<PreparedMapToken>) {
    setTokens((prev) => prev.map((token) => (token.id === id ? { ...token, ...patch } : token)))
    touch()
  }

  // Is image-space point (x,y) inside this region's geometry?
  function roomContainsPoint(room: PreparedMapRoomRegion, x: number, y: number): boolean {
    if (room.shape_type === 'rectangle') {
      const w = room.width ?? 0
      const h = room.height ?? 0
      return x >= room.x && x <= room.x + w && y >= room.y && y <= room.y + h
    }
    const pts = room.points ?? []
    if (pts.length < 3) return false
    let inside = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x
      const yi = pts[i].y
      const xj = pts[j].x
      const yj = pts[j].y
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1) + xi) inside = !inside
    }
    return inside
  }

  // Move a token; if it's a door, auto-link it to any room it now sits inside
  // (one of the two ways to tie a door to an area). Never auto-unlinks — use the
  // room's Doors list to remove a link.
  function handleTokenMove(id: string, x: number, y: number) {
    updateToken(id, { x, y })
    const token = tokens.find((t) => t.id === id)
    if (token?.token_type !== 'door') return
    setRoomRegions((prev) =>
      prev.map((room) =>
        roomContainsPoint(room, x, y) && !(room.door_token_ids ?? []).includes(id)
          ? { ...room, door_token_ids: [...(room.door_token_ids ?? []), id] }
          : room,
      ),
    )
  }

  // Update a region in whichever array holds it (room or fog).
  function updateRoom(id: string, patch: Partial<PreparedMapRoomRegion>) {
    setRoomRegions((prev) => prev.map((room) => (room.id === id ? { ...room, ...patch } : room)))
    setFogRegions((prev) => prev.map((region) => (region.id === id ? { ...region, ...patch } : region)))
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
        reveal_state: 'discoverable',
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
        reveal_state: 'discoverable',
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

  function addTransportToken() {
    const meta = preparedTokenTypeMeta('transport')
    const id = crypto.randomUUID()
    setTokens((prev) => [
      ...prev,
      {
        id,
        token_type: 'transport',
        linked_campaign_doc_id: null,
        linked_prepared_map_id: null,
        source: 'manual',
        is_dynamic: false,
        can_move: false,
        can_participate_in_combat: false,
        interactable: true,
        object_state: null,
        name: 'Transport',
        icon: meta.icon,
        x: Math.round(map.width / 2) || 200,
        y: Math.round(map.height / 2) || 200,
        size: 1,
        color: meta.color,
        reveal_state: 'discoverable',
        visible_to_players: false,
        status: 'draft',
        tags: ['transport'],
        description: 'A travel point to another area.',
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

  // Doors are ordinary door-type tokens, but authored from the area menu. Each
  // call adds one (the DM can add several), slightly offset so they don't stack.
  function addDoorToken() {
    const meta = preparedTokenTypeMeta('door')
    const id = crypto.randomUUID()
    const doorCount = tokens.filter((token) => token.token_type === 'door').length
    const step = Math.max(20, gridSize)
    const offset = (doorCount % 6) * step
    setTokens((prev) => [
      ...prev,
      {
        id,
        token_type: 'door',
        linked_campaign_doc_id: null,
        source: 'manual',
        is_dynamic: false,
        can_move: false,
        can_participate_in_combat: false,
        interactable: true,
        object_state: null,
        name: `Door ${doorCount + 1}`,
        icon: meta.icon,
        x: (Math.round(map.width / 2) || 200) + offset,
        y: (Math.round(map.height / 2) || 200) + offset,
        size: 1,
        color: meta.color,
        reveal_state: 'visible',
        visible_to_players: true,
        status: 'draft',
        tags: ['door'],
        description: 'A door.',
        dm_notes: '',
        prep_notes: [],
        player_notes: '',
        links: [],
        resource: null,
      },
    ])
    setSelectedTokenId(id)
    setSelectedRoomId(null)
    setSelectedFogId(null)
    touch()
  }

  // Create a region in the array named by `drawTarget` (rooms vs fog masks).
  // Fog masks default to a plain solid border, no player label, and the
  // currently-selected fog style — a "dumb" mask, distinct from a labelled room.
  function addRegion(shape:
    | { shape_type: 'rectangle'; x: number; y: number; width: number; height: number }
    | { shape_type: 'polygon'; points: { x: number; y: number }[] },
  ) {
    const id = crypto.randomUUID()

    if (drawTarget === 'wall') {
      const wall = createPreparedWallRegion({
        id,
        name: `Wall ${wallRegions.length + 1}`,
        shape_type: shape.shape_type,
        x: shape.shape_type === 'rectangle' ? shape.x : shape.points[0]?.x ?? Math.round(map.width / 2),
        y: shape.shape_type === 'rectangle' ? shape.y : shape.points[0]?.y ?? Math.round(map.height / 2),
        width: shape.shape_type === 'rectangle' ? shape.width : null,
        height: shape.shape_type === 'rectangle' ? shape.height : null,
        points: shape.shape_type === 'polygon' ? shape.points : [],
      })
      setWallRegions((prev) => [...prev, wall])
      setSelectedWallId(id)
      setSelectedRoomId(null)
      setSelectedFogId(null)
      setSelectedTokenId(null)
      setRoomDrawTool(null)
      setDraftRoomPolygonPoints([])
      touch()
      return
    }

    const isFog = drawTarget === 'fog'
    const region = createPreparedRoomRegion({
      id,
      name: isFog ? `Fog ${fogRegions.length + 1}` : `Room ${roomRegions.length + 1}`,
      shape_type: shape.shape_type,
      x: shape.shape_type === 'rectangle' ? shape.x : shape.points[0]?.x ?? Math.round(map.width / 2),
      y: shape.shape_type === 'rectangle' ? shape.y : shape.points[0]?.y ?? Math.round(map.height / 2),
      width: shape.shape_type === 'rectangle' ? shape.width : null,
      height: shape.shape_type === 'rectangle' ? shape.height : null,
      points: shape.shape_type === 'polygon' ? shape.points : [],
      ...(isFog
        ? { mask_style: fogStyle, border_style: 'solid' as const, player_label_visible: false }
        : {}),
    })
    if (isFog) {
      setFogRegions((prev) => [...prev, region])
      setSelectedFogId(id)
      setSelectedRoomId(null)
    } else {
      setRoomRegions((prev) => [...prev, region])
      setSelectedRoomId(id)
      setSelectedFogId(null)
    }
    setSelectedTokenId(null)
    setRoomDrawTool(null)
    setDraftRoomPolygonPoints([])
    touch()
  }

  function finishPolygonRoom() {
    if (draftRoomPolygonPoints.length < 3) {
      setError('Add at least three points to finish this region.')
      return
    }
    addRegion({ shape_type: 'polygon', points: draftRoomPolygonPoints })
  }

  function removeRoom(id: string) {
    setRoomRegions((prev) => prev.filter((room) => room.id !== id))
    setFogRegions((prev) => prev.filter((region) => region.id !== id))
    if (selectedRoomId === id) {
      setSelectedRoomId(null)
      setRoomEditMode(false)
    }
    if (selectedFogId === id) {
      setSelectedFogId(null)
      setRoomEditMode(false)
    }
    touch()
  }

  function updateWall(id: string, patch: Partial<PreparedMapWallRegion>) {
    setWallRegions((prev) => prev.map((wall) => (wall.id === id ? { ...wall, ...patch } : wall)))
    touch()
  }

  function removeWall(id: string) {
    setWallRegions((prev) => prev.filter((wall) => wall.id !== id))
    if (selectedWallId === id) {
      setSelectedWallId(null)
      setRoomEditMode(false)
    }
    touch()
  }

  function handleWallGeometryChange(
    id: string,
    geometry:
      | { shape_type: 'rectangle'; x: number; y: number; width: number; height: number }
      | { shape_type: 'polygon'; points: { x: number; y: number }[] },
  ) {
    if (geometry.shape_type === 'polygon') {
      updateWall(id, {
        shape_type: 'polygon',
        points: geometry.points,
        x: geometry.points[0]?.x ?? 0,
        y: geometry.points[0]?.y ?? 0,
        width: null,
        height: null,
      })
    } else {
      updateWall(id, {
        shape_type: 'rectangle',
        x: geometry.x,
        y: geometry.y,
        width: geometry.width,
        height: geometry.height,
        points: [],
      })
    }
  }

  // Commit a border-handle drag from the canvas. Keeps the shape kind in sync
  // (a reshaped polygon keeps its points; a rectangle keeps x/y/w/h) so the
  // stored geometry round-trips through save/deploy unchanged.
  function handleRoomGeometryChange(
    id: string,
    geometry:
      | { shape_type: 'rectangle'; x: number; y: number; width: number; height: number }
      | { shape_type: 'polygon'; points: { x: number; y: number }[] },
  ) {
    if (geometry.shape_type === 'polygon') {
      updateRoom(id, {
        shape_type: 'polygon',
        points: geometry.points,
        x: geometry.points[0]?.x ?? 0,
        y: geometry.points[0]?.y ?? 0,
        width: null,
        height: null,
      })
    } else {
      updateRoom(id, {
        shape_type: 'rectangle',
        x: geometry.x,
        y: geometry.y,
        width: geometry.width,
        height: geometry.height,
        points: [],
      })
    }
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
        room_regions: roomRegions,
        fog_regions: fogRegions,
        wall_regions: wallRegions,
        fog_mode: fogMode,
        fog_style: fogStyle,
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
      // Compress/downscale before upload to cut storage + egress.
      const { file: uploadFile, width, height } = await prepareMapImageUpload(file)
      const ext = uploadFile.type === 'image/webp' ? 'webp' : file.name.split('.').pop()?.toLowerCase() || 'png'
      const path = `${map.campaign_id}/prepared-${crypto.randomUUID()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('maps')
          .upload(path, uploadFile, {
            contentType: uploadFile.type,
            cacheControl: '3600',
            upsert: false,
          })
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
          onAddTransportToken={addTransportToken}
          onSelectToken={setSelectedTokenId}
          onRemoveToken={removeToken}
        />

        {/* Canvas / image area */}
        <div className="relative h-[60vh] min-h-[360px] min-w-0 sm:h-[72vh] lg:h-[80vh]">
          {hasImage ? (
            <>
              <MapCanvas
                imageUrl={imageUrl!}
                width={map.width}
                height={map.height}
                gridEnabled={gridEnabled}
                gridSize={gridSize}
                tokens={renderTokens}
                mode="dm"
                selectedTokenId={selectedTokenId}
                onSelectToken={(id) => {
                  setSelectedTokenId(id)
                  if (id) {
                    setSelectedRoomId(null)
                    setSelectedFogId(null)
                  }
                }}
                onMoveToken={handleTokenMove}
                canDragToken={() => true}
                roomRegions={renderRooms}
                selectedRoomRegionId={selectedRoomId ?? selectedFogId}
                onSelectRoomRegion={(id) => {
                  if (!id) {
                    setSelectedRoomId(null)
                    setSelectedFogId(null)
                    return
                  }
                  setSelectedTokenId(null)
                  // Route the selection to whichever array owns the region.
                  if (fogRegions.some((region) => region.id === id)) {
                    setSelectedFogId(id)
                    setSelectedRoomId(null)
                  } else {
                    setSelectedRoomId(id)
                    setSelectedFogId(null)
                  }
                }}
                roomDrawTool={roomDrawTool}
                draftRoomPolygonPoints={draftRoomPolygonPoints}
                onRoomPolygonPoint={(point) => {
                  setDraftRoomPolygonPoints((prev) => [...prev, point])
                  setError(null)
                }}
                onRoomRegionDrawn={addRegion}
                roomEditEnabled={roomEditMode && !!(selectedRoomId || selectedFogId) && drawTarget !== 'wall' && !roomDrawTool}
                onRoomGeometryChange={handleRoomGeometryChange}
                walls={renderWalls}
                selectedWallId={selectedWallId}
                onSelectWall={(id) => {
                  if (!id) {
                    setSelectedWallId(null)
                    return
                  }
                  setSelectedTokenId(null)
                  setSelectedRoomId(null)
                  setSelectedFogId(null)
                  setSelectedWallId(id)
                }}
                wallEditEnabled={roomEditMode && !!selectedWallId && drawTarget === 'wall' && !roomDrawTool}
                onWallGeometryChange={handleWallGeometryChange}
              />
              <SubLocationsPanel
                open={subLocationsOpen}
                roomDrawTool={roomDrawTool}
                rooms={roomRegions}
                selectedRoom={selectedRoom}
                doors={doorTokens}
                selectedTokenId={selectedTokenId}
                subLocationDocs={subLocationDocs}
                draftPointCount={draftRoomPolygonPoints.length}
                onToggle={() => {
                  setSubLocationsOpen((open) => !open)
                  setFogOpen(false)
                  setWallsOpen(false)
                  setSelectedTokenId(null)
                }}
                onAddPortal={addTransportToken}
                onAddDoor={addDoorToken}
                onSelectDoor={(id) => {
                  setSelectedTokenId(id)
                  setSelectedRoomId(null)
                  setSelectedFogId(null)
                }}
                onRemoveDoor={removeToken}
                onStartRectangle={() => {
                  setSubLocationsOpen(true)
                  setRoomEditMode(false)
                  setDrawTarget('room')
                  setRoomDrawTool((tool) => (tool === 'rectangle' ? null : 'rectangle'))
                  setDraftRoomPolygonPoints([])
                }}
                onStartPolygon={() => {
                  setSubLocationsOpen(true)
                  setRoomEditMode(false)
                  setDrawTarget('room')
                  setRoomDrawTool((tool) => (tool === 'polygon' ? null : 'polygon'))
                  setDraftRoomPolygonPoints([])
                }}
                editBordersActive={roomEditMode && drawTarget === 'room' && !!selectedRoomId}
                onToggleEditBorders={() => {
                  const wasEditingThis = roomEditMode && drawTarget === 'room'
                  setRoomDrawTool(null)
                  setDraftRoomPolygonPoints([])
                  setDrawTarget('room')
                  setRoomEditMode(!wasEditingThis)
                }}
                onFinishPolygon={finishPolygonRoom}
                onUndoPolygonPoint={() => setDraftRoomPolygonPoints((prev) => prev.slice(0, -1))}
                onCancelDraw={() => {
                  setRoomDrawTool(null)
                  setDraftRoomPolygonPoints([])
                }}
                onSelectRoom={(id) => {
                  setSelectedRoomId(id)
                  if (id) setSelectedFogId(null)
                }}
                onUpdateRoom={updateRoom}
                onRemoveRoom={removeRoom}
              />
              <FogControlsPanel
                open={fogOpen}
                fogMode={fogMode}
                fogStyle={fogStyle}
                fogRegions={fogRegions}
                selectedFog={selectedFog}
                roomDrawTool={drawTarget === 'fog' ? roomDrawTool : null}
                draftPointCount={draftRoomPolygonPoints.length}
                editBordersActive={roomEditMode && drawTarget === 'fog' && !!selectedFogId}
                onToggle={() => {
                  setFogOpen((open) => !open)
                  setSubLocationsOpen(false)
                  setWallsOpen(false)
                  setSelectedTokenId(null)
                }}
                onChangeMode={(mode) => {
                  setFogMode(mode)
                  touch()
                }}
                onChangeStyle={(style) => {
                  setFogStyle(style)
                  touch()
                }}
                onStartRectangle={() => {
                  setFogOpen(true)
                  setRoomEditMode(false)
                  setDrawTarget('fog')
                  setRoomDrawTool((tool) => (tool === 'rectangle' && drawTarget === 'fog' ? null : 'rectangle'))
                  setDraftRoomPolygonPoints([])
                }}
                onStartPolygon={() => {
                  setFogOpen(true)
                  setRoomEditMode(false)
                  setDrawTarget('fog')
                  setRoomDrawTool((tool) => (tool === 'polygon' && drawTarget === 'fog' ? null : 'polygon'))
                  setDraftRoomPolygonPoints([])
                }}
                onToggleEditBorders={() => {
                  const wasEditingThis = roomEditMode && drawTarget === 'fog'
                  setRoomDrawTool(null)
                  setDraftRoomPolygonPoints([])
                  setDrawTarget('fog')
                  setRoomEditMode(!wasEditingThis)
                }}
                onFinishPolygon={finishPolygonRoom}
                onUndoPolygonPoint={() => setDraftRoomPolygonPoints((prev) => prev.slice(0, -1))}
                onCancelDraw={() => {
                  setRoomDrawTool(null)
                  setDraftRoomPolygonPoints([])
                }}
                onSelectFog={(id) => {
                  setSelectedFogId(id)
                  if (id) setSelectedRoomId(null)
                }}
                onUpdateFog={updateRoom}
                onRemoveFog={removeRoom}
              />
              <WallsPanel
                open={wallsOpen}
                walls={wallRegions}
                selectedWall={wallRegions.find((w) => w.id === selectedWallId) ?? null}
                doors={doorTokens}
                roomDrawTool={drawTarget === 'wall' ? roomDrawTool : null}
                draftPointCount={draftRoomPolygonPoints.length}
                editBordersActive={roomEditMode && drawTarget === 'wall' && !!selectedWallId}
                onToggle={() => {
                  setWallsOpen((open) => !open)
                  setSubLocationsOpen(false)
                  setFogOpen(false)
                  setSelectedTokenId(null)
                }}
                onStartRectangle={() => {
                  setWallsOpen(true)
                  setRoomEditMode(false)
                  setDrawTarget('wall')
                  setRoomDrawTool((tool) => (tool === 'rectangle' && drawTarget === 'wall' ? null : 'rectangle'))
                  setDraftRoomPolygonPoints([])
                }}
                onStartPolygon={() => {
                  setWallsOpen(true)
                  setRoomEditMode(false)
                  setDrawTarget('wall')
                  setRoomDrawTool((tool) => (tool === 'polygon' && drawTarget === 'wall' ? null : 'polygon'))
                  setDraftRoomPolygonPoints([])
                }}
                onToggleEditBorders={() => {
                  const wasEditingThis = roomEditMode && drawTarget === 'wall'
                  setRoomDrawTool(null)
                  setDraftRoomPolygonPoints([])
                  setDrawTarget('wall')
                  setRoomEditMode(!wasEditingThis)
                }}
                onFinishPolygon={finishPolygonRoom}
                onUndoPolygonPoint={() => setDraftRoomPolygonPoints((prev) => prev.slice(0, -1))}
                onCancelDraw={() => {
                  setRoomDrawTool(null)
                  setDraftRoomPolygonPoints([])
                }}
                onSelectWall={(id) => {
                  setSelectedWallId(id)
                  if (id) {
                    setSelectedRoomId(null)
                    setSelectedFogId(null)
                  }
                }}
                onUpdateWall={updateWall}
                onRemoveWall={removeWall}
                onLinkDoor={(wallId, doorId) => {
                  updateWall(wallId, {
                    door_token_ids: [...(wallRegions.find((w) => w.id === wallId)?.door_token_ids ?? []), doorId],
                  })
                }}
                onUnlinkDoor={(wallId, doorId) => {
                  updateWall(wallId, {
                    door_token_ids: (wallRegions.find((w) => w.id === wallId)?.door_token_ids ?? []).filter((id) => id !== doorId),
                  })
                }}
              />
            </>
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
          destinationMaps={destinationMaps.filter((option) => option.id !== map.id)}
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
              roomRegions={renderRooms}
              walls={renderWalls}
              mode="player"
            />
          </div>
        </div>
      )}
    </div>
  )
}

function SubLocationsPanel({
  open,
  roomDrawTool,
  rooms,
  selectedRoom,
  doors,
  selectedTokenId,
  subLocationDocs,
  draftPointCount,
  onToggle,
  onAddPortal,
  onAddDoor,
  onSelectDoor,
  onRemoveDoor,
  onStartRectangle,
  onStartPolygon,
  onFinishPolygon,
  onUndoPolygonPoint,
  onCancelDraw,
  onSelectRoom,
  onUpdateRoom,
  onRemoveRoom,
  editBordersActive,
  onToggleEditBorders,
}: {
  open: boolean
  roomDrawTool: RoomDrawTool
  rooms: PreparedMapRoomRegion[]
  selectedRoom: PreparedMapRoomRegion | null
  doors: PreparedMapToken[]
  selectedTokenId: string | null
  subLocationDocs: CampaignDoc[]
  draftPointCount: number
  onToggle: () => void
  onAddPortal: () => void
  onAddDoor: () => void
  onSelectDoor: (id: string) => void
  onRemoveDoor: (id: string) => void
  onStartRectangle: () => void
  onStartPolygon: () => void
  onFinishPolygon: () => void
  onUndoPolygonPoint: () => void
  onCancelDraw: () => void
  onSelectRoom: (id: string | null) => void
  onUpdateRoom: (id: string, patch: Partial<PreparedMapRoomRegion>) => void
  onRemoveRoom: (id: string) => void
  editBordersActive: boolean
  onToggleEditBorders: () => void
}) {
  return (
    <div className="absolute bottom-3 left-3 z-30 flex items-end gap-3">
      <button
        type="button"
        onClick={onToggle}
        className={`flex h-14 w-14 items-center justify-center rounded-full border text-zinc-50 shadow-2xl backdrop-blur transition ${
          open
            ? 'border-fuchsia-300 bg-fuchsia-500/25 shadow-fuchsia-950/50'
            : 'border-zinc-700 bg-zinc-950/90 hover:border-fuchsia-300/70 hover:bg-zinc-900'
        }`}
        aria-label="Sub-locations"
        title="Sub-locations"
      >
        <svg className="h-8 w-8" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <rect x="18" y="8" width="36" height="36" rx="7" stroke="currentColor" strokeWidth="5" strokeDasharray="8 7" />
          <path d="M13 50L31 32M18 32l13 13" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
          <circle cx="11" cy="52" r="6" stroke="currentColor" strokeWidth="5" />
          <circle cx="24" cy="51" r="6" stroke="currentColor" strokeWidth="5" />
        </svg>
      </button>

      {open && (
        <div
          className="flex max-h-[min(42rem,calc(100dvh-6rem))] w-[min(24rem,calc(100vw-6rem))] flex-col overflow-hidden rounded-xl border border-fuchsia-300/30 bg-zinc-950/96 shadow-2xl shadow-fuchsia-950/35 backdrop-blur"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerMove={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
        >
          <div className="border-b border-zinc-800 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-fuchsia-300">Dungeon Map</p>
            <h2 className="mt-1 text-base font-semibold text-zinc-50">Sub-Locations</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Add travel portals or draw blacked-out room regions.
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 [touch-action:pan-y]">
            <div className="grid gap-3">
              <div className="rounded-lg border border-violet-500/25 bg-violet-500/10 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-violet-100">Portal Sub-Location</p>
                    <p className="mt-1 text-xs text-violet-100/70">
                      Place a transport token for big-map travel.
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={onAddPortal}>
                    Add Portal
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-stone-500/30 bg-stone-500/10 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-stone-100">Doors</p>
                    <p className="mt-1 text-xs text-stone-100/70">
                      Add door tokens to mark room entrances. Click to add several, then drag each into place.
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={onAddDoor}>
                    Add Door
                  </Button>
                </div>
                {doors.length > 0 && (
                  <div className="mt-3 grid gap-1.5">
                    {doors.map((door) => (
                      <div
                        key={door.id}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition ${
                          selectedTokenId === door.id
                            ? 'border-stone-300/70 bg-stone-500/20 text-zinc-50'
                            : 'border-zinc-800 bg-zinc-900/80 text-zinc-300'
                        }`}
                      >
                        <span aria-hidden="true">{door.icon || '🚪'}</span>
                        <button
                          type="button"
                          onClick={() => onSelectDoor(door.id)}
                          className="min-w-0 flex-1 truncate text-left font-medium hover:text-zinc-50"
                        >
                          {door.name || 'Door'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveDoor(door.id)}
                          className="shrink-0 text-xs font-semibold text-red-400 hover:text-red-300"
                          aria-label={`Remove ${door.name || 'door'}`}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-fuchsia-500/25 bg-fuchsia-500/10 p-3">
                <p className="text-sm font-semibold text-fuchsia-100">Room Sub-Location</p>
                <p className="mt-1 text-xs text-fuchsia-100/70">
                  Draw a room mask. Players see the border and door cue, not the room interior.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant={roomDrawTool === 'rectangle' ? 'primary' : 'secondary'}
                    onClick={onStartRectangle}
                  >
                    {roomDrawTool === 'rectangle' ? 'Drawing...' : 'Rectangle'}
                  </Button>
                  <Button
                    size="sm"
                    variant={roomDrawTool === 'polygon' ? 'primary' : 'secondary'}
                    onClick={onStartPolygon}
                  >
                    {roomDrawTool === 'polygon' ? `${draftPointCount} points` : 'Polygon'}
                  </Button>
                </div>
                {roomDrawTool === 'polygon' && (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <Button size="sm" variant="secondary" onClick={onUndoPolygonPoint} disabled={draftPointCount === 0}>
                      Undo
                    </Button>
                    <Button size="sm" onClick={onFinishPolygon} disabled={draftPointCount < 3} className="col-span-2">
                      Finish
                    </Button>
                  </div>
                )}
                {roomDrawTool && (
                  <button
                    type="button"
                    onClick={onCancelDraw}
                    className="mt-2 text-xs font-medium text-zinc-400 hover:text-zinc-100"
                  >
                    Cancel drawing
                  </button>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Rooms ({rooms.length})
                  </p>
                </div>
                {rooms.length === 0 ? (
                  <p className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-3 text-xs text-zinc-500">
                    Draw a room to configure fog, labels, and reveal behavior.
                  </p>
                ) : (
                  <div className="grid gap-1.5">
                    {rooms.map((room) => (
                      <button
                        key={room.id}
                        type="button"
                        onClick={() => onSelectRoom(room.id)}
                        className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                          selectedRoom?.id === room.id
                            ? 'border-fuchsia-300/70 bg-fuchsia-500/15 text-zinc-50'
                            : 'border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:border-zinc-600'
                        }`}
                      >
                        <span className="block truncate font-semibold">{room.name}</span>
                        <span className="mt-0.5 block text-[11px] capitalize text-zinc-500">
                          {room.shape_type} - {room.reveal_mode.replace('_', ' ')} - {room.is_revealed_by_default ? 'revealed' : 'masked'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedRoom && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-zinc-100">Room Settings</p>
                    <button
                      type="button"
                      onClick={() => onRemoveRoom(selectedRoom.id)}
                      className="text-xs font-semibold text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={onToggleEditBorders}
                    className={`mb-3 w-full rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                      editBordersActive
                        ? 'border-fuchsia-300/70 bg-fuchsia-500/20 text-fuchsia-100'
                        : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-fuchsia-300/60'
                    }`}
                  >
                    {editBordersActive ? 'Done editing borders' : 'Edit borders'}
                  </button>
                  {editBordersActive && (
                    <p className="mb-3 -mt-1 text-[11px] leading-relaxed text-fuchsia-200/70">
                      {selectedRoom.shape_type === 'polygon'
                        ? 'Drag the pink points to reshape the room. Your placed points are kept.'
                        : 'Drag the pink corners or amber edges to resize the room.'}
                    </p>
                  )}
                  <div className="grid gap-3">
                    <Input
                      label="Room name"
                      value={selectedRoom.name}
                      maxLength={80}
                      onChange={(event) => onUpdateRoom(selectedRoom.id, { name: event.target.value })}
                    />
                    <Select
                      label="Linked sub-location"
                      value={selectedRoom.linked_campaign_doc_id ?? ''}
                      onChange={(event) => onUpdateRoom(selectedRoom.id, { linked_campaign_doc_id: event.target.value || null })}
                    >
                      <option value="">None</option>
                      {subLocationDocs.map((doc) => (
                        <option key={doc.id} value={doc.id}>{doc.title}</option>
                      ))}
                    </Select>
                    <div className="grid grid-cols-2 gap-2">
                      <Select
                        label="Reveal"
                        value={selectedRoom.reveal_mode}
                        onChange={(event) => onUpdateRoom(selectedRoom.id, { reveal_mode: event.target.value as PreparedMapRoomRegion['reveal_mode'] })}
                      >
                        <option value="manual">Manual</option>
                        <option value="auto">Auto</option>
                        <option value="manual_auto">Manual + auto</option>
                      </Select>
                      <Input
                        label="Auto ft"
                        type="number"
                        min={0}
                        step={5}
                        value={selectedRoom.auto_reveal_distance_feet}
                        onChange={(event) => onUpdateRoom(selectedRoom.id, { auto_reveal_distance_feet: Math.max(0, Number(event.target.value) || 0) })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Select
                        label="Mask"
                        value={selectedRoom.mask_style}
                        onChange={(event) => onUpdateRoom(selectedRoom.id, { mask_style: event.target.value as PreparedMapRoomRegion['mask_style'] })}
                      >
                        <option value="blackout">Blackout</option>
                        <option value="dim">Dim</option>
                        <option value="outline_only">Outline only</option>
                      </Select>
                      <Select
                        label="Border"
                        value={selectedRoom.border_style}
                        onChange={(event) => onUpdateRoom(selectedRoom.id, { border_style: event.target.value as PreparedMapRoomRegion['border_style'] })}
                      >
                        <option value="door">Door cue</option>
                        <option value="dashed">Dashed</option>
                        <option value="solid">Solid</option>
                        <option value="glow">Glow</option>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-xs text-zinc-300">
                        Border color
                        <input
                          type="color"
                          value={selectedRoom.border_color ?? '#f472b6'}
                          onChange={(event) => onUpdateRoom(selectedRoom.id, { border_color: event.target.value })}
                          className="h-7 w-10 cursor-pointer rounded border border-zinc-700 bg-transparent"
                        />
                      </label>
                      {selectedRoom.border_color && (
                        <button
                          type="button"
                          onClick={() => onUpdateRoom(selectedRoom.id, { border_color: null })}
                          className="text-xs font-medium text-zinc-400 hover:text-zinc-100"
                        >
                          Reset to style
                        </button>
                      )}
                    </div>
                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-zinc-300">Doors (entrances)</p>
                      {(selectedRoom.door_token_ids ?? []).length > 0 ? (
                        <div className="mb-2 grid gap-1.5">
                          {(selectedRoom.door_token_ids ?? []).map((doorId) => {
                            const door = doors.find((d) => d.id === doorId)
                            return (
                              <div
                                key={doorId}
                                className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/80 px-2.5 py-1.5 text-sm text-zinc-300"
                              >
                                <span aria-hidden="true">🚪</span>
                                <span className="min-w-0 flex-1 truncate">{door?.name ?? 'Door (removed)'}</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateRoom(selectedRoom.id, {
                                      door_token_ids: (selectedRoom.door_token_ids ?? []).filter((id) => id !== doorId),
                                    })
                                  }
                                  className="shrink-0 text-xs font-semibold text-red-400 hover:text-red-300"
                                >
                                  Unlink
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="mb-2 text-[11px] text-zinc-500">
                          No doors linked yet. Players enter this area through its linked doors.
                        </p>
                      )}
                      {doors.filter((d) => !(selectedRoom.door_token_ids ?? []).includes(d.id)).length > 0 ? (
                        <Select
                          label="Link a door"
                          value=""
                          onChange={(event) => {
                            const doorId = event.target.value
                            if (!doorId) return
                            onUpdateRoom(selectedRoom.id, {
                              door_token_ids: [...(selectedRoom.door_token_ids ?? []), doorId],
                            })
                          }}
                        >
                          <option value="">Choose a door…</option>
                          {doors
                            .filter((d) => !(selectedRoom.door_token_ids ?? []).includes(d.id))
                            .map((d) => (
                              <option key={d.id} value={d.id}>{d.name || 'Door'}</option>
                            ))}
                        </Select>
                      ) : (
                        <p className="text-[11px] text-zinc-500">
                          {doors.length === 0
                            ? 'Add doors from the Doors card above, or drag a door into this area to link it.'
                            : 'All doors are linked to this area.'}
                        </p>
                      )}
                    </div>
                    <label className="flex items-center gap-2 text-xs text-zinc-300">
                      <input
                        type="checkbox"
                        checked={selectedRoom.player_label_visible}
                        onChange={(event) => onUpdateRoom(selectedRoom.id, { player_label_visible: event.target.checked })}
                        className="h-4 w-4 accent-fuchsia-400"
                      />
                      Show room label to players before reveal
                    </label>
                    <label className="flex items-center gap-2 text-xs text-zinc-300">
                      <input
                        type="checkbox"
                        checked={selectedRoom.is_revealed_by_default}
                        onChange={(event) => onUpdateRoom(selectedRoom.id, { is_revealed_by_default: event.target.checked })}
                        className="h-4 w-4 accent-emerald-400"
                      />
                      Start revealed when deployed
                    </label>
                    <Textarea
                      label="DM note"
                      rows={2}
                      value={selectedRoom.dm_notes ?? ''}
                      onChange={(event) => onUpdateRoom(selectedRoom.id, { dm_notes: event.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FogControlsPanel({
  open,
  fogMode,
  fogStyle,
  fogRegions,
  selectedFog,
  roomDrawTool,
  draftPointCount,
  editBordersActive,
  onToggle,
  onChangeMode,
  onChangeStyle,
  onStartRectangle,
  onStartPolygon,
  onToggleEditBorders,
  onFinishPolygon,
  onUndoPolygonPoint,
  onCancelDraw,
  onSelectFog,
  onUpdateFog,
  onRemoveFog,
}: {
  open: boolean
  fogMode: FogMode
  fogStyle: FogStyle
  fogRegions: PreparedMapRoomRegion[]
  selectedFog: PreparedMapRoomRegion | null
  roomDrawTool: RoomDrawTool
  draftPointCount: number
  editBordersActive: boolean
  onToggle: () => void
  onChangeMode: (mode: FogMode) => void
  onChangeStyle: (style: FogStyle) => void
  onStartRectangle: () => void
  onStartPolygon: () => void
  onToggleEditBorders: () => void
  onFinishPolygon: () => void
  onUndoPolygonPoint: () => void
  onCancelDraw: () => void
  onSelectFog: (id: string | null) => void
  onUpdateFog: (id: string, patch: Partial<PreparedMapRoomRegion>) => void
  onRemoveFog: (id: string) => void
}) {
  return (
    <div className="absolute bottom-3 left-[5.25rem] z-30 flex items-end gap-3">
      <button
        type="button"
        onClick={onToggle}
        className={`flex h-14 w-14 items-center justify-center rounded-full border text-zinc-50 shadow-2xl backdrop-blur transition ${
          open
            ? 'border-sky-300 bg-sky-500/25 shadow-sky-950/50'
            : 'border-zinc-700 bg-zinc-950/90 hover:border-sky-300/70 hover:bg-zinc-900'
        }`}
        aria-label="Fog controls"
        title="Fog controls"
      >
        <svg className="h-8 w-8" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <path
            d="M20 34a10 10 0 0 1 .6-19.98A14 14 0 0 1 47 18a9 9 0 0 1 1 17.94"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path d="M14 44h36M20 52h28" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div
          className="flex max-h-[min(42rem,calc(100dvh-6rem))] w-[min(24rem,calc(100vw-6rem))] flex-col overflow-hidden rounded-xl border border-sky-300/30 bg-zinc-950/96 shadow-2xl shadow-sky-950/35 backdrop-blur"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerMove={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
        >
          <div className="border-b border-zinc-800 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-300">Visibility</p>
            <h2 className="mt-1 text-base font-semibold text-zinc-50">Fog</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Set how the whole map starts for players, and paint extra fog anywhere.
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 [touch-action:pan-y]">
            <div className="grid gap-3">
              <div className="rounded-lg border border-sky-500/25 bg-sky-500/10 p-3">
                <p className="text-sm font-semibold text-sky-100">Base fog</p>
                <p className="mt-1 text-xs text-sky-100/70">
                  Applies to the whole map for players when deployed.
                </p>
                <div className="mt-3 grid gap-3">
                  <Select
                    label="Fog mode"
                    value={fogMode}
                    onChange={(event) => onChangeMode(event.target.value as FogMode)}
                  >
                    <option value="none">No fog — map fully visible</option>
                    <option value="rooms">Room &amp; fog masks only</option>
                    <option value="hidden">Hide entire map until revealed</option>
                  </Select>
                  <Select
                    label="Fog style"
                    value={fogStyle}
                    onChange={(event) => onChangeStyle(event.target.value as FogStyle)}
                  >
                    <option value="blackout">Blackout</option>
                    <option value="dim">Dim</option>
                  </Select>
                </div>
              </div>

              <div className="rounded-lg border border-sky-500/25 bg-sky-500/10 p-3">
                <p className="text-sm font-semibold text-sky-100">Paint fog</p>
                <p className="mt-1 text-xs text-sky-100/70">
                  Draw a fog mask over any area. Players can&apos;t see through it until you reveal it live.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant={roomDrawTool === 'rectangle' ? 'primary' : 'secondary'}
                    onClick={onStartRectangle}
                  >
                    {roomDrawTool === 'rectangle' ? 'Drawing...' : 'Rectangle'}
                  </Button>
                  <Button
                    size="sm"
                    variant={roomDrawTool === 'polygon' ? 'primary' : 'secondary'}
                    onClick={onStartPolygon}
                  >
                    {roomDrawTool === 'polygon' ? `${draftPointCount} points` : 'Polygon'}
                  </Button>
                </div>
                {roomDrawTool === 'polygon' && (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <Button size="sm" variant="secondary" onClick={onUndoPolygonPoint} disabled={draftPointCount === 0}>
                      Undo
                    </Button>
                    <Button size="sm" onClick={onFinishPolygon} disabled={draftPointCount < 3} className="col-span-2">
                      Finish
                    </Button>
                  </div>
                )}
                {roomDrawTool && (
                  <button
                    type="button"
                    onClick={onCancelDraw}
                    className="mt-2 text-xs font-medium text-zinc-400 hover:text-zinc-100"
                  >
                    Cancel drawing
                  </button>
                )}
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Fog areas ({fogRegions.length})
                </p>
                {fogRegions.length === 0 ? (
                  <p className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-3 text-xs text-zinc-500">
                    No painted fog yet. The base fog mode above still applies.
                  </p>
                ) : (
                  <div className="grid gap-1.5">
                    {fogRegions.map((region) => (
                      <button
                        key={region.id}
                        type="button"
                        onClick={() => onSelectFog(region.id)}
                        className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                          selectedFog?.id === region.id
                            ? 'border-sky-300/70 bg-sky-500/15 text-zinc-50'
                            : 'border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:border-zinc-600'
                        }`}
                      >
                        <span className="block truncate font-semibold">{region.name}</span>
                        <span className="mt-0.5 block text-[11px] capitalize text-zinc-500">
                          {region.shape_type} - {region.mask_style}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedFog && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-zinc-100">Fog area settings</p>
                    <button
                      type="button"
                      onClick={() => onRemoveFog(selectedFog.id)}
                      className="text-xs font-semibold text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={onToggleEditBorders}
                    className={`mb-3 w-full rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                      editBordersActive
                        ? 'border-sky-300/70 bg-sky-500/20 text-sky-100'
                        : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-sky-300/60'
                    }`}
                  >
                    {editBordersActive ? 'Done editing borders' : 'Edit borders'}
                  </button>
                  {editBordersActive && (
                    <p className="mb-3 -mt-1 text-[11px] leading-relaxed text-sky-200/70">
                      {selectedFog.shape_type === 'polygon'
                        ? 'Drag the pink points to reshape the fog. Your placed points are kept.'
                        : 'Drag the pink corners or amber edges to resize the fog.'}
                    </p>
                  )}
                  <div className="grid gap-3">
                    <Input
                      label="Label"
                      value={selectedFog.name}
                      maxLength={80}
                      onChange={(event) => onUpdateFog(selectedFog.id, { name: event.target.value })}
                    />
                    <Select
                      label="Style"
                      value={selectedFog.mask_style}
                      onChange={(event) => onUpdateFog(selectedFog.id, { mask_style: event.target.value as PreparedMapRoomRegion['mask_style'] })}
                    >
                      <option value="blackout">Blackout</option>
                      <option value="dim">Dim</option>
                      <option value="outline_only">Outline only</option>
                    </Select>
                    <label className="flex items-center gap-2 text-xs text-zinc-300">
                      <input
                        type="checkbox"
                        checked={selectedFog.is_revealed_by_default}
                        onChange={(event) => onUpdateFog(selectedFog.id, { is_revealed_by_default: event.target.checked })}
                        className="h-4 w-4 accent-emerald-400"
                      />
                      Start revealed when deployed
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function WallsPanel({
  open,
  walls,
  selectedWall,
  doors,
  roomDrawTool,
  draftPointCount,
  editBordersActive,
  onToggle,
  onStartRectangle,
  onStartPolygon,
  onToggleEditBorders,
  onFinishPolygon,
  onUndoPolygonPoint,
  onCancelDraw,
  onSelectWall,
  onUpdateWall,
  onRemoveWall,
  onLinkDoor,
  onUnlinkDoor,
}: {
  open: boolean
  walls: PreparedMapWallRegion[]
  selectedWall: PreparedMapWallRegion | null
  doors: PreparedMapToken[]
  roomDrawTool: RoomDrawTool
  draftPointCount: number
  editBordersActive: boolean
  onToggle: () => void
  onStartRectangle: () => void
  onStartPolygon: () => void
  onToggleEditBorders: () => void
  onFinishPolygon: () => void
  onUndoPolygonPoint: () => void
  onCancelDraw: () => void
  onSelectWall: (id: string | null) => void
  onUpdateWall: (id: string, patch: Partial<PreparedMapWallRegion>) => void
  onRemoveWall: (id: string) => void
  onLinkDoor: (wallId: string, doorId: string) => void
  onUnlinkDoor: (wallId: string, doorId: string) => void
}) {
  const linkedDoorIds = new Set(selectedWall?.door_token_ids ?? [])
  const unlinkedDoors = doors.filter((d) => !linkedDoorIds.has(d.id))
  return (
    <div className="absolute bottom-3 left-[9.5rem] z-30 flex items-end gap-3">
      <button
        type="button"
        onClick={onToggle}
        className={`flex h-14 w-14 items-center justify-center rounded-full border text-zinc-50 shadow-2xl backdrop-blur transition ${
          open
            ? 'border-amber-300 bg-amber-500/25 shadow-amber-950/50'
            : 'border-zinc-700 bg-zinc-950/90 hover:border-amber-300/70 hover:bg-zinc-900'
        }`}
        aria-label="Walls"
        title="Walls & Borders"
      >
        <svg className="h-8 w-8" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <rect x="8" y="8" width="48" height="48" rx="4" stroke="currentColor" strokeWidth="5" />
          <line x1="32" y1="8" x2="32" y2="56" stroke="currentColor" strokeWidth="4" />
          <line x1="8" y1="32" x2="56" y2="32" stroke="currentColor" strokeWidth="4" />
        </svg>
      </button>

      {open && (
        <div
          className="flex max-h-[min(42rem,calc(100dvh-6rem))] w-[min(24rem,calc(100vw-6rem))] flex-col overflow-hidden rounded-xl border border-amber-300/30 bg-zinc-950/96 shadow-2xl shadow-amber-950/35 backdrop-blur"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerMove={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
        >
          <div className="border-b border-zinc-800 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-300">Movement</p>
            <h2 className="mt-1 text-base font-semibold text-zinc-50">Walls &amp; Borders</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Draw impassable walls. Link doors to create openings players can pass through.
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 [touch-action:pan-y]">
            <div className="grid gap-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onStartRectangle}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                    roomDrawTool === 'rectangle'
                      ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                      : 'border-zinc-700 text-zinc-400 hover:border-amber-400/50 hover:text-amber-300'
                  }`}
                >
                  {roomDrawTool === 'rectangle' ? 'Drawing rectangle…' : '▭ Rectangle'}
                </button>
                <button
                  type="button"
                  onClick={onStartPolygon}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                    roomDrawTool === 'polygon'
                      ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                      : 'border-zinc-700 text-zinc-400 hover:border-amber-400/50 hover:text-amber-300'
                  }`}
                >
                  {roomDrawTool === 'polygon' ? `Polygon (${draftPointCount} pts)` : '⬡ Polygon'}
                </button>
              </div>
              {roomDrawTool === 'polygon' && draftPointCount >= 3 && (
                <div className="flex gap-2">
                  <button type="button" onClick={onFinishPolygon} className="flex-1 rounded-lg border border-amber-400 bg-amber-500/20 px-3 py-2 text-xs font-semibold text-amber-200">Finish polygon</button>
                  <button type="button" onClick={onUndoPolygonPoint} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-400">Undo point</button>
                  <button type="button" onClick={onCancelDraw} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-400">Cancel</button>
                </div>
              )}

              <button
                type="button"
                onClick={onToggleEditBorders}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                  editBordersActive
                    ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                    : 'border-zinc-700 text-zinc-400 hover:border-amber-400/50 hover:text-amber-300'
                }`}
              >
                {editBordersActive ? 'Editing borders — drag handles to reshape' : 'Edit borders'}
              </button>

              {walls.length > 0 && (
                <div className="grid gap-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Walls ({walls.length})</p>
                  {walls.map((wall) => (
                    <div
                      key={wall.id}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition cursor-pointer ${
                        selectedWall?.id === wall.id
                          ? 'border-amber-400 bg-amber-500/15 text-amber-100'
                          : 'border-zinc-800 text-zinc-300 hover:border-amber-400/40'
                      }`}
                      onClick={() => onSelectWall(wall.id)}
                    >
                      <span className="truncate">{wall.name || 'Wall'}</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onRemoveWall(wall.id) }}
                        className="ml-2 text-zinc-600 hover:text-red-400"
                        aria-label="Remove wall"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {selectedWall && (
                <div className="grid gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                  <Input
                    label="Name"
                    value={selectedWall.name}
                    onChange={(e) => onUpdateWall(selectedWall.id, { name: e.target.value })}
                  />
                  <Select
                    label="Border style"
                    value={selectedWall.border_style}
                    onChange={(e) => onUpdateWall(selectedWall.id, { border_style: e.target.value as PreparedMapWallRegion['border_style'] })}
                  >
                    <option value="solid">Solid</option>
                    <option value="double">Double</option>
                    <option value="thick">Thick</option>
                  </Select>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1">Border colour</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={selectedWall.border_color ?? '#b45309'}
                        onChange={(e) => onUpdateWall(selectedWall.id, { border_color: e.target.value })}
                        className="h-8 w-8 rounded border border-zinc-700 bg-transparent"
                      />
                      {selectedWall.border_color && (
                        <button
                          type="button"
                          onClick={() => onUpdateWall(selectedWall.id, { border_color: null })}
                          className="text-xs text-zinc-500 hover:text-zinc-300"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-amber-200 mb-1">Doors (passable gaps)</p>
                    {(selectedWall.door_token_ids ?? []).length > 0 ? (
                      <div className="grid gap-1">
                        {(selectedWall.door_token_ids ?? []).map((doorId) => {
                          const door = doors.find((d) => d.id === doorId)
                          return (
                            <div key={doorId} className="flex items-center justify-between rounded border border-amber-500/20 px-2 py-1 text-xs text-amber-100">
                              <span>{door?.name || 'Door'}</span>
                              <button type="button" onClick={() => onUnlinkDoor(selectedWall.id, doorId)} className="text-zinc-500 hover:text-red-400">✕</button>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-600">No doors linked — this wall blocks all movement through it.</p>
                    )}
                    {unlinkedDoors.length > 0 && (
                      <div className="mt-2 grid gap-1">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Available doors</p>
                        {unlinkedDoors.map((door) => (
                          <button
                            key={door.id}
                            type="button"
                            onClick={() => onLinkDoor(selectedWall.id, door.id)}
                            className="flex items-center gap-1 rounded border border-zinc-800 px-2 py-1 text-xs text-zinc-400 hover:border-amber-400/40 hover:text-amber-300"
                          >
                            <span>+</span> {door.name || 'Door'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {walls.length === 0 && (
                <p className="text-xs text-zinc-600 text-center py-4">
                  No walls yet. Draw a rectangle or polygon to add a wall region.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
