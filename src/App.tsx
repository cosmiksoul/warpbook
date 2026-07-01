import { useEffect, useState } from 'react'
import { getBrowserDuckDB } from './db/browserDuckDB'
import { createClient, type DuckDBClient } from './db/duckdbClient'
import { Shell } from './features/Shell'
import { BootScreen } from './components/BootScreen'
import type { BootProgress } from './core/bootProgress'

type InitState = 'loading' | 'ready' | 'error'

export function App() {
  const [initState, setInitState] = useState<InitState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [client, setClient] = useState<DuckDBClient | null>(null)
  const [progress, setProgress] = useState<BootProgress | null>(null)

  useEffect(() => {
    let cancelled = false
    getBrowserDuckDB((loaded, total) => {
      if (!cancelled) setProgress({ loaded, total })
    })
      .then((db) => {
        if (cancelled) return
        setClient(createClient(db))
        setInitState('ready')
      })
      .catch((e) => {
        if (cancelled) return
        setError(String(e))
        setInitState('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (initState === 'loading') return <BootScreen progress={progress} />
  if (initState === 'error')
    return <p className="status error boot">Ошибка инициализации: {error}</p>
  return <Shell client={client!} />
}
