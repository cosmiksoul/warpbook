import { useRef, useState } from 'react'

interface Props {
  onFiles: (files: File[]) => void
  disabled?: boolean
}

export function CsvDropzone({ onFiles, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  function pick(list: FileList | null) {
    const files = list ? Array.from(list) : []
    if (files.length) onFiles(files)
  }

  return (
    <div
      className={over ? 'dropzone over' : 'dropzone'}
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (!disabled) pick(e.dataTransfer.files)
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.parquet,text/csv"
        multiple
        hidden
        onChange={(e) => pick(e.target.files)}
      />
      Перетащи CSV / Parquet (можно несколько) или кликни
    </div>
  )
}
