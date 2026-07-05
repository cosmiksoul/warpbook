import { describe, it, expect } from 'vitest'
import { bootPercent, bootSegments, formatMb } from './bootProgress'

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
  it('100 exactly at the boundary', () => {
    expect(bootPercent({ loaded: 100, total: 100 })).toBe(100)
  })
  it('null (unreliable total) when loaded exceeds total — compressed transfer: Content-Length is the ENCODED size, stream bytes are DECODED', () => {
    // Реальный кейс GitHub Pages: wasm ~39 МБ отдаётся brotli ~7.8 МБ →
    // прогресс показывал «34.2 МБ из 7.8 МБ · 100%».
    expect(bootPercent({ loaded: 34_200_000, total: 7_800_000 })).toBeNull()
    expect(bootPercent({ loaded: 250, total: 100 })).toBeNull()
  })
})

describe('formatMb', () => {
  it('one decimal, decimal megabytes', () => {
    expect(formatMb(34_242_580)).toBe('34.2 МБ')
    expect(formatMb(0)).toBe('0.0 МБ')
  })
})

describe('bootSegments', () => {
  it('null (индетерминация) → null', () => {
    expect(bootSegments(null, 10)).toBeNull()
  })
  it('0% → 0 сегментов', () => {
    expect(bootSegments(0, 10)).toBe(0)
  })
  it('округляет к ближайшему сегменту', () => {
    expect(bootSegments(47, 10)).toBe(5)
    expect(bootSegments(4, 10)).toBe(0)
  })
  it('100% → все сегменты', () => {
    expect(bootSegments(100, 10)).toBe(10)
  })
  it('клампит выход за 100', () => {
    expect(bootSegments(140, 10)).toBe(10)
  })
})
