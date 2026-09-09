import { describe, expect, it } from 'vitest'
import { constrainRotationAngle, snapRotationAngle } from './rotation'

describe('constrainRotationAngle', () => {
  it.each([
    [0, 0],
    [43, 45],
    [92, 90],
    [358, 0],
    [51, 45],
  ])('constrains %d degrees to %d degrees', (angle, expected) => {
    expect(constrainRotationAngle(angle, 45)).toBe(expected)
  })
})

describe('snapRotationAngle', () => {
  it('keeps angles outside the snap tolerance free', () => {
    expect(snapRotationAngle(47, 45, 4)).toBe(45)
    expect(snapRotationAngle(51, 45, 4)).toBe(51)
    expect(snapRotationAngle(358, 45, 4)).toBe(0)
  })
})
