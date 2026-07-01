import { PAGE_SIZES } from '../core/resultQuery'

export function ResultPager({
  total, page, pageSize, onPage, onPageSize,
}: {
  total: number; page: number; pageSize: number
  onPage: (p: number) => void; onPageSize: (n: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const clampP = (p: number) => Math.min(pages, Math.max(1, p))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <div className="grid-pager">
      <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} title="строк на странице">
        {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}/стр</option>)}
      </select>
      <span className="pager-range">{from}–{to} из {total}</span>
      <span className="pager-nav">
        <button disabled={page <= 1} onClick={() => onPage(1)} title="первая">⇤</button>
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} title="назад">←</button>
        <span>стр.{' '}
          <input className="pager-jump" type="number" min={1} max={pages} defaultValue={page}
            key={page}
            onKeyDown={(e) => { if (e.key === 'Enter') onPage(clampP(Number((e.target as HTMLInputElement).value))) }}
          /> из {pages}
        </span>
        <button disabled={page >= pages} onClick={() => onPage(page + 1)} title="вперёд">→</button>
        <button disabled={page >= pages} onClick={() => onPage(pages)} title="последняя">⇥</button>
      </span>
      <span className="pager-row">к строке{' '}
        <input className="pager-jump" type="number" min={1} max={total}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            const r = Math.min(total, Math.max(1, Number((e.target as HTMLInputElement).value)))
            onPage(Math.ceil(r / pageSize))
          }}
        />
      </span>
    </div>
  )
}
