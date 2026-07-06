import { useEffect } from 'react'
import { useSession } from '../state/session'

export function Toast() {
  const toast = useSession((s) => s.toast)
  const toastSeq = useSession((s) => s.toastSeq)
  const setToast = useSession((s) => s.setToast)

  useEffect(() => {
    if (toast === null) return
    // toastSeq в deps: повтор ТОГО ЖЕ сообщения перезапускает таймер.
    const id = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(id)
  }, [toast, toastSeq, setToast])

  if (toast === null) return null
  return <div className="toast" role="status" aria-live="polite">{toast}</div>
}
