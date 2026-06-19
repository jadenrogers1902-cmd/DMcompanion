import type { TokenType } from '@/lib/types/database'
import type {
  PreparedMapToken,
  PreparedTokenLinkType,
  PreparedTokenType,
  TokenResourceRef,
  TokenRevealState,
} from '@/lib/types/adventure'
import { normalizePrepLinks, normalizePrepNotes, normalizeTags } from './prep-metadata'

// ────────────────────────────────────────────────────────────
// Prep token types: label, map glyph, color, and the visibility
// a freshly added token of that type defaults to.
// ────────────────────────────────────────────────────────────
export const PREPARED_TOKEN_TYPES: {
  value: PreparedTokenType
  label: string
  icon: string
  color: string
  defaultReveal: TokenRevealState
}[] = [
  { value: 'enemy', label: 'Enemy', icon: '⚔️', color: '#dc2626', defaultReveal: 'visible' },
  { value: 'npc', label: 'NPC', icon: '🧑', color: '#2563eb', defaultReveal: 'visible' },
  { value: 'item', label: 'Item', icon: '🎒', color: '#a16207', defaultReveal: 'visible' },
  { value: 'trap', label: 'Trap', icon: '⚠️', color: '#ea580c', defaultReveal: 'hidden' },
  { value: 'door', label: 'Door', icon: '🚪', color: '#78716c', defaultReveal: 'visible' },
  { value: 'location', label: 'Location', icon: '📍', color: '#0d9488', defaultReveal: 'visible' },
  { value: 'clue', label: 'Clue', icon: '🔍', color: '#7c3aed', defaultReveal: 'hidden' },
  { value: 'loot', label: 'Loot', icon: '💰', color: '#ca8a04', defaultReveal: 'hidden' },
  { value: 'transport', label: 'Transport', icon: '🌀', color: '#7c3aed', defaultReveal: 'discoverable' },
  { value: 'custom', label: 'Custom', icon: '✨', color: '#52525b', defaultReveal: 'visible' },
]

export function preparedTokenTypeMeta(type: string) {
  return (
    PREPARED_TOKEN_TYPES.find((t) => t.value === type) ??
    PREPARED_TOKEN_TYPES[PREPARED_TOKEN_TYPES.length - 1]
  )
}

export const REVEAL_STATE_OPTIONS: {
  value: TokenRevealState
  label: string
  hint: string
}[] = [
  { value: 'visible', label: 'Visible to players', hint: 'Players see it as soon as the map goes live.' },
  { value: 'discoverable', label: 'Discoverable on sight', hint: 'Hidden until a player’s vision reaches it, then revealed automatically. The DM always sees it.' },
  { value: 'hidden', label: 'Hidden until revealed', hint: 'Deploys invisible; reveal it from Live Map.' },
  { value: 'revealed', label: 'Revealed after interaction', hint: 'Plan: shows up once players interact. Deploys visible-off until you reveal it live.' },
  { value: 'dm_only', label: 'DM only', hint: 'Reference marker — players never see it.' },
]

/** reveal_state → player visibility (one source of truth for canvas + deploy). */
export function revealStateIsPlayerVisible(state: TokenRevealState | string): boolean {
  return state === 'visible'
}

// ────────────────────────────────────────────────────────────
// Prep type → live TokenType mapping used when a prepared map is
// deployed to the Live Map ('item'/'clue'/'location' have no live
// equivalent and map to the closest live concept).
// ────────────────────────────────────────────────────────────
export function toLiveTokenType(prepType: string): TokenType {
  switch (prepType) {
    case 'enemy': return 'enemy'
    case 'npc': return 'npc'
    case 'item': return 'object'
    case 'trap': return 'trap'
    case 'door': return 'door'
    case 'loot': return 'loot'
    case 'clue': return 'note'
    case 'location': return 'custom'
    case 'transport': return 'portal'
    default: return 'custom'
  }
}

// ────────────────────────────────────────────────────────────
// Token links
// ────────────────────────────────────────────────────────────
export const TOKEN_LINK_TYPE_OPTIONS: { value: PreparedTokenLinkType; label: string }[] = [
  { value: 'dnd_beyond', label: 'D&D Beyond' },
  { value: 'roll20', label: 'Roll20' },
  { value: 'srd', label: '5e SRD' },
  { value: 'wiki', label: 'Wiki' },
  { value: 'custom', label: 'Custom URL' },
]

/** Best-guess link category from a pasted URL (user can override). */
export function detectLinkType(url: string): PreparedTokenLinkType {
  const value = url.toLowerCase()
  if (value.includes('dndbeyond.com')) return 'dnd_beyond'
  if (value.includes('roll20.net')) return 'roll20'
  if (value.includes('5esrd.com') || value.includes('5e.tools') || value.includes('dnd5e.wikidot.com')) return 'srd'
  if (value.includes('wikipedia.org') || value.includes('fandom.com') || value.includes('wiki')) return 'wiki'
  return 'custom'
}

// ────────────────────────────────────────────────────────────
// Optional attached SRD resource (Phase 8). Stored as a slim
// reference only — coerce/cap on load so persisted JSONB can never
// smuggle in unexpected shapes or oversized payloads.
// ────────────────────────────────────────────────────────────
const RESOURCE_CATEGORIES = ['monsters', 'spells', 'magicitems', 'weapons', 'armor']

export function normalizeTokenResource(value: unknown): TokenResourceRef | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const sourceId = String(raw.source_id ?? '').trim()
  const name = String(raw.name ?? '').trim()
  if (!sourceId || !name) return null

  const rawMeta =
    raw.metadata && typeof raw.metadata === 'object'
      ? (raw.metadata as Record<string, unknown>)
      : {}
  const metadata: Record<string, string> = {}
  for (const [key, val] of Object.entries(rawMeta).slice(0, 12)) {
    const k = String(key).slice(0, 40)
    const v = String(val ?? '').slice(0, 120)
    if (k && v) metadata[k] = v
  }

  const category = String(raw.category ?? '')
  return {
    source: String(raw.source ?? 'open5e').slice(0, 40) || 'open5e',
    source_id: sourceId.slice(0, 200),
    source_url: String(raw.source_url ?? '').slice(0, 1000),
    category: RESOURCE_CATEGORIES.includes(category) ? category : category.slice(0, 40) || 'monsters',
    name: name.slice(0, 200),
    summary: String(raw.summary ?? '').slice(0, 500),
    metadata,
    synced_at: String(raw.synced_at ?? '') || new Date().toISOString(),
  }
}

// ────────────────────────────────────────────────────────────
// Normalization: older Phase 4 tokens (JSONB) lack the Phase 5
// fields — fill them in on load so the editor never sees holes.
// ────────────────────────────────────────────────────────────
export function normalizePreparedToken(raw: Partial<PreparedMapToken>): PreparedMapToken {
  const type = String(raw.token_type ?? 'custom')
  const meta = preparedTokenTypeMeta(type)
  const reveal: TokenRevealState =
    raw.reveal_state && ['dm_only', 'hidden', 'visible', 'discoverable', 'revealed'].includes(raw.reveal_state)
      ? raw.reveal_state
      : raw.visible_to_players === false
        ? 'discoverable'
        : 'visible'
  return {
    id: String(raw.id ?? crypto.randomUUID()),
    token_type: type,
    name: String(raw.name ?? ''),
    linked_campaign_doc_id: raw.linked_campaign_doc_id ? String(raw.linked_campaign_doc_id) : null,
    linked_prepared_map_id: raw.linked_prepared_map_id ? String(raw.linked_prepared_map_id) : null,
    source: raw.source ? String(raw.source).slice(0, 40) : null,
    is_dynamic: raw.is_dynamic ?? !['trap', 'door', 'item', 'loot', 'clue', 'transport'].includes(type),
    can_move: raw.can_move ?? !['trap', 'door', 'item', 'loot', 'clue', 'transport'].includes(type),
    can_participate_in_combat: raw.can_participate_in_combat ?? ['enemy', 'npc'].includes(type),
    interactable: raw.interactable ?? ['trap', 'door', 'item', 'loot', 'clue', 'transport'].includes(type),
    object_state: raw.object_state ? String(raw.object_state).slice(0, 40) : null,
    icon: String(raw.icon ?? '') || meta.icon,
    x: Number(raw.x) || 0,
    y: Number(raw.y) || 0,
    size: Number(raw.size) || 1,
    color: String(raw.color ?? '') || meta.color,
    reveal_state: reveal,
    visible_to_players: revealStateIsPlayerVisible(reveal),
    status: ['draft', 'ready', 'active', 'archived'].includes(String(raw.status))
      ? raw.status!
      : 'draft',
    tags: normalizeTags(raw.tags),
    description: String(raw.description ?? ''),
    dm_notes: String(raw.dm_notes ?? ''),
    prep_notes: normalizePrepNotes(raw.prep_notes, 'token', String(raw.id ?? '')),
    player_notes: String(raw.player_notes ?? ''),
    links: normalizePrepLinks(raw.links, 'token', String(raw.id ?? '')),
    resource: normalizeTokenResource(raw.resource),
  }
}
