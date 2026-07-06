/**
 * Имена известных таблиц, читаемых запросом: идентификаторы сразу после
 * FROM/JOIN (+ перечисление через запятую после FROM), регистронезависимо,
 * по возрастанию. Строковые литералы и комментарии вычищаются: 'from users'
 * в литерале не даёт ложный источник, таблица-тёзка колонки (id) не
 * матчится вне FROM/JOIN. Подзапрос `FROM (…)` идентификатора не даёт.
 */
export function extractDatasetNames(sql: string, known: string[]): string[] {
  // Один проход альтернацией — что раньше начинается в строке, то и матчится.
  // Чистка литералов ДО комментариев отдельными проходами ловилась на
  // апострофе внутри `-- don't`: он спаривался с кавычкой следующего
  // реального литерала и заглатывал SQL между ними.
  const cleaned = sql
    .replace(/'(?:[^']|'')*'|--[^\n]*|\/\*[\s\S]*?\*\//g, ' ')
    .toLowerCase()
  const tokens = cleaned.match(/"[^"]*"|[a-z_][a-z0-9_]*|[(),]/g) ?? []
  const ident = (t: string | undefined): string | null => {
    if (!t) return null
    if (t.startsWith('"')) return t.slice(1, -1)
    return /^[a-z_][a-z0-9_]*$/.test(t) ? t : null
  }
  const found = new Set<string>()
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== 'from' && tokens[i] !== 'join') continue
    let j = i + 1
    for (;;) {
      const name = ident(tokens[j])
      if (!name) break // подзапрос `(`/конец — перечисление не продолжаем
      found.add(name)
      // FROM a x, b y: пропускаем алиасы до запятой; JOIN дальше словит внешний цикл
      let k = j + 1
      while (ident(tokens[k])) k++
      if (tokens[k] !== ',') break
      j = k + 1
    }
  }
  return known.filter((t) => found.has(t.toLowerCase())).sort()
}
