import type {
  PrepImportantLink,
  PrepLinkType,
  PreparedMapRoomRegion,
  PrepNote,
  PrepNoteVisibility,
  RoomBorderStyle,
  RoomMaskStyle,
  RoomRegionShapeType,
  RoomRevealMode,
} from '@/lib/types/adventure'

const LINK_TYPES: PrepLinkType[] = ['wiki', 'dnd_beyond', 'srd', 'roll20', 'custom']
const ROOM_SHAPES: RoomRegionShapeType[] = ['rectangle', 'polygon']
const ROOM_REVEAL_MODES: RoomRevealMode[] = ['manual', 'auto', 'manual_auto']
const ROOM_MASK_STYLES: RoomMaskStyle[] = ['blackout', 'dim', 'outline_only']
const ROOM_BORDER_STYLES: RoomBorderStyle[] = ['door', 'dashed', 'solid', 'glow']

export function nowIso() {
  return new Date().toISOString()
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 12)
}

function finiteNumber(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeRoomPoints(value: unknown): PreparedMapRoomRegion['points'] {
  if (!Array.isArray(value)) return []
  return value
    .map((point) => asRecord(point))
    .map((point) => ({
      x: Math.round(finiteNumber(point.x)),
      y: Math.round(finiteNumber(point.y)),
    }))
    .filter((point) => point.x >= 0 && point.y >= 0)
    .slice(0, 32)
}

export function normalizeTags(tags: unknown): string[] {
  return stringList(tags).map((tag) => tag.slice(0, 32))
}

export function tagsFromInput(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12)
}

export function detectPrepLinkType(url: string): PrepLinkType {
  const lower = url.toLowerCase()
  if (lower.includes('dndbeyond.com')) return 'dnd_beyond'
  if (lower.includes('roll20.net')) return 'roll20'
  if (lower.includes('5e.tools') || lower.includes('d20srd.org') || lower.includes('aonprd.com')) {
    return 'srd'
  }
  if (lower.includes('wiki')) return 'wiki'
  return 'custom'
}

export function createPrepNote(parentType?: PrepNote['parentType'], parentId?: string): PrepNote {
  const createdAt = nowIso()
  return {
    id: crypto.randomUUID(),
    parentType,
    parentId,
    title: '',
    body: '',
    tags: [],
    pinned: false,
    visibility: 'dm_only',
    createdAt,
    updatedAt: createdAt,
  }
}

export function createPrepLink(parentType?: PrepImportantLink['parentType'], parentId?: string): PrepImportantLink {
  const createdAt = nowIso()
  return {
    id: crypto.randomUUID(),
    parentType,
    parentId,
    title: '',
    url: '',
    type: 'custom',
    description: '',
    pinned: false,
    createdAt,
    updatedAt: createdAt,
  }
}

export function normalizePrepNote(
  value: unknown,
  parentType?: PrepNote['parentType'],
  parentId?: string,
): PrepNote {
  const raw = asRecord(value)
  const createdAt = String(raw.createdAt ?? raw.created_at ?? nowIso())
  const visibility = raw.visibility === 'player_visible' ? 'player_visible' : 'dm_only'
  return {
    id: String(raw.id ?? crypto.randomUUID()),
    parentType: (raw.parentType as PrepNote['parentType']) ?? parentType,
    parentId: String(raw.parentId ?? parentId ?? ''),
    title: String(raw.title ?? '').slice(0, 120),
    body: String(raw.body ?? raw.text ?? '').slice(0, 4000),
    tags: normalizeTags(raw.tags),
    pinned: Boolean(raw.pinned),
    visibility: visibility as PrepNoteVisibility,
    createdAt,
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? createdAt),
  }
}

export function normalizePrepLink(
  value: unknown,
  parentType?: PrepImportantLink['parentType'],
  parentId?: string,
): PrepImportantLink {
  const raw = asRecord(value)
  const url = String(raw.url ?? '').slice(0, 1000)
  const type = LINK_TYPES.includes(raw.type as PrepLinkType)
    ? (raw.type as PrepLinkType)
    : detectPrepLinkType(url)
  const createdAt = String(raw.createdAt ?? raw.created_at ?? nowIso())
  return {
    id: String(raw.id ?? crypto.randomUUID()),
    parentType: (raw.parentType as PrepImportantLink['parentType']) ?? parentType,
    parentId: String(raw.parentId ?? parentId ?? ''),
    title: String(raw.title ?? raw.label ?? '').slice(0, 120),
    url,
    type,
    description: String(raw.description ?? '').slice(0, 500),
    pinned: Boolean(raw.pinned),
    createdAt,
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? createdAt),
  }
}

export function normalizePrepNotes(
  values: unknown,
  parentType?: PrepNote['parentType'],
  parentId?: string,
): PrepNote[] {
  if (!Array.isArray(values)) return []
  return values.slice(0, 100).map((value) => normalizePrepNote(value, parentType, parentId))
}

export function normalizePrepLinks(
  values: unknown,
  parentType?: PrepImportantLink['parentType'],
  parentId?: string,
): PrepImportantLink[] {
  if (!Array.isArray(values)) return []
  return values.slice(0, 50).map((value) => normalizePrepLink(value, parentType, parentId))
}

export function createPreparedRoomRegion(input?: Partial<PreparedMapRoomRegion>): PreparedMapRoomRegion {
  return normalizePreparedRoomRegion({
    id: crypto.randomUUID(),
    name: 'New room',
    shape_type: 'rectangle',
    x: 0,
    y: 0,
    width: 120,
    height: 120,
    points: [],
    reveal_mode: 'manual',
    mask_style: 'blackout',
    border_style: 'door',
    player_label_visible: false,
    auto_reveal_distance_feet: 0,
    is_revealed_by_default: false,
    visible_to_players: true,
    ...input,
  })
}

export function normalizePreparedRoomRegion(value: unknown): PreparedMapRoomRegion {
  const raw = asRecord(value)
  const shape = ROOM_SHAPES.includes(raw.shape_type as RoomRegionShapeType)
    ? (raw.shape_type as RoomRegionShapeType)
    : 'rectangle'
  const revealMode = ROOM_REVEAL_MODES.includes(raw.reveal_mode as RoomRevealMode)
    ? (raw.reveal_mode as RoomRevealMode)
    : 'manual'
  const maskStyle = ROOM_MASK_STYLES.includes(raw.mask_style as RoomMaskStyle)
    ? (raw.mask_style as RoomMaskStyle)
    : 'blackout'
  const borderStyle = ROOM_BORDER_STYLES.includes(raw.border_style as RoomBorderStyle)
    ? (raw.border_style as RoomBorderStyle)
    : 'door'
  const points = normalizeRoomPoints(raw.points)
  return {
    id: String(raw.id ?? crypto.randomUUID()),
    name: String(raw.name ?? raw.title ?? 'Room').trim().slice(0, 80) || 'Room',
    linked_campaign_doc_id: raw.linked_campaign_doc_id ? String(raw.linked_campaign_doc_id) : null,
    shape_type: shape,
    x: Math.max(0, Math.round(finiteNumber(raw.x))),
    y: Math.max(0, Math.round(finiteNumber(raw.y))),
    width: shape === 'rectangle' ? Math.max(8, Math.round(finiteNumber(raw.width, 120))) : null,
    height: shape === 'rectangle' ? Math.max(8, Math.round(finiteNumber(raw.height, 120))) : null,
    points,
    reveal_mode: revealMode,
    mask_style: maskStyle,
    border_style: borderStyle,
    player_label_visible: Boolean(raw.player_label_visible),
    auto_reveal_distance_feet: Math.max(0, Math.round(finiteNumber(raw.auto_reveal_distance_feet, 0))),
    is_revealed_by_default: Boolean(raw.is_revealed_by_default),
    visible_to_players: raw.visible_to_players !== false,
    dm_notes: String(raw.dm_notes ?? '').slice(0, 2000),
  }
}

export function normalizePreparedRoomRegions(values: unknown): PreparedMapRoomRegion[] {
  if (!Array.isArray(values)) return []
  return values.slice(0, 100).map(normalizePreparedRoomRegion)
}
