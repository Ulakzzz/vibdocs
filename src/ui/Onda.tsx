// Onda de vibração: um sinal amarelo que reage ao cursor.
// Posição horizontal do mouse → frequência; vertical → amplitude. Perto do cursor, surge um "impacto"
// (como a resposta de um defeito de rolamento no envelope). Com movimento reduzido, fica parada.
import { useEffect, useRef } from 'react'

export function Onda({ cor = '#FFC20E', className = '' }: { cor?: string; className?: string }) {
  const tela = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = tela.current!
    const g = c.getContext('2d')!
    const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches
    const mouse = { x: 0.5, y: 0.5, dentro: false }
    const alvo = { freq: 3, amp: 0.18 }
    const atual = { freq: 3, amp: 0.18, impacto: 0 }
    let t = 0
    let quadro = 0

    const ajustar = () => {
      const r = c.getBoundingClientRect()
      const d = Math.min(2, devicePixelRatio || 1)
      c.width = Math.round(r.width * d)
      c.height = Math.round(r.height * d)
      g.setTransform(d, 0, 0, d, 0, 0)
    }
    const mover = (ev: PointerEvent) => {
      const r = c.getBoundingClientRect()
      mouse.x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width))
      mouse.y = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))
      mouse.dentro = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom
      alvo.freq = 1.5 + mouse.x * 9
      alvo.amp = 0.06 + (1 - mouse.y) * 0.3
    }

    const desenhar = () => {
      const { width: l, height: a } = c.getBoundingClientRect()
      g.clearRect(0, 0, l, a)
      // suaviza a transição (a onda "persegue" o cursor)
      atual.freq += (alvo.freq - atual.freq) * 0.06
      atual.amp += (alvo.amp - atual.amp) * 0.06
      atual.impacto += ((mouse.dentro ? 1 : 0) - atual.impacto) * 0.08
      const meio = a * 0.55

      // grade fina de fundo (eixo de tempo)
      g.strokeStyle = 'rgba(255,255,255,0.06)'
      g.lineWidth = 1
      for (let x = 0; x < l; x += 48) {
        g.beginPath()
        g.moveTo(x + 0.5, 0)
        g.lineTo(x + 0.5, a)
        g.stroke()
      }
      g.beginPath()
      g.moveTo(0, meio + 0.5)
      g.lineTo(l, meio + 0.5)
      g.stroke()

      // três camadas: harmônicos fracos atrás, sinal principal na frente
      const camadas = [
        { alpha: 0.18, largura: 1, fase: 1.7, mult: 2.03 },
        { alpha: 0.35, largura: 1.2, fase: 0.6, mult: 1.01 },
        { alpha: 1, largura: 2.2, fase: 0, mult: 1 },
      ]
      for (const k of camadas) {
        g.beginPath()
        for (let x = 0; x <= l; x += 2) {
          const u = x / l
          const base = Math.sin(u * Math.PI * 2 * atual.freq * k.mult - t * 2 + k.fase)
          const harm = 0.35 * Math.sin(u * Math.PI * 4 * atual.freq * k.mult - t * 3.1)
          // impacto amortecido perto do cursor
          const dx = u - mouse.x
          const pulso = atual.impacto * Math.exp(-Math.abs(dx) * 14) * Math.sin(dx * 120 - t * 9) * 0.9
          const envelope = 0.55 + 0.45 * Math.sin(u * Math.PI)
          const y = meio - (base + harm + pulso) * atual.amp * a * envelope
          if (x === 0) g.moveTo(x, y)
          else g.lineTo(x, y)
        }
        g.strokeStyle = cor
        g.globalAlpha = k.alpha
        g.lineWidth = k.largura
        g.stroke()
        g.globalAlpha = 1
      }
      if (!reduzido) {
        t += 0.016
        quadro = requestAnimationFrame(desenhar)
      }
    }

    ajustar()
    desenhar()
    const obs = new ResizeObserver(() => {
      ajustar()
      if (reduzido) desenhar()
    })
    obs.observe(c)
    addEventListener('pointermove', mover)
    return () => {
      cancelAnimationFrame(quadro)
      obs.disconnect()
      removeEventListener('pointermove', mover)
    }
  }, [cor])

  return <canvas ref={tela} className={className} aria-hidden />
}
