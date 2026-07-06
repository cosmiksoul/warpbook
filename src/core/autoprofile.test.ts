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

import { buildProfileDraft, PROFILE_CELL_CAP, type DraftBlock } from './autoprofile'
import type { ColumnProfile } from './profile'

const num = (name: string, min = 0, max = 100): ColumnProfile => ({
  name, type: 'DOUBLE', distinct: 42, nullCount: 0, kind: 'numeric',
  stats: { min, median: (min + max) / 2, max },
})
const cat = (name: string, distinct = 3): ColumnProfile => ({
  name, type: 'VARCHAR', distinct, nullCount: 0, kind: 'categorical',
})
const draft = (columns: ColumnProfile[], rowCount = 344) =>
  buildProfileDraft({ table: 'demo_penguins', fileName: 'penguins.csv', rowCount, columns })
const widgets = (blocks: DraftBlock[]) => blocks.filter((b) => b.type === 'widget')

describe('buildProfileDraft', () => {
  it('состав: заголовок-текст, null-карта table, гистограмма chart, top-K chart', () => {
    const d = draft([num('mass'), cat('species')])
    expect(d[0]).toMatchObject({ type: 'text' })
    expect((d[0] as { markdown: string }).markdown).toContain('## Профиль: penguins.csv')
    expect((d[0] as { markdown: string }).markdown).toContain('344 строк')
    expect(d[1]).toMatchObject({ type: 'widget', title: 'null-карта', vizType: 'table', datasetNames: ['demo_penguins'] })
    expect(d[2]).toMatchObject({ type: 'widget', title: 'mass — распределение', vizType: 'chart' })
    expect(d[3]).toMatchObject({ type: 'widget', title: 'species — топ значений', vizType: 'chart' })
    expect(d).toHaveLength(4) // все вошли — хвоста нет
  })
  it('кап: 9 элигибельных -> 8 ячеек + хвост со списком', () => {
    const cols = Array.from({ length: 9 }, (_, i) => num(`n${i}`))
    const d = draft(cols)
    expect(widgets(d)).toHaveLength(1 + PROFILE_CELL_CAP) // null-карта + 8
    const tail = d[d.length - 1] as { type: string; markdown: string }
    expect(tail.type).toBe('text')
    expect(tail.markdown).toContain('n8')
    expect(tail.markdown).toContain('за капом')
  })
  it('eligibility: all-null numeric, узкий numeric, distinct=1, high-card и range — мимо ячеек, в хвост с причиной', () => {
    const allNull: ColumnProfile = { name: 'empty', type: 'DOUBLE', distinct: 0, nullCount: 344, kind: 'numeric' } // stats нет
    const flat = num('flat', 5, 5) // min==max
    const single = cat('constant', 1)
    const hc: ColumnProfile = { name: 'id', type: 'VARCHAR', distinct: 344, nullCount: 0, kind: 'highCardinality' }
    const dt: ColumnProfile = { name: 'ts', type: 'TIMESTAMP', distinct: 300, nullCount: 0, kind: 'range' }
    const d = draft([allNull, flat, single, hc, dt, num('ok')])
    expect(widgets(d)).toHaveLength(2) // null-карта + ok
    const tail = (d[d.length - 1] as { markdown: string }).markdown
    for (const frag of ['empty', 'flat', 'constant', 'id', 'ts', 'высокая кардинальность', 'дата/время', 'одно значение', 'нет размаха']) {
      expect(tail).toContain(frag)
    }
  })
  it('пустая таблица (0 строк, stats нет): заголовок + null-карта + хвост, ячеек нет', () => {
    const empty: ColumnProfile = { name: 'mass', type: 'DOUBLE', distinct: 0, nullCount: 0, kind: 'numeric' }
    const d = draft([empty], 0)
    expect(widgets(d)).toHaveLength(1) // только null-карта
    expect((d[0] as { markdown: string }).markdown).toContain('0 строк')
    expect((d[d.length - 1] as { markdown: string }).markdown).toContain('mass')
  })
  it('порядок отбора — как в схеме, вперемешку по kind', () => {
    const d = draft([cat('a'), num('b'), cat('c')])
    expect(widgets(d).map((w) => (w as { title: string }).title)).toEqual([
      'null-карта', 'a — топ значений', 'b — распределение', 'c — топ значений',
    ])
  })
})
