'use client'

import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Swords, Unlock, Users } from 'lucide-react'
import { MapCanvas, type AreaDrawTool, type RenderArea, type RenderToken } from './MapCanvas'
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
  deleteMap,
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
  updateToken,
  updateTokenPosition,
  upsertTokenDmNote,
  reviewTravelParty,
} from '@/lib/actions/maps'
import { travelThroughTransport } from '@/lib/actions/transport'
import { useTokenRealtime } from '@/lib/hooks/useTokenRealtime'
import { useRealtimeRefresh } from '@/lib/hooks/useRealtimeRefresh'
import { actionsForToken } from '@/lib/utils/actions'
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
  const [partyMenuOpen, setPartyMenuOpen] = useState(false)
  const [partyBusy, setPartyBusy] = useState<string | null>(null)
  const [partyFeedback, setPartyFeedback] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(true)
  const [mapToolTab, setMapToolTab] = useState<MapToolTab>('overview')
  const [editorTab, setEditorTab] = useState<TokenEditTab>('basic')
  const [draftToken, setDraftToken] = useState<Partial<Token> | null>(null)
  const [draftDmNote, setDraftDmNote] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const gridAutosaveReadyRef = useRef(false)

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
    },
    onAreaUpsert: (area) => setAreas((prev) => mergeAreaList(prev, area)),
    onAreaDelete: (id) => setAreas((prev) => prev.filter((a) => a.id !== id)),
  })

  // Keep the DM's linked Codex panels (map/token/object drawers) live: when a
  // Notion sync or manual Codex edit changes campaign_docs / links, refetch the
  // server-rendered codex props. DM-only route + DM-only tables, so players
  // never receive these events.
  useRealtimeRefresh(`codex-map-${map.id}`, [
    { table: 'campaign_docs', filter: `campaign_id=eq.${campaignId}` },
    { table: 'campaign_doc_links', filter: `campaign_id=eq.${campaignId}` },
  ])

  useRealtimeRefresh(`travel-map-${map.id}`, [
    { table: 'map_travel_parties', filter: `map_id=eq.${map.id}` },
    { table: 'map_travel_party_members', filter: `map_id=eq.${map.id}` },
  ])

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

  const renderTokens: RenderToken[] = useMemo(
    () =>
      tokens.map((t) => ({
        id: t.id,
        token_type: t.token_type,
        name: t.name,
        x: t.x,
        y: t.y,
        size: t.size,
        color: t.color,
        visible_to_players: t.visible_to_players,
      })),
    [tokens],
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
      setTokens((prev) => mergeTokenList(prev, token))
      setSelectedId(token.id)
      setContextMenuOpen(true)
      setAddMenuOpen(false)
    }
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

  async function handleDeleteMap() {
    if (!confirm(`Delete "${map.name}"? This removes the map and all its tokens.`)) return
    setBusy(true)
    await deleteMap(campaignId, map.id, map.storage_path)
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
  }) {
    setPartyBusy('travel')
    setPartyFeedback(null)
    if (input.travelMode) setTravelMode(input.travelMode)
    if (input.partyOptionsLocked !== undefined) setPartyOptionsLocked(input.partyOptionsLocked)
    if (input.groupMovementUnlimited !== undefined) setGroupMovementUnlimited(input.groupMovementUnlimited)
    if (input.freeroamMovementUnlimited !== undefined) setFreeroamMovementUnlimited(input.freeroamMovementUnlimited)
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
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={partyOptionsLocked ? 'primary' : 'secondary'}
            onClick={() => handleTravelOptionUpdate({ partyOptionsLocked: !partyOptionsLocked })}
          >
            {partyOptionsLocked ? 'Unlock Party Options' : 'Lock Party Options'}
          </Button>
          <Button
            size="sm"
            variant={toolsOpen ? 'secondary' : 'primary'}
            onClick={() => setToolsOpen((open) => !open)}
          >
            {toolsOpen ? 'Hide tools' : 'Show tools'}
          </Button>
          <Button
            size="sm"
            variant={mapLocked ? 'primary' : 'secondary'}
            onClick={handleToggleMapLock}
          >
            {mapLocked ? 'Unlock player movement' : 'Lock player movement'}
          </Button>
          {!isActive && (
            <Button size="sm" variant="secondary" onClick={handleSetActive} loading={busy}>
              Set active for players
            </Button>
          )}
          <Button size="sm" variant="danger" onClick={handleDeleteMap}>
            Delete map
          </Button>
        </div>
      </div>

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
            }}
            onAdd={handleAddToken}
          />
          <PartyTravelBubble
            open={partyMenuOpen}
            busy={partyBusy !== null}
            feedback={partyFeedback}
            travelMode={travelMode}
            partyOptionsLocked={partyOptionsLocked}
            groupMovementUnlimited={groupMovementUnlimited}
            freeroamMovementUnlimited={freeroamMovementUnlimited}
            parties={initialTravelParties}
            members={initialTravelPartyMembers}
            players={players}
            onToggle={() => {
              setPartyMenuOpen((open) => !open)
              setAddMenuOpen(false)
              setContextMenuOpen(false)
            }}
            onUpdate={handleTravelOptionUpdate}
            onReviewParty={handleReviewParty}
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
            />
          )}
          {selected && editorOpen && draftToken && (
            <TokenEditPanel
              campaignId={campaignId}
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

function PartyTravelBubble({
  open,
  busy,
  feedback,
  travelMode,
  partyOptionsLocked,
  groupMovementUnlimited,
  freeroamMovementUnlimited,
  parties,
  members,
  players,
  onToggle,
  onUpdate,
  onReviewParty,
}: {
  open: boolean
  busy: boolean
  feedback: string | null
  travelMode: TravelMode
  partyOptionsLocked: boolean
  groupMovementUnlimited: boolean
  freeroamMovementUnlimited: boolean
  parties: MapTravelParty[]
  members: MapTravelPartyMember[]
  players: CodexPlayer[]
  onToggle: () => void
  onUpdate: (input: {
    travelMode?: TravelMode
    partyOptionsLocked?: boolean
    groupMovementUnlimited?: boolean
    freeroamMovementUnlimited?: boolean
  }) => void
  onReviewParty: (partyId: string, approved: boolean) => void
}) {
  const pendingParties = parties.filter((party) => party.status === 'pending_dm')
  const activeParty = parties.find((party) => party.status === 'approved')
  const playerName = (userId: string) =>
    players.find((player) => player.id === userId)?.name ?? 'Player'

  function partyMemberSummary(partyId: string) {
    const rows = members.filter((member) => member.party_id === partyId)
    if (rows.length === 0) return 'No accepted members yet'
    return rows
      .map((member) => `${playerName(member.user_id)} (${member.status})`)
      .join(', ')
  }

  return (
    <div className="absolute bottom-4 left-24 z-20">
      {open && (
        <div className="mb-3 w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-zinc-700 bg-zinc-950 p-3 shadow-2xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-zinc-100">Party Travel</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                1 square = 5 ft baseline. Default travel movement is 30 ft.
              </p>
            </div>
            <button type="button" onClick={onToggle} className="text-xs text-zinc-500 hover:text-zinc-200">
              Close
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <TravelModeButton
              active={travelMode === 'group_party'}
              label="Group Party"
              icon={<Users className="h-4 w-4" aria-hidden="true" />}
              disabled={busy}
              onClick={() => onUpdate({ travelMode: 'group_party' })}
            />
            <TravelModeButton
              active={travelMode === 'freeroam'}
              label="Freeroam"
              icon={<Unlock className="h-4 w-4" aria-hidden="true" />}
              disabled={busy}
              onClick={() => onUpdate({ travelMode: 'freeroam' })}
            />
            <TravelModeButton
              active={travelMode === 'combat'}
              label="Combat Mode"
              icon={<Swords className="h-4 w-4" aria-hidden="true" />}
              disabled={busy}
              onClick={() => onUpdate({ travelMode: 'combat' })}
            />
          </div>

          <div className="mt-3 grid gap-2">
            <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">
              <span>Group Party infinite movement</span>
              <input
                type="checkbox"
                checked={groupMovementUnlimited}
                disabled={busy}
                onChange={(event) => onUpdate({ groupMovementUnlimited: event.target.checked })}
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">
              <span>Freeroam infinite movement</span>
              <input
                type="checkbox"
                checked={freeroamMovementUnlimited}
                disabled={busy}
                onChange={(event) => onUpdate({ freeroamMovementUnlimited: event.target.checked })}
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">
              <span>Lock Party Options</span>
              <input
                type="checkbox"
                checked={partyOptionsLocked}
                disabled={busy || travelMode === 'combat'}
                onChange={(event) => onUpdate({ partyOptionsLocked: event.target.checked })}
              />
            </label>
          </div>

          <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Party approvals</p>
            {activeParty && (
              <p className="mt-2 text-xs text-emerald-300">
                Active: {activeParty.name} led by {playerName(activeParty.leader_user_id)}
              </p>
            )}
            {pendingParties.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-500">No parties waiting for DM approval.</p>
            ) : (
              <div className="mt-2 grid gap-2">
                {pendingParties.map((party) => (
                  <div key={party.id} className="rounded-md border border-zinc-800 bg-zinc-950 p-2">
                    <p className="text-xs font-medium text-zinc-100">{party.name}</p>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      Leader: {playerName(party.leader_user_id)}
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-500">{partyMemberSummary(party.id)}</p>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => onReviewParty(party.id, false)} loading={busy}>
                        Deny
                      </Button>
                      <Button size="sm" onClick={() => onReviewParty(party.id, true)} loading={busy}>
                        Approve
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {feedback && (
            <p className="mt-3 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-amber-200">
              {feedback}
            </p>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={onToggle}
        aria-label="Open party travel controls"
        className={`flex h-14 w-14 items-center justify-center rounded-full border shadow-2xl transition focus:outline-none focus:ring-2 focus:ring-zinc-300 focus:ring-offset-2 focus:ring-offset-zinc-950 ${
          open
            ? 'border-zinc-300 bg-zinc-300 text-zinc-950'
            : 'border-zinc-600 bg-zinc-700 text-zinc-100 hover:bg-zinc-600'
        }`}
      >
        <Users className="h-6 w-6" aria-hidden="true" />
      </button>
    </div>
  )
}

function TravelModeButton({
  active,
  label,
  icon,
  disabled,
  onClick,
}: {
  active: boolean
  label: string
  icon: ReactNode
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg border px-2 py-2 text-center text-xs font-semibold transition disabled:opacity-50 ${
        active
          ? 'border-amber-400/60 bg-amber-500/15 text-amber-100'
          : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-600'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
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
}) {
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

function TokenEditPanel({
  campaignId,
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
  campaignId: string
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
  const [travelBusy, setTravelBusy] = useState(false)
  const [travelMsg, setTravelMsg] = useState<string | null>(null)

  async function handleTravelHere() {
    setTravelBusy(true)
    setTravelMsg(null)
    const result = await travelThroughTransport(campaignId, token.id)
    setTravelBusy(false)
    if ('error' in result) setTravelMsg(result.error)
    else if (result.traveled) setTravelMsg('Party traveled to the linked map.')
  }
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
              <div className="rounded-lg border border-violet-500/40 bg-violet-500/10 p-3">
                <p className="text-xs font-semibold text-violet-200">🌀 Transport token</p>
                <p className="mt-1 text-xs text-zinc-400">
                  {edited.destination_prepared_map_id
                    ? 'Players tap this to travel to the linked map — automatically in freeroam, or by unanimous party vote in group mode.'
                    : 'No destination linked. Set one on the prepared map in Adventure Maker, then redeploy.'}
                </p>
                {edited.destination_prepared_map_id && (
                  <>
                    <button
                      type="button"
                      disabled={travelBusy}
                      onClick={handleTravelHere}
                      className="mt-2 inline-flex items-center gap-2 rounded-md border border-violet-500/60 bg-violet-500/20 px-3 py-1.5 text-xs font-semibold text-violet-100 transition hover:border-violet-400 hover:bg-violet-500/30 disabled:opacity-50"
                    >
                      {travelBusy ? 'Working…' : 'Travel party here now'}
                    </button>
                    {travelMsg && <p className="mt-1.5 text-xs text-violet-300">{travelMsg}</p>}
                  </>
                )}
              </div>
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
              onChange={(e) => onPatch({ visible_to_players: e.target.checked })}
            />
            <Checkbox
              label="Visible on cast screen"
              checked={edited.visible_on_cast}
              onChange={(e) => onPatch({ visible_on_cast: e.target.checked })}
            />
            {!edited.visible_to_players && (
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
