'use client'

import { useState } from 'react'
import { Eye, Maximize2, RefreshCw } from 'lucide-react'
import { MapCanvas, type RenderArea, type RenderToken } from './MapCanvas'
import { useRealtimeRefresh } from '@/lib/hooks/useRealtimeRefresh'
import type { GameMap } from '@/lib/types/database'

interface CenterScreenMapViewProps {
  campaignId: string
  map: GameMap
  imageUrl: string
  tokens: RenderToken[]
  revealedAreas: RenderArea[]
}

export function CenterScreenMapView({
  campaignId,
  map,
  imageUrl,
  tokens,
  revealedAreas,
}: CenterScreenMapViewProps) {
  const [chromeHidden, setChromeHidden] = useState(false)

  useRealtimeRefresh(`center-screen-${campaignId}-${map.id}`, [
    { table: 'tokens', filter: `map_id=eq.${map.id}` },
    { table: 'map_revealed_areas', filter: `map_id=eq.${map.id}` },
    { table: 'maps', filter: `id=eq.${map.id}` },
  ], { debounceMs: 250 })

  async function enterFullscreen() {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(() => undefined)
    }
  }

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-black text-zinc-100">
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
                {tokens.length} tokens
              </span>
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

      <div className="min-h-0 flex-1 p-2">
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
          tokens={tokens}
          mode="player"
          canDragToken={() => false}
          revealedAreas={revealedAreas}
          fogEnabled
        />
      </div>
    </div>
  )
}
