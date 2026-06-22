import { useSession } from '../state/session'

export function TabStrip() {
  const tabs = useSession((s) => s.tabs)
  const activeTabId = useSession((s) => s.activeTabId)
  const setActiveTab = useSession((s) => s.setActiveTab)
  const closeTab = useSession((s) => s.closeTab)
  const openBlankTab = useSession((s) => s.openBlankTab)

  return (
    <div className="tab-strip">
      {tabs.map((t) => (
        <div
          key={t.id}
          className={t.id === activeTabId ? 'tab on' : 'tab'}
          onClick={() => setActiveTab(t.id)}
        >
          <span className="tab-title">{t.title}</span>
          <button
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation()
              closeTab(t.id)
            }}
            aria-label="закрыть таб"
          >
            ×
          </button>
        </div>
      ))}
      <button className="tab-add" onClick={() => openBlankTab()} aria-label="новый таб">
        +
      </button>
    </div>
  )
}
