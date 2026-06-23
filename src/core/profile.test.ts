import { describe, expect, it } from 'vitest'
import { classifyColumn, THRESHOLD_DISTINCT } from './profile'

describe('classifyColumn', () => {
  it('numeric for integer/real/decimal families', () => {
    expect(classifyColumn('BIGINT', 100, THRESHOLD_DISTINCT)).toBe('numeric')
    expect(classifyColumn('HUGEINT', 100, THRESHOLD_DISTINCT)).toBe('numeric')
    expect(classifyColumn('DOUBLE', 100, THRESHOLD_DISTINCT)).toBe('numeric')
    expect(classifyColumn('FLOAT', 5, THRESHOLD_DISTINCT)).toBe('numeric')
    expect(classifyColumn('INTEGER', 9999, THRESHOLD_DISTINCT)).toBe('numeric')
    expect(classifyColumn('DECIMAL(18,3)', 7, THRESHOLD_DISTINCT)).toBe('numeric')
  })
  it('boolean is categorical regardless of distinct', () => {
    expect(classifyColumn('BOOLEAN', 2, THRESHOLD_DISTINCT)).toBe('categorical')
  })
  it('varchar under threshold is categorical, over threshold is highCardinality', () => {
    expect(classifyColumn('VARCHAR', 12, 50)).toBe('categorical')
    expect(classifyColumn('VARCHAR', 50, 50)).toBe('categorical') // <= threshold
    expect(classifyColumn('VARCHAR', 51, 50)).toBe('highCardinality')
  })
  it('date/timestamp/time are range', () => {
    expect(classifyColumn('DATE', 365, THRESHOLD_DISTINCT)).toBe('range')
    expect(classifyColumn('TIMESTAMP', 1000, THRESHOLD_DISTINCT)).toBe('range')
    expect(classifyColumn('TIMESTAMP WITH TIME ZONE', 1000, THRESHOLD_DISTINCT)).toBe('range')
    expect(classifyColumn('TIME', 24, THRESHOLD_DISTINCT)).toBe('range')
  })
  it('anything else is highCardinality', () => {
    expect(classifyColumn('UUID', 9, THRESHOLD_DISTINCT)).toBe('highCardinality')
    expect(classifyColumn('BLOB', 9, THRESHOLD_DISTINCT)).toBe('highCardinality')
  })
})
