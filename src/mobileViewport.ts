export const DEFAULT_VIEWPORT = 'width=device-width, initial-scale=1.0'
const DESKTOP_LAYOUT_WIDTH = 1180
const WIDE_SCREEN = 1100 // длинная сторона планшета/десктопа — мета не нужна

/**
 * Контент viewport-меты по ориентации. Телефон в альбоме видит цельную
 * десктопную вёрстку в масштабе ~0.78 (layout 1180 ужимается в экран);
 * портрет и широкие экраны — обычный device-width (колоночный режим CSS).
 * screenWidth — ДЛИННАЯ сторона экрана в CSS-px (не зависит от ориентации).
 */
export function viewportContentFor(
  orientation: 'portrait' | 'landscape',
  screenWidth: number,
): string {
  if (orientation === 'landscape' && screenWidth < WIDE_SCREEN) {
    return `width=${DESKTOP_LAYOUT_WIDTH}`
  }
  return DEFAULT_VIEWPORT
}

/**
 * Тонкая обвязка (глазами): только тач-устройства; своп content существующей
 * меты по смене ориентации. screen.width/height в CSS-px устройства НЕ зависят
 * от текущего layout viewport (в отличие от innerWidth, который при width=1180
 * сам стал бы 1180 — петля).
 */
export function installMobileViewport(): void {
  if (!window.matchMedia('(pointer: coarse)').matches) return
  const meta = document.querySelector('meta[name="viewport"]')
  if (!meta) return
  const mq = window.matchMedia('(orientation: landscape)')
  const apply = () => {
    const longSide = Math.max(window.screen.width, window.screen.height)
    meta.setAttribute(
      'content',
      viewportContentFor(mq.matches ? 'landscape' : 'portrait', longSide),
    )
  }
  apply()
  mq.addEventListener('change', apply)
}
