import { Marked } from 'marked'

// For element TEXT content / <pre> only — every call site is text, never an
// attribute, so not escaping single quotes is intentional and safe.
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Аллоу-лист URL-схем для ссылок/картинок. Всё остальное (javascript:, data:,
// vbscript: …) → '#'. Контрол-символы и пробелы удаляются ПЕРЕД проверкой схемы:
// браузер игнорирует их в URL, поэтому `java\tscript:` иначе исполнился бы.
const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel'])
function safeUrl(href: string): string {
  // eslint-disable-next-line no-control-regex -- stripping control chars is the point (tab-bypass guard above)
  const cleaned = href.replace(/[\u0000-\u001f ]/g, '')
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(cleaned)
  if (m && !SAFE_SCHEMES.has(m[1].toLowerCase())) return '#'
  return href
}

// Отдельный инстанс marked: сырой HTML НЕ пропускается, а экранируется, и
// href ссылок/картинок проверяется по аллоу-листу схем (v1: не пускаем свой
// синтаксис ссылок в обход html-рендерера выше — marked сам URL не фильтрует).
// Отчёт — импортируемый формат (открытие .json + localStorage + экспорт .html),
// поэтому текст блоков — недоверенный ввод (XSS, review 2026-07-02).
const md = new Marked({
  renderer: {
    html(token) {
      return escapeHtml(token.text)
    },
    link(token) {
      const href = safeUrl(token.href)
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : ''
      const text = this.parser.parseInline(token.tokens)
      return `<a href="${escapeHtml(href)}"${title}>${text}</a>`
    },
    image(token) {
      const href = safeUrl(token.href)
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : ''
      return `<img src="${escapeHtml(href)}" alt="${escapeHtml(token.text)}"${title}>`
    },
  },
})

/** Markdown -> HTML; сырой HTML внутри markdown экранирован. */
export function renderMarkdown(markdown: string): string {
  return md.parse(markdown, { async: false }) as string
}
