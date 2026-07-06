import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { EditorState, Prec, Compartment } from '@codemirror/state'
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
} from '@codemirror/view'
import { defaultKeymap, history as cmHistory, historyKeymap } from '@codemirror/commands'
import { sql } from '@codemirror/lang-sql'
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { autocompletion, completionKeymap, completionStatus } from '@codemirror/autocomplete'

// SQL token colors, tuned to the cyan-console terminal palette (index.css tokens).
const qbHighlight = HighlightStyle.define([
  { tag: t.keyword, color: '#22d3ee', fontWeight: '500' },
  { tag: [t.typeName, t.typeOperator], color: '#5fe0ea' },
  { tag: [t.string, t.special(t.string)], color: '#e0b64a' },
  { tag: [t.number, t.integer, t.float], color: '#e849c4' },
  { tag: [t.bool, t.null, t.atom], color: '#ff5c72' },
  { tag: t.function(t.variableName), color: '#8ad6ff' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#5d818b', fontStyle: 'italic' },
  { tag: [t.operator, t.compareOperator, t.logicOperator, t.arithmeticOperator], color: '#6f97a2' },
  { tag: [t.punctuation, t.separator, t.paren, t.bracket], color: '#6f97a2' },
])

// Dark editor chrome (gutter/cursor/selection/active line) matching the theme.
const qbEditorTheme = EditorView.theme(
  {
    '&': { color: 'var(--text)', backgroundColor: 'transparent' },
    '.cm-content': { caretColor: 'var(--accent)', fontFamily: 'var(--font-mono)' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
    '& ::selection': { backgroundColor: 'rgba(34,211,238,.22)' },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,.03)' },
    '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--text-faint)', border: 'none' },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(255,255,255,.03)', color: 'var(--text-dim)' },
    '.cm-tooltip': { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' },
    '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'var(--surface-2)', color: 'var(--text)' },
  },
  { dark: true },
)

export interface SqlEditorHistoryCtl { step: (dir: 1 | -1) => void; reset: () => void }

interface Props {
  value: string
  onChange: (value: string) => void
  onRun: (sql: string) => void
  schema?: Record<string, string[]>
  history?: string[]
  compact?: boolean
  historyCtl?: { current: SqlEditorHistoryCtl | null }
  onHistoryPos?: (pos: number | null) => void
}

export function SqlEditor({ value, onChange, onRun, schema, history, compact, historyCtl, onHistoryPos }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  // Keep latest callbacks in a ref so the mount-once extensions never go stale.
  const cb = useRef({ onChange, onRun, onHistoryPos })
  // eslint-disable-next-line react-hooks/refs
  cb.current = { onChange, onRun, onHistoryPos }

  const schemaComp = useRef(new Compartment())
  const schemaRef = useRef(schema)
  // eslint-disable-next-line react-hooks/refs
  schemaRef.current = schema

  // История запросов (psql-стиль). Указатель: null = не в истории; иначе
  // смещение от свежего конца (0 = самый свежий). Черновик прячется при входе.
  const histRef = useRef<string[]>(history ?? [])
  // eslint-disable-next-line react-hooks/refs
  histRef.current = history ?? []
  const histPos = useRef<number | null>(null)
  const draftStash = useRef('')
  const navigating = useRef(false)

  // Drag-resizable height via the bottom handle — a much bigger target than the
  // native 16px corner grip. Default 168px (compact cells: fixed 120, no handle);
  // per-tab (SqlEditor is keyed by tab id in Explore, so it resets on tab switch).
  const [height, setHeight] = useState(compact ? 120 : 168)
  function startResize(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault()
    const bar = e.currentTarget
    const startY = e.clientY
    const startH = host.current?.offsetHeight ?? height
    bar.setPointerCapture(e.pointerId)
    const onMove = (ev: PointerEvent) => {
      if (ev.buttons === 0) { onUp(); return } // драг оборван без pointerup (alt-tab)
      setHeight(Math.max(84, startH + (ev.clientY - startY)))
    }
    const onUp = () => {
      bar.releasePointerCapture(e.pointerId)
      bar.removeEventListener('pointermove', onMove)
      bar.removeEventListener('pointerup', onUp)
      bar.removeEventListener('pointercancel', onUp)
    }
    bar.addEventListener('pointermove', onMove)
    bar.addEventListener('pointerup', onUp)
    bar.addEventListener('pointercancel', onUp)
  }

  function setDoc(v: EditorView, text: string) {
    navigating.current = true
    v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: text },
      selection: { anchor: text.length },
    })
    navigating.current = false
  }

  function notifyPos() {
    cb.current.onHistoryPos?.(histPos.current)
  }

  // Ядро шага — общее для клавиатуры и кнопок ↑/↓ у «запустить».
  function stepHistoryCore(v: EditorView, dir: 1 | -1): boolean {
    const list = histRef.current
    if (list.length === 0) return false
    const pos = histPos.current
    if (dir === 1) {
      const next = pos === null ? 0 : pos + 1
      if (next >= list.length) return true // упёрлись в самый старый — съесть нажатие
      if (pos === null) draftStash.current = v.state.doc.toString()
      histPos.current = next
      setDoc(v, list[list.length - 1 - next])
      notifyPos()
      return true
    }
    if (pos === null) return false // не в истории — обычный ArrowDown
    if (pos === 0) {
      histPos.current = null
      setDoc(v, draftStash.current)
      notifyPos()
      return true
    }
    histPos.current = pos - 1
    setDoc(v, list[list.length - 1 - histPos.current])
    notifyPos()
    return true
  }

  // Клавиатурный путь: guard'ы курсора/автокомплита, потом ядро.
  function stepHistory(v: EditorView, dir: 1 | -1): boolean {
    if (completionStatus(v.state) !== null) return false // стрелки — автокомплиту
    const sel = v.state.selection.main
    if (!sel.empty) return false
    const line = v.state.doc.lineAt(sel.head)
    if (dir === 1 && line.number !== 1) return false // старее — только с первой строки
    if (dir === -1 && line.number !== v.state.doc.lines) return false // новее — с последней
    return stepHistoryCore(v, dir)
  }

  // Mount once. Do NOT depend on `value` (would recreate the editor per keystroke).
  // eslint-disable-next-line react-hooks/immutability -- historyCtl is a parent-owned imperative handle, not render state
  useEffect(() => {
    const runKey = Prec.high(
      keymap.of([
        {
          key: 'Mod-Enter',
          run: (v) => {
            if (histPos.current !== null) { histPos.current = null; notifyPos() }
            cb.current.onRun(v.state.doc.toString())
            return true // consume: no newline inserted
          },
        },
      ]),
    )
    const histNav = keymap.of([
      { key: 'ArrowUp', run: (v) => stepHistory(v, 1) },
      { key: 'ArrowDown', run: (v) => stepHistory(v, -1) },
    ])
    const listener = EditorView.updateListener.of((u) => {
      if (u.docChanged) cb.current.onChange(u.state.doc.toString())
      if (u.docChanged && !navigating.current && histPos.current !== null) {
        histPos.current = null
        notifyPos() // ручная правка выводит из истории — гасим счётчик
      }
    })
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        cmHistory(),
        qbEditorTheme,
        syntaxHighlighting(qbHighlight),
        schemaComp.current.of(sql({ schema: schemaRef.current ?? {} })),
        autocompletion(),
        runKey,
        histNav,
        keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap]),
        listener,
      ],
    })
    const v = new EditorView({ state, parent: host.current! })
    view.current = v
    if (historyCtl) {
      // eslint-disable-next-line react-hooks/immutability -- imperative handle exposed by design (SqlEditorHistoryCtl)
      historyCtl.current = {
        step: (dir) => { if (view.current) stepHistoryCore(view.current, dir) },
        reset: () => { if (histPos.current !== null) { histPos.current = null; notifyPos() } },
      }
    }
    return () => {
      v.destroy()
      view.current = null
      if (historyCtl) historyCtl.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync external value ONLY when it diverges from the doc (prevents cursor jump).
  useEffect(() => {
    const v = view.current
    if (!v) return
    const current = v.state.doc.toString()
    if (value === current) return
    v.dispatch({ changes: { from: 0, to: current.length, insert: value } })
  }, [value])

  // Reconfigure the SQL language with the latest schema when datasets change.
  useEffect(() => {
    const v = view.current
    if (!v) return
    v.dispatch({ effects: schemaComp.current.reconfigure(sql({ schema: schema ?? {} })) })
  }, [schema])

  return (
    <div className="sql-editor-wrap">
      <div className="sql-editor" ref={host} style={{ height }} />
      {!compact && (
        <div
          className="sql-resize"
          onPointerDown={startResize}
          title="потяни, чтобы изменить высоту редактора"
        />
      )}
    </div>
  )
}
