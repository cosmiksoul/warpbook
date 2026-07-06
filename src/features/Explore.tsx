import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '../state/session'
import type { DuckDBClient } from '../db/duckdbClient'
import { useResultActions } from './useResultActions'
import { SqlEditor, type SqlEditorHistoryCtl } from '../components/SqlEditor'
import { buildSqlSchema } from '../core/sqlSchema'
import { ResultPanel } from '../components/ResultPanel'
import { ProfilePanel } from '../components/ProfilePanel'
import { TabStrip } from '../components/TabStrip'
import { Icon } from '../components/Icon'

export function Explore({ client }: { client: DuckDBClient }) {
  const tabs = useSession((s) => s.tabs)
  const activeTabId = useSession((s) => s.activeTabId)
  const updateTabSql = useSession((s) => s.updateTabSql)
  const exploreView = useSession((s) => s.exploreView)
  const profileTarget = useSession((s) => s.profileTarget)
  const datasets = useSession((s) => s.datasets)
  const history = useSession((s) => s.history)
  const schema = useMemo(() => buildSqlSchema(datasets), [datasets])

  const tab = tabs.find((t) => t.id === activeTabId) ?? null
  const { runQuery, fetchWindow, dropResult } = useResultActions(client)
  const histCtl = useRef<SqlEditorHistoryCtl | null>(null)
  const [histPos, setHistPos] = useState<number | null>(null)

  // Свежий редактор таба стартует вне истории — счётчик тоже.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setHistPos(null) }, [tab?.id])

  async function run(sql: string) {
    if (!tab) return
    await runQuery(tab.id, sql)
  }

  // Refetch по смене view; повторный fetch УЖЕ лежащего окна (первый запуск,
  // переключение таба) пропускаем — runQuery/прошлый fetch его обслужили.
  const view = tab?.view
  const lastFetchKey = useRef(new Map<string, string>())
  useEffect(() => {
    if (!tab || tab.mode !== 'paged') return
    const key = JSON.stringify([view?.page, view?.pageSize, view?.sorts, view?.search, view?.filters])
    const prev = lastFetchKey.current.get(tab.id)
    if (prev === undefined && tab.window != null) {
      lastFetchKey.current.set(tab.id, key) // окно уже есть — только запомнить вид
      return
    }
    if (prev === key && tab.window != null) return
    lastFetchKey.current.set(tab.id, key)
    void fetchWindow(tab.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab?.id, view?.page, view?.pageSize, JSON.stringify(view?.sorts), view?.search, JSON.stringify(view?.filters)])

  // Drop result tables for tabs that were closed.
  const knownTabs = useRef<Set<string>>(new Set())
  useEffect(() => {
    const now = new Set(tabs.map((t) => t.id))
    for (const id of knownTabs.current) if (!now.has(id)) void dropResult(id)
    knownTabs.current = now
  }, [tabs, dropResult])

  if (!tab) {
    return (
      <div className="explore">
        <TabStrip />
        {exploreView === 'profile' && profileTarget?.kind === 'source' ? (
          <section className="result-panel">
            <ProfilePanel />
          </section>
        ) : (
          <div className="explore-empty">
            Открой источник в рейле или нажми «+» для пустого запроса.
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="explore">
      <TabStrip />
      <section className="query-panel">
        <header className="panel-head">
          <span className="panel-title">Запрос</span>
          <button className="run-btn" onClick={() => run(tab.sql)}>
            <Icon name="play" /> запустить
          </button>
          {history.length > 0 && (
            <span className="hist-ctl" title="история запросов (или ↑/↓ в редакторе)">
              <button
                className="hist-btn"
                aria-label="раньше в истории"
                disabled={histPos === history.length - 1}
                onClick={() => histCtl.current?.step(1)}
              >↑</button>
              <span className="hist-count">
                {histPos === null ? history.length : `${history.length - histPos}/${history.length}`}
              </span>
              <button
                className="hist-btn"
                aria-label="позже в истории"
                disabled={histPos === null}
                onClick={() => histCtl.current?.step(-1)}
              >↓</button>
            </span>
          )}
        </header>
        <SqlEditor
          key={tab.id}
          value={tab.sql}
          onChange={(v) => updateTabSql(tab.id, v)}
          onRun={run}
          schema={schema}
          history={history}
          historyCtl={histCtl}
          onHistoryPos={setHistPos}
        />
      </section>
      <ResultPanel
        meta={tab.meta}
        error={tab.error}
        tabId={tab.id}
        sql={tab.sql}
        client={client}
      />
    </div>
  )
}
