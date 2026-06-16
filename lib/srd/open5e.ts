// ============================================================
// Open5e SRD lookup (Adventure Maker Phase 8)
//
// Optional, license-safe public resource enrichment for prepared
// tokens. We query the Open5e API but constrain every request to
// the WotC System Reference Document (document slug `wotc-srd`,
// published under CC BY 4.0) — third-party OGL documents that
// Open5e also hosts (Tome of Beasts, Vault of Magic, A5e, …) are
// deliberately excluded to match docs/RULES_AND_LICENSING_NOTES.md.
//
// We NEVER store the full rules text. An attached resource keeps
// only a name, a one-line summary, a few capped metadata
// highlights, and a stable source URL — "link, don't embed".
// This module is shared by the route handler and the client UI, so
// it must stay free of server-only APIs.
// ============================================================

import type { TokenResourceRef } from '@/lib/types/adventure'

export const OPEN5E_SOURCE = 'open5e'
export const OPEN5E_API_BASE = 'https://api.open5e.com/v1'
/** WotC SRD 5.1 only (CC BY 4.0). Excludes Open5e's third-party OGL docs. */
export const SRD_DOCUMENT_SLUG = 'wotc-srd'

export type SrdCategory = 'monsters' | 'spells' | 'magicitems' | 'weapons' | 'armor'

export const SRD_CATEGORIES: { value: SrdCategory; label: string }[] = [
  { value: 'monsters', label: 'Monsters' },
  { value: 'spells', label: 'Spells' },
  { value: 'magicitems', label: 'Magic Items' },
  { value: 'weapons', label: 'Weapons' },
  { value: 'armor', label: 'Armor' },
]

export function isSrdCategory(value: string): value is SrdCategory {
  return SRD_CATEGORIES.some((category) => category.value === value)
}

/** Sensible default lookup category for a prep token type. */
export function defaultCategoryForTokenType(tokenType: string): SrdCategory {
  switch (tokenType) {
    case 'item':
    case 'loot':
      return 'magicitems'
    default:
      return 'monsters'
  }
}

/** Stable, always-valid link to the licensed source data on Open5e. */
export function open5eDetailUrl(category: SrdCategory, slug: string): string {
  return `${OPEN5E_API_BASE}/${category}/${slug}/`
}

/**
 * A slim search hit — display strings only, no full rules text. Selecting one
 * becomes a `TokenResourceRef` (with a sync timestamp added) on the token.
 */
export type SrdSearchResult = {
  source: string
  /** Provider slug. */
  source_id: string
  source_url: string
  category: SrdCategory
  name: string
  summary: string
  metadata: Record<string, string>
}

// ── per-category summary + metadata extraction ──────────────

function str(value: unknown): string {
  return value == null ? '' : String(value)
}

function set(meta: Record<string, string>, key: string, value: unknown) {
  const text = str(value).trim()
  if (text) meta[key] = text.slice(0, 120)
}

function joinDot(parts: (string | undefined)[]): string {
  return parts.map((part) => (part ?? '').trim()).filter(Boolean).join(' · ')
}

function mapByCategory(
  category: SrdCategory,
  raw: Record<string, unknown>,
): { summary: string; metadata: Record<string, string> } {
  const meta: Record<string, string> = {}

  switch (category) {
    case 'monsters': {
      const size = str(raw.size)
      const type = str(raw.type)
      const summary = joinDot([[size, type].filter(Boolean).join(' '), str(raw.alignment)])
      set(meta, 'CR', raw.challenge_rating)
      set(meta, 'AC', raw.armor_class)
      set(meta, 'HP', raw.hit_points)
      set(meta, 'Type', type)
      return { summary, metadata: meta }
    }
    case 'spells': {
      const summary = joinDot([
        [str(raw.level), str(raw.school)].filter(Boolean).join(' '),
        str(raw.dnd_class),
      ])
      set(meta, 'Level', raw.level)
      set(meta, 'School', raw.school)
      set(meta, 'Classes', raw.dnd_class)
      set(meta, 'Casting Time', raw.casting_time)
      set(meta, 'Range', raw.range)
      return { summary, metadata: meta }
    }
    case 'magicitems': {
      const summary = [str(raw.type), str(raw.rarity)].filter(Boolean).join(', ')
      set(meta, 'Type', raw.type)
      set(meta, 'Rarity', raw.rarity)
      const attunement = str(raw.requires_attunement).trim()
      if (attunement) set(meta, 'Attunement', attunement)
      return { summary, metadata: meta }
    }
    case 'weapons': {
      const damage = [str(raw.damage_dice), str(raw.damage_type)].filter(Boolean).join(' ')
      const summary = joinDot([str(raw.category), damage])
      set(meta, 'Damage', damage)
      const props = Array.isArray(raw.properties) ? raw.properties.map(str).filter(Boolean) : []
      if (props.length) set(meta, 'Properties', props.join(', '))
      set(meta, 'Cost', raw.cost)
      return { summary, metadata: meta }
    }
    case 'armor': {
      const ac = str(raw.ac_string) || str(raw.base_ac)
      const summary = joinDot([str(raw.category), ac ? `AC ${ac}` : ''])
      set(meta, 'AC', ac)
      set(meta, 'Category', raw.category)
      set(meta, 'Cost', raw.cost)
      return { summary, metadata: meta }
    }
    default:
      return { summary: '', metadata: meta }
  }
}

/** Map one raw Open5e record into a slim, license-safe search result. */
export function mapSrdResult(
  category: SrdCategory,
  raw: Record<string, unknown>,
): SrdSearchResult | null {
  const slug = str(raw.slug).trim()
  const name = str(raw.name).trim()
  if (!slug || !name) return null
  const { summary, metadata } = mapByCategory(category, raw)
  return {
    source: OPEN5E_SOURCE,
    source_id: slug,
    source_url: open5eDetailUrl(category, slug),
    category,
    name,
    summary,
    metadata,
  }
}

/** Build the persisted token reference from a chosen result. */
export function resourceRefFromResult(
  result: SrdSearchResult,
  syncedAtIso: string,
): TokenResourceRef {
  return {
    source: result.source,
    source_id: result.source_id,
    source_url: result.source_url,
    category: result.category,
    name: result.name,
    summary: result.summary,
    metadata: result.metadata,
    synced_at: syncedAtIso,
  }
}
