import { describe, expect, it } from 'vitest'
import { detectUsedColumns } from './pruning'

const cols = ['user_id', 'country', 'zip', 'signup', 'revenue']

describe('detectUsedColumns', () => {
  it('SELECT * uses all columns', () => {
    expect(detectUsedColumns('SELECT * FROM events', cols).sort()).toEqual(
      [...cols].sort(),
    )
  })
  it('qualified star (t.*) uses all columns', () => {
    expect(
      detectUsedColumns('SELECT e.* FROM events e', cols).sort(),
    ).toEqual([...cols].sort())
  })
  it('count(*) does NOT count as all-columns', () => {
    expect(
      detectUsedColumns(
        'SELECT country, count(*) AS n FROM events GROUP BY 1 ORDER BY n DESC',
        cols,
      ),
    ).toEqual(['country'])
  })
  it('matches qualified and unqualified column tokens', () => {
    expect(
      detectUsedColumns(
        'SELECT e.user_id, revenue FROM events e',
        cols,
      ).sort(),
    ).toEqual(['revenue', 'user_id'])
  })
  it('ignores unknown identifiers', () => {
    expect(detectUsedColumns('SELECT total FROM orders', cols)).toEqual([])
  })
  it('is case-insensitive', () => {
    expect(detectUsedColumns('select COUNTRY from events', cols)).toEqual([
      'country',
    ])
  })
})
