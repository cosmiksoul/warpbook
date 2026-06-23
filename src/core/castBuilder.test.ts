import { describe, expect, it } from 'vitest'
import { buildCastExpr, buildCastValue, buildMaterializeDDL, buildNullLossQuery, interpretNullLoss } from './castBuilder'
import type { ColumnConfig } from './schemaTypes'

const base = (over: Partial<ColumnConfig>): ColumnConfig => ({
  origName: 'c',
  name: 'c',
  type: 'VARCHAR',
  include: true,
  ...over,
})

describe('buildCastValue (bare cast expression, no alias)', () => {
  it('VARCHAR passes the value through (no cast)', () => {
    expect(buildCastValue(base({ type: 'VARCHAR' }))).toBe('"c"')
  })
  it('BIGINT uses TRY_CAST', () => {
    expect(buildCastValue(base({ origName: 'n', type: 'BIGINT' }))).toBe(
      'TRY_CAST("n" AS BIGINT)',
    )
  })
  it('DOUBLE with decimal comma replaces , with . before casting', () => {
    expect(
      buildCastValue(base({ origName: 'rev', type: 'DOUBLE', decimalSep: ',' })),
    ).toBe(`TRY_CAST(replace("rev", ',', '.') AS DOUBLE)`)
  })
  it('FLOAT uses TRY_CAST (single precision, same path as DOUBLE)', () => {
    expect(buildCastValue(base({ origName: 'rev', type: 'FLOAT' }))).toBe(
      'TRY_CAST("rev" AS FLOAT)',
    )
  })
  it('FLOAT with decimal comma replaces , with . before casting', () => {
    expect(
      buildCastValue(base({ origName: 'rev', type: 'FLOAT', decimalSep: ',' })),
    ).toBe(`TRY_CAST(replace("rev", ',', '.') AS FLOAT)`)
  })
  it('DATE with format casts try_strptime result to DATE', () => {
    expect(
      buildCastValue(base({ origName: 'd', type: 'DATE', dateFormat: '%d.%m.%Y' })),
    ).toBe(`CAST(try_strptime("d", '%d.%m.%Y') AS DATE)`)
  })
  it('nullToken wraps the value in nullif before casting', () => {
    expect(
      buildCastValue(base({ origName: 'n', type: 'BIGINT', nullToken: 'NA' })),
    ).toBe(`TRY_CAST(nullif("n", 'NA') AS BIGINT)`)
  })
})

describe('buildCastExpr (cast value + target-name alias)', () => {
  it('VARCHAR passthrough, aliased to target name', () => {
    expect(buildCastExpr(base({ type: 'VARCHAR' }))).toBe('"c" AS "c"')
  })
  it('renames via the target name alias', () => {
    expect(buildCastExpr(base({ type: 'VARCHAR', name: 'label' }))).toBe(
      '"c" AS "label"',
    )
  })
  it('BIGINT uses TRY_CAST', () => {
    expect(buildCastExpr(base({ origName: 'n', name: 'n', type: 'BIGINT' }))).toBe(
      'TRY_CAST("n" AS BIGINT) AS "n"',
    )
  })
  it('DOUBLE with decimal comma replaces , with . before casting', () => {
    expect(
      buildCastExpr(
        base({ origName: 'rev', name: 'rev', type: 'DOUBLE', decimalSep: ',' }),
      ),
    ).toBe(`TRY_CAST(replace("rev", ',', '.') AS DOUBLE) AS "rev"`)
  })
  it('DOUBLE without comma casts directly', () => {
    expect(
      buildCastExpr(base({ origName: 'rev', name: 'rev', type: 'DOUBLE' })),
    ).toBe('TRY_CAST("rev" AS DOUBLE) AS "rev"')
  })
  it('DATE without format uses TRY_CAST', () => {
    expect(buildCastExpr(base({ origName: 'd', name: 'd', type: 'DATE' }))).toBe(
      'TRY_CAST("d" AS DATE) AS "d"',
    )
  })
  it('DATE with format casts try_strptime result to DATE', () => {
    expect(
      buildCastExpr(
        base({ origName: 'd', name: 'd', type: 'DATE', dateFormat: '%d.%m.%Y' }),
      ),
    ).toBe(`CAST(try_strptime("d", '%d.%m.%Y') AS DATE) AS "d"`)
  })
  it('TIMESTAMP without format uses TRY_CAST', () => {
    expect(
      buildCastExpr(base({ origName: 'ts', name: 'ts', type: 'TIMESTAMP' })),
    ).toBe('TRY_CAST("ts" AS TIMESTAMP) AS "ts"')
  })
  it('TIMESTAMP with format uses try_strptime directly', () => {
    expect(
      buildCastExpr(
        base({
          origName: 'ts',
          name: 'ts',
          type: 'TIMESTAMP',
          dateFormat: '%Y-%m-%d %H:%M',
        }),
      ),
    ).toBe(`try_strptime("ts", '%Y-%m-%d %H:%M') AS "ts"`)
  })
  it('BOOLEAN uses TRY_CAST', () => {
    expect(
      buildCastExpr(base({ origName: 'b', name: 'b', type: 'BOOLEAN' })),
    ).toBe('TRY_CAST("b" AS BOOLEAN) AS "b"')
  })
  it('nullToken applies to VARCHAR passthrough too', () => {
    expect(
      buildCastExpr(base({ origName: 's', name: 's', type: 'VARCHAR', nullToken: 'NA' })),
    ).toBe(`nullif("s", 'NA') AS "s"`)
  })
  it('escapes identifiers and literals (incl. quote in rename target)', () => {
    expect(
      buildCastExpr(
        base({ origName: 'we"ird', name: 'o"k', type: 'BIGINT', nullToken: "o'NA" }),
      ),
    ).toBe(`TRY_CAST(nullif("we""ird", 'o''NA') AS BIGINT) AS "o""k"`)
  })
})

describe('buildMaterializeDDL', () => {
  it('CREATE OR REPLACE from the raw table with only included columns, order kept', () => {
    const cfgs: ColumnConfig[] = [
      { origName: 'id', name: 'id', type: 'BIGINT', include: true },
      { origName: 'skip', name: 'skip', type: 'VARCHAR', include: false },
      { origName: 'name', name: 'label', type: 'VARCHAR', include: true },
    ]
    expect(buildMaterializeDDL('events', '_qb_raw_events', cfgs)).toBe(
      'CREATE OR REPLACE TABLE "events" AS SELECT ' +
        'TRY_CAST("id" AS BIGINT) AS "id", "name" AS "label" ' +
        'FROM "_qb_raw_events"',
    )
  })
  it('throws when no column is included (empty SELECT is invalid)', () => {
    expect(() =>
      buildMaterializeDDL('events', '_qb_raw_events', [
        { origName: 'a', name: 'a', type: 'VARCHAR', include: false },
      ]),
    ).toThrow(/at least one/i)
  })
})

describe('buildNullLossQuery', () => {
  it('one pass over the raw table, one loss column per non-VARCHAR included column', () => {
    const cfgs: ColumnConfig[] = [
      { origName: 'name', name: 'name', type: 'VARCHAR', include: true }, // skipped: no cast
      { origName: 'n', name: 'n', type: 'BIGINT', include: true },
      { origName: 'rev', name: 'rev', type: 'DOUBLE', include: true, decimalSep: ',' },
      { origName: 'skip', name: 'skip', type: 'BIGINT', include: false }, // excluded
    ]
    const { sql, columns } = buildNullLossQuery('_qb_raw_events', cfgs)
    expect(columns).toEqual(['n', 'rev'])
    expect(sql).toBe(
      'SELECT ' +
        `sum(CASE WHEN "n" IS NOT NULL AND "n" <> '' AND (TRY_CAST("n" AS BIGINT)) IS NULL THEN 1 ELSE 0 END) AS l0, ` +
        `sum(CASE WHEN "rev" IS NOT NULL AND "rev" <> '' AND (TRY_CAST(replace("rev", ',', '.') AS DOUBLE)) IS NULL THEN 1 ELSE 0 END) AS l1 ` +
        'FROM "_qb_raw_events"',
    )
  })
  it('adds a nullToken exclusion to the present condition (token NULL is intentional, not a loss)', () => {
    const cfgs: ColumnConfig[] = [
      { origName: 'n', name: 'n', type: 'BIGINT', include: true, nullToken: 'NA' },
    ]
    const { sql } = buildNullLossQuery('_qb_raw_t', cfgs)
    expect(sql).toBe(
      'SELECT ' +
        `sum(CASE WHEN "n" IS NOT NULL AND "n" <> '' AND "n" <> 'NA' AND (TRY_CAST(nullif("n", 'NA') AS BIGINT)) IS NULL THEN 1 ELSE 0 END) AS l0 ` +
        'FROM "_qb_raw_t"',
    )
  })
  it('uses the bare cast value even for a renamed target whose name contains a quote', () => {
    const cfgs: ColumnConfig[] = [
      { origName: 'we"ird', name: 'o"k', type: 'BIGINT', include: true },
    ]
    const { sql, columns } = buildNullLossQuery('_qb_raw_t', cfgs)
    expect(columns).toEqual(['o"k'])
    // no trailing `AS "o""k"` leaks into the CASE expression
    expect(sql).toBe(
      'SELECT ' +
        `sum(CASE WHEN "we""ird" IS NOT NULL AND "we""ird" <> '' AND (TRY_CAST("we""ird" AS BIGINT)) IS NULL THEN 1 ELSE 0 END) AS l0 ` +
        'FROM "_qb_raw_t"',
    )
  })
  it('returns no-op (empty sql, no columns) when nothing to count', () => {
    const cfgs: ColumnConfig[] = [
      { origName: 'name', name: 'name', type: 'VARCHAR', include: true },
    ]
    expect(buildNullLossQuery('_qb_raw_t', cfgs)).toEqual({ sql: '', columns: [] })
  })
})

describe('interpretNullLoss', () => {
  it('maps the l0..ln result row to per-column losses', () => {
    const row = { l0: 3n, l1: 0n }
    expect(interpretNullLoss(row, ['n', 'rev'])).toEqual({ n: 3, rev: 0 })
  })
  it('coerces null/undefined cells to 0', () => {
    expect(interpretNullLoss({ l0: null }, ['x'])).toEqual({ x: 0 })
  })
})
