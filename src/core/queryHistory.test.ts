import { describe, it, expect } from 'vitest'
import { HISTORY_CAP, pushHistory, serializeHistory, deserializeHistory } from './queryHistory'

describe('pushHistory', () => {
  it('добавляет trimmed-запрос в конец', () => {
    expect(pushHistory(['a'], '  SELECT 1  ')).toEqual(['a', 'SELECT 1'])
  })
  it('скипает пустые и пробельные', () => {
    const list = ['a']
    expect(pushHistory(list, '   ')).toBe(list)
    expect(pushHistory(list, '')).toBe(list)
  })
  it('дедупит ТОЛЬКО подряд идущие', () => {
    const list = ['a', 'b']
    expect(pushHistory(list, 'b')).toBe(list)
    expect(pushHistory(list, 'a')).toEqual(['a', 'b', 'a'])
  })
  it('кап: старые отваливаются, свежие остаются', () => {
    const full = Array.from({ length: HISTORY_CAP }, (_, i) => `q${i}`)
    const next = pushHistory(full, 'new')
    expect(next).toHaveLength(HISTORY_CAP)
    expect(next[0]).toBe('q1')
    expect(next[next.length - 1]).toBe('new')
  })
})

describe('serialize/deserialize', () => {
  it('roundtrip', () => {
    expect(deserializeHistory(serializeHistory(['a', 'b']))).toEqual(['a', 'b'])
  })
  it('null/битый JSON/не-массив/смешанный массив → []', () => {
    expect(deserializeHistory(null)).toEqual([])
    expect(deserializeHistory('{oops')).toEqual([])
    expect(deserializeHistory('"str"')).toEqual([])
    expect(deserializeHistory('[1, "a"]')).toEqual([])
  })
})
