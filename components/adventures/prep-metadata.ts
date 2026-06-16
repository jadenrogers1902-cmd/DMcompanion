import type {
  PrepImportantLink,
  PrepLinkType,
  PrepNote,
  PrepNoteVisibility,
} from '@/lib/types/adventure'

const LINK_TYPES: PrepLinkType[] = ['wiki', 'dnd_beyond', 'srd', 'roll20', 'custom']

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
