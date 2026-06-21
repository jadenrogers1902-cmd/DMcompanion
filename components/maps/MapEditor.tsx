'use client'

import Link from 'next/link'
import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapCanvas, type AreaDrawTool, type RenderArea, type RenderToken } from './MapCanvas'
import { PartyPlayersPanel } from './PartyPlayersPanel'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Checkbox } from '@/components/ui/Checkbox'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { DMLinkedCodexDocsPanel } from '@/components/codex/CodexLinkedDocsPanel'
import type { CodexPlayer } from '@/lib/actions/codex'
import {
  OBJECT_STATES,
  PLAYER_ACTION_TYPES,
  TOKEN_TYPES,
  type CampaignDoc,
  type CampaignDocLink,
  type CampaignDocLiveObjectType,
  type ActionIntentStatus,
  type GameMap,
  type MapRevealedArea,
  type MapTravelParty,
  type MapTravelPartyMember,
  type Token,
  type TokenType,
  type TravelMode,
} from '@/lib/types/database'
import {
  addRevealedArea,
  addToken,
  bulkUpdateTokenClassSettings,
  deleteRevealedArea,
  deleteToken,
  hideEntireMap,
  resetTokenMovement,
  resetTokenPosition,
  revealEntireMap,
  setActiveMap,
  setMapMovementLock,
  setMapTravelOptions,
  setRevealedAreaVisibility,
  setTokenMovementLock,
  setTokenOverride,
  updateMapSettings,
  updateMapCastSettings,
  updateToken,
  updateTokenPosition,
  upsertTokenDmNote,
  reviewTravelParty,
} from '@/lib/actions/maps'
import { travelThroughTransport, goToTransportDestination } from '@/lib/actions/transport'
import { startCampaignSession, endCampaignSession } from '@/lib/actions/sessions'
import { useActiveSession } from '@/lib/hooks/useActiveSession'
import { useTokenRealtime } from '@/lib/hooks/useTokenRealtime'
import { useRealtimeRefresh } from '@/lib/hooks/useRealtimeRefresh'
import { actionsForToken } from '@/lib/utils/actions'
import { normalizeCenterCastSettings, type CenterCastSettings } from '@/lib/utils/cast-settings'
import { createClient } from '@/lib/supabase/client'

// Action-intent statuses that keep a "!" alert badge on the target token.
const ACTIVE_INTENT_STATUSES: ActionIntentStatus[] = [
  'pending',
  'needs_roll',
  'approved',
  'approved_waiting_for_roll',
  'rolling',
  'rolled_waiting_for_dm',
  'resolving',
]

type TokenEditTab = 'basic' | 'actions' | 'visibility' | 'combat' | 'notes' | 'advanced'
type SaveStatus = 'idle' | 'saving' | 'saved'
type MapToolTab = 'overview' | 'reveal' | 'grid'
type TokenVisibilityFilter = 'all' | 'visible' | 'hidden' | 'discoverable' | 'cast'
type TokenClassId = 'enemy' | 'npc' | 'portal' | 'item' | 'object'
type TopToolbarMenu = 'casting' | 'map' | null
type TokenClassSettings = Pick<
  Token,
  | 'visible_to_players'
  | 'discoverable'
  | 'visible_on_cast'
  | 'interactable'
  | 'requires_approval'
  | 'movement_locked'
  | 'movement_override_allowed'
  | 'interaction_range_feet'
  | 'available_actions'
  | 'hidden_dm_actions'
  | 'object_state'
  | 'resolver_type'
>

type TokenClassDefinition = {
  id: TokenClassId
  label: string
  description: string
  tokenTypes: TokenType[]
  accent: string
  settings: TokenClassSettings
}

const LATEST_LOCAL_MIGRATION = '055_token_class_behavior_defaults.sql'

const TOKEN_EDIT_TABS: { value: TokenEditTab; label: string }[] = [
  { value: 'basic', label: 'Basic' },
  { value: 'actions', label: 'Actions' },
  { value: 'visibility', label: 'Visibility' },
  { value: 'combat', label: 'Combat' },
  { value: 'notes', label: 'Notes' },
  { value: 'advanced', label: 'Advanced' },
]

const OBJECT_TOKEN_TYPES = new Set<TokenType>([
  'object',
  'trap',
  'door',
  'chest',
  'book',
  'note',
  'loot',
  'lever',
  'switch',
  'portal',
  'key',
  'container',
  'custom',
])

const TOKEN_CLASS_DEFINITIONS: TokenClassDefinition[] = [
  {
    id: 'enemy',
    label: 'Enemies',
    description: 'Hostile creatures with combat-first behavior and health resolution.',
    tokenTypes: ['enemy'],
    accent: 'border-red-500/35 bg-red-500/10 text-red-100',
    settings: {
      visible_to_players: false,
      discoverable: true,
      visible_on_cast: true,
      interactable: true,
      requires_approval: true,
      movement_locked: false,
      movement_override_allowed: false,
      interaction_range_feet: 5,
      available_actions: ['Attack', 'Inspect'],
      hidden_dm_actions: [],
      object_state: 'visible',
      resolver_type: 'attack',
    },
  },
  {
    id: 'npc',
    label: 'NPC',
    description: 'Characters players can talk to, inspect, and request details from.',
    tokenTypes: ['npc'],
    accent: 'border-sky-500/35 bg-sky-500/10 text-sky-100',
    settings: {
      visible_to_players: true,
      discoverable: true,
      visible_on_cast: true,
      interactable: true,
      requires_approval: true,
      movement_locked: true,
      movement_override_allowed: false,
      interaction_range_feet: 10,
      available_actions: ['Talk', 'Inspect'],
      hidden_dm_actions: [],
      object_state: 'visible',
      resolver_type: 'manual',
    },
  },
  {
    id: 'portal',
    label: 'Portal',
    description: 'Dim discoverable travel markers that keep transport approval intact.',
    tokenTypes: ['portal'],
    accent: 'border-violet-500/35 bg-violet-500/10 text-violet-100',
    settings: {
      visible_to_players: false,
      discoverable: true,
      visible_on_cast: true,
      interactable: true,
      requires_approval: true,
      movement_locked: true,
      movement_override_allowed: false,
      interaction_range_feet: 5,
      available_actions: ['Enter', 'Inspect'],
      hidden_dm_actions: [],
      object_state: 'visible',
      resolver_type: 'manual',
    },
  },
  {
    id: 'item',
    label: 'Items',
    description: 'Lootable map rewards, containers, and keys players can discover.',
    tokenTypes: ['loot', 'chest', 'key', 'container'],
    accent: 'border-amber-500/35 bg-amber-500/10 text-amber-100',
    settings: {
      visible_to_players: false,
      discoverable: true,
      visible_on_cast: true,
      interactable: true,
      requires_approval: true,
      movement_locked: true,
      movement_override_allowed: false,
      interaction_range_feet: 5,
      available_actions: ['Inspect', 'Search', 'Take', 'Use Item'],
      hidden_dm_actions: [],
      object_state: 'visible',
      resolver_type: 'object_state',
    },
  },
  {
    id: 'object',
    label: 'Objects',
    description: 'Doors, traps, switches, notes, and other interactable map pieces.',
    tokenTypes: ['object', 'trap', 'door', 'book', 'note', 'lever', 'switch', 'custom'],
    accent: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-100',
    settings: {
      visible_to_players: false,
      discoverable: true,
      visible_on_cast: true,
      interactable: true,
      requires_approval: true,
      movement_locked: true,
      movement_override_allowed: false,
      interaction_range_feet: 5,
      available_actions: ['Inspect', 'Open', 'Close', 'Use Item', 'Lockpick', 'Disarm', 'Read'],
      hidden_dm_actions: [],
      object_state: 'visible',
      resolver_type: 'object_state',
    },
  },
]

function tokenClassForType(tokenType: TokenType) {
  return TOKEN_CLASS_DEFINITIONS.find((definition) => definition.tokenTypes.includes(tokenType)) ?? null
}

function tokenClassPatch(settings: TokenClassSettings): Partial<Token> {
  return {
    visible_to_players: settings.visible_to_players,
    discoverable: settings.discoverable,
    visible_on_cast: settings.visible_on_cast,
    interactable: settings.interactable,
    requires_approval: settings.requires_approval,
    movement_locked: settings.movement_locked,
    movement_override_allowed: settings.movement_override_allowed,
    interaction_range_feet: settings.interaction_range_feet,
    available_actions: settings.available_actions,
    hidden_dm_actions: settings.hidden_dm_actions,
    object_state: settings.object_state,
    resolver_type: settings.resolver_type,
  }
}

function codexObjectTypeForToken(token: Token): CampaignDocLiveObjectType {
  return OBJECT_TOKEN_TYPES.has(token.token_type) ? 'object' : 'token'
}

function mergeTokenList(tokens: Token[], token: Token) {
  const next = tokens.filter((t) => t.id !== token.id)
  next.push(token)
  return next
}

function removeDuplicateTokens(tokens: Token[]) {
  const byId = new Map<string, Token>()
  tokens.forEach((token) => byId.set(token.id, token))
  return Array.from(byId.values())
}

function mergeAreaList(areas: MapRevealedArea[], area: MapRevealedArea) {
  const next = areas.filter((a) => a.id !== area.id)
  next.push(area)
  return next
}

interface MapEditorProps {
  campaignId: string
  map: GameMap
  imageUrl: string
  initialTokens: Token[]
  initialDmNotes: Record<string, string>
  initialAreas: MapRevealedArea[]
  characters: { id: string; name: string; speed: number }[]
  /** Target token ids with an active action request — seed for the "!" badge. */
  initialAlertTokenIds?: string[]
  codexDocs?: CampaignDoc[]
  codexLinks?: CampaignDocLink[]
  players?: CodexPlayer[]
  initialTravelParties?: MapTravelParty[]
  initialTravelPartyMembers?: MapTravelPartyMember[]
  editMapHref?: string | null
}

export function MapEditor({
  campaignId,
  map,
  imageUrl,
  initialTokens,
  initialDmNotes,
  initialAreas,
  characters,
  initialAlertTokenIds = [],
  codexDocs = [],
  codexLinks = [],
  players = [],
  initialTravelParties = [],
  initialTravelPartyMembers = [],
  editMapHref = null,
}: MapEditorProps) {
  const router = useRouter()
  const [tokens, setTokens] = useState<Token[]>(() =>
    removeDuplicateTokens(initialTokens),
  )
  const [dmNotes, setDmNotes] = useState<Record<string, string>>(initialDmNotes)
  const [areas, setAreas] = useState<MapRevealedArea[]>(initialAreas)
  const [drawTool, setDrawTool] = useState<AreaDrawTool>(null)
  const [areaBusy, setAreaBusy] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Local, editable map settings
  const [gridEnabled, setGridEnabled] = useState(map.grid_enabled)
  const [gridSize, setGridSize] = useState(map.grid_size)
  const [gridScale, setGridScale] = useState(map.grid_scale_feet)
  const [gridColor, setGridColor] = useState(map.grid_color ?? '#ffffff')
  const [gridOpacity, setGridOpacity] = useState(map.grid_opacity ?? 0.34)
  const [gridLineWidth, setGridLineWidth] = useState(map.grid_line_width ?? 1.25)
  const [gridSubdivisions, setGridSubdivisions] = useState(map.grid_subdivisions ?? 1)
  const [gridOffsetX, setGridOffsetX] = useState(map.grid_offset_x ?? 0)
  const [gridOffsetY, setGridOffsetY] = useState(map.grid_offset_y ?? 0)
  const [dmLightBrightness, setDmLightBrightness] = useState(map.dm_light_brightness ?? 0.18)
  const [savingGrid, setSavingGrid] = useState(false)
  const [gridSaveError, setGridSaveError] = useState<string | null>(null)

  const [isActive, setIsActive] = useState(map.is_active)
  const [mapLocked, setMapLocked] = useState(map.player_movement_locked)
  const [travelMode, setTravelMode] = useState<TravelMode>(map.travel_mode ?? 'freeroam')
  const [partyOptionsLocked, setPartyOptionsLocked] = useState(map.party_options_locked ?? false)
  const [groupMovementUnlimited, setGroupMovementUnlimited] = useState(map.group_movement_unlimited ?? false)
  const [freeroamMovementUnlimited, setFreeroamMovementUnlimited] = useState(map.freeroam_movement_unlimited ?? false)
  const [playerVisionRadiusFeet, setPlayerVisionRadiusFeet] = useState(map.player_vision_radius_feet ?? 7)
  const [partyMenuOpen, setPartyMenuOpen] = useState(false)
  const [castSettingsOpen, setCastSettingsOpen] = useState(false)
  const [tokenClassPanelOpen, setTokenClassPanelOpen] = useState(false)
  const [tokenClassBusy, setTokenClassBusy] = useState<TokenClassId | 'all' | null>(null)
  const [topToolbarMenu, setTopToolbarMenu] = useState<TopToolbarMenu>(null)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [castSettings, setCastSettings] = useState<CenterCastSettings>(() =>
    normalizeCenterCastSettings(map.cast_settings),
  )
  const [castSettingsBusy, setCastSettingsBusy] = useState(false)
  const [castSettingsFeedback, setCastSettingsFeedback] = useState<string | null>(null)
  const [partyBusy, setPartyBusy] = useState<string | null>(null)
  const [partyFeedback, setPartyFeedback] = useState<string | null>(null)
  const [mapRealtimeStatus, setMapRealtimeStatus] = useState('connecting')
  const [codexRealtimeStatus, setCodexRealtimeStatus] = useState('connecting')
  const [travelRealtimeStatus, setTravelRealtimeStatus] = useState('connecting')
  const [centerPresenceStatus, setCenterPresenceStatus] = useState('connecting')
  const [centerScreenCount, setCenterScreenCount] = useState(0)
  const [toast, setToast] = useState<{ tone: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [tokenQuery, setTokenQuery] = useState('')
  const [tokenTypeFilter, setTokenTypeFilter] = useState<'all' | TokenType>('all')
  const [tokenVisibilityFilter, setTokenVisibilityFilter] = useState<TokenVisibilityFilter>('all')
  const [busy, setBusy] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [mapToolTab, setMapToolTab] = useState<MapToolTab>('overview')
  const [editorTab, setEditorTab] = useState<TokenEditTab>('basic')
  const [draftToken, setDraftToken] = useState<Partial<Token> | null>(null)
  const [draftDmNote, setDraftDmNote] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const gridAutosaveReadyRef = useRef(false)

  // Live tabletop session — startable from any live map; flips the players'
  // Tabletop tab + live indicator. Realtime-backed so the button reflects state
  // even if another DM device toggles it.
  const session = useActiveSession(campaignId)
  const [sessionBusy, setSessionBusy] = useState(false)

  function showToast(message: string, tone: 'success' | 'error' | 'info' = 'info') {
    setToast({ message, tone })
    window.setTimeout(() => setToast(null), 4500)
  }

  async function handleToggleSession() {
    setSessionBusy(true)
    if (session.isLive) {
      await endCampaignSession(campaignId)
    } else {
      await startCampaignSession(campaignId, map.id)
    }
    setSessionBusy(false)
  }

  const selected = tokens.find((t) => t.id === selectedId) ?? null

  // "!" alert badges: target tokens that currently have an active action
  // request. Seeded from the server, then kept live by subscribing to
  // action_intents for this campaign.
  const [alertTokenIds, setAlertTokenIds] = useState<string[]>(initialAlertTokenIds)
  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    async function refreshAlerts() {
      const { data } = await supabase
        .from('action_intents')
        .select('target_token_id, status')
        .eq('campaign_id', campaignId)
        .eq('map_id', map.id)
        .in('status', ACTIVE_INTENT_STATUSES)
      if (cancelled) return
      const ids = Array.from(
        new Set((data ?? []).map((row) => row.target_token_id).filter(Boolean) as string[]),
      )
      setAlertTokenIds(ids)
    }

    void refreshAlerts()
    const channel = supabase
      .channel(`map-action-alerts-${map.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'action_intents', filter: `campaign_id=eq.${campaignId}` },
        () => void refreshAlerts(),
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [campaignId, map.id])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setAddMenuOpen(false)
      setContextMenuOpen(false)
      setEditorOpen(false)
      setTokenClassPanelOpen(false)
      setTopToolbarMenu(null)
      setDiagnosticsOpen(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Live updates: see player moves and any other DM's changes in real time.
  useTokenRealtime(map.id, campaignId, {
    onUpsert: (row) => {
      setTokens((prev) => {
        const token = row as Token
        return mergeTokenList(prev, token)
      })
    },
    onDelete: (id) => {
      setTokens((prev) => prev.filter((t) => t.id !== id))
      if (selectedId === id) {
        setContextMenuOpen(false)
        setEditorOpen(false)
        setDraftToken(null)
        setDraftDmNote('')
      }
      setSelectedId((cur) => (cur === id ? null : cur))
    },
    onMapChange: (m) => {
      setMapLocked(m.player_movement_locked)
      setGridEnabled(m.grid_enabled)
      setGridSize(m.grid_size)
      setGridScale(m.grid_scale_feet)
      setGridColor(m.grid_color ?? '#ffffff')
      setGridOpacity(m.grid_opacity ?? 0.34)
      setGridLineWidth(m.grid_line_width ?? 1.25)
      setGridSubdivisions(m.grid_subdivisions ?? 1)
      setGridOffsetX(m.grid_offset_x ?? 0)
      setGridOffsetY(m.grid_offset_y ?? 0)
      setDmLightBrightness(m.dm_light_brightness ?? 0.18)
      setTravelMode(m.travel_mode ?? 'freeroam')
      setPartyOptionsLocked(m.party_options_locked ?? false)
      setGroupMovementUnlimited(m.group_movement_unlimited ?? false)
      setFreeroamMovementUnlimited(m.freeroam_movement_unlimited ?? false)
      setPlayerVisionRadiusFeet(m.player_vision_radius_feet ?? 7)
    },
    onAreaUpsert: (area) => setAreas((prev) => mergeAreaList(prev, area)),
    onAreaDelete: (id) => setAreas((prev) => prev.filter((a) => a.id !== id)),
    onStatus: setMapRealtimeStatus,
  })

  // Keep the DM's linked Codex panels (map/token/object drawers) live: when a
  // Notion sync or manual Codex edit changes campaign_docs / links, refetch the
  // server-rendered codex props. DM-only route + DM-only tables, so players
  // never receive these events.
  useRealtimeRefresh(`codex-map-${map.id}`, [
    { table: 'campaign_docs', filter: `campaign_id=eq.${campaignId}` },
    { table: 'campaign_doc_links', filter: `campaign_id=eq.${campaignId}` },
  ], { onStatus: setCodexRealtimeStatus })

  useRealtimeRefresh(`travel-map-${map.id}`, [
    { table: 'map_travel_parties', filter: `map_id=eq.${map.id}` },
    { table: 'map_travel_party_members', filter: `map_id=eq.${map.id}` },
  ], { onStatus: setTravelRealtimeStatus })

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(`center-screen-presence-${map.id}`)
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      const count = Object.values(state)
        .flat()
        .filter((entry) => (entry as { role?: string }).role === 'center_screen')
        .length
      setCenterScreenCount(count)
    })
    channel.subscribe((status) => {
      setCenterPresenceStatus(status)
      if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setCenterScreenCount(0)
      }
    })
    return () => {
      supabase.removeChannel(channel)
    }
  }, [map.id])

  const renderAreas: RenderArea[] = useMemo(
    () =>
      areas.map((a) => ({
        id: a.id,
        shape_type: a.shape_type,
        x: a.x,
        y: a.y,
        width: a.width,
        height: a.height,
        radius: a.radius,
      })),
    [areas],
  )

  async function handleRevealAll() {
    setAreaBusy(true)
    await revealEntireMap(campaignId, map.id)
    setAreaBusy(false)
    router.refresh()
  }

  async function handleHideAll() {
    if (!confirm('Hide the entire map and clear all revealed areas? Players will see nothing until you reveal again.')) return
    setAreaBusy(true)
    await hideEntireMap(campaignId, map.id)
    setAreas([])
    setAreaBusy(false)
  }

  async function handleAreaDrawn(
    shape:
      | { shape_type: 'rectangle'; x: number; y: number; width: number; height: number }
      | { shape_type: 'circle'; x: number; y: number; radius: number },
  ) {
    setDrawTool(null)
    await addRevealedArea(campaignId, map.id, shape)
  }

  async function handleToggleArea(area: MapRevealedArea) {
    const next = !area.visible_to_players
    setAreas((prev) => prev.map((a) => (a.id === area.id ? { ...a, visible_to_players: next } : a)))
    await setRevealedAreaVisibility(campaignId, map.id, area.id, next)
  }

  async function handleDeleteArea(area: MapRevealedArea) {
    setAreas((prev) => prev.filter((a) => a.id !== area.id))
    await deleteRevealedArea(campaignId, map.id, area.id)
  }

  const selectedSpeed =
    selected?.linked_character_id
      ? characters.find((c) => c.id === selected.linked_character_id)?.speed
      : undefined

  const filteredTokens = useMemo(() => {
    const query = tokenQuery.trim().toLowerCase()
    return tokens.filter((token) => {
      const matchesQuery =
        !query ||
        token.name?.toLowerCase().includes(query) ||
        token.token_type.toLowerCase().includes(query) ||
        token.notes?.toLowerCase().includes(query) ||
        token.public_description?.toLowerCase().includes(query)
      const matchesType = tokenTypeFilter === 'all' || token.token_type === tokenTypeFilter
      const matchesVisibility =
        tokenVisibilityFilter === 'all' ||
        (tokenVisibilityFilter === 'visible' && token.visible_to_players !== false) ||
        (tokenVisibilityFilter === 'hidden' && token.visible_to_players === false) ||
        (tokenVisibilityFilter === 'discoverable' && token.discoverable) ||
        (tokenVisibilityFilter === 'cast' && token.visible_on_cast !== false)
      return matchesQuery && matchesType && matchesVisibility
    })
  }, [tokenQuery, tokenTypeFilter, tokenVisibilityFilter, tokens])

  const renderTokens: RenderToken[] = useMemo(
    () =>
      filteredTokens.map((t) => ({
        id: t.id,
        token_type: t.token_type,
        name: t.name,
        x: t.x,
        y: t.y,
        size: t.size,
        color: t.color,
        visible_to_players: t.visible_to_players,
        max_hp: t.max_hp,
        current_hp: t.current_hp,
        temp_hp: t.temp_hp,
        is_defeated: t.is_defeated,
      })),
    [filteredTokens],
  )

  async function handleMove(id: string, x: number, y: number) {
    setTokens((prev) => prev.map((t) => (t.id === id ? { ...t, x, y } : t)))
    await updateTokenPosition(campaignId, id, x, y)
  }

  async function handleAddToken(type: TokenType) {
    setBusy(true)
    const result = await addToken(campaignId, map.id, {
      token_type: type,
      name: '',
      x: map.width / 2,
      y: map.height / 2,
    })
    setBusy(false)
    if ('token' in result && result.token) {
      const token = result.token as Token
      const tokenClass = tokenClassForType(token.token_type)
      const nextToken = tokenClass ? { ...token, ...tokenClassPatch(tokenClass.settings) } : token
      setTokens((prev) => mergeTokenList(prev, nextToken))
      setSelectedId(token.id)
      setContextMenuOpen(true)
      setAddMenuOpen(false)
      if (tokenClass) {
        const updateResult = await updateToken(campaignId, map.id, token.id, tokenClassPatch(tokenClass.settings))
        if ('error' in updateResult && updateResult.error) {
          showToast(`Token created, but ${tokenClass.label} defaults were not applied: ${updateResult.error}`, 'error')
        }
      }
    }
  }

  async function applyTokenClassSettings(definition: TokenClassDefinition) {
    const patch = tokenClassPatch(definition.settings)
    const matchingCount = tokens.filter((token) => definition.tokenTypes.includes(token.token_type)).length
    setTokenClassBusy(definition.id)
    setTokens((prev) =>
      prev.map((token) => (definition.tokenTypes.includes(token.token_type) ? { ...token, ...patch } : token)),
    )
    const result = await bulkUpdateTokenClassSettings(campaignId, map.id, {
      tokenTypes: definition.tokenTypes,
      settings: definition.settings,
    })
    setTokenClassBusy(null)
    if ('error' in result && result.error) {
      showToast(`${definition.label} settings failed: ${result.error}`, 'error')
      router.refresh()
      return
    }
    showToast(`Applied ${definition.label} behavior to ${matchingCount} token${matchingCount === 1 ? '' : 's'}.`, 'success')
  }

  async function applyAllTokenClassSettings() {
    setTokenClassBusy('all')
    const nextTokens = tokens.map((token) => {
      const definition = tokenClassForType(token.token_type)
      return definition ? { ...token, ...tokenClassPatch(definition.settings) } : token
    })
    setTokens(nextTokens)

    for (const definition of TOKEN_CLASS_DEFINITIONS) {
      const result = await bulkUpdateTokenClassSettings(campaignId, map.id, {
        tokenTypes: definition.tokenTypes,
        settings: definition.settings,
      })
      if ('error' in result && result.error) {
        setTokenClassBusy(null)
        showToast(`${definition.label} settings failed: ${result.error}`, 'error')
        router.refresh()
        return
      }
    }

    setTokenClassBusy(null)
    showToast('Applied recommended behavior to all token classes on this map.', 'success')
  }

  async function saveSelected(patch: Partial<Token>) {
    if (!selected) return
    const next = { ...selected, ...patch }
    setTokens((prev) => prev.map((t) => (t.id === next.id ? next : t)))
    await updateToken(campaignId, map.id, next.id, {
      name: patch.name,
      token_type: patch.token_type,
      color: patch.color,
      size: patch.size,
      visible_to_players: patch.visible_to_players,
      notes: patch.notes,
      linked_character_id: patch.linked_character_id,
      interaction_range_feet: patch.interaction_range_feet,
      available_actions: patch.available_actions,
      hidden_dm_actions: patch.hidden_dm_actions,
      interactable: patch.interactable,
      object_state: patch.object_state,
      discoverable: patch.discoverable,
      public_description: patch.public_description,
      visible_on_cast: patch.visible_on_cast,
      requires_approval: patch.requires_approval,
      resolver_type: patch.resolver_type,
      resolver_config: patch.resolver_config,
      max_hp: patch.max_hp,
      current_hp: patch.current_hp,
      temp_hp: patch.temp_hp,
      armor_class: patch.armor_class,
      is_defeated: patch.is_defeated,
    })
  }

  async function handleDeleteToken() {
    if (!selected) return
    if (!confirm(`Delete token "${selected.name || selected.token_type}"? This cannot be undone.`)) return
    const id = selected.id
    setTokens((prev) => prev.filter((t) => t.id !== id))
    setSelectedId(null)
    setContextMenuOpen(false)
    setEditorOpen(false)
    await deleteToken(campaignId, map.id, id)
  }

  async function handleSaveGrid() {
    setSavingGrid(true)
    setGridSaveError(null)
    const result = await updateMapSettings(campaignId, map.id, {
      grid_enabled: gridEnabled,
      grid_size: gridSize,
      grid_scale_feet: gridScale,
      grid_color: gridColor,
      grid_opacity: gridOpacity,
      grid_line_width: gridLineWidth,
      grid_subdivisions: gridSubdivisions,
      grid_offset_x: gridOffsetX,
      grid_offset_y: gridOffsetY,
      dm_light_brightness: dmLightBrightness,
    })
    setSavingGrid(false)
    if (result?.error) {
      setGridSaveError(result.error)
      return
    }
    router.refresh()
  }

  useEffect(() => {
    if (!gridAutosaveReadyRef.current) {
      gridAutosaveReadyRef.current = true
      return
    }

    const timer = window.setTimeout(async () => {
      setSavingGrid(true)
      setGridSaveError(null)
      const result = await updateMapSettings(campaignId, map.id, {
        grid_enabled: gridEnabled,
        grid_size: gridSize,
        grid_scale_feet: gridScale,
        grid_color: gridColor,
        grid_opacity: gridOpacity,
        grid_line_width: gridLineWidth,
        grid_subdivisions: gridSubdivisions,
        grid_offset_x: gridOffsetX,
        grid_offset_y: gridOffsetY,
        dm_light_brightness: dmLightBrightness,
      })
      setSavingGrid(false)
      if (result?.error) {
        setGridSaveError(result.error)
        return
      }
      router.refresh()
    }, 700)

    return () => window.clearTimeout(timer)
  }, [
    campaignId,
    dmLightBrightness,
    gridColor,
    gridEnabled,
    gridLineWidth,
    gridOffsetX,
    gridOffsetY,
    gridOpacity,
    gridScale,
    gridSize,
    gridSubdivisions,
    map.id,
    router,
  ])

  async function handleSetActive() {
    setBusy(true)
    await setActiveMap(campaignId, map.id)
    setIsActive(true)
    setBusy(false)
    router.refresh()
  }

  async function handleToggleMapLock() {
    const next = !mapLocked
    setMapLocked(next)
    await setMapMovementLock(campaignId, map.id, next)
  }

  async function handleTravelOptionUpdate(input: {
    travelMode?: TravelMode
    partyOptionsLocked?: boolean
    groupMovementUnlimited?: boolean
    freeroamMovementUnlimited?: boolean
    playerVisionRadiusFeet?: number
  }) {
    setPartyBusy('travel')
    setPartyFeedback(null)
    if (input.travelMode) setTravelMode(input.travelMode)
    if (input.partyOptionsLocked !== undefined) setPartyOptionsLocked(input.partyOptionsLocked)
    if (input.groupMovementUnlimited !== undefined) setGroupMovementUnlimited(input.groupMovementUnlimited)
    if (input.freeroamMovementUnlimited !== undefined) setFreeroamMovementUnlimited(input.freeroamMovementUnlimited)
    if (input.playerVisionRadiusFeet !== undefined) setPlayerVisionRadiusFeet(input.playerVisionRadiusFeet)
    if (input.travelMode === 'combat') {
      setMapLocked(true)
      setPartyOptionsLocked(true)
    }
    const result = await setMapTravelOptions(campaignId, map.id, input)
    if (result?.error) setPartyFeedback(result.error)
    else setPartyFeedback('Travel options updated.')
    setPartyBusy(null)
    router.refresh()
  }

  async function handleCastSettingsUpdate(patch: Partial<CenterCastSettings>) {
    const next = normalizeCenterCastSettings({ ...castSettings, ...patch })
    setCastSettings(next)
    setCastSettingsBusy(true)
    setCastSettingsFeedback(null)
    const result = await updateMapCastSettings(campaignId, map.id, next)
    if (result?.error) {
      setCastSettingsFeedback(result.error)
    } else {
      setCastSettingsFeedback('Cast settings updated.')
    }
    setCastSettingsBusy(false)
    router.refresh()
  }

  async function handleReviewParty(partyId: string, approved: boolean) {
    setPartyBusy(partyId)
    setPartyFeedback(null)
    const result = await reviewTravelParty(campaignId, map.id, partyId, approved)
    if (result?.error) setPartyFeedback(result.error)
    else {
      setPartyFeedback(approved ? 'Party approved.' : 'Party denied.')
    }
    setPartyBusy(null)
    router.refresh()
  }

  function patchToken(id: string, patch: Partial<Token>) {
    setTokens((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  async function handleToggleTokenLock() {
    if (!selected) return
    const next = !selected.movement_locked
    patchToken(selected.id, { movement_locked: next })
    await setTokenMovementLock(campaignId, map.id, selected.id, next)
  }

  async function handleToggleOverride() {
    if (!selected) return
    const next = !selected.movement_override_allowed
    patchToken(selected.id, { movement_override_allowed: next })
    await setTokenOverride(campaignId, map.id, selected.id, next)
  }

  async function handleResetMovement() {
    if (!selected) return
    patchToken(selected.id, { last_x: selected.x, last_y: selected.y, movement_used: 0 })
    await resetTokenMovement(campaignId, map.id, selected.id)
  }

  async function handleResetPosition() {
    if (!selected) return
    const ax = selected.last_x ?? selected.x
    const ay = selected.last_y ?? selected.y
    patchToken(selected.id, { x: ax, y: ay, movement_used: 0 })
    await resetTokenPosition(campaignId, map.id, selected.id)
  }

  // Per-token controls for the Party & Players roster (act on a token by id
  // rather than the current selection).
  function focusToken(tokenId: string) {
    setSelectedId(tokenId)
    setContextMenuOpen(true)
    setAddMenuOpen(false)
  }

  async function lockTokenById(tokenId: string, next: boolean) {
    patchToken(tokenId, { movement_locked: next })
    await setTokenMovementLock(campaignId, map.id, tokenId, next)
  }

  async function resetMovementById(tokenId: string) {
    const t = tokens.find((x) => x.id === tokenId)
    if (!t) return
    patchToken(tokenId, { last_x: t.x, last_y: t.y, movement_used: 0 })
    await resetTokenMovement(campaignId, map.id, tokenId)
  }

  async function resetPositionById(tokenId: string) {
    const t = tokens.find((x) => x.id === tokenId)
    if (!t) return
    const ax = t.last_x ?? t.x
    const ay = t.last_y ?? t.y
    patchToken(tokenId, { x: ax, y: ay, movement_used: 0 })
    await resetTokenPosition(campaignId, map.id, tokenId)
  }

  const [portalBusy, setPortalBusy] = useState(false)

  // Send the party through this portal (deploy/activate destination) and follow
  // the party there.
  async function handlePortalTravelParty(tokenId: string) {
    setPortalBusy(true)
    const result = await travelThroughTransport(campaignId, tokenId)
    setPortalBusy(false)
    if ('error' in result) {
      showToast(result.error, 'error')
      return
    }
    showToast('Travel party sent through portal.', 'success')
    if (result.traveled) router.push(`/campaigns/${campaignId}/live-map/${result.liveMapId}`)
  }

  // Jump to the destination map yourself (scout) without moving the players.
  async function handlePortalGoToLocation(tokenId: string) {
    setPortalBusy(true)
    const result = await goToTransportDestination(campaignId, tokenId)
    setPortalBusy(false)
    if ('error' in result) {
      showToast(result.error, 'error')
      return
    }
    showToast('Opening portal destination.', 'success')
    router.push(`/campaigns/${campaignId}/live-map/${result.liveMapId}`)
  }

  function handleSelectToken(id: string | null) {
    setSelectedId(id)
    setAddMenuOpen(false)
    if (id) {
      setContextMenuOpen(true)
      return
    }

    setContextMenuOpen(false)
    setEditorOpen(false)
    setDraftToken(null)
    setDraftDmNote('')
  }

  function openTokenEditor(tab: TokenEditTab) {
    if (!selected) return
    setDraftToken(selected)
    setDraftDmNote(dmNotes[selected.id] ?? '')
    setEditorTab(tab)
    setEditorOpen(true)
    setContextMenuOpen(false)
  }

  function patchDraftToken(patch: Partial<Token>) {
    setDraftToken((prev) => ({ ...(prev ?? {}), ...patch }))
  }

  async function handleSaveTokenDraft() {
    if (!selected || !draftToken) return

    setSaveStatus('saving')
    await saveSelected(draftToken)

    if (draftDmNote !== (dmNotes[selected.id] ?? '')) {
      setDmNotes((prev) => ({ ...prev, [selected.id]: draftDmNote }))
      await upsertTokenDmNote(campaignId, map.id, selected.id, draftDmNote)
    }

    setSaveStatus('saved')
    setEditorOpen(false)
  }

  const tokenMenuPosition: CSSProperties | undefined = selected
    ? {
        left: `clamp(0.75rem, calc(${(selected.x / map.width) * 100}% + 1rem), calc(100% - 18rem))`,
        top: `clamp(0.75rem, calc(${(selected.y / map.height) * 100}% - 1rem), calc(100% - 18rem))`,
      }
    : undefined

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-bold text-zinc-100">{map.name}</h1>
          {isActive ? (
            <Badge variant="success">Active</Badge>
          ) : (
            <Badge variant="default">Inactive</Badge>
          )}
          {mapLocked && <Badge variant="warning">Movement locked</Badge>}
          <Badge variant={travelMode === 'combat' ? 'warning' : 'default'}>
            {travelMode === 'group_party' ? 'Group Party' : travelMode === 'combat' ? 'Combat Mode' : 'Freeroam'}
          </Badge>
          {partyOptionsLocked && <Badge variant="warning">Party options locked</Badge>}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <ToolbarMenu
            label="Casting Options"
            open={topToolbarMenu === 'casting'}
            onToggle={() => {
              setTopToolbarMenu((open) => (open === 'casting' ? null : 'casting'))
              setPartyMenuOpen(false)
              setAddMenuOpen(false)
              setContextMenuOpen(false)
            }}
          >
            <Link
              href={`/campaigns/${campaignId}/live-map/${map.id}/center-screen`}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
              onClick={() => setTopToolbarMenu(null)}
            >
              <ToolbarMenuItemText
                title="Cast to Center Screen"
                description="Open the shared table display in a new tab."
              />
            </Link>
            <ToolbarMenuButton
              title="Cast Settings"
              description="Configure split views, fog, names, health bars, and cast chrome."
              active={castSettingsOpen}
              onClick={() => {
                setCastSettingsOpen((open) => !open)
                setTokenClassPanelOpen(false)
                setPartyMenuOpen(false)
                setTopToolbarMenu(null)
              }}
            />
          </ToolbarMenu>

          <ToolbarMenu
            label="Map Options"
            open={topToolbarMenu === 'map'}
            onToggle={() => {
              setTopToolbarMenu((open) => (open === 'map' ? null : 'map'))
              setPartyMenuOpen(false)
              setAddMenuOpen(false)
              setContextMenuOpen(false)
            }}
          >
            {editMapHref ? (
              <Link href={editMapHref} className="block" onClick={() => setTopToolbarMenu(null)}>
                <ToolbarMenuItemText
                  title="Edit Map"
                  description="Open this map in Adventure Maker."
                />
              </Link>
            ) : (
              <ToolbarMenuItemText
                title="Edit Map"
                description="No Adventure Maker source is linked to this live map."
                disabled
              />
            )}
            <ToolbarMenuButton
              title="Token Classes"
              description="Mass-apply behavior presets for enemies, NPCs, portals, items, and objects."
              active={tokenClassPanelOpen}
              onClick={() => {
                setTokenClassPanelOpen((open) => !open)
                setCastSettingsOpen(false)
                setPartyMenuOpen(false)
                setAddMenuOpen(false)
                setContextMenuOpen(false)
                setTopToolbarMenu(null)
              }}
            />
            <ToolbarMenuButton
              title="Map Tools"
              description={toolsOpen ? 'Hide the right-side map tools panel.' : 'Show the right-side map tools panel.'}
              active={toolsOpen}
              onClick={() => {
                setToolsOpen((open) => !open)
                setTopToolbarMenu(null)
              }}
            />
            <ToolbarMenuButton
              title={mapLocked ? 'Unlock Player Movement' : 'Lock Player Movement'}
              description="Control whether players can move tokens on this map."
              active={mapLocked}
              onClick={() => {
                void handleToggleMapLock()
                setTopToolbarMenu(null)
              }}
            />
            {!isActive && (
              <ToolbarMenuButton
                title="Set Active for Players"
                description="Make this the map players enter from the Adventure tab."
                loading={busy}
                onClick={() => {
                  void handleSetActive()
                  setTopToolbarMenu(null)
                }}
              />
            )}
          </ToolbarMenu>
          <button
            type="button"
            onClick={() => {
              setTopToolbarMenu(null)
              void handleToggleSession()
            }}
            disabled={sessionBusy}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold transition disabled:opacity-50 ${
              session.isLive
                ? 'border border-red-500/70 bg-red-500/15 text-red-200 hover:bg-red-500/25'
                : 'border border-emerald-500/60 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
            }`}
          >
            {session.isLive && (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
            )}
            {sessionBusy ? 'Working…' : session.isLive ? 'End session' : 'Start session'}
          </button>
        </div>
      </div>

      <LiveMapHealthPanel
        open={diagnosticsOpen}
        onToggle={() => {
          setDiagnosticsOpen((open) => !open)
          setTopToolbarMenu(null)
        }}
        isActive={isActive}
        mapRealtimeStatus={mapRealtimeStatus}
        codexRealtimeStatus={codexRealtimeStatus}
        travelRealtimeStatus={travelRealtimeStatus}
        centerPresenceStatus={centerPresenceStatus}
        centerScreenCount={centerScreenCount}
        sessionLoaded={session.loaded}
        sessionLive={session.isLive}
        latestMigration={LATEST_LOCAL_MIGRATION}
        unappliedMigrationHint="Run npm.cmd run db:migrate after Supabase credentials are available."
      />

      {toast && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm shadow-lg ${
            toast.tone === 'error'
              ? 'border-red-500/40 bg-red-950/70 text-red-100'
              : toast.tone === 'success'
                ? 'border-emerald-500/40 bg-emerald-950/70 text-emerald-100'
                : 'border-sky-500/40 bg-sky-950/70 text-sky-100'
          }`}
          role="status"
        >
          {toast.message}
        </div>
      )}

      <div
        className={
          toolsOpen
            ? 'grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_380px]'
            : 'grid min-h-0 flex-1 grid-cols-1 overflow-hidden'
        }
      >
        {/* Canvas */}
        <div className="relative min-h-0 overflow-hidden rounded-lg">
          <MapCanvas
            imageUrl={imageUrl}
            width={map.width}
            height={map.height}
            gridEnabled={gridEnabled}
            gridSize={gridSize}
            gridColor={gridColor}
            gridOpacity={gridOpacity}
            gridLineWidth={gridLineWidth}
            gridSubdivisions={gridSubdivisions}
            gridOffsetX={gridOffsetX}
            gridOffsetY={gridOffsetY}
            dmLightBrightness={dmLightBrightness}
            tokens={renderTokens}
            alertTokenIds={alertTokenIds}
            mode="dm"
            selectedTokenId={selectedId}
            onSelectToken={handleSelectToken}
            onMoveToken={handleMove}
            revealedAreas={renderAreas}
            fogEnabled={false}
            drawTool={drawTool}
            onAreaDrawn={handleAreaDrawn}
          />
          <TokenAddBubble
            open={addMenuOpen}
            busy={busy}
            onToggle={() => {
              setAddMenuOpen((open) => !open)
              setContextMenuOpen(false)
              setTokenClassPanelOpen(false)
            }}
            onAdd={handleAddToken}
          />
          <PartyPlayersPanel
            open={partyMenuOpen}
            busy={partyBusy !== null}
            feedback={partyFeedback}
            travelMode={travelMode}
            partyOptionsLocked={partyOptionsLocked}
            groupMovementUnlimited={groupMovementUnlimited}
            freeroamMovementUnlimited={freeroamMovementUnlimited}
            playerVisionRadiusFeet={playerVisionRadiusFeet}
            parties={initialTravelParties}
            members={initialTravelPartyMembers}
            players={players}
            onToggle={() => {
              setPartyMenuOpen((open) => !open)
              setAddMenuOpen(false)
              setContextMenuOpen(false)
              setCastSettingsOpen(false)
              setTokenClassPanelOpen(false)
            }}
            onUpdate={handleTravelOptionUpdate}
            onReviewParty={handleReviewParty}
            tokens={tokens}
            selectedTokenId={selectedId}
            onFocusToken={focusToken}
            onToggleTokenLock={lockTokenById}
            onResetMovement={resetMovementById}
            onResetPosition={resetPositionById}
          />
          <CastSettingsPanel
            open={castSettingsOpen}
            settings={castSettings}
            busy={castSettingsBusy}
            feedback={castSettingsFeedback}
            onToggle={() => setCastSettingsOpen((open) => !open)}
            onChange={handleCastSettingsUpdate}
          />
          <TokenClassSettingsPanel
            open={tokenClassPanelOpen}
            tokens={tokens}
            busyClass={tokenClassBusy}
            onToggle={() => setTokenClassPanelOpen((open) => !open)}
            onApply={applyTokenClassSettings}
            onApplyAll={applyAllTokenClassSettings}
          />
          {selected && contextMenuOpen && tokenMenuPosition && (
            <TokenContextMenu
              token={selected}
              position={tokenMenuPosition}
              selectedSpeed={selectedSpeed}
              onOpenTab={openTokenEditor}
              onResetMovement={handleResetMovement}
              onResetPosition={handleResetPosition}
              onToggleLock={handleToggleTokenLock}
              onToggleOverride={handleToggleOverride}
              onDelete={handleDeleteToken}
              portalBusy={portalBusy}
              onTravelParty={() => handlePortalTravelParty(selected.id)}
              onGoToLocation={() => handlePortalGoToLocation(selected.id)}
            />
          )}
          {selected && editorOpen && draftToken && (
            <TokenEditPanel
              token={selected}
              draft={draftToken}
              dmNote={draftDmNote}
              saveStatus={saveStatus}
              tab={editorTab}
              characters={characters}
              selectedSpeed={selectedSpeed}
              onTabChange={setEditorTab}
              onPatch={patchDraftToken}
              onDmNoteChange={setDraftDmNote}
              onCancel={() => setEditorOpen(false)}
              onSave={handleSaveTokenDraft}
            />
          )}
        </div>

        {/* Side panel */}
        <div className={`${toolsOpen ? 'flex' : 'hidden'} min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950`}>
          <div className="shrink-0 border-b border-zinc-800 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-zinc-100">Map Tools</h2>
              <Badge variant="default">DM</Badge>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <ToolTabButton active={mapToolTab === 'overview'} onClick={() => setMapToolTab('overview')}>
                Token
              </ToolTabButton>
              <ToolTabButton active={mapToolTab === 'reveal'} onClick={() => setMapToolTab('reveal')}>
                Reveal
              </ToolTabButton>
              <ToolTabButton active={mapToolTab === 'grid'} onClick={() => setMapToolTab('grid')}>
                Grid
              </ToolTabButton>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {mapToolTab === 'overview' && (
              <div className="flex flex-col gap-3">
                <DMLinkedCodexDocsPanel
                  campaignId={campaignId}
                  objectType="map"
                  objectId={map.id}
                  objectLabel={map.name}
                  docs={codexDocs}
                  links={codexLinks}
                  players={players}
                />
                <TokenFilterPanel
                  total={tokens.length}
                  shown={filteredTokens.length}
                  query={tokenQuery}
                  typeFilter={tokenTypeFilter}
                  visibilityFilter={tokenVisibilityFilter}
                  onQueryChange={setTokenQuery}
                  onTypeChange={setTokenTypeFilter}
                  onVisibilityChange={setTokenVisibilityFilter}
                />
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                  <h3 className="text-sm font-semibold text-zinc-200">Token Editing</h3>
                  <p className="mt-2 text-xs text-zinc-500">
                    Use the floating + on the map to add tokens. Select any token for quick actions
                    and a tabbed editor.
                  </p>
            {selected ? (
                  <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-100">
                          {selected.name || 'Unnamed token'}
                        </p>
                        <p className="text-xs capitalize text-zinc-500">{selected.token_type}</p>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => openTokenEditor('basic')}>
                        Edit
                      </Button>
                    </div>
                  </div>
            ) : (
                  <p className="mt-3 text-xs text-zinc-600">
                    Nothing selected. Click a token to manage it, or click the + bubble.
                  </p>
            )}
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                  <h3 className="text-sm font-semibold text-zinc-200">Movement</h3>
                  <p className="mt-2 text-xs text-zinc-500">
                    Use selected-token quick controls to lock, reset movement, or reset position.
                  </p>
                  {selected && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button size="sm" variant="secondary" onClick={handleResetMovement}>
                        Reset move
                      </Button>
                      <Button size="sm" variant="secondary" onClick={handleResetPosition}>
                        Reset pos
                      </Button>
                      <Button size="sm" variant="secondary" onClick={handleToggleTokenLock}>
                        {selected.movement_locked ? 'Unlock' : 'Lock'}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={handleToggleOverride}>
                        {selected.movement_override_allowed ? 'Block over' : 'Allow over'}
                      </Button>
                    </div>
                  )}
                </div>
                {selected && (
                  <DMLinkedCodexDocsPanel
                    campaignId={campaignId}
                    objectType={codexObjectTypeForToken(selected)}
                    objectId={selected.id}
                    objectLabel={selected.name || selected.token_type}
                    docs={codexDocs}
                    links={codexLinks}
                    players={players}
                  />
                )}
              </div>
            )}

          {/* Revealed areas (fog layer) */}
          {mapToolTab === 'reveal' && (
          <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <h3 className="text-sm font-semibold text-zinc-200">Revealed Areas</h3>
            <p className="text-xs text-zinc-500">
              Controls what map regions players can see. With no areas revealed,
              players see an empty/fogged map.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={handleRevealAll} loading={areaBusy}>
                Reveal entire map
              </Button>
              <Button size="sm" variant="danger" onClick={handleHideAll} loading={areaBusy}>
                Hide / clear all
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={drawTool === 'rectangle' ? 'primary' : 'secondary'}
                onClick={() => setDrawTool((t) => (t === 'rectangle' ? null : 'rectangle'))}
                className="flex-1"
              >
                {drawTool === 'rectangle' ? 'Drawing rectangle…' : 'Reveal rectangle'}
              </Button>
              <Button
                size="sm"
                variant={drawTool === 'circle' ? 'primary' : 'secondary'}
                onClick={() => setDrawTool((t) => (t === 'circle' ? null : 'circle'))}
                className="flex-1"
              >
                {drawTool === 'circle' ? 'Drawing circle…' : 'Reveal circle'}
              </Button>
            </div>
            {drawTool && (
              <p className="text-[11px] text-amber-400/80">
                Drag on the map to draw the {drawTool}. Click the button again to cancel.
              </p>
            )}
            {areas.length > 0 && (
              <ul className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                {areas.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5"
                  >
                    <span className="text-zinc-400 capitalize">
                      {a.shape_type}
                      {a.shape_type !== 'full' && (
                        <span className="text-zinc-600">
                          {' '}@ {Math.round(a.x)},{Math.round(a.y)}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleArea(a)}
                        className={a.visible_to_players ? 'text-emerald-400 hover:text-emerald-300' : 'text-zinc-500 hover:text-zinc-300'}
                      >
                        {a.visible_to_players ? 'Revealed' : 'Hidden'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteArea(a)}
                        className="text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          )}

          {/* Grid settings */}
          {mapToolTab === 'grid' && (
          <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-200">Grid</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Tune the map grid and DM reveal-light brightness. These grid settings are shared by the DM and player views.
              </p>
            </div>
            <Checkbox
              label="Show grid"
              checked={gridEnabled}
              onChange={(e) => setGridEnabled(e.target.checked)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Square size (px)"
                type="number"
                min={5}
                value={gridSize}
                onChange={(e) => setGridSize(Number(e.target.value) || 0)}
              />
              <Input
                label="Feet / square"
                type="number"
                min={1}
                value={gridScale}
                onChange={(e) => setGridScale(Number(e.target.value) || 0)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Offset X (px)"
                type="number"
                value={gridOffsetX}
                onChange={(e) => setGridOffsetX(Number(e.target.value) || 0)}
              />
              <Input
                label="Offset Y (px)"
                type="number"
                value={gridOffsetY}
                onChange={(e) => setGridOffsetY(Number(e.target.value) || 0)}
              />
            </div>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium text-zinc-300">Grid color</span>
              <input
                type="color"
                value={gridColor}
                onChange={(event) => setGridColor(event.target.value)}
                className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 p-1"
              />
            </label>
            <SliderSetting
              label="Grid brightness"
              value={gridOpacity}
              min={0.05}
              max={1}
              step={0.01}
              display={`${Math.round(gridOpacity * 100)}%`}
              onChange={setGridOpacity}
            />
            <SliderSetting
              label="Line width"
              value={gridLineWidth}
              min={0.5}
              max={6}
              step={0.25}
              display={`${gridLineWidth.toFixed(2)}px`}
              onChange={setGridLineWidth}
            />
            <SliderSetting
              label="Minor subdivisions"
              value={gridSubdivisions}
              min={1}
              max={8}
              step={1}
              display={`${gridSubdivisions} per square`}
              onChange={(value) => setGridSubdivisions(Math.round(value))}
            />
            <SliderSetting
              label="DM light brightness"
              value={dmLightBrightness}
              min={0}
              max={0.6}
              step={0.01}
              display={`${Math.round(dmLightBrightness * 100)}%`}
              onChange={setDmLightBrightness}
            />
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-500">
              1 square = {gridScale} ft. Grid brightness defaults brighter now at 34% for both DM and players.
            </div>
            {gridSaveError && (
              <p className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-200">
                {gridSaveError}
              </p>
            )}
            <Button size="sm" variant="secondary" onClick={handleSaveGrid} loading={savingGrid}>
              Save grid settings
            </Button>
          </div>
          )}
          </div>
        </div>
      </div>
    </div>
  )
}

function realtimeHealthy(status: string) {
  return status === 'SUBSCRIBED'
}

function ToolbarMenu({
  label,
  open,
  onToggle,
  children,
}: {
  label: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="relative">
      <Button size="sm" variant={open ? 'primary' : 'secondary'} onClick={onToggle}>
        {label}
      </Button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl shadow-black/40">
          <div className="grid gap-1 p-2">{children}</div>
        </div>
      )}
    </div>
  )
}

function ToolbarMenuItemText({
  title,
  description,
  active = false,
  disabled = false,
}: {
  title: string
  description: string
  active?: boolean
  disabled?: boolean
}) {
  return (
    <span
      className={`block rounded-md border px-3 py-2 text-left transition ${
        disabled
          ? 'border-transparent text-zinc-600'
          : active
          ? 'border-amber-400/50 bg-amber-500/15 text-amber-100'
          : 'border-transparent text-zinc-200 hover:border-zinc-700 hover:bg-zinc-900'
      }`}
    >
      <span className="block text-sm font-semibold">{title}</span>
      <span className="mt-0.5 block text-xs text-zinc-500">{description}</span>
    </span>
  )
}

function ToolbarMenuButton({
  title,
  description,
  active,
  loading,
  onClick,
}: {
  title: string
  description: string
  active?: boolean
  loading?: boolean
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} disabled={loading} className="disabled:opacity-50">
      <ToolbarMenuItemText title={loading ? 'Working...' : title} description={description} active={active} />
    </button>
  )
}

function LiveMapHealthPanel({
  open,
  onToggle,
  isActive,
  mapRealtimeStatus,
  codexRealtimeStatus,
  travelRealtimeStatus,
  centerPresenceStatus,
  centerScreenCount,
  sessionLoaded,
  sessionLive,
  latestMigration,
  unappliedMigrationHint,
}: {
  open: boolean
  onToggle: () => void
  isActive: boolean
  mapRealtimeStatus: string
  codexRealtimeStatus: string
  travelRealtimeStatus: string
  centerPresenceStatus: string
  centerScreenCount: number
  sessionLoaded: boolean
  sessionLive: boolean
  latestMigration: string
  unappliedMigrationHint: string
}) {
  const checks = [
    isActive,
    realtimeHealthy(mapRealtimeStatus),
    realtimeHealthy(codexRealtimeStatus),
    realtimeHealthy(travelRealtimeStatus),
    centerScreenCount > 0,
    sessionLoaded && sessionLive,
  ]
  const issueCount = checks.filter((ok) => !ok).length
  const statusTone =
    issueCount === 0
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
      : issueCount <= 2
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
        : 'border-red-500/40 bg-red-500/10 text-red-200'

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl shadow-black/20">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-zinc-900/70"
      >
        <div>
          <p className="text-sm font-semibold text-zinc-100">Diagnostics</p>
          <p className="text-xs text-zinc-500">Live map health, realtime, session, cast, and migration status.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${statusTone}`}>
            {issueCount === 0 ? 'Healthy' : `${issueCount} check${issueCount === 1 ? '' : 's'}`}
          </span>
          <span className="text-xs text-zinc-500">{open ? 'Hide' : 'Show'}</span>
        </div>
      </button>
      {open && (
        <div className="grid gap-2 border-t border-zinc-800 p-3 lg:grid-cols-[1fr_1fr]">
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-100">Live map health</h2>
              <span className="text-[11px] uppercase tracking-wide text-zinc-500">DM diagnostics</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <HealthItem label="Active map" value={isActive ? 'Active' : 'Inactive'} ok={isActive} />
              <HealthItem
                label="Map realtime"
                value={realtimeHealthy(mapRealtimeStatus) ? 'Connected' : mapRealtimeStatus}
                ok={realtimeHealthy(mapRealtimeStatus)}
              />
              <HealthItem
                label="Center screen"
                value={centerScreenCount > 0 ? `${centerScreenCount} connected` : realtimeHealthy(centerPresenceStatus) ? 'Waiting' : centerPresenceStatus}
                ok={centerScreenCount > 0}
              />
              <HealthItem
                label="Player session"
                value={!sessionLoaded ? 'Checking' : sessionLive ? 'Live' : 'Not live'}
                ok={sessionLoaded && sessionLive}
              />
            </div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Migration/status diagnostics</p>
                <p className="mt-1 break-all text-xs text-zinc-300">Latest local: {latestMigration}</p>
              </div>
              <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-200">
                Remote unverified
              </span>
            </div>
            <p className="mt-2 text-xs text-zinc-500">{unappliedMigrationHint}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <HealthItem
                label="Codex realtime"
                value={realtimeHealthy(codexRealtimeStatus) ? 'Connected' : codexRealtimeStatus}
                ok={realtimeHealthy(codexRealtimeStatus)}
              />
              <HealthItem
                label="Party realtime"
                value={realtimeHealthy(travelRealtimeStatus) ? 'Connected' : travelRealtimeStatus}
                ok={realtimeHealthy(travelRealtimeStatus)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function HealthItem({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
        <p className="mt-0.5 truncate text-xs text-zinc-200">{value}</p>
      </div>
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ok ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]' : 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.6)]'}`} />
    </div>
  )
}

function TokenFilterPanel({
  total,
  shown,
  query,
  typeFilter,
  visibilityFilter,
  onQueryChange,
  onTypeChange,
  onVisibilityChange,
}: {
  total: number
  shown: number
  query: string
  typeFilter: 'all' | TokenType
  visibilityFilter: TokenVisibilityFilter
  onQueryChange: (value: string) => void
  onTypeChange: (value: 'all' | TokenType) => void
  onVisibilityChange: (value: TokenVisibilityFilter) => void
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-200">Token search</h3>
        <span className="text-xs text-zinc-500">{shown}/{total} shown</span>
      </div>
      <input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search name, type, notes..."
        className="mt-3 min-h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-amber-400"
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <select
          value={typeFilter}
          onChange={(event) => onTypeChange(event.target.value as 'all' | TokenType)}
          className="min-h-10 rounded-md border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-100 outline-none focus:border-amber-400"
        >
          <option value="all">All types</option>
          {TOKEN_TYPES.map((type) => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </select>
        <select
          value={visibilityFilter}
          onChange={(event) => onVisibilityChange(event.target.value as TokenVisibilityFilter)}
          className="min-h-10 rounded-md border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-100 outline-none focus:border-amber-400"
        >
          <option value="all">All visibility</option>
          <option value="visible">Visible to players</option>
          <option value="hidden">Hidden</option>
          <option value="discoverable">Discoverable</option>
          <option value="cast">Shown on cast</option>
        </select>
      </div>
      {(query || typeFilter !== 'all' || visibilityFilter !== 'all') && (
        <button
          type="button"
          onClick={() => {
            onQueryChange('')
            onTypeChange('all')
            onVisibilityChange('all')
          }}
          className="mt-2 text-xs font-semibold text-amber-300 hover:text-amber-200"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}

function TokenAddBubble({
  open,
  busy,
  onToggle,
  onAdd,
}: {
  open: boolean
  busy: boolean
  onToggle: () => void
  onAdd: (type: TokenType) => void
}) {
  return (
    <div className="absolute bottom-4 left-4 z-20">
      {open && (
        <div className="mb-3 max-h-[calc(100%-1.5rem)] w-[min(21rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950 p-3 shadow-2xl">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-zinc-100">Add token</p>
            <button
              type="button"
              onClick={onToggle}
              className="text-xs text-zinc-500 hover:text-zinc-200"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {TOKEN_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                disabled={busy}
                onClick={() => onAdd(type.value)}
                className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 text-center transition hover:border-amber-500/70 disabled:opacity-50"
              >
                <span
                  className="h-6 w-6 rounded-full border border-black/40"
                  style={{ backgroundColor: type.color }}
                />
                <span className="text-xs text-zinc-300">{type.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={onToggle}
        aria-label="Add token or object"
        className="flex h-14 w-14 items-center justify-center rounded-full border border-amber-300/60 bg-amber-500 text-3xl font-semibold leading-none text-zinc-950 shadow-2xl transition hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-2 focus:ring-offset-zinc-950"
      >
        +
      </button>
    </div>
  )
}

function TokenContextMenu({
  token,
  position,
  selectedSpeed,
  onOpenTab,
  onResetMovement,
  onResetPosition,
  onToggleLock,
  onToggleOverride,
  onDelete,
  portalBusy,
  onTravelParty,
  onGoToLocation,
}: {
  token: Token
  position: CSSProperties
  selectedSpeed?: number
  onOpenTab: (tab: TokenEditTab) => void
  onResetMovement: () => void
  onResetPosition: () => void
  onToggleLock: () => void
  onToggleOverride: () => void
  onDelete: () => void
  portalBusy?: boolean
  onTravelParty?: () => void
  onGoToLocation?: () => void
}) {
  const isPortal = token.token_type === 'portal' && Boolean(token.destination_prepared_map_id)
  return (
    <div
      className="absolute z-30 max-h-[calc(100%-1.5rem)] w-72 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950 p-3 shadow-2xl"
      style={position}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-100">
            {token.name || 'Unnamed token'}
          </p>
          <p className="text-xs capitalize text-zinc-500">
            {token.token_type}
            {!token.visible_to_players && ' · hidden'}
            {token.is_defeated && ' · defeated'}
          </p>
        </div>
        <span
          className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-black/40"
          style={{ backgroundColor: token.color }}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ContextButton onClick={() => onOpenTab('basic')}>Edit Details</ContextButton>
        <ContextButton onClick={() => onOpenTab('actions')}>Actions</ContextButton>
        <ContextButton onClick={() => onOpenTab('visibility')}>Visibility</ContextButton>
        <ContextButton onClick={() => onOpenTab('combat')}>Health</ContextButton>
        <ContextButton onClick={() => onOpenTab('notes')}>Notes</ContextButton>
        <ContextButton onClick={() => onOpenTab('advanced')}>Advanced</ContextButton>
      </div>

      <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/80 p-2">
        <p className="text-xs text-zinc-500">
          Movement used: <span className="text-zinc-200">{Math.round(token.movement_used)} ft</span>
          {selectedSpeed !== undefined && <> of {selectedSpeed} ft</>}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <ContextButton onClick={onResetMovement}>Reset Move</ContextButton>
          <ContextButton onClick={onResetPosition}>Reset Position</ContextButton>
          <ContextButton onClick={onToggleLock}>
            {token.movement_locked ? 'Unlock Token' : 'Lock Token'}
          </ContextButton>
          <ContextButton onClick={onToggleOverride}>
            {token.movement_override_allowed ? 'Block Override' : 'Allow Override'}
          </ContextButton>
        </div>
      </div>

      {isPortal && (
        <div className="mt-3 grid gap-2">
          <button
            type="button"
            disabled={portalBusy}
            onClick={onTravelParty}
            className="w-full rounded-md border border-violet-500/60 bg-violet-500/15 px-3 py-2 text-xs font-semibold text-violet-100 transition hover:border-violet-400 hover:bg-violet-500/25 disabled:opacity-50"
          >
            🌀 {portalBusy ? 'Working…' : `Travel party to ${token.name || 'location'}`}
          </button>
          <button
            type="button"
            disabled={portalBusy}
            onClick={onGoToLocation}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-200 transition hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-50"
          >
            Go to {token.name || 'location'}
          </button>
        </div>
      )}

      <Button size="sm" variant="danger" onClick={onDelete} className="mt-3 w-full">
        Delete token
      </Button>
    </div>
  )
}

function ContextButton({
  children,
  onClick,
}: {
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-2 text-xs font-medium text-zinc-200 transition hover:border-amber-500/70 hover:text-amber-200"
    >
      {children}
    </button>
  )
}

function ToolTabButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2 py-2 text-xs font-medium transition ${
        active
          ? 'bg-amber-500 text-zinc-950'
          : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
      }`}
    >
      {children}
    </button>
  )
}

function SliderSetting({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (value: number) => void
}) {
  return (
    <label className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm">
      <span className="flex items-center justify-between gap-3">
        <span className="font-medium text-zinc-300">{label}</span>
        <span className="text-xs text-zinc-500">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-amber-500"
      />
    </label>
  )
}

function TokenClassSettingsPanel({
  open,
  tokens,
  busyClass,
  onToggle,
  onApply,
  onApplyAll,
}: {
  open: boolean
  tokens: Token[]
  busyClass: TokenClassId | 'all' | null
  onToggle: () => void
  onApply: (definition: TokenClassDefinition) => void
  onApplyAll: () => void
}) {
  if (!open) return null

  const classifiedCount = tokens.filter((token) => tokenClassForType(token.token_type)).length

  return (
    <div className="absolute right-3 top-3 z-30 flex max-h-[calc(100%-6rem)] w-[min(27rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-fuchsia-400/30 bg-zinc-950/95 shadow-2xl shadow-fuchsia-950/30 backdrop-blur">
      <div className="border-b border-zinc-800 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-fuchsia-300">Live Map Control</p>
            <h2 className="mt-1 text-base font-semibold text-zinc-50">Token Classes</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Apply behavior presets to already placed enemies, NPCs, portals, loot, and objects.
            </p>
          </div>
          <button
            type="button"
            onClick={onToggle}
            className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close token class settings"
          >
            x
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-3 rounded-lg border border-fuchsia-500/25 bg-fuchsia-500/10 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-zinc-100">Recommended defaults</p>
              <p className="mt-1 text-xs text-zinc-400">
                {classifiedCount} of {tokens.length} placed tokens match these classes.
              </p>
            </div>
            <Button
              size="sm"
              variant="primary"
              loading={busyClass === 'all'}
              disabled={busyClass !== null}
              onClick={onApplyAll}
            >
              Apply all
            </Button>
          </div>
        </div>

        <div className="grid gap-3">
          {TOKEN_CLASS_DEFINITIONS.map((definition) => {
            const count = tokens.filter((token) => definition.tokenTypes.includes(token.token_type)).length
            const settings = definition.settings
            return (
              <div key={definition.id} className={`rounded-lg border p-3 ${definition.accent}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-zinc-50">{definition.label}</h3>
                      <span className="rounded-full border border-current/25 px-2 py-0.5 text-[11px]">
                        {count} token{count === 1 ? '' : 's'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-300">{definition.description}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busyClass === definition.id}
                    disabled={busyClass !== null}
                    onClick={() => onApply(definition)}
                  >
                    Apply
                  </Button>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-zinc-200">
                  <TokenClassChip label={settings.visible_to_players ? 'Visible' : 'Dim until discovered'} />
                  <TokenClassChip label={settings.discoverable ? 'Discoverable' : 'Not discoverable'} />
                  <TokenClassChip label={settings.visible_on_cast ? 'Cast display' : 'Hidden from cast'} />
                  <TokenClassChip label={settings.interactable ? 'Interactable' : 'Map marker'} />
                  <TokenClassChip label={settings.requires_approval ? 'DM approval' : 'Auto resolve'} />
                  <TokenClassChip label={settings.movement_locked ? 'Locked' : 'Movable'} />
                  <TokenClassChip label={`${settings.interaction_range_feet} ft range`} />
                  <TokenClassChip label={`Resolver: ${settings.resolver_type}`} />
                </div>

                <div className="mt-3 rounded-md border border-white/10 bg-black/20 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Actions</p>
                  <p className="mt-1 text-xs text-zinc-200">
                    {(settings.available_actions ?? []).join(', ') || 'Uses default actions'}
                  </p>
                  <p className="mt-2 text-[11px] text-zinc-400">
                    Types: {definition.tokenTypes.join(', ')}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function TokenClassChip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5">
      {label}
    </span>
  )
}

function CastSettingsPanel({
  open,
  settings,
  busy,
  feedback,
  onToggle,
  onChange,
}: {
  open: boolean
  settings: CenterCastSettings
  busy: boolean
  feedback: string | null
  onToggle: () => void
  onChange: (patch: Partial<CenterCastSettings>) => void
}) {
  if (!open) return null

  return (
    <div className="absolute right-3 top-3 z-30 flex max-h-[calc(100%-6rem)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-cyan-400/30 bg-zinc-950/95 shadow-2xl shadow-cyan-950/30 backdrop-blur">
      <div className="border-b border-zinc-800 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Cast Display</p>
            <h2 className="mt-1 text-base font-semibold text-zinc-50">Cast Settings</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Controls how the center screen arranges party and split-player views.
            </p>
          </div>
          <button
            type="button"
            onClick={onToggle}
            className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close cast settings"
          >
            x
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid gap-3">
          <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 p-3">
            <Checkbox
              label="Dynamic split views"
              checked={settings.dynamicSplitEnabled}
              disabled={busy}
              onChange={(event) => onChange({ dynamicSplitEnabled: event.target.checked })}
            />
            <p className="mt-1 text-xs text-cyan-100/70">
              Separated players get their own map card on the center display.
            </p>
          </div>

          <Input
            label="Split distance (ft)"
            type="number"
            min={0}
            max={1000}
            step={5}
            value={settings.splitDistanceFeet}
            disabled={busy || !settings.dynamicSplitEnabled}
            onChange={(event) => onChange({ splitDistanceFeet: Number(event.target.value) })}
            hint="Default is 120 ft. Players farther than this from the leader split into their own view."
          />

          <Select
            label="Screen arrangement"
            value={settings.layoutMode}
            disabled={busy}
            onChange={(event) => onChange({ layoutMode: event.target.value as CenterCastSettings['layoutMode'] })}
          >
            <option value="auto_grid">Auto grid</option>
            <option value="main_side_rail">Main plus side rail</option>
            <option value="rotating_focus">Rotating focus</option>
          </Select>

          <Select
            label="Main focus"
            value={settings.mainFocus}
            disabled={busy}
            onChange={(event) => onChange({ mainFocus: event.target.value as CenterCastSettings['mainFocus'] })}
          >
            <option value="party_leader">Party leader</option>
            <option value="first_player">First player token</option>
            <option value="manual">Manual fallback</option>
          </Select>

          <Select
            label="View zoom"
            value={settings.viewZoom}
            disabled={busy}
            onChange={(event) => onChange({ viewZoom: event.target.value as CenterCastSettings['viewZoom'] })}
          >
            <option value="close">Close</option>
            <option value="balanced">Balanced</option>
            <option value="wide">Wide</option>
          </Select>

          <div className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
            <ToggleSetting label="Show player names" checked={settings.showPlayerNames} disabled={busy} onChange={(value) => onChange({ showPlayerNames: value })} />
            <ToggleSetting label="Show health bars" checked={settings.showHealthBars} disabled={busy} onChange={(value) => onChange({ showHealthBars: value })} />
            <ToggleSetting label="Show undiscovered hints" checked={settings.showTokenHints} disabled={busy} onChange={(value) => onChange({ showTokenHints: value })} />
            <ToggleSetting label="Show fog and reveals" checked={settings.showFog} disabled={busy} onChange={(value) => onChange({ showFog: value })} />
            <ToggleSetting label="Hide cast chrome by default" checked={settings.hideChromeByDefault} disabled={busy} onChange={(value) => onChange({ hideChromeByDefault: value })} />
          </div>

          {feedback && (
            <p className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-amber-200">
              {feedback}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function ToggleSetting({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-cyan-400"
      />
    </label>
  )
}

function TokenEditPanel({
  token,
  draft,
  dmNote,
  saveStatus,
  tab,
  characters,
  selectedSpeed,
  onTabChange,
  onPatch,
  onDmNoteChange,
  onCancel,
  onSave,
}: {
  token: Token
  draft: Partial<Token>
  dmNote: string
  saveStatus: SaveStatus
  tab: TokenEditTab
  characters: { id: string; name: string; speed: number }[]
  selectedSpeed?: number
  onTabChange: (tab: TokenEditTab) => void
  onPatch: (patch: Partial<Token>) => void
  onDmNoteChange: (value: string) => void
  onCancel: () => void
  onSave: () => void
}) {
  const edited = { ...token, ...draft }
  const visibleActions = (edited.available_actions ?? actionsForToken({ ...edited, interactable: true })).join(', ')
  const hiddenActions = (edited.hidden_dm_actions ?? []).join(', ')

  function parseList(value: string) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-40 max-h-[82vh] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-2xl md:absolute md:inset-x-auto md:bottom-4 md:right-4 md:w-[32rem]">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-100">
            {edited.name || 'Unnamed token'}
          </p>
          <p className="text-xs capitalize text-zinc-500">{edited.token_type}</p>
        </div>
        <div className="flex items-center gap-2">
          {saveStatus !== 'idle' && (
            <span className="text-xs text-zinc-500">
              {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
            </span>
          )}
          <button type="button" onClick={onCancel} className="text-sm text-zinc-500 hover:text-zinc-200">
            Close
          </button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-zinc-800 px-3 py-2">
        {TOKEN_EDIT_TABS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => onTabChange(item.value)}
            className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition ${
              tab === item.value
                ? 'bg-amber-500 text-zinc-950'
                : 'bg-zinc-900 text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="max-h-[58vh] overflow-y-auto p-4">
        {tab === 'basic' && (
          <div className="flex flex-col gap-3">
            <Input
              label="Name"
              value={edited.name}
              onChange={(e) => onPatch({ name: e.target.value })}
              placeholder="Goblin Boss"
            />
            <Select
              label="Type"
              value={edited.token_type}
              onChange={(e) => {
                const type = e.target.value as TokenType
                const color = TOKEN_TYPES.find((t) => t.value === type)?.color ?? edited.color
                onPatch({ token_type: type, color })
              }}
            >
              {TOKEN_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </Select>
            <Select
              label="Size"
              value={String(edited.size)}
              onChange={(e) => onPatch({ size: Number(e.target.value) })}
            >
              <option value="0.5">Tiny (1/2 square)</option>
              <option value="1">Medium (1 square)</option>
              <option value="2">Large (2 squares)</option>
              <option value="3">Huge (3 squares)</option>
              <option value="4">Gargantuan (4 squares)</option>
            </Select>
            {characters.length > 0 && (
              <Select
                label="Linked character"
                value={edited.linked_character_id ?? ''}
                onChange={(e) => onPatch({ linked_character_id: e.target.value || null })}
              >
                <option value="">None</option>
                {characters.map((character) => (
                  <option key={character.id} value={character.id}>{character.name}</option>
                ))}
              </Select>
            )}
            <Select
              label="Object state"
              value={edited.object_state ?? 'visible'}
              onChange={(e) => onPatch({ object_state: e.target.value as Token['object_state'] })}
            >
              {OBJECT_STATES.map((state) => (
                <option key={state.value} value={state.value}>{state.label}</option>
              ))}
            </Select>

            {edited.token_type === 'portal' && (
              <p className="rounded-lg border border-violet-500/40 bg-violet-500/10 p-3 text-xs text-zinc-400">
                🌀 Transport token{edited.destination_prepared_map_id ? '' : ' — no destination linked. Set one on the prepared map in Adventure Maker, then redeploy.'}
                {edited.destination_prepared_map_id ? ' Use the quick menu (click the token) to travel the party here or go to the location yourself.' : ''}
              </p>
            )}
          </div>
        )}

        {tab === 'actions' && (
          <div className="flex flex-col gap-3">
            <Checkbox
              label="Players can interact with this"
              checked={edited.interactable}
              onChange={(e) => onPatch({ interactable: e.target.checked })}
            />
            <Checkbox
              label="Requires DM approval"
              checked={edited.requires_approval}
              onChange={(e) => onPatch({ requires_approval: e.target.checked })}
            />
            <Input
              label="Interaction range (ft)"
              type="number"
              min={0}
              value={edited.interaction_range_feet}
              onChange={(e) => onPatch({ interaction_range_feet: Number(e.target.value) || 0 })}
            />
            <Textarea
              label="Allowed actions"
              value={visibleActions}
              onChange={(e) => onPatch({ available_actions: parseList(e.target.value) })}
              rows={3}
              disabled={!edited.interactable}
              hint={`Suggestions: ${PLAYER_ACTION_TYPES.join(', ')}`}
            />
            <Textarea
              label="Hidden DM-only actions"
              value={hiddenActions}
              onChange={(e) => onPatch({ hidden_dm_actions: parseList(e.target.value) })}
              rows={2}
              placeholder="Ambush, Secret Door..."
              className="border-amber-900/50 bg-zinc-950"
            />
            <Select
              label="Default resolver"
              value={edited.resolver_type}
              onChange={(e) => onPatch({ resolver_type: e.target.value as Token['resolver_type'] })}
            >
              <option value="manual">Manual</option>
              <option value="object_state">Object state</option>
              <option value="attack">Attack</option>
            </Select>
          </div>
        )}

        {tab === 'visibility' && (
          <div className="flex flex-col gap-3">
            <Checkbox
              label="Visible to players"
              checked={edited.visible_to_players}
              onChange={(e) => onPatch({ visible_to_players: e.target.checked, discoverable: e.target.checked ? false : edited.discoverable })}
            />
            <Checkbox
              label="Discoverable on sight"
              checked={edited.discoverable}
              onChange={(e) => onPatch({ discoverable: e.target.checked, visible_to_players: e.target.checked ? false : edited.visible_to_players })}
            />
            <Checkbox
              label="Visible on cast screen"
              checked={edited.visible_on_cast}
              onChange={(e) => onPatch({ visible_on_cast: e.target.checked })}
            />
            {edited.discoverable && !edited.visible_to_players && (
              <p className="rounded-lg border border-blue-900/50 bg-blue-950/20 p-3 text-xs text-blue-200">
                Hidden from players until their vision reaches it, then revealed automatically. You always see it.
              </p>
            )}
            {!edited.visible_to_players && !edited.discoverable && (
              <p className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-3 text-xs text-amber-200">
                Hidden tokens stay DM-only and are not sent to player map or action views.
              </p>
            )}
            <Textarea
              label="Player-visible note"
              value={edited.notes ?? ''}
              onChange={(e) => onPatch({ notes: e.target.value })}
              rows={3}
            />
            <Textarea
              label="Public description"
              value={edited.public_description ?? ''}
              onChange={(e) => onPatch({ public_description: e.target.value })}
              rows={3}
              placeholder="An old iron-bound chest, slightly ajar."
            />
          </div>
        )}

        {tab === 'combat' && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="AC"
                type="number"
                min={0}
                value={edited.armor_class}
                onChange={(e) => onPatch({ armor_class: Number(e.target.value) || 0 })}
              />
              <Input
                label="Max HP"
                type="number"
                min={0}
                value={edited.max_hp}
                onChange={(e) => onPatch({ max_hp: Number(e.target.value) || 0 })}
              />
              <Input
                label="Current HP"
                type="number"
                min={0}
                value={edited.current_hp}
                onChange={(e) => onPatch({ current_hp: Number(e.target.value) || 0 })}
              />
              <Input
                label="Temp HP"
                type="number"
                min={0}
                value={edited.temp_hp}
                onChange={(e) => onPatch({ temp_hp: Number(e.target.value) || 0 })}
              />
            </div>
            <Checkbox
              label="Defeated"
              checked={edited.is_defeated}
              onChange={(e) =>
                onPatch({
                  is_defeated: e.target.checked,
                  object_state: e.target.checked ? 'defeated' : edited.object_state,
                })
              }
            />
          </div>
        )}

        {tab === 'notes' && (
          <div className="flex flex-col gap-3">
            <Textarea
              label="DM note"
              value={dmNote}
              onChange={(e) => onDmNoteChange(e.target.value)}
              rows={5}
              placeholder="Only you can see this. Never sent to players."
              className="border-amber-900/50 bg-zinc-950"
            />
            <p className="text-xs text-zinc-500">
              Private notes are stored separately from tokens and are not part of player realtime payloads.
            </p>
          </div>
        )}

        {tab === 'advanced' && (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Movement</p>
              <p className="mt-2 text-sm text-zinc-300">
                Used this round: <span className="text-zinc-100">{Math.round(edited.movement_used)} ft</span>
                {selectedSpeed !== undefined && <> of {selectedSpeed} ft</>}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Token is {edited.movement_locked ? 'locked' : 'unlocked'}; over-speed movement is{' '}
                {edited.movement_override_allowed ? 'allowed' : 'blocked'}.
              </p>
            </div>
            <p className="text-xs text-zinc-500">
              Use the quick menu for lock, override, reset movement, and reset position controls.
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-zinc-800 px-4 py-3">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSave} loading={saveStatus === 'saving'}>
          Save
        </Button>
      </div>
    </div>
  )
}
