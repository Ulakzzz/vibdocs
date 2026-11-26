// Malha de pontos que vibra a partir do cursor (variante A6 escolhida para a entrada).
// Cada ponto tem uma "mola" própria: a amplitude sobe e desce suavemente em vez de acender e apagar,
// as ondas nascem conforme o cursor anda (mais rápido = onda mais forte) e se espalham com frente larga.
// Sem o cursor por perto, um ponto imaginário passeia devagar para a malha não ficar parada.
// Anima sempre: no Windows com "efeitos de animação" desligados o navegador pede movimento reduzido,
// e a malha ficava toda apagada (sem resposta ao cursor).
import { useEffect, useRef } from 'react'

interface OndaMalha {
  x: number
  y: number
  t0: number
  forca: number
}

export function Malha({ className = '', passo = 26 }: { className?: string; passo?: number }) {
  const tela = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = tela.current!
    const g = c.getContext('2d')!
    let L = 0
    let A = 0
    let cols = 0
    let linhas = 0
    let amp = new Float32Array(0) // amplitude atual de cada ponto
    let vel = new Float32Array(0) // velocidade da mola
    const ondas: OndaMalha[] = []
    const cursor = { x: -1e4, y: -1e4, dentro: false, ultimoX: 0, ultimoY: 0, andado: 0, visto: 0 }
    let quadro = 0

    const ajustar = () => {
      const r = c.getBoundingClientRect()
      const d = Math.min(2, devicePixelRatio || 1)
      L = r.width
      A = r.height
      c.width = Math.round(L * d)
      c.height = Math.round(A * d)
      g.setTransform(d, 0, 0, d, 0, 0)
      cols = Math.ceil(L / passo)
      linhas = Math.ceil(A / passo)
      amp = new Float32Array(cols * linhas)
      vel = new Float32Array(cols * linhas)
    }

    const mover = (ev: PointerEvent) => {
      const r = c.getBoundingClientRect()
      const x = ev.clientX - r.left
      const y = ev.clientY - r.top
      cursor.dentro = x >= 0 && y >= 0 && x <= r.width && y <= r.height
      if (!cursor.dentro) return
      const d = Math.hypot(x - cursor.ultimoX, y - cursor.ultimoY)
      cursor.andado += Math.min(d, 80)
      cursor.x = x
      cursor.y = y
      cursor.ultimoX = x
      cursor.ultimoY = y
      cursor.visto = performance.now()
      // uma onda a cada ~70 px percorridos; a força acompanha a velocidade
      if (cursor.andado > 70) {
        ondas.push({ x, y, t0: performance.now(), forca: Math.min(0.9, 0.35 + d / 50) })
        cursor.andado = 0
        if (ondas.length > 8) ondas.shift()
      }
    }

    const desenhar = (agora: number) => {
      g.clearRect(0, 0, L, A)
      while (ondas.length && agora - ondas[0].t0 > 3000) ondas.shift()

      // sem cursor há 1,5 s: um ponto imaginário passeia devagar (Lissajous)
      const ocioso = !cursor.dentro || agora - cursor.visto > 1500
      const px = ocioso ? L * (0.55 + 0.3 * Math.sin(agora / 5200)) : cursor.x
      const py = ocioso ? A * (0.45 + 0.25 * Math.sin(agora / 3700 + 1)) : cursor.y
      const forcaBase = ocioso ? 0.35 : 0.6

      for (let j = 0; j < linhas; j++) {
        const y = passo / 2 + j * passo
        for (let i = 0; i < cols; i++) {
          const x = passo / 2 + i * passo
          const k = j * cols + i
          // alvo: frentes de onda (gaussiana larga) + respiração perto do cursor
          let alvo = 0
          let empurra = 0
          for (const o of ondas) {
            const dt = agora - o.t0
            const dx = x - o.x
            const dy = y - o.y
            const dist = Math.hypot(dx, dy)
            const raio = dt * 0.3
            const frente = Math.exp(-((dist - raio) ** 2) / 1800) * Math.exp(-dt / 900) * o.forca
            alvo += frente
            empurra += frente * Math.sin((dist - raio) / 14)
          }
          const dc = Math.hypot(x - px, y - py)
          alvo += forcaBase * Math.exp(-(dc * dc) / 9000) * (0.75 + 0.25 * Math.sin(agora / 260 - dc / 30))
          alvo = Math.min(1, alvo)
          // mola criticamente amortecida: sobe e desce sem "piscar"
          vel[k] += (alvo - amp[k]) * 0.09
          vel[k] *= 0.72
          amp[k] += vel[k]
          const a = Math.max(0, Math.min(1, amp[k]))

          // deslocamento radial pequeno (o ponto "vibra" para fora da onda)
          const ang = Math.atan2(y - py, x - px)
          const ox = Math.cos(ang) * empurra * 3
          const oy = Math.sin(ang) * empurra * 3
          const r = 3.6 + Math.max(0, a - 0.06) * 3.6
          g.beginPath()
          g.arc(x + ox, y + oy, r, 0, Math.PI * 2)
          // abaixo de 0,06 o ponto fica só no contorno (evita um véu amarelo na malha toda)
          const f = (a - 0.06) / 0.94
          if (f > 0) {
            g.fillStyle = `rgba(255,194,14,${Math.min(1, f * 1.1).toFixed(3)})`
            g.fill()
          }
          if (a < 0.6) {
            g.strokeStyle = `rgba(255,255,255,${(0.2 * (1 - a / 0.6)).toFixed(3)})`
            g.lineWidth = 1.1
            g.stroke()
          }
        }
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
  }, [passo])

  return <canvas ref={tela} className={className} aria-hidden />
}
