import assert from 'node:assert/strict'
import test from 'node:test'

const { movementCrossesWall } = await import('../../lib/utils/wall-collision.ts')

const wall = {
  name: 'North wall',
  shape_type: 'rectangle',
  x: 0,
  y: 0,
  width: 1_000,
  height: 500,
  door_positions: [{ x: 50, y: 0 }],
}

test('a linked door opens only its nearby wall crossing', () => {
  assert.equal(
    movementCrossesWall([wall], 50, -100, 50, 100, 100),
    null,
    'movement through the linked door should be permitted',
  )
  assert.equal(
    movementCrossesWall([wall], 900, -100, 900, 100, 100),
    'North wall',
    'a distant crossing on the same long edge must remain blocked',
  )
  assert.equal(
    movementCrossesWall(
      [{ ...wall, y: 0, height: 0, door_positions: [{ x: 0, y: 0 }] }],
      0,
      25,
      300,
      -25,
      50,
    ),
    'North wall',
    'a shallow path that passes near a door but crosses far away must remain blocked',
  )
})

test('an edge without a door remains blocking', () => {
  assert.equal(
    movementCrossesWall([{ ...wall, door_positions: [] }], 50, -100, 50, 100, 100),
    'North wall',
  )
})
