import { describe, expect, it } from 'vitest'
import { buildSelectAll, quoteIdent, quoteLiteral, tableNameFromFilename, uniqueTableName } from './sql'

describe('quoteIdent', () => {
  it('double-quotes an identifier', () => {
    expect(quoteIdent('events')).toBe('"events"')
  })
  it('escapes embedded double-quotes', () => {
    expect(quoteIdent('we"ird')).toBe('"we""ird"')
  })
})

describe('quoteLiteral', () => {
  it('single-quotes a string literal', () => {
    expect(quoteLiteral('events.csv')).toBe("'events.csv'")
  })
  it('escapes embedded single-quotes', () => {
    expect(quoteLiteral("o'brien.csv")).toBe("'o''brien.csv'")
  })
})

describe('buildSelectAll', () => {
  it('builds a select-all with default limit 100', () => {
    expect(buildSelectAll('events')).toBe('SELECT * FROM "events" LIMIT 100')
  })
  it('honors an explicit limit', () => {
    expect(buildSelectAll('events', 5)).toBe('SELECT * FROM "events" LIMIT 5')
  })
  it('quotes the table identifier', () => {
    expect(buildSelectAll('we"ird')).toBe('SELECT * FROM "we""ird" LIMIT 100')
  })
})

describe('tableNameFromFilename', () => {
  it('strips the extension and keeps a clean base name', () => {
    expect(tableNameFromFilename('events.csv')).toBe('events')
    expect(tableNameFromFilename('orders.parquet')).toBe('orders')
  })
  it('replaces invalid identifier chars with underscores', () => {
    expect(tableNameFromFilename('My Data!.csv')).toBe('My_Data_')
  })
  it('prefixes a leading digit so the identifier is valid', () => {
    expect(tableNameFromFilename('2024.csv')).toBe('_2024')
  })
  it('falls back to "table" when nothing usable remains', () => {
    expect(tableNameFromFilename('.csv')).toBe('table')
    expect(tableNameFromFilename('')).toBe('table')
  })
  it('handles names with multiple dots (only last extension stripped)', () => {
    expect(tableNameFromFilename('a.b.csv')).toBe('a_b')
  })
})

describe('uniqueTableName', () => {
  it('returns the desired name when free', () => {
    expect(uniqueTableName('events', [])).toBe('events')
    expect(uniqueTableName('events', ['orders'])).toBe('events')
  })
  it('suffixes on collision', () => {
    expect(uniqueTableName('events', ['events'])).toBe('events_1')
    expect(uniqueTableName('events', ['events', 'events_1'])).toBe('events_2')
  })
})
