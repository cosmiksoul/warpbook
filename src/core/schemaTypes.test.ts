import { describe, expect, it } from 'vitest'
import {
  baselineConfig,
  mapDuckDBType,
  parseInferredColumns,
  suggestTypes,
  type ColumnConfig,
} from './schemaTypes'
import type { QueryResult, ResultColumn } from './arrowToRows'

describe('mapDuckDBType', () => {
  it('maps integer family to BIGINT', () => {
    expect(mapDuckDBType('BIGINT')).toBe('BIGINT')
    expect(mapDuckDBType('INTEGER')).toBe('BIGINT')
    expect(mapDuckDBType('HUGEINT')).toBe('BIGINT')
  })
  it('maps DOUBLE/DECIMAL/NUMERIC to DOUBLE', () => {
    expect(mapDuckDBType('DOUBLE')).toBe('DOUBLE')
    expect(mapDuckDBType('DECIMAL(18,3)')).toBe('DOUBLE')
    expect(mapDuckDBType('NUMERIC')).toBe('DOUBLE')
  })
  it('maps FLOAT/REAL to FLOAT (single precision — honest, not folded to DOUBLE)', () => {
    expect(mapDuckDBType('FLOAT')).toBe('FLOAT')
    expect(mapDuckDBType('REAL')).toBe('FLOAT')
  })
  it('maps date/timestamp/boolean', () => {
    expect(mapDuckDBType('DATE')).toBe('DATE')
    expect(mapDuckDBType('TIMESTAMP')).toBe('TIMESTAMP')
    expect(mapDuckDBType('TIMESTAMP WITH TIME ZONE')).toBe('TIMESTAMP')
    expect(mapDuckDBType('BOOLEAN')).toBe('BOOLEAN')
  })
  it('falls back to VARCHAR for anything else', () => {
    expect(mapDuckDBType('VARCHAR')).toBe('VARCHAR')
    expect(mapDuckDBType('UUID')).toBe('VARCHAR')
    expect(mapDuckDBType('BLOB')).toBe('VARCHAR')
  })
})

// parseInferredColumns reads a DESCRIBE-shaped result: rows with
// column_name / column_type, exactly like duckdbClient.describeTable consumes.
function fakeDescribe(
  pairs: { column_name: string; column_type: string }[],
): QueryResult {
  return {
    columns: [
      { name: 'column_name', type: 'Utf8' },
      { name: 'column_type', type: 'Utf8' },
    ],
    rows: pairs,
    numRows: pairs.length,
  }
}

describe('parseInferredColumns', () => {
  it('maps a DESCRIBE result to {name, type: ColType}', () => {
    const r = fakeDescribe([
      { column_name: 'id', column_type: 'BIGINT' },
      { column_name: 'revenue', column_type: 'DECIMAL(18,3)' },
      { column_name: 'name', column_type: 'VARCHAR' },
      { column_name: 'signup', column_type: 'DATE' },
    ])
    expect(parseInferredColumns(r)).toEqual([
      { name: 'id', type: 'BIGINT' },
      { name: 'revenue', type: 'DOUBLE' },
      { name: 'name', type: 'VARCHAR' },
      { name: 'signup', type: 'DATE' },
    ])
  })
})

describe('suggestTypes', () => {
  it('builds a full per-column config from inferred types', () => {
    const cfgs: ColumnConfig[] = suggestTypes([
      { name: 'id', type: 'BIGINT' },
      { name: 'name', type: 'VARCHAR' },
    ])
    expect(cfgs).toEqual([
      { origName: 'id', name: 'id', type: 'BIGINT', include: true },
      { origName: 'name', name: 'name', type: 'VARCHAR', include: true },
    ])
  })
})

describe('baselineConfig', () => {
  it('keeps every column as VARCHAR (the untyped M1 state)', () => {
    const columns: ResultColumn[] = [
      { name: 'id', type: 'VARCHAR' },
      { name: 'name', type: 'VARCHAR' },
    ]
    expect(baselineConfig(columns)).toEqual([
      { origName: 'id', name: 'id', type: 'VARCHAR', include: true },
      { origName: 'name', name: 'name', type: 'VARCHAR', include: true },
    ])
  })
})
