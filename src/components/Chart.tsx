import { useEffect, useRef } from 'react'
import * as Plot from '@observablehq/plot'
import type { ChartSpec } from '../core/chartSpec'

interface Props {
  spec: ChartSpec
  rows: Record<string, unknown>[]
}

export function Chart({ spec, rows }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const mark =
      spec.kind === 'bar'
        ? Plot.barY(rows, { x: spec.x, y: spec.y, sort: { x: '-y' } })
        : Plot.lineY(rows, { x: spec.x, y: spec.y })
    const fig = Plot.plot({
      marks: [mark, Plot.ruleY([0])],
      x: { label: spec.x },
      y: { label: spec.y, grid: true },
      height: 280,
      marginLeft: 56,
      style: { background: 'transparent', color: '#c8d6d2' },
    })
    el.replaceChildren(fig)
    return () => fig.remove() // avoid leaking SVG nodes
  }, [spec, rows])
  return <div className="chart" ref={ref} />
}
