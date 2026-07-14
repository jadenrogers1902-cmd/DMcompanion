'use client'

import { useEffect, useMemo, useState } from 'react'
import { Eye, Maximize2, RefreshCw } from 'lucide-react'
import { MapCanvas, type RenderArea, type RenderRoomRegion, type RenderToken, type RenderWall } from './MapCanvas'
import { buildPrivateMapImageUrl } from '@/lib/maps/live-map'
import { safePlayerImageUrl } from '@/lib/utils/player-media'
import type {
  GameMap,
  MapRevealedArea,
  MapRoomRegion,
  MapTravelParty,
  MapTravelPartyMember,
  MapWall,
  Token,
} from '@/lib/types/database'
import { normalizeCenterCastSettings, type CenterCastSettings } from '@/lib/utils/cast-settings'
import { createClient } from '@/lib/supabase/client'
import { usePlayerSafeMapRealtime } from '@/lib/hooks/usePlayerSafeMapRealtime'

export interface CenterScreenViewGroup {
  id: string
  label: string
  subtitle: string
  focusTokenId: string | null
  focus: { x: number; y: number } | null
  tone: 'party' | 'solo'
}

interface CenterScreenMapViewProps {
  campaignId: string
  map: GameMap
  imageUrl: string
  initialTokens: Token[]
  initialRevealedAreas: MapRevealedArea[]
  initialRoomRegions: MapRoomRegion[]
  initialWalls: MapWall[]
  initialTravelParties: MapTravelParty[]
  initialTravelPartyMembers: MapTravelPartyMember[]
}

function distanceFeet(a: Token, b: Token, map: GameMap) {
  const gridSize = Math.max(1, map.grid_size || 1)
  const gridScale = Math.max(1, map.grid_scale_feet || 5)
  const dx = a.x - b.x
  const dy = a.y - b.y
  return (Math.sqrt((dx * dx) + (dy * dy)) / gridSize) * gridScale
}

function playerLabel(token: Token) {
  return token.name?.trim() || 'Player'
}

function tokenToCenterScreenToken(token: Token): RenderToken | null {
  if (token.visible_on_cast === false) return null
  if (token.visible_to_players === false && !token.discoverable) return null
  const visible = token.visible_to_players !== false
  return {
    id: token.id,
    token_type: token.token_type,
    name: visible ? token.name : '',
    x: token.x,
    y: token.y,
    size: token.size,
    color: token.color,
    visible_to_players: visible,
    max_hp: visible ? token.max_hp : 0,
    current_hp: visible ? token.current_hp : 0,
    temp_hp: visible ? token.temp_hp : 0,
    is_defeated: visible ? token.is_defeated : false,
    showHealth: visible && token.max_hp > 0,
    dimmed: !visible,
    imageUrl: visible ? safePlayerImageUrl(token.image_url) : null,
  }
}

function buildViewGroups(input: {
  map: GameMap
  tokens: Token[]
  travelParties: MapTravelParty[]
  partyMembers: MapTravelPartyMember[]
}): CenterScreenViewGroup[] {
  const { map, tokens, travelParties, partyMembers } = input
  const settings = normalizeCenterCastSettings(map.cast_settings)
  const activeParty = travelParties.find((party) => party.status === 'approved') ?? null
  const playerTokens = tokens.filter((token) => token.token_type === 'player' && token.visible_to_players !== false)

  if (playerTokens.length === 0) {
    return [{
      id: 'map',
      label: map.name,
      subtitle: 'Full map',
      focusTokenId: null,
      focus: null,
      tone: 'party',
    }]
  }

  const firstPlayer = playerTokens[0]
  const partyLeaderToken = activeParty
    ? playerTokens.find((token) => token.controlled_by_user_id === activeParty.leader_user_id) ?? null
    : null
  const mainToken = settings.mainFocus === 'first_player' ? firstPlayer : partyLeaderToken ?? firstPlayer
  const acceptedPartyUsers = new Set(
    activeParty
      ? partyMembers
          .filter((member) => member.party_id === activeParty.id && member.status === 'accepted')
          .map((member) => member.user_id)
      : [],
  )
  if (activeParty) acceptedPartyUsers.add(activeParty.leader_user_id)

  const separated = settings.dynamicSplitEnabled
    ? playerTokens.filter((token) => {
        if (token.id === mainToken.id) return false
        const userId = token.controlled_by_user_id
        const isAcceptedPartyMember = Boolean(userId && acceptedPartyUsers.has(userId))
        const tooFar = distanceFeet(token, mainToken, map) > settings.splitDistanceFeet
        if (map.travel_mode === 'group_party' && activeParty) {
          return !isAcceptedPartyMember || tooFar
        }
        return tooFar
      })
    : []

  const mainLabel = activeParty && map.travel_mode === 'group_party'
    ? activeParty.name || 'Party'
    : playerLabel(mainToken)
  const mainSubtitle = separated.length > 0
    ? `${playerLabel(mainToken)} focus - ${separated.length} separated`
    : `${playerLabel(mainToken)} focus - everyone present`

  return [
    {
      id: 'party',
      label: mainLabel,
      subtitle: mainSubtitle,
      focusTokenId: mainToken.id,
      focus: { x: mainToken.x, y: mainToken.y },
      tone: 'party',
    },
    ...separated.map((token) => ({
      id: `player-${token.id}`,
      label: `${playerLabel(token)} alone`,
      subtitle: `${Math.round(distanceFeet(token, mainToken, map))} ft from ${playerLabel(mainToken)}`,
      focusTokenId: token.id,
      focus: { x: token.x, y: token.y },
      tone: 'solo' as const,
    })),
  ]
}

export function CenterScreenMapView({
  campaignId,
  map,
  imageUrl,
  initialTokens,
  initialRevealedAreas,
  initialRoomRegions,
  initialWalls,
  initialTravelParties,
  initialTravelPartyMembers,
}: CenterScreenMapViewProps) {
  const [mapState, setMapState] = useState(map)
  const [tokenRows, setTokenRows] = useState(initialTokens)
  const [areaRows, setAreaRows] = useState(initialRevealedAreas)
  const [roomRows, setRoomRows] = useState(initialRoomRegions)
  const [wallRows, setWallRows] = useState(initialWalls)
  const [travelParties, setTravelParties] = useState(initialTravelParties)
  const [travelPartyMembers, setTravelPartyMembers] = useState(initialTravelPartyMembers)
  const [chromeHidden, setChromeHidden] = useState(normalizeCenterCastSettings(map.cast_settings).hideChromeByDefault)
  const [followLeader, setFollowLeader] = useState(true)
  const [rotatingIndex, setRotatingIndex] = useState(0)

  usePlayerSafeMapRealtime(campaignId, map.id, {
    onSnapshot: (snapshot) => {
      setMapState(snapshot.map)
      setTokenRows(snapshot.tokens)
      setAreaRows(snapshot.areas)
      setRoomRows(snapshot.rooms)
      setWallRows(snapshot.walls)
      setTravelParties(snapshot.travel_parties)
      setTravelPartyMembers(snapshot.travel_party_members)
    },
  })

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(`center-screen-presence-${map.id}`, {
      config: { presence: { key: `center-${crypto.randomUUID()}` } },
    })
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          role: 'center_screen',
          mapId: map.id,
          connectedAt: new Date().toISOString(),
        })
      }
    })
    return () => {
      void channel.untrack()
      supabase.removeChannel(channel)
    }
  }, [map.id])

  const settings = normalizeCenterCastSettings(mapState.cast_settings)
  const stableImageUrl = useMemo(
    () => buildPrivateMapImageUrl(campaignId, mapState.id, mapState.storage_path),
    [campaignId, mapState.id, mapState.storage_path],
  )
  const effectiveImageUrl = stableImageUrl || imageUrl
  const castSafeTokens = useMemo(
    () => tokenRows.filter((token) => token.visible_on_cast !== false),
    [tokenRows],
  )
  const displayTokens = useMemo(
    () =>
      castSafeTokens
        .map(tokenToCenterScreenToken)
        .filter((token): token is RenderToken => Boolean(token))
        .filter((token) => settings.showTokenHints || !token.dimmed)
        .map((token) => ({
          ...token,
          showHealth: settings.showHealthBars ? token.showHealth : false,
        })),
    [castSafeTokens, settings.showHealthBars, settings.showTokenHints],
  )
  const viewGroups = useMemo(
    () => buildViewGroups({
      map: mapState,
      tokens: castSafeTokens,
      travelParties,
      partyMembers: travelPartyMembers,
    }),
    [castSafeTokens, mapState, travelParties, travelPartyMembers],
  )
  const visibleGroups = useMemo(() => {
    const groups = viewGroups.length > 0
      ? viewGroups
      : [{
          id: 'map',
          label: mapState.name,
          subtitle: 'Full map',
          focusTokenId: null,
          focus: null,
          tone: 'party' as const,
        }]
    if (settings.layoutMode !== 'rotating_focus' || groups.length <= 1) return groups
    return [groups[rotatingIndex % groups.length]]
  }, [mapState.name, rotatingIndex, settings.layoutMode, viewGroups])

  useEffect(() => {
    if (settings.layoutMode !== 'rotating_focus' || viewGroups.length <= 1) return
    const interval = window.setInterval(() => {
      setRotatingIndex((index) => (index + 1) % viewGroups.length)
    }, 8000)
    return () => window.clearInterval(interval)
  }, [settings.layoutMode, viewGroups.length])

  const revealOverride = mapState.reveal_override ?? 'normal'
  const displayAreas: RenderArea[] = useMemo(() => {
    if (!settings.showFog || revealOverride === 'hide_all') return []
    return areaRows.map((area) => ({
      id: area.id,
      shape_type: area.shape_type,
      x: area.x,
      y: area.y,
      width: area.width,
      height: area.height,
      radius: area.radius,
    }))
  }, [areaRows, revealOverride, settings.showFog])
  const displayRooms: RenderRoomRegion[] = useMemo(() => {
    if (!settings.showFog) return []
    return roomRows.map((room) => ({
      id: room.id,
      name: room.is_revealed || room.player_label_visible ? room.name : '',
      shape_type: room.shape_type,
      x: room.x,
      y: room.y,
      width: room.width,
      height: room.height,
      points: room.points,
      reveal_mode: room.reveal_mode,
      mask_style: room.mask_style,
      border_style: room.border_style,
      border_color: room.border_color,
      player_label_visible: room.player_label_visible,
      is_revealed: revealOverride === 'reveal_all' ? true : room.is_revealed,
      visible_to_players: room.visible_to_players,
    }))
  }, [revealOverride, roomRows, settings.showFog])

  const displayWalls: RenderWall[] = useMemo(() => {
    return wallRows.map((wall) => ({
      id: wall.id,
      name: wall.name,
      shape_type: wall.shape_type,
      x: wall.x,
      y: wall.y,
      width: wall.width,
      height: wall.height,
      points: wall.points,
      border_style: wall.border_style,
      border_color: wall.border_color,
    }))
  }, [wallRows])

  const firstGroup = visibleGroups[0] ?? null
  const statusLabel =
    firstGroup && visibleGroups.length === 1
      ? settings.showPlayerNames
        ? firstGroup.label
        : firstGroup.tone === 'party'
          ? 'party view'
          : 'separated view'
      : `${visibleGroups.length} views`
  const followGridSquares =
    settings.viewZoom === 'close' ? 12 : settings.viewZoom === 'wide' ? 30 : 20
  const fogMode = mapState.fog_mode ?? 'rooms'
  const baseFog =
    revealOverride === 'reveal_all'
      ? false
      : revealOverride === 'hide_all'
        ? true
        : fogMode === 'none'
          ? false
          : fogMode === 'hidden'
            ? true
            : displayAreas.length > 0 || roomRows.length === 0
  const globalFogEnabled = settings.showFog && baseFog

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' && effectiveImageUrl.includes('/api/campaigns/')) {
      console.debug('[live-map-image] center-screen image url', effectiveImageUrl)
    }
  }, [effectiveImageUrl])

  async function enterFullscreen() {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(() => undefined)
    }
  }

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-black text-content">
      {!chromeHidden && (
        <div className="shrink-0 border-b border-border bg-canvas/95 px-4 py-3 shadow-xl shadow-black/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                Center Screen
              </p>
              <h1 className="truncate text-lg font-bold text-content">{mapState.name}</h1>
              <p className="mt-0.5 text-xs text-faint">
                Player-safe display: discovered fog, visible tokens, and dimmed undiscovered hints.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-panel px-2.5 py-1 text-xs text-muted">
                <Eye className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
                {areaRows.length} revealed
              </span>
              <span className="rounded-md border border-border bg-panel px-2.5 py-1 text-xs text-muted">
                {displayTokens.length} tokens
              </span>
              {firstGroup?.focus && (
                <button
                  type="button"
                  onClick={() => setFollowLeader((value) => !value)}
                  className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition ${
                    followLeader
                      ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25'
                      : 'border-border-strong bg-panel text-muted hover:border-border-strong'
                  }`}
                >
                  {followLeader ? 'Following focus' : 'Follow focus'}
                </button>
              )}
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-panel px-2.5 py-1.5 text-xs font-semibold text-content transition hover:border-border-strong hover:text-content"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Refresh
              </button>
              <button
                type="button"
                onClick={enterFullscreen}
                className="inline-flex items-center gap-1.5 rounded-md border border-border-strong bg-panel px-2.5 py-1.5 text-xs font-semibold text-content transition hover:border-border-strong hover:text-content"
              >
                <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                Fullscreen
              </button>
              <button
                type="button"
                onClick={() => setChromeHidden(true)}
                className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-on-accent transition hover:bg-accent-hover"
              >
                Hide bar
              </button>
            </div>
          </div>
        </div>
      )}

      {chromeHidden && (
        <button
          type="button"
          onClick={() => setChromeHidden(false)}
          className="absolute right-3 top-3 z-40 rounded-md border border-border-strong bg-canvas/80 px-2.5 py-1.5 text-xs font-semibold text-muted opacity-35 backdrop-blur transition hover:opacity-100"
        >
          Show bar
        </button>
      )}

      <div className={layoutClass(settings.layoutMode, visibleGroups.length)}>
        {visibleGroups.map((group, index) => (
          <div
            key={group.id}
            className={viewCardClass(settings.layoutMode, visibleGroups.length, index, group.tone)}
          >
            <div className="pointer-events-none absolute left-3 top-3 z-20 max-w-[calc(100%-1.5rem)] rounded-lg border border-white/10 bg-canvas/82 px-3 py-2 shadow-xl shadow-black/40 backdrop-blur">
              <p className={`truncate text-sm font-bold ${group.tone === 'party' ? 'text-cyan-100' : 'text-fuchsia-100'}`}>
                {settings.showPlayerNames ? group.label : group.tone === 'party' ? 'Party View' : 'Separated View'}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-muted">
                {settings.showPlayerNames ? group.subtitle : group.tone === 'party' ? 'Main cast focus' : 'Separate cast focus'}
              </p>
            </div>
            <MapCanvas
              imageUrl={effectiveImageUrl}
              width={mapState.width}
              height={mapState.height}
              gridEnabled={mapState.grid_enabled}
              gridSize={mapState.grid_size}
              gridColor={mapState.grid_color}
              gridOpacity={mapState.grid_opacity}
              gridLineWidth={mapState.grid_line_width}
              gridSubdivisions={mapState.grid_subdivisions}
              gridOffsetX={mapState.grid_offset_x}
              gridOffsetY={mapState.grid_offset_y}
              tokens={displayTokens}
              mode="player"
              canDragToken={() => false}
              revealedAreas={displayAreas}
              roomRegions={displayRooms}
              walls={displayWalls}
              fogEnabled={globalFogEnabled}
              fogStyle={mapState.fog_style ?? 'blackout'}
              followTarget={followLeader ? group.focus : null}
              followGridSquares={followGridSquares}
            />
          </div>
        ))}
      </div>
      {!chromeHidden && followLeader && firstGroup?.focus && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-full border border-border bg-canvas/85 px-3 py-1.5 text-xs text-muted shadow-xl shadow-black/40">
          Following {statusLabel}
        </div>
      )}
    </div>
  )
}

function layoutClass(layoutMode: CenterCastSettings['layoutMode'], count: number) {
  if (count <= 1 || layoutMode === 'rotating_focus') return 'min-h-0 flex-1 p-2'
  if (layoutMode === 'main_side_rail') return 'grid min-h-0 flex-1 grid-cols-1 gap-2 p-2 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,30vw)]'
  if (count === 2) return 'grid min-h-0 flex-1 grid-cols-1 gap-2 p-2 lg:grid-cols-2'
  return 'grid min-h-0 flex-1 grid-cols-1 gap-2 p-2 md:grid-cols-2'
}

function viewCardClass(
  layoutMode: CenterCastSettings['layoutMode'],
  count: number,
  index: number,
  tone: CenterScreenViewGroup['tone'],
) {
  const toneClass = tone === 'party'
    ? 'border-cyan-300/35 shadow-cyan-950/35'
    : 'border-fuchsia-300/35 shadow-fuchsia-950/35'
  const spanClass =
    layoutMode === 'main_side_rail' && count > 1 && index === 0
      ? 'lg:row-span-full'
      : count === 3 && index === 0 && layoutMode === 'auto_grid'
        ? 'md:col-span-2'
        : ''
  return `relative h-full min-h-0 overflow-hidden rounded-xl border bg-black shadow-2xl ${toneClass} ${spanClass}`
}
