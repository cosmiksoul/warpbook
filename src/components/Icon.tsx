import type { ReactNode } from 'react'

type IconName =
  | 'logo' | 'explore' | 'report' | 'play' | 'pin' | 'types' | 'profile' | 'table'

// logo is rendered separately (dithered ring, MARK_DOTS below); these are stroke glyphs.
const PATHS: Record<Exclude<IconName, 'logo'>, ReactNode> = {
  // simple, recognizable stroke glyphs (Lucide-ish), 24x24 viewBox
  explore: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  report: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  play: <path d="M6 4l14 8-14 8z" />,
  pin: <path d="M12 17v5M9 3h6l-1 7 3 3H7l3-3-1-7z" />,
  types: <path d="M3 21l3-1 11-11-2-2L4 18l-1 3zM14 6l4 4" />,
  profile: <><path d="M3 21h18" /><rect x="5" y="11" width="3" height="7" /><rect x="11" y="7" width="3" height="11" /><rect x="17" y="13" width="3" height="5" /></>,
  table: <><rect x="3" y="4" width="18" height="16" rx="1.5" /><path d="M3 9h18M10 9v11" /></>,
}

// Точки логотипа считаются один раз на модуль: дизеренное кольцо на решётке 3px.
const MARK_DOTS: { x: number; y: number; o: number }[] = (() => {
  const dots: { x: number; y: number; o: number }[] = []
  for (let y = 0; y < 40; y += 3) {
    for (let x = 0; x < 40; x += 3) {
      const dx = (x - 20) / 18
      const dy = (y - 20) / 18
      const r = Math.hypot(dx, dy)
      const ring = 0.5 + 0.5 * Math.sin(r * 10 - 1.2)
      const mask = Math.max(0, Math.min(1, (r - 0.1) / 0.25)) * (1 - Math.max(0, Math.min(1, (r - 0.85) / 0.3)))
      const inten = ring * ring * mask
      if (inten > 0.35) dots.push({ x, y, o: 0.4 + inten * 0.6 })
    }
  }
  return dots
})()

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  if (name === 'logo') {
    // Дизеренное кольцо (порт canvas.mark из терминального мокапа):
    // детерминированная решётка 3px-ячеек 40×40, интенсивность кольца → альфа точки.
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true" style={{ flex: '0 0 auto' }}>
        {MARK_DOTS.map((d, i) => (
          <rect key={i} x={d.x} y={d.y} width="2" height="2" fill="var(--accent)" opacity={d.o} />
        ))}
      </svg>
    )
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: '0 0 auto' }}
    >
      {PATHS[name]}
    </svg>
  )
}
