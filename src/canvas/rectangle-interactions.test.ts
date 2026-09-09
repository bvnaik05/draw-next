import { describe, expect, it } from 'vitest'
import {
  containsPoint,
  moveRectangle,
  rectangleCorners,
  rotatePoint,
  rotateRectangle,
  setCornerRadius,
  resizeFromEdge,
  resizeFromCorner,
} from './rectangle-interactions'
import type { RectangleShape } from './scene'

const rectangle: RectangleShape = {
  id: 'rectangle-1',
  x: 10,
  y: 20,
  width: 40,
  height: 20,
  rotation: 0,
  cornerRadius: 0,
}

describe('rectangle interactions', () => {
  it('moves the rectangle by the pointer delta', () => {
    expect(moveRectangle(rectangle, { x: -5, y: 12 })).toMatchObject({ x: 5, y: 32 })
  })

  it('resizes from a corner while retaining the opposite corner', () => {
    expect(resizeFromCorner(rectangle, 'northwest', { x: 5, y: 15 })).toMatchObject({
      x: 5,
      y: 15,
      width: 45,
      height: 25,
    })
  })

  it('preserves an existing shape ratio while Shift-resizing from corners or edges', () => {
    expect(resizeFromCorner(rectangle, 'northwest', { x: 0, y: 15 }, true)).toMatchObject({
      x: 0,
      y: 15,
      width: 50,
      height: 25,
    })
    expect(resizeFromEdge(rectangle, 'east', { x: 70, y: 30 }, true)).toMatchObject({
      x: 10,
      y: 15,
      width: 60,
      height: 30,
    })
  })

  it('uses either pointer direction for a proportional corner resize', () => {
    expect(resizeFromCorner(rectangle, 'northwest', { x: 0, y: 30 }, true)).toMatchObject({
      x: 0,
      y: 15,
      width: 50,
      height: 25,
    })
  })

  it('flips a corner resize after it crosses the opposite corner', () => {
    expect(resizeFromCorner(rectangle, 'northwest', { x: 60, y: 50 })).toMatchObject({
      x: 50,
      y: 40,
      width: 10,
      height: 10,
    })
  })

  it('resizes from an edge while keeping the opposite edge fixed', () => {
    expect(resizeFromEdge(rectangle, 'east', { x: 60, y: 30 })).toMatchObject({ x: 10, width: 50 })
    expect(resizeFromEdge(rectangle, 'west', { x: 0, y: 30 })).toMatchObject({ x: 0, width: 50 })
    expect(resizeFromEdge(rectangle, 'south', { x: 30, y: 60 })).toMatchObject({ y: 20, height: 40 })
    expect(resizeFromEdge(rectangle, 'north', { x: 30, y: 0 })).toMatchObject({ y: 0, height: 40 })
  })

  it('keeps the opposite corner fixed while resizing a rotated rectangle', () => {
    const rotated = { ...rectangle, rotation: 30 }
    const originalAnchor = rectangleCorners(rotated).southeast
    const pointer = rotatePoint({ x: 0, y: 10 }, { x: 30, y: 30 }, rotated.rotation)
    const resizedAnchor = rectangleCorners(resizeFromCorner(rotated, 'northwest', pointer)).southeast

    expect(resizedAnchor.x).toBeCloseTo(originalAnchor.x)
    expect(resizedAnchor.y).toBeCloseTo(originalAnchor.y)
  })

  it('limits corner radius to the rectangle bounds while resizing', () => {
    expect(setCornerRadius(rectangle, 'northwest', { x: 28, y: 38 }).cornerRadius).toBe(10)
    expect(
      resizeFromEdge({ ...rectangle, cornerRadius: 10 }, 'south', { x: 30, y: 24 }).cornerRadius,
    ).toBe(2)
  })

  it('rotates from the initial pointer angle', () => {
    const rotated = rotateRectangle(rectangle, { x: 30, y: 0 }, { x: 50, y: 30 })
    expect(rotated.rotation).toBe(90)
    expect(containsPoint(rotated, { x: 30, y: 30 })).toBe(true)
    expect(rectangleCorners(rotated).northwest.x).toBeCloseTo(40)
  })

  it('snaps only when rotation is close to a 45-degree increment', () => {
    const snapped = rotateRectangle(rectangle, { x: 30, y: 0 }, { x: 52, y: 6 })
    const free = rotateRectangle(rectangle, { x: 30, y: 0 }, { x: 50, y: 40 })

    expect(snapped.rotation).toBe(45)
    expect(free.rotation).toBeCloseTo(116.565, 3)
  })

  it('constrains rotation to 15-degree increments with Shift', () => {
    const rotated = rotateRectangle(rectangle, { x: 30, y: 0 }, { x: 51, y: 12 }, true)

    expect(rotated.rotation).toBe(45)
  })

  it('uses the ellipse perimeter for hit testing', () => {
    const ellipse = { ...rectangle, kind: 'ellipse' as const }
    expect(containsPoint(ellipse, { x: 30, y: 30 })).toBe(true)
    expect(containsPoint(ellipse, { x: 10, y: 20 })).toBe(false)
  })

  it('keeps ellipse transformations on the shared bounds interaction path', () => {
    const ellipse = { ...rectangle, kind: 'ellipse' as const }
    expect(moveRectangle(ellipse, { x: -5, y: 12 })).toMatchObject({ x: 5, y: 32, kind: 'ellipse' })
    expect(resizeFromCorner(ellipse, 'northwest', { x: 5, y: 15 })).toMatchObject({
      x: 5,
      y: 15,
      width: 45,
      height: 25,
      kind: 'ellipse',
    })
    expect(rotateRectangle(ellipse, { x: 30, y: 0 }, { x: 50, y: 30 })).toMatchObject({
      rotation: 90,
      kind: 'ellipse',
    })
    expect(resizeFromCorner(ellipse, 'northwest', { x: 0, y: 15 }, true)).toMatchObject({
      width: 50,
      height: 25,
      kind: 'ellipse',
    })
  })
})
