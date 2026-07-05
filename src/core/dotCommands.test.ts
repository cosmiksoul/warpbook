import { describe, it, expect } from 'vitest'
import { parseDotCommand, runDotCommand, tablesRows, schemaRows, helpRows } from './dotCommands'
import type { Dataset } from '../state/session'

const ds = (table: string, kind: Dataset['kind'] = 'csv'): Dataset => ({
  table, fileName: `${table}.csv`, bytes: 1, kind,
  columns: [{ name: 'a', type: 'VARCHAR' }, { name: 'b', type: 'BIGINT' }],
})

describe('parseDotCommand', () => {
  it('не dot-команда → null', () => {
    expect(parseDotCommand('SELECT 1')).toBeNull()
    expect(parseDotCommand('  SELECT .5')).toBeNull()
  })
  it('многострочный ввод → null (это SQL, не команда)', () => {
    expect(parseDotCommand('.tables\nSELECT 1')).toBeNull()
  })
  it('.tables / .help без аргументов, регистронезависимо', () => {
    expect(parseDotCommand(' .tables ')).toEqual({ kind: 'tables' })
    expect(parseDotCommand('.HELP')).toEqual({ kind: 'help' })
  })
  it('.schema с одним аргументом', () => {
    expect(parseDotCommand('.schema demo_users')).toEqual({ kind: 'schema', table: 'demo_users' })
  })
  it('.schema без аргумента / с двумя, .tables с аргументом, мусор → unknown', () => {
    expect(parseDotCommand('.schema')).toMatchObject({ kind: 'unknown' })
    expect(parseDotCommand('.schema a b')).toMatchObject({ kind: 'unknown' })
    expect(parseDotCommand('.tables x')).toMatchObject({ kind: 'unknown' })
    expect(parseDotCommand('.wat')).toMatchObject({ kind: 'unknown' })
  })
})

describe('билдеры', () => {
  it('tablesRows: name/kind/columns, _qb_* скрыты', () => {
    const r = tablesRows([ds('demo_users'), ds('_qb_raw_x'), ds('mart1', 'view')])
    expect(r.columns.map((c) => c.name)).toEqual(['name', 'kind', 'columns'])
    expect(r.rows.map((x) => x.name)).toEqual(['demo_users', 'mart1'])
    expect(r.rows[0]).toEqual({ name: 'demo_users', kind: 'csv', columns: 2 })
    expect(r.numRows).toBe(2)
  })
  it('schemaRows: column/type', () => {
    const r = schemaRows(ds('t'))
    expect(r.rows).toEqual([
      { column: 'a', type: 'VARCHAR' },
      { column: 'b', type: 'BIGINT' },
    ])
  })
  it('helpRows: есть все три команды', () => {
    const cmds = helpRows().rows.map((r) => r.command)
    expect(cmds).toEqual(expect.arrayContaining(['.tables', '.schema <таблица>', '.help']))
  })
})

describe('runDotCommand', () => {
  it('schema находит таблицу регистронезависимо', () => {
    const out = runDotCommand({ kind: 'schema', table: 'DEMO_USERS' }, [ds('demo_users')])
    expect(out.ok).toBe(true)
  })
  it('schema по отсутствующей таблице → ошибка с подсказкой', () => {
    const out = runDotCommand({ kind: 'schema', table: 'nope' }, [ds('demo_users')])
    expect(out).toEqual({ ok: false, error: 'нет таблицы nope — см. .tables' })
  })
  it('unknown → ошибка с .help', () => {
    const out = runDotCommand({ kind: 'unknown', raw: '.wat' }, [])
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toContain('.help')
  })
})
