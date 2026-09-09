import { describe, expect, it } from 'vitest'
import { rotateLineEndpoint } from './line-interactions'
import type { LineShape } from './scene'

const line: LineShape = {
  id: 'line-1',
  kind: 'line',
  start: { x: 0, y: 0 },
  end: { x: 40, y: 0 },
}

describe('line interactions', () => {
  it('snaps a dragged endpoint to the nearest 45-degree direction around its anchor', () => {
    const rotated = rotateLineEndpoint(line, 'end', { x: 50, y: 52 }, true)

    expect(rotated.start).toEqual(line.start)
    expect(rotated.end.x).toBeCloseTo(51.0098, 3)
    expect(rotated.end.y).toBeCloseTo(51.0098, 3)
  })

  it('keeps an endpoint freely positioned outside the snap range', () => {
    const rotated = rotateLineEndpoint(line, 'end', { x: 50, y: 70 })

    expect(rotated.end).toEqual({ x: 50, y: 70 })
  })
})
