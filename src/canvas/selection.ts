import type { Point } from './geometry'
import { rectangleCorners, rectangleCenter, rotatePoint } from './rectangle-interactions'
import type { RectangleShape, TextShape, LineShape } from './scene'

export type Shape = RectangleShape | TextShape | LineShape
export type Scene = { rectangles: (RectangleShape | TextShape)[]; lines: LineShape[] }
export function isLine(shape: Shape): shape is LineShape { return 'kind' in shape && shape.kind === 'line' }
export function bounds(shapes: Shape[]): RectangleShape | undefined {
  if (!shapes.length) return
  const points = shapes.flatMap(shape => isLine(shape) ? [shape.start, shape.end] : Object.values(rectangleCorners(shape)))
  const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y))
  return { id: 'selection', x, y, width: Math.max(...points.map(p => p.x)) - x, height: Math.max(...points.map(p => p.y)) - y, rotation: 0, cornerRadius: 0 }
}
export function transformShape(shape: Shape, from: RectangleShape, to: RectangleShape): Shape {
  const a = rectangleCenter(from), b = rectangleCenter(to)
  const sx = from.width ? to.width / from.width : 1, sy = from.height ? to.height / from.height : 1
  const angle = to.rotation - from.rotation
  const map = (p: Point) => rotatePoint({ x: b.x + (p.x - a.x) * sx, y: b.y + (p.y - a.y) * sy }, b, angle)
  if (isLine(shape)) return { ...shape, start: map(shape.start), end: map(shape.end) }
  const center = map(rectangleCenter(shape))
  const radians = shape.rotation * Math.PI / 180
  const width = shape.width * Math.hypot(sx * Math.cos(radians), sy * Math.sin(radians))
  const height = shape.height * Math.hypot(sx * Math.sin(radians), sy * Math.cos(radians))
  const scale = Math.min(sx, sy)
  const result = { ...shape, x: center.x - width / 2, y: center.y - height / 2, width, height, rotation: shape.rotation + angle, cornerRadius: shape.cornerRadius * scale }
  if (result.labelFontSize) result.labelFontSize *= scale
  const text = result as TextShape
  if (text.kind === 'text') text.fontSize = Math.max(1, text.fontSize * scale)
  return result
}
export function parseScene(value: unknown): Scene {
  if (!value || typeof value !== 'object') throw new Error('Invalid drawing')
  const scene = value as Scene
  if (!Array.isArray(scene.rectangles) || !Array.isArray(scene.lines) || scene.rectangles.length + scene.lines.length > 10000) throw new Error('Invalid drawing')
  const ids = new Set<string>()
  for (const shape of [...scene.rectangles, ...scene.lines]) {
    if (!shape || typeof shape !== 'object' || typeof shape.id !== 'string' || ids.has(shape.id)) throw new Error('Invalid object')
    ids.add(shape.id)
    if (shape.groupId !== undefined && typeof shape.groupId !== 'string') throw new Error('Invalid group')
    if (shape.order !== undefined && !Number.isFinite(shape.order)) throw new Error('Invalid layer')
    const rectangle = shape as RectangleShape
    if (rectangle.label !== undefined && typeof rectangle.label !== 'string') throw new Error('Invalid label')
    if (rectangle.labelFontSize !== undefined && (!Number.isFinite(rectangle.labelFontSize) || rectangle.labelFontSize <= 0)) throw new Error('Invalid label size')
    const numbers = isLine(shape) ? [shape.start?.x, shape.start?.y, shape.end?.x, shape.end?.y] : [shape.x, shape.y, shape.width, shape.height, shape.rotation, shape.cornerRadius]
    if (!numbers.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1e8)) throw new Error('Invalid geometry')
    if (!isLine(shape) && (shape.width < 0 || shape.height < 0)) throw new Error('Invalid size')
    if ('kind' in shape && !['ellipse', 'text', 'line'].includes(String(shape.kind))) throw new Error('Invalid shape')
    const text = shape as TextShape
    if (text.kind === 'text' && (typeof text.text !== 'string' || !Number.isFinite(text.fontSize) || text.fontSize <= 0)) throw new Error('Invalid text')
  }
  if (scene.rectangles.some(isLine) || scene.lines.some(s => !isLine(s))) throw new Error('Invalid shape list')
  return JSON.parse(JSON.stringify(scene)) as Scene
}
