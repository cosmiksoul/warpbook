import { describe, it, expect } from 'vitest'
import { extractDatasetNames } from './cellSql'

describe('extractDatasetNames', () => {
  it('находит известную таблицу', () => {
    expect(extractDatasetNames('SELECT * FROM demo_users', ['demo_users', 'demo_payments'])).toEqual(['demo_users'])
  })
  it('регистронезависимо (как каталог DuckDB)', () => {
    expect(extractDatasetNames('select * from DEMO_USERS', ['demo_users'])).toEqual(['demo_users'])
  })
  it('подстроки НЕ матчатся', () => {
    expect(extractDatasetNames('SELECT * FROM demo_users_2024', ['demo_users'])).toEqual([])
    expect(extractDatasetNames('SELECT users_x FROM t', ['users'])).toEqual([])
  })
  it('несколько таблиц → sorted-дедуп', () => {
    const sql = 'SELECT * FROM demo_users u JOIN demo_payments p ON u.id=p.id JOIN demo_users d ON 1=1'
    expect(extractDatasetNames(sql, ['demo_users', 'demo_payments', 'demo_taxi'])).toEqual(['demo_payments', 'demo_users'])
  })
  it('квотированное имя "demo_users" тоже матчится', () => {
    expect(extractDatasetNames('SELECT * FROM "demo_users"', ['demo_users'])).toEqual(['demo_users'])
  })
  it('пустой SQL / нет известных → []', () => {
    expect(extractDatasetNames('', ['demo_users'])).toEqual([])
    expect(extractDatasetNames('SELECT 1', [])).toEqual([])
  })
})
