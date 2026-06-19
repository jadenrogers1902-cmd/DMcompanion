import {
  parseNotionProperties,
  parseNotionTitle,
  type NotionPage,
} from './client'
import type { CampaignDocType } from '@/lib/types/database'

export type NpcWaresItem = {
  name: string
  price: string | null
  description: string | null
  quantity: string | null
  tags: string[]
}

export type NpcProfile = {
  role: string | null
  personality: string | null
  appearance: string | null
  wares: NpcWaresItem[]
}

export type NpcRevealPayload = NpcProfile & {
  kind: 'npc_profile'
  title: string
  summary: string | null
  docId: string | null
  sourceStatus: 'fresh_notion' | 'cached_codex' | 'token_fallback'
}

const ROLE_PROPS = ['role', 'type', 'kind', 'category', 'npc type', 'character type']
const PERSONALITY_PROPS = ['personality', 'personality traits', 'traits', 'mannerisms', 'demeanor']
const APPEARANCE_PROPS = ['appearance', 'description', 'looks', 'visual description', 'physical description']
const WARES_PROPS = ['wares', 'goods', 'inventory', 'shop inventory', 'items for sale', 'prices', 'merchandise']

export function emptyNpcProfile(): NpcProfile {
  return { role: null, personality: null, appearance: null, wares: [] }
}

export function isNpcDocType(docType: CampaignDocType | string | null | undefined) {
  return docType === 'npc' || docType === 'character' || docType === 'boss' || docType === 'hostile_enemy'
}

export function normalizeNpcProfile(value: unknown): NpcProfile {
  if (!value || typeof value !== 'object') return emptyNpcProfile()
  const input = value as Partial<NpcProfile>
  return {
    role: cleanText(input.role, 80),
    personality: cleanText(input.personality, 1200),
    appearance: cleanText(input.appearance, 1200),
    wares: normalizeWares(input.wares),
  }
}

export function extractNpcProfileFromPage(page: NotionPage): NpcProfile {
  const props = parseNotionProperties(page)
  return extractNpcProfileFromProperties(props)
}

export function extractNpcProfileFromProperties(props: Record<string, unknown>): NpcProfile {
  return {
    role: firstPropText(props, ROLE_PROPS, 80),
    personality: firstPropText(props, PERSONALITY_PROPS, 1200),
    appearance: firstPropText(props, APPEARANCE_PROPS, 1200),
    wares: parseWares(firstPropValue(props, WARES_PROPS)),
  }
}

export function buildNpcRevealPayload(input: {
  title: string
  summary?: string | null
  docId?: string | null
  profile?: unknown
  sourceStatus: NpcRevealPayload['sourceStatus']
}): NpcRevealPayload {
  const profile = normalizeNpcProfile(input.profile)
  return {
    kind: 'npc_profile',
    title: cleanText(input.title, 160) || 'NPC',
    summary: cleanText(input.summary, 2000),
    docId: input.docId ?? null,
    sourceStatus: input.sourceStatus,
    ...profile,
  }
}

export function buildNpcSummary(title: string, profile: NpcProfile, fallback?: string | null) {
  const pieces = [
    fallback,
    profile.role ? `Role: ${profile.role}` : null,
    profile.appearance ? `Appearance: ${profile.appearance}` : null,
    profile.personality ? `Personality: ${profile.personality}` : null,
  ].filter(Boolean)
  return pieces.join('\n\n').trim() || `${title} is ready to talk.`
}

export function pageTitle(page: NotionPage, fallback: string) {
  return parseNotionTitle(page) || fallback
}

function firstPropValue(props: Record<string, unknown>, names: string[]) {
  const targetNames = new Set(names.map((name) => normalizeKey(name)))
  for (const [name, value] of Object.entries(props)) {
    if (targetNames.has(normalizeKey(name))) return value
  }
  return null
}

function firstPropText(props: Record<string, unknown>, names: string[], max: number) {
  return cleanText(firstPropValue(props, names), max)
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
}

function cleanText(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null
  const text = Array.isArray(value) ? value.map(String).join(', ') : String(value)
  const cleaned = text.replace(/\s+/g, ' ').trim()
  return cleaned ? cleaned.slice(0, max) : null
}

function normalizeWares(value: unknown): NpcWaresItem[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const input = item as Partial<NpcWaresItem>
      const name = cleanText(input.name, 120)
      if (!name) return null
      return {
        name,
        price: cleanText(input.price, 80),
        description: cleanText(input.description, 500),
        quantity: cleanText(input.quantity, 80),
        tags: Array.isArray(input.tags) ? input.tags.map(String).slice(0, 8) : [],
      }
    })
    .filter((item): item is NpcWaresItem => Boolean(item))
    .slice(0, 40)
}

function parseWares(value: unknown): NpcWaresItem[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => parseWares(item))
      .slice(0, 40)
  }
  if (typeof value === 'object') return normalizeWares([value])

  const text = String(value).trim()
  if (!text) return []
  try {
    const parsed = JSON.parse(text) as unknown
    const normalized = normalizeWares(Array.isArray(parsed) ? parsed : [parsed])
    if (normalized.length > 0) return normalized
  } catch {
    // Plain Notion text is expected; fall through to line parsing.
  }

  return text
    .split(/\r?\n|;/)
    .map((line) => line.trim().replace(/^[-*]\s*/, ''))
    .filter(Boolean)
    .map(parseWareLine)
    .filter((item): item is NpcWaresItem => Boolean(item))
    .slice(0, 40)
}

function parseWareLine(line: string): NpcWaresItem | null {
  const match = line.match(/^(.+?)(?:\s+[-–—:]\s+|\s+\()([^()]+?\b(?:cp|sp|ep|gp|pp|gold|silver|copper|free|varies)\b[^()]*)\)?(?:\s+[-–—:]\s+(.+))?$/i)
  if (match) {
    return {
      name: match[1].trim().slice(0, 120),
      price: match[2].trim().slice(0, 80),
      description: cleanText(match[3], 500),
      quantity: null,
      tags: [],
    }
  }
  return {
    name: line.slice(0, 120),
    price: null,
    description: null,
    quantity: null,
    tags: [],
  }
}
