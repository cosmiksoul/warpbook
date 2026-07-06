import { useEffect, useMemo, useState } from 'react'
import type { WidgetBlock } from '../core/report'
import type { DuckDBClient } from '../db/duckdbClient'
import { arrowToRows, type QueryResult } from '../core/arrowToRows'
import { buildChartSpec } from '../core/chartSpec'
import { buildCountSql, buildWindowSql, CHART_CAP, DEFAULT_VIEW } from '../core/resultQuery'
import { useSession } from '../state/session'
import { buildSqlSchema } from '../core/sqlSchema'
import { extractDatasetNames } from '../core/cellSql'
import { buildResultTempDDL, isInternalTable, resultTempName } from '../core/sql'
import { SqlEditor } from './SqlEditor'
import { ResultGrid } from './ResultGrid'
import { ResultPager } from './ResultPager'
import { Chart } from './Chart'

interface Props {
  block: WidgetBlock
  client: DuckDBClient
}

type WidgetState =
  | { kind: 'idle' } // пустой sql — ячейка ждёт первый запрос
  | { kind: 'loading' }
  | { kind: 'ok'; rowCount: number } // строки живут в снапшоте DuckDB, не здесь
  | { kind: 'error'; message: string }

export function WidgetBlockView({ block, client }: Props) {
  const setWidgetVizType = useSession((s) => s.setWidgetVizType)
  const updateWidgetCaption = useSession((s) => s.updateWidgetCaption)
  const updateWidgetTitle = useSession((s) => s.updateWidgetTitle)
  const moveBlock = useSession((s) => s.moveBlock)
  const removeBlock = useSession((s) => s.removeBlock)

  // datasets is a separate store slice, so the rerun effect must ALSO depend on
  // the loaded subset of this widget's sources. Otherwise, after a reload the
  // re-dropped source (addDataset) wouldn't retrigger the query and the widget
  // would stay stuck on its missing-table error (the headline rehydration flow).
  const loadedKey = useSession((s) =>
    s.datasets
      .filter((d) => block.datasetNames.includes(d.table))
      .map((d) => `${d.table}:${d.gen ?? 0}`) // gen: re-apply схемы перезапускает ячейку
      .sort()
      .join('|'),
  )

  const updateWidgetSql = useSession((s) => s.updateWidgetSql)
  const runAllSeq = useSession((s) => s.runAllSeq)
  const datasets = useSession((s) => s.datasets)
  const schema = useMemo(() => buildSqlSchema(datasets), [datasets])

  const [state, setState] = useState<WidgetState>(
    block.sql.trim() === '' ? { kind: 'idle' } : { kind: 'loading' },
  )
  // Редактор раскрыт сразу у свежей пустой ячейки («+ запрос»).
  const [sqlOpen, setSqlOpen] = useState(block.sql === '')
  // Черновик SQL — runtime-only (спека): живёт, пока блок смонтирован.
  const [draft, setDraft] = useState(block.sql)
  const [runSeq, setRunSeq] = useState(0)
  const dirty = draft !== block.sql

  // M8-механика в ячейке: результат материализован в _qb_result_<blockId>,
  // в JS живёт ОДНА страница окна. matSeq будит window-эффект на свежий снапшот.
  const [pageData, setPageData] = useState<QueryResult | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [matSeq, setMatSeq] = useState(0)
  const [chartData, setChartData] = useState<QueryResult | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(block.title)

  // После commitDraft block.sql === draft (no-op). Внешняя загрузка отчёта с
  // совпадающими id обновляет незакоммиченный черновик — принято (runtime-only).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setDraft(block.sql) }, [block.sql])

  // Lazy rerun: SQL ячейки материализуется в снапшот _qb_result_<blockId>
  // (та же M8-механика, что у explore-табов) + count(*). Строки НЕ тянутся в
  // JS целиком — страницы забирает отдельный window-эффект ниже. Результат
  // никогда не сериализуется (spec decision 4).
  useEffect(() => {
    if (block.sql.trim() === '') {
      setState({ kind: 'idle' }) // eslint-disable-line react-hooks/set-state-in-effect
      setPageData(null)
      setChartData(null)
      return
    }
    let cancelled = false
    setState({ kind: 'loading' })
    setChartData(null) // новый снапшот -> график перечитается лениво
    ;(async () => {
      await client.exec(buildResultTempDDL(block.id, block.sql))
      const cnt = arrowToRows(
        await client.query(buildCountSql(resultTempName(block.id), [], DEFAULT_VIEW)),
      )
      if (cancelled) return
      setPage(1)
      setState({ kind: 'ok', rowCount: Number(cnt.rows[0]?.n ?? 0) })
      setMatSeq((n) => n + 1) // будит window-эффект (page=1 мог не измениться)
    })().catch((e) => {
      if (!cancelled) setState({ kind: 'error', message: String(e) })
    })
    return () => {
      cancelled = true
    }
  }, [block.sql, block.id, client, loadedKey, runSeq, runAllSeq])

  // Окно страницы поверх снапшота: листание и новый снапшот (matSeq).
  useEffect(() => {
    if (state.kind !== 'ok') return
    let cancelled = false
    const view = { ...DEFAULT_VIEW, page, pageSize }
    client
      .query(buildWindowSql(resultTempName(block.id), [], view))
      .then((t) => {
        if (!cancelled) setPageData(arrowToRows(t))
      })
      .catch(() => {
        // снапшот пересоздаётся под ногами — свежий matSeq перезапросит окно
      })
    return () => {
      cancelled = true
    }
  }, [state.kind, page, pageSize, matSeq, block.id, client])

  // График рисуется по снапшоту с капом CHART_CAP (как chartSrc в explore),
  // тянется лениво — только когда выбран вид «график».
  useEffect(() => {
    if (state.kind !== 'ok' || block.vizType !== 'chart' || chartData !== null) return
    let cancelled = false
    client
      .query(
        buildWindowSql(resultTempName(block.id), [], { ...DEFAULT_VIEW, page: 1, pageSize: CHART_CAP }),
      )
      .then((t) => {
        if (!cancelled) setChartData(arrowToRows(t))
      })
      .catch(() => {
        // снапшот в перестройке — после matSeq chartData снова null и заход повторится
      })
    return () => {
      cancelled = true
    }
  }, [state.kind, block.vizType, chartData, block.id, client])

  function commitDraft(sqlText = draft) {
    if (sqlText.trim() === '') return
    if (sqlText === block.sql) {
      setRunSeq((n) => n + 1) // без правки — просто пересчитать
      return
    }
    const known = datasets.filter((d) => !isInternalTable(d.table)).map((d) => d.table)
    updateWidgetSql(block.id, sqlText, extractDatasetNames(sqlText, known))
  }

  const error = state.kind === 'error' ? state.message : null
  const loading = state.kind === 'loading'
  const ok = state.kind === 'ok'
  const rowCount = state.kind === 'ok' ? state.rowCount : 0

  // spec — по странице окна (типы/temporal-детект по образцу строки);
  // рисуем же график по chartData (до CHART_CAP строк из снапшота).
  const spec = pageData ? buildChartSpec(pageData.columns, pageData.rows[0]) : null
  const showChart = block.vizType === 'chart' && spec != null && ok

  return (
    <div className="widget-block">
      <div className="widget-head">
        {editingTitle ? (
          <input
            className="widget-title-edit"
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => {
              const next = titleDraft.trim()
              if (next && next !== block.title) updateWidgetTitle(block.id, next)
              setEditingTitle(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              else if (e.key === 'Escape') { setTitleDraft(block.title); setEditingTitle(false) }
            }}
          />
        ) : (
          <span
            className="widget-title"
            title="кликни, чтобы переименовать"
            onClick={(e) => { e.stopPropagation(); setTitleDraft(block.title); setEditingTitle(true) }}
          >
            {block.title}
          </span>
        )}
        {loading && <span className="cell-chip">…</span>}
        {error !== null && <span className="cell-chip err">ошибка</span>}
        {dirty && <span className="cell-chip dirty">правка не выполнена</span>}
        <span className="widget-datasets">
          {block.datasetNames.map((t) => (
            <span className="ds-pill" key={t}>
              {t}
            </span>
          ))}
        </span>
        <button
          className="widget-sql-toggle"
          onClick={() => setSqlOpen((v) => !v)}
          title="показать/скрыть SQL"
        >
          SQL {sqlOpen ? '▾' : '▸'}
        </button>
        <span className="widget-controls">
          <button onClick={() => moveBlock(block.id, 'up')} title="вверх">
            ↑
          </button>
          <button onClick={() => moveBlock(block.id, 'down')} title="вниз">
            ↓
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              removeBlock(block.id)
            }}
            title="удалить"
          >
            ✕
          </button>
        </span>
      </div>

      {sqlOpen && (
        <div className="cell-editor">
          <SqlEditor
            compact
            value={draft}
            onChange={setDraft}
            onRun={(sql) => commitDraft(sql)}
            schema={schema}
          />
          <div className="cell-actions">
            <button className="cell-run" disabled={draft.trim() === ''} onClick={() => commitDraft()}>
              ▸ выполнить
            </button>
            <button
              className="cell-rerun"
              title="пере-исполнить сохранённый SQL"
              disabled={block.sql.trim() === ''}
              onClick={() => setRunSeq((n) => n + 1)}
            >
              ⟳
            </button>
            {dirty && (
              <button className="cell-cancel" onClick={() => setDraft(block.sql)}>
                отменить
              </button>
            )}
          </div>
        </div>
      )}

      <div className="view-toggle widget-view-toggle">
        <button
          className={block.vizType === 'table' ? 'on' : ''}
          onClick={() => setWidgetVizType(block.id, 'table')}
        >
          таблица
        </button>
        <button
          className={block.vizType === 'chart' ? 'on' : ''}
          disabled={!spec}
          title={spec ? '' : 'нет числовой колонки для графика'}
          onClick={() => setWidgetVizType(block.id, 'chart')}
        >
          график
        </button>
      </div>

      {error && (
        <div className="widget-error">
          <pre className="result-error">{error}</pre>
          {block.datasetNames.length > 0 && (
            <p className="widget-sources-hint">
              источник(и): {block.datasetNames.join(', ')} — подгрузи, если
              отсутствуют
            </p>
          )}
        </div>
      )}
      {state.kind === 'idle' && (
        <p className="result-empty">напиши запрос и нажми ▸ выполнить</p>
      )}
      {!error && loading && <p className="result-empty">пересчитываю…</p>}
      {!error && !loading && showChart && (
        chartData ? (
          <Chart spec={spec!} rows={chartData.rows} />
        ) : (
          <p className="result-empty">строю график…</p>
        )
      )}
      {!error && !loading && ok && block.vizType === 'table' && pageData && (
        <>
          <ResultGrid
            result={pageData}
            rowOffset={(page - 1) * pageSize}
            sorts={[]}
            onToggleSort={() => {}}
            onOpenFilter={() => {}}
          />
          <ResultPager
            total={rowCount}
            page={page}
            pageSize={pageSize}
            onPage={setPage}
            onPageSize={(n) => {
              setPageSize(n)
              setPage(1)
            }}
          />
        </>
      )}
      {/*
        Do NOT delete as "dead": this branch fires only for a loaded/rehydrated
        widget whose SAVED vizType is 'chart' but whose recomputed result has no
        numeric column. The chart toggle is disabled={!spec}, so a user can never
        reach vizType==='chart' && !spec by clicking — only a JSON open / reload
        produces it. (Spec line 71: chart toggle disabled when no numeric col.)
      */}
      {!error && !loading && ok && block.vizType === 'chart' && pageData && !spec && (
        <p className="result-empty">нет числовой колонки для графика</p>
      )}

      <input
        className="widget-caption"
        placeholder="подпись…"
        value={block.caption}
        onChange={(e) => updateWidgetCaption(block.id, e.target.value)}
      />
    </div>
  )
}
