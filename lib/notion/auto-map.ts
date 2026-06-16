// Pure auto-detection for Notion table import. No network, no secrets.
// Given a Notion database name + property list, suggest a Codex doc type and a
// field mapping, with confidence + a per-field plan for the preview UI.

import type { CampaignDocType } from '@/lib/types/database'
import type { NotionDatabaseSummary } from './client'

export type Confidence = 'high' | 'low'
export type FieldRole =
  | 'title'
  | 'dm_summary'
  | 'player_summary'
  | 'dm_notes'
  | 'tags'
  | 'status'
  | 'relation'
  | 'ignored'

export type FieldPlanItem = {
  name: string
  type: string
  role: FieldRole
  confidence: Confidence
  relationDatabaseId: string | null
}

export type SuggestedMapping = {
  title_property: string | null
  dm_summary_property: string | null
  player_summary_property: string | null
  dm_notes_property: string | null
  tags_property: string | null
  status_property: string | null
  relation_properties: string[]
}

export type AutoMapResult = {
  docType: CampaignDocType | null
  docTypeConfidence: Confidence
  needsReview: boolean
  mapping: SuggestedMapping
  fieldPlan: FieldPlanItem[]
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Detect the Codex doc type from a Notion table name. */
export function detectDocType(tableName: string): { docType: CampaignDocType | null; confidence: Confidence } {
  const n = norm(tableName)
  // Order matters: check more specific names first (sub-location before location).
  if (/\bsub\b.*location|sub location/.test(n)) return { docType: 'sub_location', confidence: 'high' }
  if (/\bboss|hostile|enemy|enemies|villain/.test(n)) return { docType: 'hostile_enemy', confidence: 'high' }
  if (/\blocation/.test(n)) return { docType: 'location', confidence: 'high' }
  if (/\bsub location|\broom/.test(n)) return { docType: 'sub_location', confidence: 'high' }
  if (/\bcharacter|\bnpc\b|\bpeople\b/.test(n)) return { docType: 'character', confidence: 'high' }
  if (/\bstoryline|\bsession|\bstory\b|\bchapter/.test(n)) return { docType: 'session', confidence: 'high' }
  if (/\brumor|\brumour/.test(n)) return { docType: 'rumor', confidence: 'high' }
  if (/\bside quest|\bquest/.test(n)) return { docType: 'side_quest', confidence: 'high' }
  if (/\bfaction/.test(n)) return { docType: 'faction', confidence: 'high' }
  if (/\bitem|\bloot|\binventory|\bwares\b/.test(n)) return { docType: 'item', confidence: 'high' }
  return { docType: null, confidence: 'low' }
}

const DM_SUMMARY_NAMES = ['description', 'summary', 'story overview', 'overview', 'atmosphere']
const PLAYER_SAFE_NAMES = ['player summary', 'player safe summary', 'public description', 'rumor description']
const DM_NOTES_NAMES = [
  'background',
  'what happens here',
  'what happens',
  'room secret',
  'motive',
  'lore',
  'combat stats',
  'combat',
  'ability scores',
  'skill modifiers',
  'notes',
]
const TITLE_NAMES = ['name', 'page', 'title', 'character', 'side quest', 'session']
const TAGS_NAMES = ['tags', 'tag']
const STATUS_NAMES = ['status', 'session', 'state', 'category']

function includesAny(name: string, list: string[]): boolean {
  return list.some((k) => name === k || name.includes(k))
}

/**
 * Suggest a full mapping + per-field plan. Privacy-first: anything that isn't an
 * explicit player-safe field defaults to DM-only. Each Codex field takes the
 * first matching property (single-slot); extra matches are marked ignored.
 */
export function autoMapTable(table: NotionDatabaseSummary): AutoMapResult {
  const { docType, confidence } = detectDocType(table.title)

  const mapping: SuggestedMapping = {
    title_property: null,
    dm_summary_property: null,
    player_summary_property: null,
    dm_notes_property: null,
    tags_property: null,
    status_property: null,
    relation_properties: [],
  }
  const plan: FieldPlanItem[] = []

  for (const prop of table.properties) {
    const lower = norm(prop.name)
    let role: FieldRole = 'ignored'
    let conf: Confidence = 'high'

    if (prop.type === 'relation') {
      role = 'relation'
      mapping.relation_properties.push(prop.name)
    } else if (prop.type === 'title' || (!mapping.title_property && includesAny(lower, TITLE_NAMES))) {
      if (!mapping.title_property) {
        role = 'title'
        mapping.title_property = prop.name
      }
    } else if (!mapping.player_summary_property && includesAny(lower, PLAYER_SAFE_NAMES)) {
      role = 'player_summary'
      mapping.player_summary_property = prop.name
    } else if (!mapping.dm_summary_property && includesAny(lower, DM_SUMMARY_NAMES)) {
      role = 'dm_summary'
      mapping.dm_summary_property = prop.name
    } else if (!mapping.dm_notes_property && includesAny(lower, DM_NOTES_NAMES)) {
      role = 'dm_notes'
      mapping.dm_notes_property = prop.name
    } else if (!mapping.tags_property && (prop.type === 'multi_select' || includesAny(lower, TAGS_NAMES))) {
      role = 'tags'
      mapping.tags_property = prop.name
    } else if (!mapping.status_property && (prop.type === 'status' || prop.type === 'select') && includesAny(lower, STATUS_NAMES)) {
      role = 'status'
      mapping.status_property = prop.name
      conf = 'low'
    } else {
      role = 'ignored'
      conf = 'low'
    }

    plan.push({ name: prop.name, type: prop.type, role, confidence: conf, relationDatabaseId: prop.relationDatabaseId })
  }

  // If no explicit title prop matched, fall back to the Notion title-typed prop.
  if (!mapping.title_property) {
    const titleProp = table.properties.find((p) => p.type === 'title')
    if (titleProp) {
      mapping.title_property = titleProp.name
      const item = plan.find((p) => p.name === titleProp.name)
      if (item) item.role = 'title'
    }
  }

  const needsReview = docType == null || !mapping.title_property
  return { docType, docTypeConfidence: confidence, needsReview, mapping, fieldPlan: plan }
}
