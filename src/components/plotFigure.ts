import * as Plot from '@observablehq/plot'
import type { ChartSpec } from '../core/chartSpec'

/** Build the bar/line figure used by both the live Chart and the HTML export. */
export function plotFigure(
  spec: ChartSpec,
  rows: Record<string, unknown>[],
  style: { background: string; color: string; series?: string },
): HTMLElement | SVGSVGElement {
  // Экспорт на белом: cyan #22d3ee даёт контраст ~1.55:1 — серии перекрашиваются
  // в глубокий teal; живое приложение (тёмный фон) остаётся на дефолте.
  const seriesColor = style.series ?? '#22d3ee'
  // X — дата-строки (strftime): парсим в Date, чтобы Plot дал временную ось
  // (аккуратные тики по месяцам), а не ординал с тиком на каждую из N дат.
  const data = spec.xDates
    ? rows.map((r) => ({ ...r, [spec.x]: r[spec.x] == null ? null : new Date(String(r[spec.x])) }))
    : spec.xNumericStrings
      ? rows.map((r) => ({ ...r, [spec.x]: r[spec.x] == null ? null : Number(r[spec.x]) }))
      : rows
  const mark =
    spec.kind === 'bar'
      ? Plot.barY(data, {
          x: spec.x,
          y: spec.y,
          // Гистограммы (числовые лейблы) — в порядке бакетов; категории — value-ranking.
          ...(spec.xNumericStrings ? {} : { sort: { x: '-y' } }),
          fill: seriesColor,
        })
      : Plot.lineY(data, { x: spec.x, y: spec.y, stroke: seriesColor, strokeWidth: 2 })
  return Plot.plot({
    marks: [mark, Plot.ruleY([0])],
    x: { label: spec.x },
    y: { label: spec.y, grid: true },
    height: 280,
    marginLeft: 56,
    style: { background: style.background, color: style.color },
  })
}
