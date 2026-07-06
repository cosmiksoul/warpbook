import { useEffect, useRef } from 'react'

export function AboutModal({ onClose, onOpenSamples }: { onClose: () => void; onOpenSamples: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const box = boxRef.current
    box?.querySelector<HTMLElement>('button, a[href]')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab' || !box) return
      // Трап: Tab с последнего — на первый, Shift+Tab с первого — на последний.
      const items = box.querySelectorAll<HTMLElement>('button, a[href]')
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      opener?.focus() // фокус назад на «?»
    }
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div ref={boxRef} className="modal" role="dialog" aria-modal="true" aria-label="О warpbook" onClick={(e) => e.stopPropagation()}>
        <button className="modal-x" aria-label="закрыть" onClick={onClose}>✕</button>
        <h2>warpbook</h2>
        <p>Браузерный аналитический ноутбук: данные → SQL и профиль значений → нарративный отчёт с экспортом. Без бэкенда.</p>
        <h3>Как устроено</h3>
        <p>DuckDB-WASM в Web Worker (Apache Arrow). Всё исполняется в браузере, статика на GitHub Pages — данные никуда не уходят.</p>
        <h3>Терминал</h3>
        <ul>
          <li><code>.tables</code> — список таблиц, <code>.schema имя</code> — колонки, <code>.help</code> — подсказка;</li>
          <li>история запросов — ↑/↓ на первой/последней строке редактора или кнопки у «запустить».</li>
        </ul>
        <h3>Ограничения v1</h3>
        <ul>
          <li>только локально загруженные файлы (CSV / Parquet);</li>
          <li>перезагрузка страницы очищает данные (без персиста);</li>
          <li>витрины (VIEW / TABLE) живут до перезагрузки — виджет отчёта на витрине после reload попросит источник;</li>
          <li>экспорт самодостаточный: HTML / PDF / CSV / Parquet.</li>
        </ul>
        <h3>Данные демо</h3>
        <p>Из учебника «SQL 101: Рецепты продуктового аналитика» (MIT).</p>
        <p><button className="link-btn" onClick={onOpenSamples}>учебные датасеты (сэмплы) →</button></p>
        <p className="modal-foot">
          MIT ·{' '}
          <a href="https://github.com/cosmiksoul/sql-product-analytics-cookbook" target="_blank" rel="noopener noreferrer">учебник</a>
        </p>
      </div>
    </div>
  )
}
