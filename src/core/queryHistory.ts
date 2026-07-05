export const HISTORY_CAP = 200
export const HISTORY_KEY = 'quackbook.sqlHistory'

/** Пуш в историю: trim, скип пустых, дедуп подряд идущих, кап HISTORY_CAP.
 *  Если пушить нечего — возвращает ИСХОДНЫЙ массив (референс-равенство
 *  используется стором как признак no-op). */
export function pushHistory(list: string[], sql: string): string[] {
  const s = sql.trim()
  if (s === '') return list
  if (list[list.length - 1] === s) return list
  const next = [...list, s]
  return next.length > HISTORY_CAP ? next.slice(next.length - HISTORY_CAP) : next
}

export function serializeHistory(list: string[]): string {
  return JSON.stringify(list)
}

/** localStorage → string[]; всё битое/чужое → []. */
export function deserializeHistory(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')
      ? (parsed as string[])
      : []
  } catch {
    return []
  }
}
