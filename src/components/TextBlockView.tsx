import { useState } from 'react'
import { renderMarkdown } from '../core/markdown'
import type { TextBlock } from '../core/report'
import { useSession } from '../state/session'

const PLACEHOLDER = '_пустой текст — кликни, чтобы редактировать_'

export function TextBlockView({ block }: { block: TextBlock }) {
  const updateTextBlock = useSession((s) => s.updateTextBlock)
  const moveBlock = useSession((s) => s.moveBlock)
  const removeBlock = useSession((s) => s.removeBlock)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(block.markdown)

  if (editing) {
    return (
      <textarea
        className="text-block-edit"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== block.markdown) updateTextBlock(block.id, draft)
          setEditing(false)
        }}
      />
    )
  }

  // Markdown может прийти из импортированного .json-отчёта — сырой HTML экранируется (renderMarkdown).
  const html = renderMarkdown(block.markdown || PLACEHOLDER)
  return (
    <>
      <span className="widget-controls text-block-controls">
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
      <div
        className="text-block"
        role="button"
        tabIndex={0}
        onClick={() => {
          setDraft(block.markdown)
          setEditing(true)
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return
          if (e.key === 'Enter') { setDraft(block.markdown); setEditing(true) }
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  )
}
