import { useEffect, useRef } from 'react'
import { EditorState, Prec, Compartment } from '@codemirror/state'
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { sql } from '@codemirror/lang-sql'
import { autocompletion, completionKeymap } from '@codemirror/autocomplete'

interface Props {
  value: string
  onChange: (value: string) => void
  onRun: (sql: string) => void
  schema?: Record<string, string[]>
}

export function SqlEditor({ value, onChange, onRun, schema }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  // Keep latest callbacks in a ref so the mount-once extensions never go stale.
  const cb = useRef({ onChange, onRun })
  // eslint-disable-next-line react-hooks/refs
  cb.current = { onChange, onRun }

  const schemaComp = useRef(new Compartment())
  const schemaRef = useRef(schema)
  // eslint-disable-next-line react-hooks/refs
  schemaRef.current = schema

  // Mount once. Do NOT depend on `value` (would recreate the editor per keystroke).
  useEffect(() => {
    const runKey = Prec.high(
      keymap.of([
        {
          key: 'Mod-Enter',
          run: (v) => {
            cb.current.onRun(v.state.doc.toString())
            return true // consume: no newline inserted
          },
        },
      ]),
    )
    const listener = EditorView.updateListener.of((u) => {
      if (u.docChanged) cb.current.onChange(u.state.doc.toString())
    })
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        schemaComp.current.of(sql({ schema: schemaRef.current ?? {} })),
        autocompletion(),
        runKey,
        keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap]),
        listener,
      ],
    })
    const v = new EditorView({ state, parent: host.current! })
    view.current = v
    return () => {
      v.destroy()
      view.current = null
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

  return <div className="sql-editor" ref={host} />
}
