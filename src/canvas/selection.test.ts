import { expect, it } from 'vitest'
import { bounds, parseScene, transformShape } from './selection'

it('transforms mixed selections and rejects invalid clipboard geometry', () => {
  const rectangle = { id: 'rectangle', x: 0, y: 0, width: 20, height: 10, rotation: 0, cornerRadius: 0 }
  const line = { id: 'line', kind: 'line' as const, start: { x: 30, y: 0 }, end: { x: 40, y: 10 } }
  const frame = bounds([rectangle, line])!
  expect(frame.width).toBe(40)
  const target = { ...frame, width: 80, height: 20 }
  expect(transformShape(rectangle, frame, target)).toMatchObject({ width: 40, height: 20 })
  expect(transformShape(line, frame, target)).toMatchObject({ start: { x: 60, y: 0 }, end: { x: 80, y: 20 } })
  expect(() => parseScene({ rectangles: [{ ...rectangle, width: -1 }], lines: [] })).toThrow()
  expect(() => parseScene({ rectangles: [rectangle, rectangle], lines: [] })).toThrow()
  expect(parseScene({ rectangles: [{ ...rectangle, kind: 'image', src: 'data:image/png;base64,AA==', naturalWidth: 40, naturalHeight: 20, crop: { x: 5, y: 5, width: 20, height: 10 } }], lines: [] }).rectangles[0]).toMatchObject({ kind: 'image' })
  expect(() => parseScene({ rectangles: [{ ...rectangle, kind: 'image', src: 'https://example.com/image.png' }], lines: [] })).toThrow()
  expect(() => parseScene({ rectangles: [{ ...rectangle, kind: 'image', src: 'data:image/png;base64,AA==', naturalWidth: 40, naturalHeight: 20, crop: { x: 30, y: 0, width: 20, height: 10 } }], lines: [] })).toThrow()
})
