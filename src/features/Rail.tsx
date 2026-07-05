import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { useSession, type Dataset } from '../state/session'
import { detectReferencedTables, detectUsedColumns } from '../core/pruning'
import { buildDropDatasetStatements } from '../core/resetPlan'
import { isInternalTable } from '../core/sql'
import type { DuckDBClient } from '../db/duckdbClient'
import { SchemaColumnEditor } from '../components/SchemaColumnEditor'
import { CsvDropzone } from '../components/CsvDropzone'
import { SamplesModal } from '../components/SamplesModal'
import { useSchemaActions } from './useSchemaActions'
import { useProfileActions } from './useProfileActions'
import { useMartActions } from './useMartActions'
import { Icon } from '../components/Icon'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}K`
  return `${(n / (1024 * 1024)).toFixed(1)}M`
}

const RAIL_MIN = 200
const RAIL_MAX = 520
const RAIL_DEFAULT = 260

export function Rail({
  client,
  onFiles,
}: {
  client: DuckDBClient
  onFiles: (files: File[]) => void
}) {
  const allDatasets = useSession((s) => s.datasets)
  const datasets = allDatasets.filter((d) => !isInternalTable(d.table))
  const isMart = (d: Dataset): boolean => d.kind === 'view' || d.kind === 'table'
  const sources = datasets.filter((d) => !isMart(d))
  const marts = datasets.filter(isMart)
  const { refreshMart, dropMart } = useMartActions(client)
  const tabs = useSession((s) => s.tabs)
  const activeTabId = useSession((s) => s.activeTabId)
  const openOrFocusTab = useSession((s) => s.openOrFocusTab)
  const { applyInferred, apply } = useSchemaActions(client)
  const setExploreView = useSession((s) => s.setExploreView)
  const setProfileTarget = useSession((s) => s.setProfileTarget)
  const { profile } = useProfileActions(client)
  const stageColumn = useSession((s) => s.stageColumn)
  const resetColumn = useSession((s) => s.resetColumn)
  const setColumnConfig = useSession((s) => s.setColumnConfig)
  const [editing, setEditing] = useState<{ table: string; origName: string } | null>(null)
  const [samplesOpen, setSamplesOpen] = useState(false)

  // Драг-ширина рейла (session-local, как высота SQL-редактора). Хэндл — флекс-сосед
  // <aside>, не потомок: внутри overflow:auto он уезжал бы вместе со скроллом.
  const [railW, setRailW] = useState(RAIL_DEFAULT)
  function startResize(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault()
    const bar = e.currentTarget
    const startX = e.clientX
    const startW = railW
    bar.setPointerCapture(e.pointerId)
    const onMove = (ev: PointerEvent) =>
      setRailW(Math.min(RAIL_MAX, Math.max(RAIL_MIN, startW + (ev.clientX - startX))))
    const onUp = () => {
      bar.releasePointerCapture(e.pointerId)
      bar.removeEventListener('pointermove', onMove)
      bar.removeEventListener('pointerup', onUp)
    }
    bar.addEventListener('pointermove', onMove)
    bar.addEventListener('pointerup', onUp)
  }

  const mode = useSession((s) => s.mode)
  const report = useSession((s) => s.report)
  const activeBlockId = useSession((s) => s.activeBlockId)

  // Зеркало dropMart: идемпотентные DROP-ы (IF EXISTS), из стора убираем
  // в любом случае. Для csv уходит и immutable raw-таблица.
  async function removeSource(d: Dataset) {
    for (const sql of buildDropDatasetStatements(d)) {
      try {
        await client.exec(sql)
      } catch {
        // объекта может уже не быть — не мешаем удалению из стора
      }
    }
    useSession.getState().removeDataset(d.table)
  }

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null

  // The rail follows the ACTIVE QUERY. In report mode that's the active widget
  // block's sql (click a widget -> rail shows its schema/highlights); in explore
  // mode it's the active tab's sql. Both feed the same detect* machinery.
  const activeWidget =
    mode === 'report'
      ? report.blocks.find(
          (b) => b.id === activeBlockId && b.type === 'widget',
        )
      : undefined
  const currentSql =
    mode === 'report'
      ? (activeWidget && activeWidget.type === 'widget' ? activeWidget.sql : null)
      : (activeTab?.sql ?? null)
  const fallbackTable = activeTab?.datasetTable ?? sources[0]?.table

  // Before a table is named (blank/empty tab, or no active widget) fall back to
  // the tab's own dataset, else the first source, so the rail isn't empty.
  const referenced = currentSql
    ? detectReferencedTables(
        currentSql,
        sources.map((d) => d.table),
      )
    : []
  const shownTables =
    referenced.length > 0
      ? referenced
      : [fallbackTable].filter((t): t is string => t != null)
  const shownDatasets = shownTables
    .map((t) => datasets.find((d) => d.table === t))
    .filter((d): d is Dataset => d != null)
  const shown = new Set(shownDatasets.map((d) => d.table))

  return (
    <>
      <aside className="rail" style={{ '--rail-w': `${railW}px` } as CSSProperties}>
        <CsvDropzone onFiles={onFiles} />
        <button className="rail-samples" onClick={() => setSamplesOpen(true)}>▸ сэмплы</button>
      <div className="rail-section-label">Источники</div>
      <ul className="sources">
        {sources.map((d) => (
          <li className={shown.has(d.table) ? 'source-row active' : 'source-row'} key={d.table}>
            <button className="source" onClick={() => openOrFocusTab(d.table)}>
              <span className="source-kind">{d.kind === 'csv' ? 'csv' : 'pq'}</span>
              <span className="source-name">{d.fileName}</span>
              <span className="source-size">{formatBytes(d.bytes)}</span>
            </button>
            <button
              className="source-del"
              title={`удалить источник ${d.fileName}`}
              onClick={() => void removeSource(d)}
            >
              ×
            </button>
          </li>
        ))}
        {sources.length === 0 && (
          <li className="sources-empty">Брось CSV / Parquet</li>
        )}
      </ul>

      {marts.length > 0 && (
        <>
          <div className="rail-section-label">Витрины</div>
          <ul className="sources marts">
            {marts.map((m) => (
              <li className="mart-row" key={m.table}>
                <div className="mart-head">
                  <span className="source-kind">{m.kind}</span>
                  <span className="source-name">{m.table}</span>
                  <div className="mart-actions">
                    <button
                      className="mart-act"
                      title="профиль витрины"
                      onClick={() => {
                        setProfileTarget({ kind: 'source', table: m.table })
                        setExploreView('profile')
                        void profile(m.table)
                      }}
                    >
                      <Icon name="profile" />
                    </button>
                    {m.kind === 'table' && (
                      <button className="mart-act" title="обновить снапшот" onClick={() => void refreshMart(m.table)}>↻</button>
                    )}
                    <button className="mart-act mart-del" title="удалить витрину" onClick={() => void dropMart(m.table)}>×</button>
                  </div>
                </div>
                <ul className="mart-cols">
                  {m.columns.map((c) => (
                    <li className="mart-col" key={c.name}>
                      <span className="col-name">{c.name}</span>
                      <span className="col-type">{c.type === 'VARCHAR' ? 'STRING' : c.type}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}

      {shownDatasets.map((ds) => {
        const used = new Set(
          currentSql
            ? detectUsedColumns(
                currentSql,
                ds.columns.map((c) => c.name),
              )
            : [],
        )
        const canType = ds.kind === 'csv' && (ds.suggested?.length ?? 0) > 0
        const isCsv = ds.kind === 'csv' && (ds.schemaConfig?.length ?? 0) > 0
        return (
          <div className="schema-block" key={ds.table}>
            <div className="rail-section-label schema-head">
              <span className="schema-title">
                <span>Схема ·</span>
                <span className="schema-file" title={ds.fileName}>
                  {ds.fileName}
                </span>
                <span className="schema-count">
                  {used.size}/{ds.columns.length}
                </span>
              </span>
              <span className="schema-actions">
                {isCsv && (
                  <button
                    className="schema-btn"
                    onClick={() => {
                      const base = (ds.schemaConfig ?? []).map((c) => ({
                        origName: c.origName,
                        name: c.origName,
                        type: 'VARCHAR' as const,
                        include: true,
                      }))
                      setColumnConfig(ds.table, base)
                      void apply(ds.table)
                    }}
                    title="сбросить схему к исходным VARCHAR-типам"
                  >
                    сброс
                  </button>
                )}
                {canType && (
                  <button
                    className="schema-btn"
                    onClick={() => void applyInferred(ds.table)}
                    title="типизировать все колонки по инференсу одним кликом"
                  >
                    <Icon name="types" /> типы
                  </button>
                )}
              </span>
            </div>
            {ds.schemaError && (
              <div className="schema-error" role="alert">
                {ds.schemaError}
              </div>
            )}
            <ul className="schema">
              {(() => {
                const includedCount =
                  ds.schemaConfig?.filter((c) => c.include).length ?? 0
                return ds.columns.map((c) => {
                  const cfg = ds.schemaConfig?.find((x) => x.origName === c.name)
                  const open =
                    editing?.table === ds.table && editing?.origName === c.name
                  // Allow un-including only when >1 column is currently included.
                  const canDisableInclude = includedCount > 1
                  return (
                    <li
                      className={used.has(c.name) ? 'schema-col used' : 'schema-col'}
                      key={c.name}
                    >
                      <span className="col-name">{c.name}</span>
                      <span className="col-meta">
                        <span className="col-type">{c.type === 'VARCHAR' ? 'STRING' : c.type}</span>
                        {c.nullLoss != null && c.nullLoss > 0 && (
                          <span className="col-warn" title={`${c.nullLoss} → NULL`}>
                            ⚠ {c.nullLoss}
                          </span>
                        )}
                        {cfg && (
                          <button
                            className="col-edit"
                            aria-label={`правка ${c.name}`}
                            onClick={() =>
                              setEditing(
                                open ? null : { table: ds.table, origName: c.name },
                              )
                            }
                          >
                            ✎
                          </button>
                        )}
                      </span>
                      {open && cfg && (
                        <SchemaColumnEditor
                          config={cfg}
                          canDisableInclude={canDisableInclude}
                          onStage={(next) => {
                            stageColumn(ds.table, next)
                            void apply(ds.table)
                          }}
                          onReset={(orig) => {
                            resetColumn(ds.table, orig)
                            void apply(ds.table)
                            setEditing(null)
                          }}
                          onClose={() => setEditing(null)}
                        />
                      )}
                    </li>
                  )
                })
              })()}
            </ul>
            <button
              className="profbtn"
              onClick={() => {
                setProfileTarget({ kind: 'source', table: ds.table })
                setExploreView('profile')
                void profile(ds.table)
              }}
              title="посмотреть распределения колонок источника"
            >
              <Icon name="profile" /> профиль источника
            </button>
          </div>
        )
      })}
      {shownDatasets.length > 0 && (
        <p className="rail-note">▸ подсвечены колонки, которые читает запрос</p>
      )}
      </aside>
      <div
        className="rail-resize"
        onPointerDown={startResize}
        onDoubleClick={() => setRailW(RAIL_DEFAULT)}
        title="тяни, чтобы менять ширину; двойной клик — сброс"
      />
      {samplesOpen && <SamplesModal client={client} onClose={() => setSamplesOpen(false)} />}
    </>
  )
}
