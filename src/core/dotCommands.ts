import type { Dataset } from '../state/session'
import type { QueryResult } from './arrowToRows'
import { isInternalTable } from './sql'

export type DotCommand =
  | { kind: 'tables' }
  | { kind: 'schema'; table: string }
  | { kind: 'help' }
  | { kind: 'unknown'; raw: string }

/**
 * Распознать dot-команду (в духе DuckDB CLI). null — это не команда, а SQL:
 * первый непробельный символ не «.», либо ввод многострочный. Неизвестная/
 * кривая точка-команда → unknown (исполнитель покажет подсказку про .help).
 */
export function parseDotCommand(input: string): DotCommand | null {
  const s = input.trim()
  if (!s.startsWith('.')) return null
  if (/[\r\n]/.test(s)) return null
  const m = /^\.(\S*)(?:\s+(.*))?$/.exec(s)
  if (!m) return null
  const cmd = (m[1] ?? '').toLowerCase()
  const arg = (m[2] ?? '').trim()
  if (cmd === 'tables' && arg === '') return { kind: 'tables' }
  if (cmd === 'help' && arg === '') return { kind: 'help' }
  if (cmd === 'schema' && arg !== '' && !/\s/.test(arg)) return { kind: 'schema', table: arg }
  return { kind: 'unknown', raw: s }
}

/** Псевдо-результат под raw-путь панели (все колонки — VARCHAR-условно). */
function pseudo(names: string[], rows: Record<string, unknown>[]): QueryResult {
  return { columns: names.map((name) => ({ name, type: 'VARCHAR' })), rows, numRows: rows.length }
}

export function tablesRows(datasets: Dataset[]): QueryResult {
  const rows = datasets
    .filter((d) => !isInternalTable(d.table))
    .map((d) => ({ name: d.table, kind: d.kind, columns: d.columns.length }))
  return pseudo(['name', 'kind', 'columns'], rows)
}

export function schemaRows(d: Dataset): QueryResult {
  return pseudo(['column', 'type'], d.columns.map((c) => ({ column: c.name, type: c.type })))
}

export function helpRows(): QueryResult {
  return pseudo(['command', 'description'], [
    { command: '.tables', description: 'список таблиц (источники и витрины)' },
    { command: '.schema <таблица>', description: 'колонки и типы таблицы' },
    { command: '.help', description: 'эта справка' },
    { command: '↑ / ↓', description: 'история запросов (курсор на первой/последней строке)' },
  ])
}

export type DotOutcome = { ok: true; result: QueryResult } | { ok: false; error: string }

/** Исполнить dot-команду по данным стора — движок не участвует. */
export function runDotCommand(cmd: DotCommand, datasets: Dataset[]): DotOutcome {
  switch (cmd.kind) {
    case 'tables':
      return { ok: true, result: tablesRows(datasets) }
    case 'help':
      return { ok: true, result: helpRows() }
    case 'schema': {
      const d = datasets.find(
        (x) => !isInternalTable(x.table) && x.table.toLowerCase() === cmd.table.toLowerCase(),
      )
      return d
        ? { ok: true, result: schemaRows(d) }
        : { ok: false, error: `нет таблицы ${cmd.table} — см. .tables` }
    }
    case 'unknown':
      return { ok: false, error: `неизвестная команда «${cmd.raw}» — попробуй .help` }
  }
}
