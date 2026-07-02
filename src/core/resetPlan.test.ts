import { describe, expect, it } from 'vitest'
import { buildResetStatements } from './resetPlan'

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
})
