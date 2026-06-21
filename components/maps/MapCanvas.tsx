'use client'

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Heart } from 'lucide-react'
import type { TokenType } from '@/lib/types/database'
import { hpBarClass, hpPercent } from '@/lib/utils/hp'

export interface RenderToken {
  id: string
  token_type: TokenType
  name: string
  x: number
  y: number
  size: number
  color: string
  visible_to_players: boolean
  max_hp?: number | null
  current_hp?: number | null
  temp_hp?: number | null
  is_defeated?: boolean | null
  showHealth?: boolean
  /** Optional glyph (emoji) rendered instead of the name/type initial. */
  icon?: string | null
  /** Player-safe hint for not-yet-discovered tokens. */
  dimmed?: boolean
}

export interface RenderArea {
  id: string
  shape_type: 'full' | 'rectangle' | 'circle'
  x: number
  y: number
  width?: number | null
  height?: number | null
  radius?: number | null
}

export type AreaDrawTool = 'rectangle' | 'circle' | null

interface MapCanvasProps {
  imageUrl: string
  width: number
  height: number
  gridEnabled: boolean
  gridSize: number
  gridColor?: string | null
  gridOpacity?: number | null
  gridLineWidth?: number | null
  gridSubdivisions?: number | null
  gridOffsetX?: number | null
  gridOffsetY?: number | null
  dmLightBrightness?: number | null
  tokens: RenderToken[]
  /** Token ids that have an active player action request — render a "!" badge. */
  alertTokenIds?: string[]
  mode: 'dm' | 'player'
  selectedTokenId?: string | null
  onSelectToken?: (id: string | null) => void
  onMoveToken?: (id: string, x: number, y: number) => void
  // Optional per-token drag gate. If omitted, DM mode drags, player mode does not.
  canDragToken?: (id: string) => boolean
  // Revealed-area fog layer (first-version reveal system)
  revealedAreas?: RenderArea[]
  // Player mode: render a dark fog over everything not covered by a
  // visible-to-players area. DM mode: just outline areas for reference.
  fogEnabled?: boolean
  // DM drawing tool: when set, drag on the map draws a new reveal shape.
  drawTool?: AreaDrawTool
  onAreaDrawn?: (shape:
    | { shape_type: 'rectangle'; x: number; y: number; width: number; height: number }
    | { shape_type: 'circle'; x: number; y: number; radius: number }) => void
  // Presentation mode: keep a world coordinate centered in the viewport when it changes.
  followTarget?: { x: number; y: number } | null
  followGridSquares?: number
  viewportCommand?: { type: 'fit' } | { type: 'center'; x: number; y: number; gridSquares?: number; nonce: number }
  onTokenDragPreview?: (preview: { id: string; x: number; y: number } | null) => void
  snapToGrid?: boolean
  deferTokenMove?: boolean
  pendingTokenPosition?: { id: string; x: number; y: number } | null
  onTokenMovePreview?: (preview: { id: string; x: number; y: number } | null) => void
}

const MIN_SCALE = 0.1
const MAX_SCALE = 8
const DEFAULT_GRID_COLOR = '#ffffff'
const DEFAULT_GRID_OPACITY = 0.34
const DEFAULT_GRID_LINE_WIDTH = 1.25
const DEFAULT_GRID_SUBDIVISIONS = 1
const DEFAULT_DM_LIGHT_BRIGHTNESS = 0.18

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function hexToRgb(hex: string | null | undefined) {
  const clean = (hex || DEFAULT_GRID_COLOR).replace('#', '').trim()
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return { r: 255, g: 255, b: 255 }
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  }
}

function rgba(hex: string | null | undefined, opacity: number) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r},${g},${b},${clamp(opacity, 0, 1)})`
}

const TYPE_INITIAL: Record<TokenType, string> = {
  player: 'P',
  npc: 'N',
  enemy: 'E',
  object: 'O',
  trap: 'T',
  door: 'D',
  chest: 'C',
  book: 'B',
  note: 'N',
  loot: 'L',
  lever: 'L',
  switch: 'S',
  portal: 'P',
  key: 'K',
  container: 'C',
  custom: '?',
}

export function MapCanvas({
  imageUrl,
  width,
  height,
  gridEnabled,
  gridSize,
  gridColor = DEFAULT_GRID_COLOR,
  gridOpacity = DEFAULT_GRID_OPACITY,
  gridLineWidth = DEFAULT_GRID_LINE_WIDTH,
  gridSubdivisions = DEFAULT_GRID_SUBDIVISIONS,
  gridOffsetX = 0,
  gridOffsetY = 0,
  dmLightBrightness = DEFAULT_DM_LIGHT_BRIGHTNESS,
  tokens,
  alertTokenIds = [],
  mode,
  selectedTokenId,
  onSelectToken,
  onMoveToken,
  canDragToken,
  revealedAreas = [],
  fogEnabled = false,
  drawTool = null,
  onAreaDrawn,
  followTarget = null,
  followGridSquares = 18,
  viewportCommand,
  onTokenDragPreview,
  snapToGrid = false,
  deferTokenMove = false,
  pendingTokenPosition = null,
  onTokenMovePreview,
}: MapCanvasProps) {
  const isDraggable = (id: string) =>
    canDragToken ? canDragToken(id) : mode === 'dm'
  const viewportRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null)
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [drawCircle, setDrawCircle] = useState<{ cx: number; cy: number; r: number } | null>(null)
  const safeGridSize = Math.max(1, gridSize)
  const safeSubdivisions = Math.max(1, Math.round(gridSubdivisions ?? DEFAULT_GRID_SUBDIVISIONS))
  const minorGridSize = safeGridSize / safeSubdivisions
  const majorStroke = rgba(gridColor, gridOpacity ?? DEFAULT_GRID_OPACITY)
  const minorStroke = rgba(gridColor, (gridOpacity ?? DEFAULT_GRID_OPACITY) * 0.42)
  const lightFill = `rgba(250,250,250,${clamp(dmLightBrightness ?? DEFAULT_DM_LIGHT_BRIGHTNESS, 0, 0.6)})`
  const followTargetX = followTarget?.x ?? null
  const followTargetY = followTarget?.y ?? null
  const viewportCommandNonce = viewportCommand && 'nonce' in viewportCommand ? viewportCommand.nonce : null

  function clientToWorld(clientX: number, clientY: number) {
    const vp = viewportRef.current
    if (!vp) return { x: 0, y: 0 }
    const rect = vp.getBoundingClientRect()
    return {
      x: (clientX - rect.left - offset.x) / scale,
      y: (clientY - rect.top - offset.y) / scale,
    }
  }

  function clampWorld(value: number, max: number) {
    return clamp(value, 0, max)
  }

  function snapWorldToGrid(x: number, y: number) {
    if (!snapToGrid) {
      return { x: clampWorld(x, width), y: clampWorld(y, height) }
    }
    const grid = safeGridSize
    const offsetX = gridOffsetX ?? 0
    const offsetY = gridOffsetY ?? 0
    const snappedX = offsetX + (Math.floor((x - offsetX) / grid) * grid) + (grid / 2)
    const snappedY = offsetY + (Math.floor((y - offsetY) / grid) * grid) + (grid / 2)
    return {
      x: clampWorld(snappedX, width),
      y: clampWorld(snappedY, height),
    }
  }

  function worldToGridCell(x: number, y: number) {
    const grid = safeGridSize
    const offsetX = gridOffsetX ?? 0
    const offsetY = gridOffsetY ?? 0
    const minCol = Math.floor((0 - offsetX) / grid)
    const minRow = Math.floor((0 - offsetY) / grid)
    const maxCol = Math.floor((width - 0.001 - offsetX) / grid)
    const maxRow = Math.floor((height - 0.001 - offsetY) / grid)
    return {
      col: clamp(Math.floor((x - offsetX) / grid), minCol, maxCol),
      row: clamp(Math.floor((y - offsetY) / grid), minRow, maxRow),
    }
  }

  function gridCellToClippedRect(col: number, row: number) {
    const grid = safeGridSize
    const x1 = (gridOffsetX ?? 0) + (col * grid)
    const y1 = (gridOffsetY ?? 0) + (row * grid)
    const x2 = x1 + grid
    const y2 = y1 + grid
    const left = clamp(x1, 0, width)
    const top = clamp(y1, 0, height)
    const right = clamp(x2, 0, width)
    const bottom = clamp(y2, 0, height)
    return {
      key: `${col}:${row}`,
      left,
      top,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    }
  }

  function buildMovementPathSquares(token: RenderToken | undefined, target: { x: number; y: number } | null) {
    if (!token || !target || !snapToGrid) return []
    const start = worldToGridCell(token.x, token.y)
    const end = worldToGridCell(target.x, target.y)
    const deltaCol = end.col - start.col
    const deltaRow = end.row - start.row
    const steps = Math.max(Math.abs(deltaCol), Math.abs(deltaRow))
    if (steps === 0) return []

    const seen = new Set<string>()
    const squares: ReturnType<typeof gridCellToClippedRect>[] = []
    for (let step = 1; step <= steps; step += 1) {
      const col = start.col + Math.round((deltaCol * step) / steps)
      const row = start.row + Math.round((deltaRow * step) / steps)
      const rect = gridCellToClippedRect(col, row)
      if (rect.width <= 0 || rect.height <= 0 || seen.has(rect.key)) continue
      seen.add(rect.key)
      squares.push(rect)
    }
    return squares
  }

  // Interaction tracking (refs avoid re-render churn during a gesture)
  const interaction = useRef<{
    kind: 'none' | 'pan' | 'token' | 'draw' | 'pinch'
    pointerId: number
    startClientX: number
    startClientY: number
    startOffsetX: number
    startOffsetY: number
    tokenId: string | null
    tokenStartX: number
    tokenStartY: number
    drawStartX: number
    drawStartY: number
    moved: boolean
  }>({
    kind: 'none',
    pointerId: -1,
    startClientX: 0,
    startClientY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    tokenId: null,
    tokenStartX: 0,
    tokenStartY: 0,
    drawStartX: 0,
    drawStartY: 0,
    moved: false,
  })
  const activePointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{
    initialDistance: number
    initialScale: number
    initialOffsetX: number
    initialOffsetY: number
    initialCenterX: number
    initialCenterY: number
  } | null>(null)

  const fit = useCallback(() => {
    const vp = viewportRef.current
    if (!vp || width === 0 || height === 0) return
    const vw = vp.clientWidth
    const vh = vp.clientHeight
    const s = Math.min(vw / width, vh / height) * 0.95
    setScale(s)
    setOffset({ x: (vw - width * s) / 2, y: (vh - height * s) / 2 })
  }, [width, height])

  useEffect(() => {
    fit()
    const vp = viewportRef.current
    if (!vp) return
    const ro = new ResizeObserver(() => fit())
    ro.observe(vp)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl])

  useEffect(() => {
    const vp = viewportRef.current
    if (!vp || followTargetX === null || followTargetY === null || width === 0 || height === 0) return
    const vw = vp.clientWidth
    const vh = vp.clientHeight
    const fitScale = Math.min(vw / width, vh / height) * 0.95
    const focusWorldWidth = Math.max(safeGridSize * followGridSquares, safeGridSize * 8)
    const focusWorldHeight = Math.max(safeGridSize * Math.round(followGridSquares * 0.7), safeGridSize * 6)
    const followScale = clamp(
      Math.max(fitScale, Math.min(vw / focusWorldWidth, vh / focusWorldHeight)),
      MIN_SCALE,
      MAX_SCALE,
    )
    setScale(followScale)
    setOffset({
      x: (vw / 2) - (followTargetX * followScale),
      y: (vh / 2) - (followTargetY * followScale),
    })
  }, [
    followTargetX,
    followTargetY,
    followGridSquares,
    safeGridSize,
    width,
    height,
  ])

  useEffect(() => {
    if (!viewportCommand) return
    if (viewportCommand.type === 'fit') {
      fit()
      return
    }
    const vp = viewportRef.current
    if (!vp || width === 0 || height === 0) return
    const vw = vp.clientWidth
    const vh = vp.clientHeight
    const fitScale = Math.min(vw / width, vh / height) * 0.95
    const gridSquares = viewportCommand.gridSquares ?? 16
    const focusWorldWidth = Math.max(safeGridSize * gridSquares, safeGridSize * 8)
    const focusWorldHeight = Math.max(safeGridSize * Math.round(gridSquares * 0.7), safeGridSize * 6)
    const nextScale = clamp(
      Math.max(fitScale, Math.min(vw / focusWorldWidth, vh / focusWorldHeight)),
      MIN_SCALE,
      MAX_SCALE,
    )
    setScale(nextScale)
    setOffset({
      x: (vw / 2) - (viewportCommand.x * nextScale),
      y: (vh / 2) - (viewportCommand.y * nextScale),
    })
  }, [
    viewportCommand,
    viewportCommandNonce,
    fit,
    height,
    safeGridSize,
    width,
  ])

  const zoomAround = useCallback((clientX: number, clientY: number, factor: number) => {
    const vp = viewportRef.current
    if (!vp) return
    const rect = vp.getBoundingClientRect()
    const cx = clientX - rect.left
    const cy = clientY - rect.top
    setScale((prev) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev * factor))
      setOffset((off) => {
        const worldX = (cx - off.x) / prev
        const worldY = (cy - off.y) / prev
        return { x: cx - worldX * next, y: cy - worldY * next }
      })
      return next
    })
  }, [])

  function pointerDistance(points: { x: number; y: number }[]) {
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
  }

  function pointerCenter(points: { x: number; y: number }[]) {
    return {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
    }
  }

  function beginPinch() {
    const vp = viewportRef.current
    const points = Array.from(activePointers.current.values())
    if (!vp || points.length < 2) return
    const rect = vp.getBoundingClientRect()
    const center = pointerCenter(points)
    interaction.current.kind = 'pinch'
    interaction.current.moved = true
    setDragPos(null)
    setDrawRect(null)
    setDrawCircle(null)
    pinch.current = {
      initialDistance: Math.max(1, pointerDistance(points)),
      initialScale: scale,
      initialOffsetX: offset.x,
      initialOffsetY: offset.y,
      initialCenterX: center.x - rect.left,
      initialCenterY: center.y - rect.top,
    }
  }

  function updatePinch() {
    const vp = viewportRef.current
    const state = pinch.current
    const points = Array.from(activePointers.current.values())
    if (!vp || !state || points.length < 2) return
    const rect = vp.getBoundingClientRect()
    const center = pointerCenter(points)
    const cx = center.x - rect.left
    const cy = center.y - rect.top
    const nextScale = clamp(state.initialScale * (pointerDistance(points) / state.initialDistance), MIN_SCALE, MAX_SCALE)
    const worldX = (state.initialCenterX - state.initialOffsetX) / state.initialScale
    const worldY = (state.initialCenterY - state.initialOffsetY) / state.initialScale
    setScale(nextScale)
    setOffset({ x: cx - worldX * nextScale, y: cy - worldY * nextScale })
  }

  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return

    function handleWheel(event: WheelEvent) {
      event.preventDefault()
      event.stopPropagation()
      zoomAround(event.clientX, event.clientY, event.deltaY < 0 ? 1.1 : 0.9)
    }

    vp.addEventListener('wheel', handleWheel, { passive: false })
    return () => vp.removeEventListener('wheel', handleWheel)
  }, [zoomAround])

  function handlePointerDown(e: React.PointerEvent) {
    const target = e.target as HTMLElement
    const tokenEl = target.closest('[data-token-id]') as HTMLElement | null
    const vp = viewportRef.current
    if (!vp) return
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    vp.setPointerCapture(e.pointerId)

    if (!drawTool && activePointers.current.size === 2) {
      beginPinch()
      return
    }

    const i = interaction.current
    i.pointerId = e.pointerId
    i.startClientX = e.clientX
    i.startClientY = e.clientY
    i.moved = false

    if (drawTool && !tokenEl) {
      const w = clientToWorld(e.clientX, e.clientY)
      i.kind = 'draw'
      i.drawStartX = w.x
      i.drawStartY = w.y
      if (drawTool === 'rectangle') setDrawRect({ x: w.x, y: w.y, w: 0, h: 0 })
      else setDrawCircle({ cx: w.x, cy: w.y, r: 0 })
      return
    }

    if (tokenEl) {
      const id = tokenEl.dataset.tokenId!
      i.tokenId = id
      if (isDraggable(id) && onMoveToken) {
        const tok = tokens.find((t) => t.id === id)
        if (tok) {
          i.kind = 'token'
          i.tokenStartX = tok.x
          i.tokenStartY = tok.y
          return
        }
      }
      // Not draggable: tap selects it, drag pans the map.
      i.kind = 'pan'
      i.startOffsetX = offset.x
      i.startOffsetY = offset.y
      return
    }

    // background → pan
    i.kind = 'pan'
    i.startOffsetX = offset.x
    i.startOffsetY = offset.y
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (activePointers.current.has(e.pointerId)) {
      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }
    if (pinch.current) {
      updatePinch()
      return
    }
    const i = interaction.current
    if (i.kind === 'none') return
    const dx = e.clientX - i.startClientX
    const dy = e.clientY - i.startClientY
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) i.moved = true

    if (i.kind === 'pan') {
      setOffset({ x: i.startOffsetX + dx, y: i.startOffsetY + dy })
    } else if (i.kind === 'token' && i.tokenId) {
      const world = snapWorldToGrid(
        i.tokenStartX + dx / scale,
        i.tokenStartY + dy / scale,
      )
      const preview = {
        id: i.tokenId,
        x: world.x,
        y: world.y,
      }
      setDragPos(preview)
      onTokenDragPreview?.(preview)
    } else if (i.kind === 'draw') {
      const w = clientToWorld(e.clientX, e.clientY)
      if (drawTool === 'rectangle') {
        setDrawRect({
          x: Math.min(i.drawStartX, w.x),
          y: Math.min(i.drawStartY, w.y),
          w: Math.abs(w.x - i.drawStartX),
          h: Math.abs(w.y - i.drawStartY),
        })
      } else if (drawTool === 'circle') {
        const r = Math.hypot(w.x - i.drawStartX, w.y - i.drawStartY)
        setDrawCircle({ cx: i.drawStartX, cy: i.drawStartY, r })
      }
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    const i = interaction.current
    const vp = viewportRef.current
    if (vp?.hasPointerCapture(e.pointerId)) vp.releasePointerCapture(e.pointerId)
    activePointers.current.delete(e.pointerId)

    if (pinch.current) {
      pinch.current = null
      activePointers.current.clear()
      i.kind = 'none'
      i.tokenId = null
      return
    }

    if (i.kind === 'token' && i.tokenId) {
      if (i.moved && dragPos) {
        const finalPreview = {
          id: i.tokenId,
          x: Math.round(dragPos.x),
          y: Math.round(dragPos.y),
        }
        if (deferTokenMove) {
          onTokenMovePreview?.(finalPreview)
        } else {
          onMoveToken?.(finalPreview.id, finalPreview.x, finalPreview.y)
        }
      } else {
        onSelectToken?.(i.tokenId)
      }
      setDragPos(null)
      onTokenDragPreview?.(null)
    } else if (i.kind === 'draw') {
      if (drawTool === 'rectangle' && drawRect && drawRect.w > 4 && drawRect.h > 4) {
        onAreaDrawn?.({
          shape_type: 'rectangle',
          x: Math.round(drawRect.x),
          y: Math.round(drawRect.y),
          width: Math.round(drawRect.w),
          height: Math.round(drawRect.h),
        })
      } else if (drawTool === 'circle' && drawCircle && drawCircle.r > 4) {
        onAreaDrawn?.({
          shape_type: 'circle',
          x: Math.round(drawCircle.cx),
          y: Math.round(drawCircle.cy),
          radius: Math.round(drawCircle.r),
        })
      }
      setDrawRect(null)
      setDrawCircle(null)
    } else if (i.kind === 'pan' && !i.moved) {
      // Background click deselects; token tap selects.
      onSelectToken?.(i.tokenId ?? null)
    }
    i.kind = 'none'
    i.tokenId = null
  }

  const movementPathTarget = deferTokenMove ? (dragPos ?? pendingTokenPosition) : null
  const movementPathToken = movementPathTarget
    ? tokens.find((token) => token.id === movementPathTarget.id)
    : undefined
  const movementPathSquares = buildMovementPathSquares(movementPathToken, movementPathTarget)

  return (
    <div className="relative w-full h-full overflow-hidden rounded-lg bg-zinc-950 select-none">
      <div
        ref={viewportRef}
        className={`absolute inset-0 touch-none ${drawTool ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* World */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width,
            height,
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: '0 0',
          }}
        >
          <img
            src={imageUrl}
            alt="Map"
            width={width}
            height={height}
            draggable={false}
            style={{ display: 'block', pointerEvents: 'none', userSelect: 'none' }}
          />

          {/* Grid overlay */}
          {gridEnabled && gridSize > 0 && (
            <svg
              width={width}
              height={height}
              style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
            >
              <defs>
                {safeSubdivisions > 1 && (
                  <pattern
                    id="grid-minor-pattern"
                    width={minorGridSize}
                    height={minorGridSize}
                    patternUnits="userSpaceOnUse"
                    patternTransform={`translate(${gridOffsetX ?? 0} ${gridOffsetY ?? 0})`}
                  >
                    <path
                      d={`M ${minorGridSize} 0 L 0 0 0 ${minorGridSize}`}
                      fill="none"
                      stroke={minorStroke}
                      strokeWidth={Math.max(0.5, (gridLineWidth ?? DEFAULT_GRID_LINE_WIDTH) * 0.65)}
                      vectorEffect="non-scaling-stroke"
                    />
                  </pattern>
                )}
                <pattern
                  id="grid-pattern"
                  width={safeGridSize}
                  height={safeGridSize}
                  patternUnits="userSpaceOnUse"
                  patternTransform={`translate(${gridOffsetX ?? 0} ${gridOffsetY ?? 0})`}
                >
                  <path
                    d={`M ${safeGridSize} 0 L 0 0 0 ${safeGridSize}`}
                    fill="none"
                    stroke={majorStroke}
                    strokeWidth={gridLineWidth ?? DEFAULT_GRID_LINE_WIDTH}
                    vectorEffect="non-scaling-stroke"
                  />
                </pattern>
              </defs>
              {safeSubdivisions > 1 && <rect width={width} height={height} fill="url(#grid-minor-pattern)" />}
              <rect width={width} height={height} fill="url(#grid-pattern)" />
            </svg>
          )}

          {/* Revealed-area fog layer */}
          {(fogEnabled || mode === 'dm') && (
            <svg
              width={width}
              height={height}
              style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
            >
              {fogEnabled && (
                <>
                  <defs>
                    <mask id="fog-mask">
                      <rect width={width} height={height} fill="white" />
                      {revealedAreas.map((a) =>
                        a.shape_type === 'full' ? (
                          <rect key={a.id} width={width} height={height} fill="black" />
                        ) : a.shape_type === 'rectangle' ? (
                          <rect
                            key={a.id}
                            x={a.x}
                            y={a.y}
                            width={a.width ?? 0}
                            height={a.height ?? 0}
                            fill="black"
                          />
                        ) : (
                          <circle key={a.id} cx={a.x} cy={a.y} r={a.radius ?? 0} fill="black" />
                        ),
                      )}
                    </mask>
                  </defs>
                  <rect width={width} height={height} fill="rgba(9,9,11,0.92)" mask="url(#fog-mask)" />
                </>
              )}

              {/* DM reference outlines for revealed areas (not shown to players) */}
              {mode === 'dm' &&
                revealedAreas.map((a) =>
                  a.shape_type === 'rectangle' ? (
                    <rect
                      key={a.id}
                      x={a.x}
                      y={a.y}
                      width={a.width ?? 0}
                      height={a.height ?? 0}
                      fill={lightFill}
                      stroke="rgba(16,185,129,0.65)"
                      strokeDasharray="6 4"
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : a.shape_type === 'circle' ? (
                    <circle
                      key={a.id}
                      cx={a.x}
                      cy={a.y}
                      r={a.radius ?? 0}
                      fill={lightFill}
                      stroke="rgba(16,185,129,0.65)"
                      strokeDasharray="6 4"
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null,
                )}

              {/* Live draw preview */}
              {drawRect && (
                <rect
                  x={drawRect.x}
                  y={drawRect.y}
                  width={drawRect.w}
                  height={drawRect.h}
                  fill="rgba(251,191,36,0.15)"
                  stroke="#fbbf24"
                  strokeDasharray="6 4"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {drawCircle && (
                <circle
                  cx={drawCircle.cx}
                  cy={drawCircle.cy}
                  r={drawCircle.r}
                  fill="rgba(251,191,36,0.15)"
                  stroke="#fbbf24"
                  strokeDasharray="6 4"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>
          )}

          {movementPathSquares.length > 0 && (
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
              }}
            >
              {movementPathSquares.map((square, index) => {
                const isDestination = index === movementPathSquares.length - 1
                return (
                  <div
                    key={square.key}
                    style={{
                      position: 'absolute',
                      left: square.left,
                      top: square.top,
                      width: square.width,
                      height: square.height,
                      borderRadius: Math.max(3, Math.min(8, safeGridSize * 0.12)),
                      border: isDestination
                        ? '2px solid rgba(187,247,208,0.98)'
                        : '1px solid rgba(134,239,172,0.82)',
                      background: isDestination
                        ? 'radial-gradient(circle, rgba(187,247,208,0.48) 0%, rgba(34,197,94,0.34) 58%, rgba(22,163,74,0.18) 100%)'
                        : 'linear-gradient(135deg, rgba(34,197,94,0.16), rgba(132,204,22,0.34))',
                      boxShadow: isDestination
                        ? '0 0 22px rgba(74,222,128,0.96), inset 0 0 18px rgba(187,247,208,0.52)'
                        : '0 0 14px rgba(34,197,94,0.72), inset 0 0 12px rgba(187,247,208,0.28)',
                      opacity: Math.min(1, 0.58 + ((index + 1) / movementPathSquares.length) * 0.38),
                    }}
                  />
                )
              })}
            </div>
          )}

          {/* Tokens */}
          {tokens.map((t) => {
            const pos = deferTokenMove
              ? t
              : dragPos?.id === t.id
                ? dragPos
                : pendingTokenPosition?.id === t.id
                  ? pendingTokenPosition
                  : t
            const px = t.size * gridSize
            const isSelected = selectedTokenId === t.id
            const hiddenFromPlayers = mode === 'dm' && !t.visible_to_players
            const dimmedTokenHint = mode === 'player' && t.dimmed === true
            const isAlerted = alertTokenIds.includes(t.id)
            const maxHp = Number(t.max_hp ?? 0)
            const currentHp = Number(t.current_hp ?? 0)
            const tempHp = Number(t.temp_hp ?? 0)
            const showHealth = (mode === 'dm' || t.showHealth) && maxHp > 0
            const hpPct = hpPercent(currentHp, maxHp)
            return (
              <div
                key={t.id}
                data-token-id={t.id}
                style={{
                  position: 'absolute',
                  left: pos.x,
                  top: pos.y,
                  width: px,
                  height: px,
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: hiddenFromPlayers || dimmedTokenHint ? `${t.color}66` : t.color,
                  border: isSelected
                    ? '3px solid #fbbf24'
                    : hiddenFromPlayers || dimmedTokenHint
                      ? '2px dashed rgba(216,180,254,0.78)'
                      : '2px solid rgba(0,0,0,0.5)',
                  borderRadius: '9999px',
                  cursor: isDraggable(t.id) ? 'move' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: dimmedTokenHint
                    ? '0 0 18px rgba(168,85,247,0.35), 0 2px 6px rgba(0,0,0,0.5)'
                    : '0 2px 6px rgba(0,0,0,0.5)',
                  opacity: dimmedTokenHint ? 0.58 : 1,
                  touchAction: 'none',
                }}
                title={dimmedTokenHint ? 'Something is here' : t.name || t.token_type}
                aria-label={dimmedTokenHint ? 'Unrevealed token hint' : t.name || t.token_type}
              >
                <span
                  style={{
                    color: 'white',
                    fontWeight: 700,
                    fontSize: Math.max(10, Math.min(px * 0.5, 22)),
                    textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                    pointerEvents: 'none',
                  }}
                >
                  {dimmedTokenHint ? '?' : t.icon || (t.name?.[0] ?? TYPE_INITIAL[t.token_type]).toUpperCase()}
                </span>
                {isAlerted && (
                  <span
                    className="action-alert-badge"
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -6,
                      width: 18,
                      height: 18,
                      borderRadius: '9999px',
                      backgroundColor: '#dc2626',
                      border: '2px solid #fff',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 800,
                      lineHeight: '14px',
                      textAlign: 'center',
                      boxShadow: '0 0 8px rgba(220,38,38,0.9)',
                      pointerEvents: 'none',
                    }}
                    aria-hidden="true"
                  >
                    !
                  </span>
                )}
                {showHealth && (
                  <div
                    className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 flex min-w-20 -translate-x-1/2 items-center gap-1 rounded-full border border-zinc-800 bg-zinc-950/95 px-1.5 py-1 shadow-lg shadow-black/40"
                    aria-hidden="true"
                  >
                    <Heart
                      className={`h-3.5 w-3.5 ${
                        t.is_defeated || currentHp <= 0
                          ? 'fill-red-800 text-red-600'
                          : 'fill-red-500 text-red-300'
                      }`}
                    />
                    <div className="h-1.5 w-12 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className={`h-full rounded-full ${hpBarClass(currentHp, maxHp, Boolean(t.is_defeated))}`}
                        style={{ width: `${hpPct}%` }}
                      />
                    </div>
                    {tempHp > 0 && (
                      <span className="h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => zoomAround(
            (viewportRef.current?.getBoundingClientRect().left ?? 0) +
              (viewportRef.current?.clientWidth ?? 0) / 2,
            (viewportRef.current?.getBoundingClientRect().top ?? 0) +
              (viewportRef.current?.clientHeight ?? 0) / 2,
            1.2,
          )}
          className="w-9 h-9 rounded-lg bg-zinc-900/90 border border-zinc-700 text-zinc-200 text-lg font-semibold hover:bg-zinc-800"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoomAround(
            (viewportRef.current?.getBoundingClientRect().left ?? 0) +
              (viewportRef.current?.clientWidth ?? 0) / 2,
            (viewportRef.current?.getBoundingClientRect().top ?? 0) +
              (viewportRef.current?.clientHeight ?? 0) / 2,
            0.8,
          )}
          className="w-9 h-9 rounded-lg bg-zinc-900/90 border border-zinc-700 text-zinc-200 text-lg font-semibold hover:bg-zinc-800"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          onClick={fit}
          className="w-9 h-9 rounded-lg bg-zinc-900/90 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 flex items-center justify-center"
          aria-label="Fit to screen"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
        </button>
      </div>
    </div>
  )
}
