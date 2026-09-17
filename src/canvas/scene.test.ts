import { describe, expect, it } from 'vitest'
import { diamondFromPoints, diamondPath, ellipseFromPoints, lineArrowHeadPath, lineFromPoints, linePath, rectangleFromPoints } from './scene'

describe('rectangleFromPoints', () => {
  it('normalizes a rectangle drawn up and left from its start point', () => {
    expect(rectangleFromPoints({ x: 80, y: 60 }, { x: 20, y: 10 }, 'rectangle-1')).toEqual({
      id: 'rectangle-1',
      x: 20,
      y: 10,
      width: 60,
      height: 50,
      rotation: 0,
      cornerRadius: 8,
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

describe('diamondFromPoints', () => {
  it('creates a rounded diamond from normalized bounds', () => {
    const diamond = diamondFromPoints({ x: 80, y: 60 }, { x: 20, y: 10 }, 'diamond-1')

    expect(diamond).toMatchObject({
      id: 'diamond-1',
      kind: 'diamond',
      x: 20,
      y: 10,
      width: 60,
      height: 50,
      cornerRadius: 8,
    })
    expect(diamondPath(diamond)).toContain('Q')
  })
})

it('builds curved arrow paths with an arrowhead tangent to the end', () => {
  const arrow = lineFromPoints({ x: 0, y: 0 }, { x: 40, y: 0 }, 'arrow-1', false, 'arrow')
  const curved = { ...arrow, curve: { x: 20, y: 10 } }

  expect(curved.kind).toBe('arrow')
  expect(linePath(curved)).toContain('Q')
  expect(lineArrowHeadPath(curved)).toContain('Z')
})
