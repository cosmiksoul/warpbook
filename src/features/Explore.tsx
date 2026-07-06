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
    histCtl.current?.reset() // header-кнопка «запустить» тоже сбрасывает курсор истории
    await runQuery(tab.id, sql)
  }

  // Refetch по смене view; повторный fetch УЖЕ застолблённого run'а (первый
  // запуск, переключение таба) пропускаем — гвардим по windowSeq (стамп ДО
  // await в runQuery/fetchWindow), а не по tab.window — оно заполняется
  // позже, и на первом run'е успевает проскочить лишний рендер с window ещё
  // null, что даёт двойной fetch ровно в момент стампа windowSeq.
  const view = tab?.view
  const lastFetchKey = useRef(new Map<string, { seq: number; key: string }>())
  useEffect(() => {
    if (!tab || tab.mode !== 'paged') return
    const key = JSON.stringify([view?.page, view?.pageSize, view?.sorts, view?.search, view?.filters])
    const seq = tab.windowSeq ?? 0
    const prev = lastFetchKey.current.get(tab.id)
    lastFetchKey.current.set(tab.id, { seq, key })
    if (!prev) return // первое появление таба в paged-режиме — окно уже несёт владелец run'а
    if (prev.seq !== seq) return // новый run/fetch уже застолбил свой собственный fetch
    if (prev.key === key) return // тот же вид — рефетчить нечего
    // Минтим и штампуем seq САМИ здесь же, синхронно с записью в map — иначе
    // map хранит seq, прочитанный ДО фетча, а standalone-ветка fetchWindow
    // синхронно штампует НОВЫЙ seq в сторе → к следующей смене вида map
    // отстаёт от стора и проверка выше ложно решает «чужой seq», глотая рефетч.
    const st = useSession.getState()
    const ownSeq = st.nextWindowSeq()
    st.stampWindowSeq(tab.id, ownSeq)
    lastFetchKey.current.set(tab.id, { seq: ownSeq, key })
    void fetchWindow(tab.id, ownSeq)
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
