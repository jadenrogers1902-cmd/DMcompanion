'use client'

import { useEffect, useMemo, useState } from 'react'
import { Eye, Maximize2, RefreshCw } from 'lucide-react'
import { MapCanvas, type RenderArea, type RenderRoomRegion, type RenderToken } from './MapCanvas'
import { useRealtimeRefresh } from '@/lib/hooks/useRealtimeRefresh'
import type { GameMap, MapRoomRegion } from '@/lib/types/database'
import { normalizeCenterCastSettings, type CenterCastSettings } from '@/lib/utils/cast-settings'
import { createClient } from '@/lib/supabase/client'

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
  tokens: RenderToken[]
  revealedAreas: RenderArea[]
  roomRegions: MapRoomRegion[]
  settings?: CenterCastSettings | Record<string, unknown> | null
  viewGroups: CenterScreenViewGroup[]
}

export function CenterScreenMapView({
  campaignId,
  map,
  imageUrl,
  tokens,
  revealedAreas,
  roomRegions,
  settings: rawSettings,
  viewGroups,
}: CenterScreenMapViewProps) {
  const settings = normalizeCenterCastSettings(rawSettings)
  const [chromeHidden, setChromeHidden] = useState(settings.hideChromeByDefault)
  const [followLeader, setFollowLeader] = useState(true)
  const [rotatingIndex, setRotatingIndex] = useState(0)

  useRealtimeRefresh(`center-screen-${campaignId}-${map.id}`, [
    { table: 'tokens', filter: `map_id=eq.${map.id}` },
    { table: 'map_revealed_areas', filter: `map_id=eq.${map.id}` },
    { table: 'map_room_regions', filter: `map_id=eq.${map.id}` },
    { table: 'maps', filter: `id=eq.${map.id}` },
    { table: 'map_travel_parties', filter: `map_id=eq.${map.id}` },
    { table: 'map_travel_party_members', filter: `map_id=eq.${map.id}` },
  ], { debounceMs: 250 })

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

  const visibleGroups = useMemo(() => {
    const groups = viewGroups.length > 0
      ? viewGroups
      : [{
          id: 'map',
          label: map.name,
          subtitle: 'Full map',
          focusTokenId: null,
          focus: null,
          tone: 'party' as const,
        }]
    if (settings.layoutMode !== 'rotating_focus' || groups.length <= 1) return groups
    return [groups[rotatingIndex % groups.length]]
  }, [map.name, rotatingIndex, settings.layoutMode, viewGroups])

  useEffect(() => {
    if (settings.layoutMode !== 'rotating_focus' || viewGroups.length <= 1) return
    const interval = window.setInterval(() => {
      setRotatingIndex((index) => (index + 1) % viewGroups.length)
    }, 8000)
    return () => window.clearInterval(interval)
  }, [settings.layoutMode, viewGroups.length])

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
  const displayTokens = tokens
    .filter((token) => settings.showTokenHints || !token.dimmed)
    .map((token) => ({
      ...token,
      showHealth: settings.showHealthBars ? token.showHealth : false,
    }))
  const displayAreas = settings.showFog ? revealedAreas : []
  const displayRooms: RenderRoomRegion[] = settings.showFog
    ? roomRegions.map((room) => ({
        id: room.id,
        name: room.name,
        shape_type: room.shape_type,
        x: room.x,
        y: room.y,
        width: room.width,
        height: room.height,
        points: room.points,
        reveal_mode: room.reveal_mode,
        mask_style: room.mask_style,
        border_style: room.border_style,
        player_label_visible: room.player_label_visible,
        is_revealed: room.is_revealed,
        visible_to_players: room.visible_to_players,
      }))
    : []

  async function enterFullscreen() {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(() => undefined)
    }
  }

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-black text-zinc-100">
      {!chromeHidden && (
        <div className="shrink-0 border-b border-zinc-800 bg-zinc-950/95 px-4 py-3 shadow-xl shadow-black/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                Center Screen
              </p>
              <h1 className="truncate text-lg font-bold text-zinc-50">{map.name}</h1>
              <p className="mt-0.5 text-xs text-zinc-500">
                Player-safe display: discovered fog, visible tokens, and dimmed undiscovered hints.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300">
                <Eye className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
                {revealedAreas.length} revealed
              </span>
              <span className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300">
                {displayTokens.length} tokens
              </span>
              {firstGroup?.focus && (
                <button
                  type="button"
                  onClick={() => setFollowLeader((value) => !value)}
                  className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition ${
                    followLeader
                      ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25'
                      : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500'
                  }`}
                >
                  {followLeader ? 'Following focus' : 'Follow focus'}
                </button>
              )}
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-zinc-200 transition hover:border-zinc-500 hover:text-zinc-50"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Refresh
              </button>
              <button
                type="button"
                onClick={enterFullscreen}
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-zinc-200 transition hover:border-zinc-500 hover:text-zinc-50"
              >
                <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                Fullscreen
              </button>
              <button
                type="button"
                onClick={() => setChromeHidden(true)}
                className="rounded-md bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-amber-400"
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
          className="absolute right-3 top-3 z-40 rounded-md border border-zinc-700 bg-zinc-950/80 px-2.5 py-1.5 text-xs font-semibold text-zinc-300 opacity-35 backdrop-blur transition hover:opacity-100"
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
            <div className="pointer-events-none absolute left-3 top-3 z-20 max-w-[calc(100%-1.5rem)] rounded-lg border border-white/10 bg-zinc-950/82 px-3 py-2 shadow-xl shadow-black/40 backdrop-blur">
              <p className={`truncate text-sm font-bold ${group.tone === 'party' ? 'text-cyan-100' : 'text-fuchsia-100'}`}>
                {settings.showPlayerNames ? group.label : group.tone === 'party' ? 'Party View' : 'Separated View'}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-zinc-400">
                {settings.showPlayerNames ? group.subtitle : group.tone === 'party' ? 'Main cast focus' : 'Separate cast focus'}
              </p>
            </div>
            <MapCanvas
              imageUrl={imageUrl}
              width={map.width}
              height={map.height}
              gridEnabled={map.grid_enabled}
              gridSize={map.grid_size}
              gridColor={map.grid_color}
              gridOpacity={map.grid_opacity}
              gridLineWidth={map.grid_line_width}
              gridSubdivisions={map.grid_subdivisions}
              gridOffsetX={map.grid_offset_x}
              gridOffsetY={map.grid_offset_y}
              tokens={displayTokens}
              mode="player"
              canDragToken={() => false}
              revealedAreas={displayAreas}
              roomRegions={displayRooms}
              fogEnabled={settings.showFog}
              followTarget={followLeader ? group.focus : null}
              followGridSquares={followGridSquares}
            />
          </div>
        ))}
      </div>
      {!chromeHidden && followLeader && firstGroup?.focus && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-full border border-zinc-800 bg-zinc-950/85 px-3 py-1.5 text-xs text-zinc-300 shadow-xl shadow-black/40">
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
