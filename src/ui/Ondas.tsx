// Ondas sobrepostas (ideia do CodePen "Blending motions", refeita em canvas, sem biblioteca):
// várias linhas suaves que oscilam com fases defasadas; o cursor aumenta um pouco a amplitude perto dele.
import { useEffect, useRef } from 'react'

const FREQ = [0, -30, 50, -50, -35, 35, 0, -30, 50, -50, -35, 35, -30, 50, -50]

export function Ondas({ className = '', linhas = 13 }: { className?: string; linhas?: number }) {
  const tela = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = tela.current!
    const g = c.getContext('2d')!
    let L = 0
    let A = 0
    let quadro = 0
    const mouse = { x: 0.5, forca: 0 }
    const ajustar = () => {
      const r = c.getBoundingClientRect()
      const d = Math.min(2, devicePixelRatio || 1)
      L = r.width
      A = r.height
      c.width = Math.round(L * d)
      c.height = Math.round(A * d)
      g.setTransform(d, 0, 0, d, 0, 0)
    }
    const mover = (e: PointerEvent) => {
      const r = c.getBoundingClientRect()
      const dentro = e.clientY >= r.top && e.clientY <= r.bottom
      mouse.x = (e.clientX - r.left) / r.width
      mouse.forca = dentro ? 1 : 0
    }
    let forca = 0
    const desenhar = (t: number) => {
      const s = t / 1000
      forca += (mouse.forca - forca) * 0.04
      g.clearRect(0, 0, L, A)
      const horizonte = A * 0.58
      const n = FREQ.length
      const escala = A / 320
      for (let p = 0; p < linhas; p++) {
        // pontos de controle da linha p
        const pts = FREQ.map((f, i) => {
          const x = (L / (n - 1)) * i
          const sinal = i % 2 ? -1 : 1
          const perto = 1 + forca * 0.6 * Math.exp(-(((i / (n - 1) - mouse.x) * 4) ** 2))
          const y = horizonte + Math.sin((s + i * 0.9) * 1.6) * (f * sinal + p * 7 * sinal) * escala * perto
          return [x, y] as const
        })
        g.beginPath()
        g.moveTo(-10, pts[0][1])
        for (let i = 0; i < n - 1; i++) {
          const [x0, y0] = pts[i]
          const [x1, y1] = pts[i + 1]
          g.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
        }
        g.lineTo(L + 10, pts[n - 1][1])
        g.strokeStyle = `rgba(255,194,14,${(0.08 + 0.5 * (1 - p / linhas)).toFixed(3)})`
        g.lineWidth = p === 0 ? 2 : 1.2
        g.stroke()
      }
      quadro = requestAnimationFrame(desenhar)
    }
    ajustar()
    quadro = requestAnimationFrame(desenhar)
    const obs = new ResizeObserver(ajustar)
    obs.observe(c)
    addEventListener('pointermove', mover)
    return () => {
      cancelAnimationFrame(quadro)
      obs.disconnect()
      removeEventListener('pointermove', mover)
    }
  }, [linhas])
  return <canvas ref={tela} className={className} aria-hidden />
}
