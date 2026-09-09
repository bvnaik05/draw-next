import type { Point } from './geometry'

export type RectangleShape = {
  id: string
  groupId?: string
  order?: number
  x: number
  y: number
  width: number
  height: number
  rotation: number
  cornerRadius: number
  label?: string
  labelFontSize?: number
}

export type EllipseShape = RectangleShape & {
  kind: 'ellipse'
}

export type LineShape = {
  id: string
  groupId?: string
  order?: number
  kind: 'line'
  start: Point
  end: Point
}

export type TextShape = RectangleShape & {
  kind: 'text'
  text: string
  fontSize: number
  wrap: boolean
}

export function rectangleFromPoints(
  start: Point,
  end: Point,
  id: string,
  constrainProportions = false,
): RectangleShape {
  const constrainedEnd = constrainProportions ? squareEndPoint(start, end) : end
  return {
    id,
    x: Math.min(start.x, constrainedEnd.x),
    y: Math.min(start.y, constrainedEnd.y),
    width: Math.abs(constrainedEnd.x - start.x),
    height: Math.abs(constrainedEnd.y - start.y),
    rotation: 0,
    cornerRadius: 0,
  }
}

export function ellipseFromPoints(
  start: Point,
  end: Point,
  id: string,
  constrainProportions = false,
): EllipseShape {
  return { ...rectangleFromPoints(start, end, id, constrainProportions), kind: 'ellipse' }
}

export function lineFromPoints(start: Point, end: Point, id: string, constrainAngle = false): LineShape {
  const constrainedEnd = constrainAngle ? angleConstrainedEndPoint(start, end) : end
  return { id, kind: 'line', start: { ...start }, end: { ...constrainedEnd } }
}

function squareEndPoint(start: Point, end: Point): Point {
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const size = Math.max(Math.abs(deltaX), Math.abs(deltaY))
  return {
    x: start.x + Math.sign(deltaX || 1) * size,
    y: start.y + Math.sign(deltaY || 1) * size,
  }
}

function angleConstrainedEndPoint(start: Point, end: Point): Point {
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const length = Math.hypot(deltaX, deltaY)
  if (length === 0) return end
  const angle = Math.round((Math.atan2(deltaY, deltaX) * 180) / Math.PI / 45) * 45
  const radians = (angle * Math.PI) / 180
  return { x: start.x + length * Math.cos(radians), y: start.y + length * Math.sin(radians) }
}

export function createId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return prefix + '-' + Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}
