// Pure, server-safe helpers that turn a Notion page + a saved mapping into a
// preview of how it would land in the Adventure Codex. No network, no secrets.
// Used by the mapping preview action and (later) the sync adapter.

import type { CampaignDocType, NotionSyncMapping } from '@/lib/types/database'
import { parseNotionProperties, parseNotionTitle, type NotionPage } from './client'
import { extractNpcProfileFromProperties, isNpcDocType, type NpcProfile } from './npc-profile'

export type MappingPreviewField = { label: string; value: string }

export type MappingPreviewRelation = {
  property: string
  count: number
  sample: string
}

export type MappingPreview = {
  title: string
  dmFields: MappingPreviewField[]
  playerFields: MappingPreviewField[]
  tags: string[]
  status: string | null
  relations: MappingPreviewRelation[]
  /** Mapped property names that were not present on the sample record. */
  warnings: string[]
}

/**
 * Mapped fields for one page, ready to upsert. A field is `undefined` when its
 * property is not mapped OR is mapped but absent from the page (renamed/missing)
 * — the caller must then PRESERVE the existing app value. A mapped+present field
 * is included even when empty (Notion wins for mapped documentation fields).
 */
export type MappedDocFields = {
  sourcePageId: string
  sourceUrl: string | null
  docType: CampaignDocType
  title?: string
  dm_summary?: string | null
  dm_notes?: string | null
  player_summary?: string | null
  tags?: string[]
  status?: string | null
  npc_profile?: NpcProfile
  relations: { property: string; pageIds: string[] }[]
  /** Mapped property names absent from this page (graceful drift report). */
  warnings: string[]
}

function normalizeId(value: string): string {
  // Notion relation ids come back as dashed UUIDs; keep them as-is for matching
  // against campaign_docs.source_page_id (also stored as the Notion page id).
  return value.trim()
}

/**
 * Turns a Notion page + mapping into upsert-ready Codex fields. Pure; never
 * throws. Only emits fields whose property is mapped AND present on the page, so
 * unmapped / app-owned fields are left untouched by the caller.
 */
export function mapPageToDoc(page: NotionPage, mapping: NotionSyncMapping): MappedDocFields {
  const props = parseNotionProperties(page)
  const present = new Set(Object.keys(props))
  const warnings: string[] = []

  function mapped(propName: string | null, label: string): { has: boolean; value: unknown } {
    if (!propName) return { has: false, value: undefined }
    if (!present.has(propName)) {
      warnings.push(`${label} property "${propName}" was not found on this record.`)
      return { has: false, value: undefined }
    }
    return { has: true, value: props[propName] }
  }

  const out: MappedDocFields = {
    sourcePageId: page.id,
    sourceUrl: page.url ?? null,
    docType: mapping.doc_type,
    relations: [],
    warnings,
  }

  // Title: mapped property → intrinsic title fallback. Only undefined if neither
  // resolves (so the caller preserves the existing title).
  const titleMap = mapped(mapping.title_property, 'Title')
  let title = titleMap.has ? toStringValue(titleMap.value).trim() : ''
  if (!title) title = parseNotionTitle(page)
  if (title) out.title = title

  const dmSummary = mapped(mapping.dm_summary_property, 'DM summary')
  if (dmSummary.has) out.dm_summary = toStringValue(dmSummary.value).trim() || null

  const dmNotes = mapped(mapping.dm_notes_property, 'DM notes')
  if (dmNotes.has) out.dm_notes = toStringValue(dmNotes.value).trim() || null

  const playerSummary = mapped(mapping.player_summary_property, 'Player summary')
  if (playerSummary.has) out.player_summary = toStringValue(playerSummary.value).trim() || null

  const tags = mapped(mapping.tags_property, 'Tags')
  if (tags.has) out.tags = toTags(tags.value)

  const status = mapped(mapping.status_property, 'Status')
  if (status.has) out.status = toStringValue(status.value).trim() || null

  if (isNpcDocType(mapping.doc_type)) {
    out.npc_profile = extractNpcProfileFromProperties(props)
  }

  // Optional source URL property overrides the canonical page URL if present.
  const sourceUrlProp = mapped(mapping.source_url_property, 'Source URL')
  if (sourceUrlProp.has) {
    const v = toStringValue(sourceUrlProp.value).trim()
    if (v) out.sourceUrl = v
  }

  for (const propName of mapping.relation_properties ?? []) {
    if (!present.has(propName)) {
      warnings.push(`Relation property "${propName}" was not found on this record.`)
      continue
    }
    const raw = props[propName]
    const pageIds = (Array.isArray(raw) ? raw.map(String) : raw ? [String(raw)] : [])
      .map(normalizeId)
      .filter(Boolean)
    if (pageIds.length > 0) out.relations.push({ property: propName, pageIds })
  }

  return out
}

function toStringValue(value: unknown): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map(String).join(', ')
  return String(value)
}

function toTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((t) => t.trim()).filter(Boolean)
  if (typeof value === 'string') {
    return value.split(',').map((t) => t.trim()).filter(Boolean)
  }
  return []
}

/**
 * Applies a mapping to one Notion page. Missing or renamed properties never
 * throw — they yield empty values and a warning, so a drifted Notion schema
 * degrades gracefully instead of breaking the mapping.
 */
export function applyMapping(page: NotionPage, mapping: NotionSyncMapping): MappingPreview {
  const props = parseNotionProperties(page)
  const present = new Set(Object.keys(props))
  const warnings: string[] = []

  function read(propName: string | null, label: string): string {
    if (!propName) return ''
    if (!present.has(propName)) {
      warnings.push(`${label} property "${propName}" was not found on this record.`)
      return ''
    }
    return toStringValue(props[propName])
  }

  // Title: prefer the mapped property, fall back to the page's title property.
  let title = read(mapping.title_property, 'Title')
  if (!title) {
    const intrinsic = parseNotionTitle(page)
    if (intrinsic) title = intrinsic
  }

  const dmSummary = read(mapping.dm_summary_property, 'DM summary')
  const dmNotes = read(mapping.dm_notes_property, 'DM notes')
  const playerSummary = read(mapping.player_summary_property, 'Player summary')

  let tags: string[] = []
  if (mapping.tags_property) {
    if (present.has(mapping.tags_property)) tags = toTags(props[mapping.tags_property])
    else warnings.push(`Tags property "${mapping.tags_property}" was not found on this record.`)
  }

  let status: string | null = null
  if (mapping.status_property) {
    if (present.has(mapping.status_property)) {
      const raw = toStringValue(props[mapping.status_property])
      status = raw || null
    } else {
      warnings.push(`Status property "${mapping.status_property}" was not found on this record.`)
    }
  }

  const relations: MappingPreviewRelation[] = []
  for (const propName of mapping.relation_properties ?? []) {
    if (!present.has(propName)) {
      warnings.push(`Relation property "${propName}" was not found on this record.`)
      continue
    }
    const raw = props[propName]
    const values = Array.isArray(raw) ? raw.map(String) : raw ? [String(raw)] : []
    relations.push({
      property: propName,
      count: values.length,
      sample: values.slice(0, 3).join(', '),
    })
  }

  const dmFields: MappingPreviewField[] = []
  if (dmSummary) dmFields.push({ label: 'DM summary', value: dmSummary })
  if (dmNotes) dmFields.push({ label: 'DM notes', value: dmNotes })

  const playerFields: MappingPreviewField[] = []
  if (playerSummary) playerFields.push({ label: 'Player summary', value: playerSummary })

  return { title, dmFields, playerFields, tags, status, relations, warnings }
}
