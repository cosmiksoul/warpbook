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
  it('таблица-тёзка колонки не матчится вне FROM/JOIN', () => {
    expect(extractDatasetNames('SELECT id FROM orders', ['id', 'orders'])).toEqual(['orders'])
  })
  it('строковый литерал и комментарии не дают ложный источник', () => {
    expect(
      extractDatasetNames("SELECT 'from users' AS s FROM t -- join ghosts", ['users', 'ghosts', 't']),
    ).toEqual(['t'])
  })
  it('FROM-перечисление, JOIN и кавычки идентификаторов', () => {
    expect(extractDatasetNames('SELECT * FROM "a", b JOIN c ON 1=1', ['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
  })
  it('подзапрос в FROM не ломает разбор', () => {
    expect(extractDatasetNames('SELECT * FROM (SELECT x, y FROM inner_t) q', ['inner_t', 'q', 'x'])).toEqual(['inner_t'])
  })
  it('апостроф в комментарии не заглатывает SQL до следующего литерала', () => {
    expect(extractDatasetNames("SELECT * FROM t -- don't\nJOIN users ON 1=1 WHERE x = 'bob'", ['t', 'users'])).toEqual(['t', 'users'])
  })
})
