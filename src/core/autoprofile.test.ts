import { describe, expect, it } from 'vitest'
import { buildHistogramCellSql, buildNullMapSql, buildTopKSql } from './autoprofile'

describe('buildNullMapSql', () => {
  it('long-форма: UNION ALL по колонкам, сортировка по null desc', () => {
    const sql = buildNullMapSql('t', ['a', 'b'])
    expect(sql).toContain(`SELECT 'a' AS "колонка"`)
    expect(sql).toContain('UNION ALL')
    expect(sql).toContain(`count(*) FILTER (WHERE "b" IS NULL)`)
    expect(sql).toContain('greatest(count(*), 1)') // guard деления на 0
    expect(sql.trim().endsWith('ORDER BY "null" DESC, "колонка"')).toBe(true)
  })
  it('кривые имена: идент квотится, литерал эскейпится', () => {
    const sql = buildNullMapSql('t', [`we"ird`, `o'brien`])
    expect(sql).toContain(`"we""ird" IS NULL`)
    expect(sql).toContain(`'o''brien' AS "колонка"`)
  })
})

describe('buildHistogramCellSql', () => {
  it('самодостаточный CTE, 12 бакетов, строковый лейбл, числовой ORDER', () => {
    const sql = buildHistogramCellSql('t', 'mass')
    expect(sql).toContain('WITH s AS (SELECT min("mass") AS lo, max("mass") AS hi')
    expect(sql).toContain('nullif(s.hi - s.lo, 0)') // защита lo==hi
    expect(sql).toContain('* 12,') // HISTOGRAM_BINS
    expect(sql).toContain('::VARCHAR AS "от"')
    expect(sql).toContain('ORDER BY min("mass")')
    expect(sql).not.toMatch(/\b\d+\.\d+\b/) // никаких зашитых min/max-констант
  })
})

describe('buildTopKSql', () => {
  it('top-7 с детерминированным tiebreak и без NULL', () => {
    const sql = buildTopKSql('t', 'species')
    expect(sql).toContain(`"species" AS "значение"`)
    expect(sql).toContain('WHERE "species" IS NOT NULL')
    expect(sql).toContain('ORDER BY 2 DESC, 1 LIMIT 7')
  })
})
