import { describe, it, expect } from 'vitest'
import { SAMPLES, sampleLoaded, sampleTables } from './sampleCatalog'

describe('SAMPLES manifest', () => {
  it('4 записи с уникальными id, cookbook — featured и первая', () => {
    expect(SAMPLES.map((s) => s.id)).toEqual(['cookbook', 'penguins', 'taxi', 'titanic'])
    expect(new Set(SAMPLES.map((s) => s.id)).size).toBe(4)
    expect(SAMPLES[0].featured).toBe(true)
  })
  it('все таблицы demo_-префиксные', () => {
    for (const s of SAMPLES) for (const t of sampleTables(s)) expect(t).toMatch(/^demo_/)
  })
  it('каждый seed-запрос ссылается на таблицу своего сэмпла', () => {
    for (const s of SAMPLES) {
      const tables = sampleTables(s)
      for (const tab of s.seedTabs) {
        expect(tables.some((t) => tab.sql.includes(t))).toBe(true)
      }
    }
  })
  it('у каждого сэмпла есть blurb, sizeLabel и хотя бы один seed-таб', () => {
    for (const s of SAMPLES) {
      expect(s.blurb.length).toBeGreaterThan(0)
      expect(s.sizeLabel.length).toBeGreaterThan(0)
      expect(s.seedTabs.length).toBeGreaterThan(0)
    }
  })
})

describe('sampleLoaded', () => {
  const penguins = SAMPLES.find((s) => s.id === 'penguins')!
  const cookbook = SAMPLES.find((s) => s.id === 'cookbook')!
  it('true, когда все таблицы сэмпла загружены', () => {
    expect(sampleLoaded(penguins, ['demo_penguins', 'other'])).toBe(true)
  })
  it('false, когда есть не все таблицы мульти-файлового сэмпла', () => {
    expect(sampleLoaded(cookbook, ['demo_payments'])).toBe(false)
    expect(sampleLoaded(cookbook, ['demo_payments', 'demo_users'])).toBe(true)
  })
  it('регистронезависимо (каталог DuckDB case-insensitive)', () => {
    expect(sampleLoaded(penguins, ['DEMO_PENGUINS'])).toBe(true)
  })
  it('false на пустом сторе', () => {
    expect(sampleLoaded(penguins, [])).toBe(false)
  })
})
