import { useEffect, useRef, useState } from 'react'

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`

// Палитра захардкожена под токены --accent (#22d3ee) / --accent-2 (#e849c4).
const FRAG = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;
uniform float u_intensity;
const vec3 CYAN = vec3(0.133, 0.827, 0.933);
const vec3 MAGENTA = vec3(0.910, 0.286, 0.769);
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
  vec2 center = 0.5 + (u_mouse - 0.5) * 0.06;
  vec2 p = (uv - center) * aspect;
  float r = length(p);
  float a = atan(p.y, p.x);
  float t = u_time * 0.6 * u_intensity;
  float freq = 8.0;
  float off = 0.05 + r * 0.12;
  float ringsC = sin(log(r + 0.06 + off) * freq - t * 3.14159);
  float ringsM = sin(log(r + 0.06 - off) * freq - t * 3.14159);
  float glowC = pow(max(ringsC, 0.0), 6.0);
  float glowM = pow(max(ringsM, 0.0), 6.0);
  float band = 0.7 + 0.3 * (0.5 + 0.5 * sin(a * 3.0 + t * 2.0));
  vec3 col = CYAN * glowC * band + MAGENTA * glowM * band;
  col *= smoothstep(0.0, 0.35, r);          // dark central well
  col *= smoothstep(1.15, 0.2, r);          // vignette
  col *= 1.4 * u_intensity;
  gl_FragColor = vec4(col, 1.0);
}
`

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type)
  if (!sh) return null
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh)
    return null
  }
  return sh
}

export function WarpShader({ intensity = 1, className }: { intensity?: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false }) as WebGLRenderingContext | null
    if (!gl) { setFailed(true); return }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const prog = gl.createProgram()
    if (!vs || !fs || !prog) { setFailed(true); return }
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { setFailed(true); return }
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(prog, 'u_resolution')
    const uTime = gl.getUniformLocation(prog, 'u_time')
    const uMouse = gl.getUniformLocation(prog, 'u_mouse')
    const uInt = gl.getUniformLocation(prog, 'u_intensity')

    const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 }
    const onMove = (e: PointerEvent) => {
      mouse.tx = e.clientX / window.innerWidth
      mouse.ty = 1 - e.clientY / window.innerHeight
    }
    window.addEventListener('pointermove', onMove)

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.floor(canvas.clientWidth * dpr)
      const h = Math.floor(canvas.clientHeight * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      gl.viewport(0, 0, canvas.width, canvas.height)
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    const start = performance.now()

    const draw = (now: number) => {
      resize()
      mouse.x += (mouse.tx - mouse.x) * 0.06
      mouse.y += (mouse.ty - mouse.y) * 0.06
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uTime, reduced ? 0 : (now - start) / 1000)
      gl.uniform2f(uMouse, mouse.x, mouse.y)
      gl.uniform1f(uInt, intensity)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      if (!reduced && !document.hidden) raf = requestAnimationFrame(draw)
    }
    draw(start)

    const onVis = () => {
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0 }
      else if (!reduced && raf === 0) raf = requestAnimationFrame(draw)
    }
    document.addEventListener('visibilitychange', onVis)

    const onLost = (e: Event) => { e.preventDefault(); cancelAnimationFrame(raf); setFailed(true) }
    canvas.addEventListener('webglcontextlost', onLost)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('visibilitychange', onVis)
      canvas.removeEventListener('webglcontextlost', onLost)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      // NB: do NOT call WEBGL_lose_context.loseContext() here — under React
      // StrictMode (dev) the effect mounts twice on the SAME canvas, and a
      // force-lost context poisons the remount (getContext returns the lost
      // context → compile fails → silent fallback). The context is freed by GC
      // when the canvas unmounts; real context loss is handled by onLost.
    }
  }, [intensity])

  if (failed) return <div className={'warp-fallback' + (className ? ' ' + className : '')} aria-hidden="true" />
  return <canvas ref={canvasRef} className={'warp-shader' + (className ? ' ' + className : '')} aria-hidden="true" />
}
