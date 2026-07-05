import { useEffect, useRef } from 'react'
import type { ChartSpec } from '../core/chartSpec'
import { plotFigure } from './plotFigure'

interface Props {
  spec: ChartSpec
  rows: Record<string, unknown>[]
}

export function Chart({ spec, rows }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const fig = plotFigure(spec, rows, { background: 'transparent', color: '#6f97a2' })
    el.replaceChildren(fig)
    return () => fig.remove() // avoid leaking SVG nodes
  }, [spec, rows])
  return <div className="chart" ref={ref} />
}
