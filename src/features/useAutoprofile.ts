import { buildProfileDraft } from '../core/autoprofile'
import type { DuckDBClient } from '../db/duckdbClient'
import { useSession } from '../state/session'
import { useProfileActions } from './useProfileActions'

/**
 * «Профиль -> отчёт»: кэш профиля M3 (или посчитать) -> черновик блоков ->
 * append в конец отчёта -> режим «Отчёт» -> скролл к первому добавленному.
 * Ячейки исполняются сами при монтировании (lazy rerun M7b) — runAll не нужен.
 */
export function useAutoprofile(client: DuckDBClient) {
  const { profile } = useProfileActions(client)

  async function profileToReport(table: string): Promise<void> {
    if (!useSession.getState().datasets.find((d) => d.table === table)?.profile) {
      await profile(table) // считает и кэширует; ошибка ляжет в profileError
    }
    const st = useSession.getState()
    const ds = st.datasets.find((d) => d.table === table)
    if (!ds) return
    if (!ds.profile) {
      st.setToast(`профиль не посчитался: ${ds.profileError ?? 'ошибка'}`)
      return
    }
    const draft = buildProfileDraft({
      table,
      fileName: ds.fileName,
      rowCount: ds.rowCount ?? 0,
      columns: ds.profile,
    })
    const firstId = st.appendBlocks(draft)
    st.setMode('report')
    st.setToast(`профиль ${ds.fileName} добавлен: ${draft.filter((b) => b.type === 'widget').length} ячеек`)
    if (firstId) {
      // Report ещё монтируется, а виджеты выше растут по мере самоисполнения
      // и сносят позицию — скроллим дважды: сразу и докоррекция после загрузки.
      for (const delay of [60, 700]) {
        setTimeout(() => document.getElementById(firstId)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), delay)
      }
    }
  }

  return { profileToReport }
}
