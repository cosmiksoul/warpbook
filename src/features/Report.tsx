import type { DuckDBClient } from '../db/duckdbClient'
import { useSession } from '../state/session'
import { TextBlockView } from '../components/TextBlockView'
import { WidgetBlockView } from '../components/WidgetBlockView'

export function Report({ client }: { client: DuckDBClient }) {
  const report = useSession((s) => s.report)
  const activeBlockId = useSession((s) => s.activeBlockId)
  const addTextBlock = useSession((s) => s.addTextBlock)
  const setActiveBlock = useSession((s) => s.setActiveBlock)

  return (
    <div className="report">
      <div className="report-toolbar">
        <button onClick={() => addTextBlock()}>+ текст</button>
      </div>

      {report.blocks.length === 0 ? (
        <div className="report-stub">
          Закрепи результат в Исследовании (📌) или добавь текстовый блок.
        </div>
      ) : (
        <div className="report-stack">
          {report.blocks.map((block) => (
            <div
              key={block.id}
              className={
                block.id === activeBlockId
                  ? 'report-block active'
                  : 'report-block'
              }
              onClick={() => setActiveBlock(block.id)}
            >
              {block.type === 'text' ? (
                <TextBlockView block={block} />
              ) : (
                <WidgetBlockView block={block} client={client} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
