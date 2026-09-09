import { describe, expect, it } from 'vitest'
import {
  dotInterval,
  nextZoomStep,
  positiveModulo,
  resizeAroundCenter,
  screenToWorld,
  worldToScreen,
  zoomAt,
  type Viewport,
} from './geometry'

describe('canvas geometry', () => {
  const viewport: Viewport = { translationX: 310.5, translationY: -72.25, scale: 1.75 }

  it('round trips world and screen coordinates', () => {
    const world = { x: -42.75, y: 91.125 }
    const result = screenToWorld(worldToScreen(world, viewport), viewport)
    expect(result.x).toBeCloseTo(world.x, 10)
    expect(result.y).toBeCloseTo(world.y, 10)
  })

  it('keeps the focal world point fixed while zooming', () => {
    const focal = { x: 220, y: 160 }
    const world = screenToWorld(focal, viewport)
    const zoomed = zoomAt(viewport, focal, 3.5)
    expect(worldToScreen(world, zoomed)).toEqual(focal)
  })

  it('clamps zoom and changes button zoom by 10 percentage points', () => {
    expect(zoomAt(viewport, { x: 0, y: 0 }, 99).scale).toBe(8)
    expect(nextZoomStep(0.9, 1)).toBe(1)
    expect(nextZoomStep(1, 1)).toBe(1.1)
    expect(nextZoomStep(2, 1)).toBe(2.1)
    expect(nextZoomStep(1, -1)).toBe(0.9)
    expect(nextZoomStep(0.1, -1)).toBe(0.1)
    expect(nextZoomStep(8, 1)).toBe(8)
  })

  it('derives sparse dot intervals at low zoom', () => {
    expect(dotInterval(1)).toBe(24)
    expect(dotInterval(0.5)).toBe(24)
    expect(dotInterval(0.25)).toBe(48)
    expect(dotInterval(0.1)).toBe(192)
    expect(dotInterval(8)).toBe(24)
  })

  it('keeps the old center world point at the new center', () => {
    const resized = resizeAroundCenter(viewport, { x: 800, y: 600 }, { x: 1200, y: 900 })
    const oldWorld = screenToWorld({ x: 400, y: 300 }, viewport)
    expect(worldToScreen(oldWorld, resized)).toEqual({ x: 600, y: 450 })
  })

  it('handles negative pattern offsets', () => {
    expect(positiveModulo(-5, 24)).toBe(19)
    expect(positiveModulo(29, 24)).toBe(5)
  })
})
