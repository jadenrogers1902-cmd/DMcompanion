export interface WallForCollision {
  name: string
  shape_type: 'rectangle' | 'polygon'
  x: number
  y: number
  width?: number | null
  height?: number | null
  points?: { x: number; y: number }[] | null
  door_positions: { x: number; y: number }[]
}

function onSegment(
  sx1: number, sy1: number, sx2: number, sy2: number,
  px: number, py: number,
): boolean {
  return px >= Math.min(sx1, sx2) && px <= Math.max(sx1, sx2)
      && py >= Math.min(sy1, sy2) && py <= Math.max(sy1, sy2)
}

export function segmentsIntersect(
  ax1: number, ay1: number, ax2: number, ay2: number,
  bx1: number, by1: number, bx2: number, by2: number,
): boolean {
  const d1 = (bx2 - bx1) * (ay1 - by1) - (by2 - by1) * (ax1 - bx1)
  const d2 = (bx2 - bx1) * (ay2 - by1) - (by2 - by1) * (ax2 - bx1)
  const d3 = (ax2 - ax1) * (by1 - ay1) - (ay2 - ay1) * (bx1 - ax1)
  const d4 = (ax2 - ax1) * (by2 - ay1) - (ay2 - ay1) * (bx2 - ax1)

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }

  if (d1 === 0 && onSegment(bx1, by1, bx2, by2, ax1, ay1)) return true
  if (d2 === 0 && onSegment(bx1, by1, bx2, by2, ax2, ay2)) return true
  if (d3 === 0 && onSegment(ax1, ay1, ax2, ay2, bx1, by1)) return true
  if (d4 === 0 && onSegment(ax1, ay1, ax2, ay2, bx2, by2)) return true

  return false
}

function segmentIntersectionPoint(
  ax1: number, ay1: number, ax2: number, ay2: number,
  bx1: number, by1: number, bx2: number, by2: number,
): { x: number; y: number } | null {
  const rx = ax2 - ax1
  const ry = ay2 - ay1
  const sx = bx2 - bx1
  const sy = by2 - by1
  const denominator = rx * sy - ry * sx

  // Parallel/collinear overlap has no single safe doorway crossing. The caller
  // treats it as blocked rather than guessing a permissive point.
  if (Math.abs(denominator) < 1e-9) return null

  const qpx = bx1 - ax1
  const qpy = by1 - ay1
  const t = (qpx * sy - qpy * sx) / denominator
  return { x: ax1 + t * rx, y: ay1 + t * ry }
}

function edgeCrossesWithDoorCheck(
  oldX: number, oldY: number, newX: number, newY: number,
  ex1: number, ey1: number, ex2: number, ey2: number,
  doorPositions: { x: number; y: number }[],
  doorThreshold: number,
): boolean {
  if (!segmentsIntersect(oldX, oldY, newX, newY, ex1, ey1, ex2, ey2)) return false
  const crossing = segmentIntersectionPoint(oldX, oldY, newX, newY, ex1, ey1, ex2, ey2)
  if (!crossing) return true
  for (const door of doorPositions) {
    // A linked door opens only the nearby crossing, not the entire wall edge
    // or a shallow path that merely passes near the door before crossing later.
    if (Math.hypot(door.x - crossing.x, door.y - crossing.y) <= doorThreshold) {
      return false
    }
  }
  return true
}

export function movementCrossesWall(
  walls: WallForCollision[],
  oldX: number,
  oldY: number,
  newX: number,
  newY: number,
  gridSize: number,
): string | null {
  const doorThreshold = gridSize * 0.75

  for (const wall of walls) {
    if (wall.shape_type === 'rectangle' && wall.width != null && wall.height != null) {
      const x = wall.x
      const y = wall.y
      const r = x + wall.width
      const b = y + wall.height
      const edges: [number, number, number, number][] = [
        [x, y, r, y],
        [r, y, r, b],
        [r, b, x, b],
        [x, b, x, y],
      ]
      for (const [ex1, ey1, ex2, ey2] of edges) {
        if (edgeCrossesWithDoorCheck(oldX, oldY, newX, newY, ex1, ey1, ex2, ey2, wall.door_positions, doorThreshold)) {
          return wall.name
        }
      }
    } else if (wall.shape_type === 'polygon') {
      const pts = wall.points ?? []
      if (pts.length < 3) continue
      for (let i = 0; i < pts.length; i++) {
        const p1 = pts[i]
        const p2 = pts[(i + 1) % pts.length]
        if (edgeCrossesWithDoorCheck(oldX, oldY, newX, newY, p1.x, p1.y, p2.x, p2.y, wall.door_positions, doorThreshold)) {
          return wall.name
        }
      }
    }
  }

  return null
}
