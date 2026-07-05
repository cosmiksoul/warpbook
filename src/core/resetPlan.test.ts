import { describe, expect, it } from 'vitest'
import { buildDropDatasetStatements, buildResetStatements } from './resetPlan'

describe('buildDropDatasetStatements', () => {
  it('csv -> таблица + её immutable raw', () => {
    expect(buildDropDatasetStatements({ table: 'events', kind: 'csv' })).toEqual([
      'DROP TABLE IF EXISTS "events"',
      'DROP TABLE IF EXISTS "_qb_raw_events"',
    ])
  })

  it('parquet -> только таблица', () => {
    expect(buildDropDatasetStatements({ table: 'metrics', kind: 'parquet' })).toEqual([
      'DROP TABLE IF EXISTS "metrics"',
    ])
  })

  it('витрины -> DROP своего вида', () => {
    expect(buildDropDatasetStatements({ table: 'rev', kind: 'view' })).toEqual([
      'DROP VIEW IF EXISTS "rev"',
    ])
    expect(buildDropDatasetStatements({ table: 'snap', kind: 'table' })).toEqual([
      'DROP TABLE IF EXISTS "snap"',
    ])
  })
})

describe('buildResetStatements', () => {
  it('drops file tables (+raw for csv), marts by their kind, and per-tab result snapshots', () => {
    expect(
      buildResetStatements(
        [
          { table: 'events', kind: 'csv' },
          { table: 'metrics', kind: 'parquet' },
          { table: 'rev', kind: 'view' },
          { table: 'snap', kind: 'table' },
        ],
        ['tab-1', 'tab-2'],
      ),
    ).toEqual([
      'DROP TABLE IF EXISTS "events"',
      'DROP TABLE IF EXISTS "_qb_raw_events"',
      'DROP TABLE IF EXISTS "metrics"',
      'DROP VIEW IF EXISTS "rev"',
      'DROP TABLE IF EXISTS "snap"',
      'DROP TABLE IF EXISTS "_qb_result_tab-1"',
      'DROP TABLE IF EXISTS "_qb_result_tab-2"',
    ])
  })

  it('empty session -> no statements', () => {
    expect(buildResetStatements([], [])).toEqual([])
  })

  it('чистит и снапшоты ячеек отчёта (blockIds)', () => {
    expect(buildResetStatements([], ['tab-1'], ['blk-2', 'blk-5'])).toEqual([
      'DROP TABLE IF EXISTS "_qb_result_tab-1"',
      'DROP TABLE IF EXISTS "_qb_result_blk-2"',
      'DROP TABLE IF EXISTS "_qb_result_blk-5"',
    ])
  })
})
