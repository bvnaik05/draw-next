import { describe, expect, it } from 'vitest'
import { ellipseFromPoints, rectangleFromPoints } from './scene'

describe('rectangleFromPoints', () => {
  it('normalizes a rectangle drawn up and left from its start point', () => {
    expect(rectangleFromPoints({ x: 80, y: 60 }, { x: 20, y: 10 }, 'rectangle-1')).toEqual({
      id: 'rectangle-1',
      x: 20,
      y: 10,
      width: 60,
      height: 50,
      rotation: 0,
      cornerRadius: 0,
    })
  })

  it('constrains a Shift-drawn rectangle to a square', () => {
    expect(rectangleFromPoints({ x: 10, y: 20 }, { x: 40, y: 35 }, 'square-1', true)).toMatchObject({
      width: 30,
      height: 30,
    })
  })
})

describe('ellipseFromPoints', () => {
  it('normalizes ellipse bounds and constrains Shift-drawn ellipses to circles', () => {
    expect(ellipseFromPoints({ x: 80, y: 60 }, { x: 20, y: 10 }, 'ellipse-1')).toMatchObject({
      id: 'ellipse-1',
      kind: 'ellipse',
      x: 20,
      y: 10,
      width: 60,
      height: 50,
      rotation: 0,
    })
    expect(ellipseFromPoints({ x: 10, y: 20 }, { x: 40, y: 35 }, 'circle-1', true)).toMatchObject({
      width: 30,
      height: 30,
    })
  })
})
