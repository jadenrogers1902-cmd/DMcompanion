// ============================================================
// Adventure Maker domain vocabulary (Phase 1 scaffolding)
//
// The map system is split into two surfaces:
//
//   Live Map        — the DM's *active session* dashboard (route:
//                     /campaigns/[id]/live-map). Realtime state: the active
//                     map, live tokens, fog reveals, movement, action
//                     requests. Players see the active map here too.
//
//   Adventure Maker — the *preparation* surface (future feature). The DM
//                     preps Adventures → Chapters → PreparedMaps (with
//                     pre-placed tokens, encounters, notes, and links)
//                     before the session, then pushes them into Live Map.
//
// `Adventure` (migration 019), `Chapter` (migration 020), and `PreparedMap`
// (migration 021) are all persisted row types now. Prep-side names stay
// distinct from the live `GameMap`/`Token` runtime types in
// lib/types/database.ts: prepared content is DM-only authoring data that gets
// instantiated into live rows on deploy, never edited in place during play.
// ============================================================

import type { FogMode, FogStyle } from './database'

export type { FogMode, FogStyle }

/** Lifecycle of a prepared adventure in the Adventure Maker workspace. */
export type AdventureStatus = 'draft' | 'ready' | 'active' | 'archived'

export type PrepParentType = 'adventure' | 'chapter' | 'map' | 'token'
export type PrepNoteVisibility = 'dm_only' | 'player_visible'
export type PrepLinkType = 'wiki' | 'dnd_beyond' | 'srd' | 'roll20' | 'custom'

export type PrepNote = {
  id: string
  parentType?: PrepParentType
  parentId?: string
  title: string
  body: string
  tags: string[]
  pinned: boolean
  visibility: PrepNoteVisibility
  createdAt: string
  updatedAt: string
}

export type PrepImportantLink = {
  id: string
  parentType?: PrepParentType
  parentId?: string
  title: string
  url: string
  type: PrepLinkType
  description: string
  pinned: boolean
  createdAt: string
  updatedAt: string
}

/**
 * A prepared campaign module: an ordered set of chapters the DM authors
 * before play. Backed by the `adventures` table (migration 019) — DM-only RLS.
 */
export interface Adventure {
  id: string
  campaign_id: string
  title: string
  description: string | null
  status: AdventureStatus
  prep_notes: PrepNote[]
  important_links: PrepImportantLink[]
  tags: string[]
  created_at: string
  updated_at: string
}

/**
 * One major section of an Adventure ("Session 1", "Dungeon Entrance", ...).
 * Backed by the `adventure_chapters` table (migration 020) — DM-only RLS.
 */
export interface Chapter {
  id: string
  adventure_id: string
  campaign_id: string
  title: string
  description: string | null
  /** Presentation order within the adventure (ascending). */
  sort_order: number
  status: AdventureStatus
  /** Whether this is the campaign's currently playable chapter (one per campaign). */
  is_live?: boolean
  prep_notes: PrepNote[]
  important_links: PrepImportantLink[]
  tags: string[]
  created_at: string
  updated_at: string
}

/**
 * A reusable map template authored in Adventure Maker: image + grid settings +
 * pre-placed token layout + DM notes + links. Deploying one into a session
 * creates a live `GameMap` (and live `Token` rows) without mutating the
 * prepared original. Backed by the `prepared_maps` table (migration 021) —
 * DM-only RLS; tokens/notes/links live as JSONB on the row.
 *
 * Declared with `type` (not `interface`) so the JSONB collections stay
 * assignable to the typed client's `Record<string, unknown>[]` columns.
 */
export type PreparedMap = {
  id: string
  adventure_id: string
  chapter_id: string
  campaign_id: string
  title: string
  description: string | null
  /** Path within the private 'maps' bucket; null until an image is added. */
  storage_path: string | null
  width: number
  height: number
  grid_enabled: boolean
  grid_size: number
  tokens: PreparedMapToken[]
  room_regions: PreparedMapRoomRegion[]
  /** Author-painted fog masks; deploy into map_room_regions like room masks. */
  fog_regions: PreparedMapRoomRegion[]
  /** Base (whole-map) fog applied to players when deployed. */
  fog_mode: FogMode
  fog_style: FogStyle
  notes: PreparedMapNote[]
  links: PreparedMapLink[]
  tags: string[]
  status: AdventureStatus
  /** Whether this is the chapter's hub (entry) map — one per chapter. */
  is_hub?: boolean
  created_at: string
  updated_at: string
}

export type RoomRegionPoint = {
  x: number
  y: number
}

export type RoomRegionShapeType = 'rectangle' | 'polygon'
export type RoomRevealMode = 'manual' | 'auto' | 'manual_auto'
export type RoomMaskStyle = 'blackout' | 'dim' | 'outline_only'
export type RoomBorderStyle = 'door' | 'dashed' | 'solid' | 'glow'

export type PreparedMapRoomRegion = {
  id: string
  name: string
  linked_campaign_doc_id?: string | null
  shape_type: RoomRegionShapeType
  x: number
  y: number
  width?: number | null
  height?: number | null
  points: RoomRegionPoint[]
  reveal_mode: RoomRevealMode
  mask_style: RoomMaskStyle
  border_style: RoomBorderStyle
  player_label_visible: boolean
  auto_reveal_distance_feet: number
  is_revealed_by_default: boolean
  visible_to_players: boolean
  dm_notes?: string
}

/** Prep-side token vocabulary (distinct from the live `TokenType` set). */
export type PreparedTokenType =
  | 'enemy'
  | 'npc'
  | 'item'
  | 'trap'
  | 'door'
  | 'location'
  | 'clue'
  | 'loot'
  | 'transport'
  | 'custom'

/** Visibility rule applied when the scene is deployed (and shown in prep). */
export type TokenRevealState = 'dm_only' | 'hidden' | 'visible' | 'discoverable' | 'revealed'

/** Categorized external resource attached to a token. */
export type PreparedTokenLinkType = 'wiki' | 'dnd_beyond' | 'srd' | 'roll20' | 'custom'

export type PreparedTokenLink = {
  id: string
  title: string
  url: string
  type: PreparedTokenLinkType
  description?: string
  pinned?: boolean
  createdAt?: string
  updatedAt?: string
}

/**
 * A public SRD-compatible resource attached to a token (Phase 8). Holds a
 * compact reference + display summary, never the full API payload, and stays
 * fully separate from DM-written notes.
 */
export type TokenResourceRef = {
  /** Provider id, e.g. 'open5e'. */
  source: string
  /** Provider-side identifier (slug). */
  source_id: string
  /** Human-viewable URL for the resource. */
  source_url: string
  /** Provider category, e.g. 'monsters' | 'spells' | 'magicitems' | 'weapons' | 'armor'. */
  category: string
  name: string
  /** One-line display summary built from the API payload. */
  summary: string
  /** Small key→value highlights (CR, AC, HP, rarity, …) — capped, not the raw payload. */
  metadata: Record<string, string>
  /** ISO timestamp of the last fetch from the provider. */
  synced_at: string
}

/**
 * A token pre-placement inside a PreparedMap (not a live, realtime token).
 * Notion-style: structured info, notes split by audience, and typed links.
 * adventure/chapter/map ids are implicit — tokens live as JSONB on their
 * `prepared_maps` row.
 */
export type PreparedMapToken = {
  id: string
  token_type: PreparedTokenType | string
  name: string
  /** Optional Adventure Codex record this prep token was created from. */
  linked_campaign_doc_id?: string | null
  /**
   * For transport tokens: the prepared map this token travels to. Players tap
   * the deployed token to move the party to that scene. Ignored for other types.
   */
  linked_prepared_map_id?: string | null
  /** App-side origin label for the linked record; never a raw provider id. */
  source?: 'manual' | 'notion' | 'import' | 'open5e' | 'codex' | string | null
  /** Dynamic entity tokens can move/participate in live systems; static objects are fixed for players. */
  is_dynamic?: boolean
  can_move?: boolean
  can_participate_in_combat?: boolean
  interactable?: boolean
  object_state?: string | null
  /** Short glyph (emoji) shown on the map icon. */
  icon: string
  x: number
  y: number
  size: number
  color: string
  /**
   * Kept in sync with reveal_state ('visible'/'revealed' → true) so shared
   * canvas styling and deploy both read one source of truth.
   */
  visible_to_players: boolean
  reveal_state: TokenRevealState
  status: AdventureStatus
  tags: string[]
  /** Player-safe summary of what this is. */
  description: string
  /** DM-only prep notes — never shown to players. */
  dm_notes: string
  prep_notes: PrepNote[]
  /** Notes intended to be read to/by players. */
  player_notes: string
  links: PreparedTokenLink[]
  /** Optional attached public resource (5e SRD-compatible) — separate from DM notes. */
  resource: TokenResourceRef | null
}

/** A DM-only prep note attached to a PreparedMap. */
export type PreparedMapNote = PrepNote

/** An external link/resource attached to a PreparedMap. */
export type PreparedMapLink = PrepImportantLink
