import { useEffect } from 'react'
import { useSession } from '../state/session'

export function Toast() {
  const toast = useSession((s) => s.toast)
  const setToast = useSession((s) => s.setToast)

  useEffect(() => {
    if (toast === null) return
    // setTimeout is fine in UI (it is NOT in core/store logic).
    const id = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(id)
  }, [toast, setToast])

  if (toast === null) return null
  return <div className="toast">{toast}</div>
}
