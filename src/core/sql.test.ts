import { describe, expect, it } from 'vitest'
import { buildSelectAll, quoteIdent, quoteLiteral } from './sql'

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
