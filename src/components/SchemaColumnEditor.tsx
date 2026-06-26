import { useState } from 'react'
import type { ColType, ColumnConfig } from '../core/schemaTypes'

const TYPES: ColType[] = [
  'VARCHAR',
  'BIGINT',
  'DOUBLE',
  'FLOAT',
  'DATE',
  'TIMESTAMP',
  'BOOLEAN',
]

interface Props {
  config: ColumnConfig
  /** When false, the include checkbox cannot be unchecked (last included col). */
  canDisableInclude: boolean
  onStage: (cfg: ColumnConfig) => void
  onReset: (origName: string) => void
  onClose: () => void
}

export function SchemaColumnEditor({
  config,
  canDisableInclude,
  onStage,
  onReset,
  onClose,
}: Props) {
  const [draft, setDraft] = useState<ColumnConfig>(config)

  const set = (patch: Partial<ColumnConfig>) =>
    setDraft((d) => ({ ...d, ...patch }))

  const isNumeric =
    draft.type === 'BIGINT' || draft.type === 'DOUBLE' || draft.type === 'FLOAT'
  const isTemporal = draft.type === 'DATE' || draft.type === 'TIMESTAMP'

  function save() {
    onStage(draft)
    onClose()
  }

  return (
    <div className="col-editor" role="dialog" aria-label={`правка ${config.origName}`}>
      <div className="col-editor-head">
        <span className="col-editor-orig">{config.origName}</span>
        <button className="col-editor-x" onClick={onClose} aria-label="закрыть">
          ×
        </button>
      </div>

      <label className="col-editor-row">
        <span>имя</span>
        <input
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
        />
      </label>

      <label className="col-editor-row">
        <span>тип</span>
        <select
          value={draft.type}
          onChange={(e) => set({ type: e.target.value as ColType })}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t === 'VARCHAR' ? 'STRING' : t}
            </option>
          ))}
        </select>
      </label>

      <label className="col-editor-row checkbox">
        <input
          type="checkbox"
          checked={draft.include}
          disabled={draft.include && !canDisableInclude}
          onChange={(e) => set({ include: e.target.checked })}
        />
        <span>включить колонку</span>
      </label>

      {isNumeric && (
        <label className="col-editor-row checkbox">
          <input
            type="checkbox"
            checked={draft.decimalSep === ','}
            onChange={(e) => set({ decimalSep: e.target.checked ? ',' : undefined })}
          />
          <span>десятичная запятая</span>
        </label>
      )}

      {isTemporal && (
        <label className="col-editor-row">
          <span>формат</span>
          <input
            placeholder="%d.%m.%Y (опц.)"
            value={draft.dateFormat ?? ''}
            onChange={(e) => set({ dateFormat: e.target.value || undefined })}
          />
        </label>
      )}

      <label className="col-editor-row">
        <span>nullstr</span>
        <input
          placeholder="напр. NA (опц.)"
          value={draft.nullToken ?? ''}
          onChange={(e) => set({ nullToken: e.target.value || undefined })}
        />
      </label>

      <div className="col-editor-actions">
        <button className="link" onClick={() => onReset(config.origName)}>
          сбросить
        </button>
        <button className="schema-btn" onClick={save}>
          применить
        </button>
      </div>
    </div>
  )
}
