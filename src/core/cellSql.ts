/**
 * Известные таблицы, упомянутые в SQL как целые идентификаторы-слова
 * (регистронезависимо), отсортированные по возрастанию. Строки/комментарии
 * сознательно не вычищаются: имя таблицы в строковом литерале даст ложный
 * плюс — приемлемо, это только хинт рехидрации отчёта (спека M7b).
 */
export function extractDatasetNames(sql: string, known: string[]): string[] {
  const words = new Set(sql.toLowerCase().match(/[a-z_][a-z0-9_]*/g) ?? [])
  return known.filter((t) => words.has(t.toLowerCase())).sort()
}
