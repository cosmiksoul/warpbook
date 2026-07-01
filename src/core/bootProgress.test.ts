import { describe, it, expect } from 'vitest'
import { bootPercent, formatMb } from './bootProgress'

describe('bootPercent', () => {
  it('null when no progress yet', () => {
    expect(bootPercent(null)).toBeNull()
  })
  it('null (indeterminate) when the total size is unknown', () => {
    expect(bootPercent({ loaded: 1000, total: 0 })).toBeNull()
  })
  it('0 at the very start', () => {
    expect(bootPercent({ loaded: 0, total: 100 })).toBe(0)
  })
  it('rounds mid-download', () => {
    expect(bootPercent({ loaded: 33, total: 100 })).toBe(33)
    expect(bootPercent({ loaded: 1, total: 3 })).toBe(33)
  })
  it('clamps an overshoot to 100', () => {
    expect(bootPercent({ loaded: 250, total: 100 })).toBe(100)
  })
})

describe('formatMb', () => {
  it('one decimal, decimal megabytes', () => {
    expect(formatMb(34_242_580)).toBe('34.2 МБ')
    expect(formatMb(0)).toBe('0.0 МБ')
  })
})
