import { describe, expect, it } from 'vitest'
import type { RectangleShape } from './scene'
import { snapResizeHandlePoint, snapShapeMove, visualBounds } from './snapping'

function rectangle(
  id: string,
  x: number,
  y: number,
  width = 40,
  height = 40,
  rotation = 0,
): RectangleShape {
  return { id, x, y, width, height, rotation, cornerRadius: 0 }
}

describe('shape movement snapping', () => {
  it('aligns a nearby edge and returns its guide', () => {
    const reference = rectangle('reference', 0, 0, 100, 50)
    const moving = rectangle('moving', 104, 80, 100, 50)

    const result = snapShapeMove(moving, [reference, moving], 1)

    expect(result.shape.x).toBe(100)
    expect(result.alignmentGuides).toContainEqual({
      axis: 'x', position: 100, start: 0, end: 130,
    })
  })

  it('keeps the snap tolerance constant in screen pixels', () => {
    const reference = rectangle('reference', 0, 0, 100, 50)
    const moving = rectangle('moving', 104, 80, 100, 50)

    expect(snapShapeMove(moving, [reference, moving], 2).shape.x).toBe(104)
  })

  it('snaps a third shape to the existing gap between two shapes', () => {
    const first = rectangle('first', 0, 0)
    const second = rectangle('second', 60, 0)
    const moving = rectangle('moving', 123, 0)

    const result = snapShapeMove(moving, [first, second, moving], 1)

    expect(result.shape.x).toBe(120)
    expect(result.spacingMarkers).toHaveLength(2)
    expect(result.spacingMarkers.map(({ start, end }) => [start, end])).toEqual([
      [40, 60],
      [100, 120],
    ])
  })

  it('uses the visual bounds of a rotated shape', () => {
    expect(visualBounds(rectangle('rotated', 100, 100, 80, 40, 90))).toMatchObject({
      left: 120,
      top: 80,
      right: 160,
      bottom: 160,
    })
  })

  it('snaps a resize handle to a nearby shape edge', () => {
    const moving = rectangle('moving', 0, 0)
    const reference = rectangle('reference', 100, 0)

    const result = snapResizeHandlePoint(
      { x: 96, y: 20 },
      moving,
      'east',
      [moving, reference],
      1,
    )

    expect(result.point).toEqual({ x: 100, y: 20 })
    expect(result.alignmentGuides[0]).toMatchObject({ axis: 'x', position: 100 })
  })
})
