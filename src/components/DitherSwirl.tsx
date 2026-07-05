import { useEffect, useRef } from 'react'

// 4×4 ordered Bayer matrix, нормированная в [0,1) — пороги дизеринга.
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((v) => v / 16))

const DOT = { r: 34, g: 211, b: 238 } // --accent #22d3ee
const CELL = 7

/**
 * Дизеренный дот-свирл (2D canvas, Bayer 4×4) — hero-фон boot/welcome.
 * Заменяет WebGL warp-шейдер: 0 зависимостей, нет жизненного цикла WebGL-
 * контекста (и связанного StrictMode-бага aa0122f); при prefers-reduced-motion
 * рисуется один статичный кадр.
 */
export function DitherSwirl({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let W = 0
    let H = 0
    let cols = 0
    let rows = 0
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = canvas.clientWidth
      H = canvas.clientHeight
      canvas.width = Math.floor(W * dpr)
      canvas.height = Math.floor(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols = Math.ceil(W / CELL)
      rows = Math.ceil(H / CELL)
    }

    const start = performance.now()
    const drawFrame = (now: number) => {
      const t = (now - start) / 1000
      ctx.clearRect(0, 0, W, H)
      const R = Math.min(W, H) * 0.62
      const cx = W * 0.5
      const cy = H * 0.5
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          const px = gx * CELL + CELL * 0.5
          const py = gy * CELL + CELL * 0.5
          const dx = (px - cx) / R
          const dy = (py - cy) / R
          const r = Math.hypot(dx, dy)
          const ang = Math.atan2(dy, dx)
          // кольца свирла: твист растёт с радиусом, фаза бежит быстро (скорость)
          const rings = 0.5 + 0.5 * Math.sin(r * 11.0 - t * 3.4 + ang * 2.0 + r * 3.0)
          const well = Math.max(0, Math.min(1, (r - 0.06) / 0.34)) // тёмный колодец в центре
          const edge = 1 - Math.max(0, Math.min(1, (r - 0.85) / 0.5)) // затухание к краю
          const inten = rings * rings * well * edge
          if (inten > BAYER[gy & 3][gx & 3]) {
            const a = Math.min(1, 0.16 + inten * 0.72)
            const s = Math.max(1.2, inten > 0.72 ? CELL - 1.5 : inten > 0.45 ? CELL - 3 : CELL - 4.5)
            ctx.fillStyle = `rgba(${DOT.r},${DOT.g},${DOT.b},${a.toFixed(3)})`
            ctx.fillRect(px - s / 2, py - s / 2, s, s)
          }
        }
      }
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    const loop = (now: number) => {
      drawFrame(now)
      if (!document.hidden) raf = requestAnimationFrame(loop)
    }

    resize()
    if (reduced) {
      drawFrame(start) // один статичный кадр
    } else {
      raf = requestAnimationFrame(loop)
    }

    const onResize = () => {
      resize()
      if (reduced) drawFrame(performance.now())
    }
    window.addEventListener('resize', onResize)
    const onVis = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf)
        raf = 0
      } else if (!reduced && raf === 0) {
        raf = requestAnimationFrame(loop)
      }
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return <canvas ref={canvasRef} className={'dither-swirl' + (className ? ' ' + className : '')} aria-hidden="true" />
}
