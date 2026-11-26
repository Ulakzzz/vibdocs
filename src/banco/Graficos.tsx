// Gráficos do banco de vibração (SVG próprio, leve): tendência dos globais e espectro com harmônicos da rotação.
import { useMemo, useRef, useState } from 'react'
import type { Limites } from '../lib/omnitrend/ler'

export const CORES = ['#FFC20E', '#38bdf8', '#a78bfa', '#34d399', '#fb7185', '#f97316', '#e879f9', '#94a3b8']
const L = 900
const A = 300
const M = { e: 52, d: 16, t: 14, b: 34 }

function escala(max: number) {
  if (max <= 0) return { max: 1, passo: 0.2 }
  const bruto = max / 5
  const p = 10 ** Math.floor(Math.log10(bruto))
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= bruto)!
  return { max: Math.ceil((max * 1.05) / passo) * passo, passo }
}
const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)).replace('.', ',')
const data = (t: number) => new Date(t * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })

export interface SerieTend {
  nome: string
  pontos: { t: number; v: number }[]
}

/** Tendência no tempo (uma linha por ponto de medição) com as faixas de alarme/alerta. */
export function Tendencia({ series, limites, unidade }: { series: SerieTend[]; limites?: Limites; unidade: string }) {
  const [mira, setMira] = useState<number>()
  const svg = useRef<SVGSVGElement>(null)
  const todos = series.flatMap((s) => s.pontos)
  const t0 = Math.min(...todos.map((p) => p.t))
  const t1 = Math.max(...todos.map((p) => p.t))
  const vmax = Math.max(...todos.map((p) => p.v), limites?.alarme ?? 0, limites?.alerta ?? 0)
  const { max, passo } = escala(vmax)
  const x = (t: number) => M.e + ((t - t0) / Math.max(1, t1 - t0)) * (L - M.e - M.d)
  const y = (v: number) => A - M.b - (v / max) * (A - M.t - M.b)
  if (!todos.length) return <p className="py-10 text-center text-sm text-cinza">Sem medições.</p>
  const anos: number[] = []
  for (let a = new Date(t0 * 1000).getFullYear() + 1; a <= new Date(t1 * 1000).getFullYear(); a++) anos.push(new Date(a, 0, 1).getTime() / 1000)

  const mover = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * L
    setMira(t0 + ((px - M.e) / (L - M.e - M.d)) * (t1 - t0))
  }
  const perto = mira === undefined ? [] : series.map((s) => s.pontos.reduce((a, p) => (Math.abs(p.t - mira) < Math.abs(a.t - mira) ? p : a), s.pontos[0]))

  return (
    <div className="grafico-banco">
      <svg ref={svg} viewBox={`0 0 ${L} ${A}`} onPointerMove={mover} onPointerLeave={() => setMira(undefined)} role="img" aria-label="Tendência">
        {Array.from({ length: Math.round(max / passo) + 1 }, (_, i) => i * passo).map((v) => (
          <g key={v}>
            <line x1={M.e} x2={L - M.d} y1={y(v)} y2={y(v)} className="grade" />
            <text x={M.e - 6} y={y(v) + 4} textAnchor="end" className="eixo">
              {fmt(v)}
            </text>
          </g>
        ))}
        {anos.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={M.t} y2={A - M.b} className="grade" />
            <text x={x(t)} y={A - M.b + 16} textAnchor="middle" className="eixo">
              {new Date(t * 1000).getFullYear()}
            </text>
          </g>
        ))}
        {limites?.alerta !== undefined && limites.alerta < max && (
          <g>
            <line x1={M.e} x2={L - M.d} y1={y(limites.alerta)} y2={y(limites.alerta)} className="lim-alerta" />
            <text x={L - M.d - 4} y={y(limites.alerta) - 4} textAnchor="end" className="eixo lim-txt">
              alerta {fmt(limites.alerta)}
            </text>
          </g>
        )}
        {limites?.alarme !== undefined && limites.alarme <= max && (
          <g>
            <line x1={M.e} x2={L - M.d} y1={y(limites.alarme)} y2={y(limites.alarme)} className="lim-alarme" />
            <text x={L - M.d - 4} y={y(limites.alarme) - 4} textAnchor="end" className="eixo lim-txt">
              alarme {fmt(limites.alarme)}
            </text>
          </g>
        )}
        {series.map((s, k) => (
          <g key={s.nome} style={{ color: CORES[k % CORES.length] }}>
            <polyline className="serie" points={s.pontos.map((p) => `${x(p.t)},${y(p.v)}`).join(' ')} />
            {s.pontos.map((p) => (
              <circle key={p.t} cx={x(p.t)} cy={y(p.v)} r="2.6" className="marca" />
            ))}
          </g>
        ))}
        {mira !== undefined && perto[0] && (
          <g>
            <line x1={x(perto[0].t)} x2={x(perto[0].t)} y1={M.t} y2={A - M.b} className="mira" />
            {perto.map((p, k) => p && <circle key={k} cx={x(p.t)} cy={y(p.v)} r="5" fill="none" stroke={CORES[k % CORES.length]} strokeWidth="2" />)}
          </g>
        )}
        <text x={12} y={M.t + 4} className="eixo" transform={`rotate(-90 12 ${M.t + 4})`} textAnchor="end">
          {unidade}
        </text>
      </svg>
      <div className="legenda-banco">
        {series.map((s, k) => (
          <span key={s.nome}>
            <i style={{ background: CORES[k % CORES.length] }} />
            {s.nome}
            {perto[k] && mira !== undefined && (
              <b>
                {fmt(perto[k].v)} {unidade} · {data(perto[k].t)}
              </b>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}

export interface CurvaEsp {
  nome: string
  passo: number
  valores: number[]
}

/** Espectro (uma ou mais curvas sobrepostas) com marcas de 1× a 6× a rotação. */
export function EspectroGrafico({ curvas, rpm, unidade, sinal = false }: { curvas: CurvaEsp[]; rpm?: number; unidade: string; sinal?: boolean }) {
  const [mira, setMira] = useState<number>()
  const svg = useRef<SVGSVGElement>(null)
  const fmax = Math.max(...curvas.map((c) => c.passo * c.valores.length))
  const [zoom, setZoom] = useState(1)
  const xmax = fmax / zoom
  const vmax = Math.max(...curvas.flatMap((c) => c.valores.slice(0, Math.ceil(xmax / c.passo)).map(Math.abs)))
  const { max, passo } = escala(vmax)
  const vmin = sinal ? -max : 0
  const x = (f: number) => M.e + (f / xmax) * (L - M.e - M.d)
  const y = (v: number) => A - M.b - ((v - vmin) / (max - vmin)) * (A - M.t - M.b)
  // reduz a ~1400 pontos guardando o pico de cada faixa (o espectro não perde os picos)
  const linhas = useMemo(
    () =>
      curvas.map((c) => {
        const n = Math.min(c.valores.length, Math.ceil(xmax / c.passo))
        const grupo = Math.max(1, Math.floor(n / 1400))
        const pts: string[] = []
        for (let i = 0; i < n; i += grupo) {
          let pico = c.valores[i]
          for (let k = 1; k < grupo && i + k < n; k++) if (Math.abs(c.valores[i + k]) > Math.abs(pico)) pico = c.valores[i + k]
          pts.push(`${x(i * c.passo).toFixed(1)},${y(pico).toFixed(1)}`)
        }
        return pts.join(' ')
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [curvas, xmax, max],
  )
  const f1 = rpm ? rpm / 60 : undefined
  const passoX = escala(xmax).passo
  const mover = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect()
    setMira(Math.max(0, (((e.clientX - r.left) / r.width) * L - M.e) / (L - M.e - M.d)) * xmax)
  }
  const valorEm = (c: CurvaEsp, f: number) => {
    const i = Math.round(f / c.passo)
    let melhor = i
    for (let k = Math.max(0, i - 3); k <= Math.min(c.valores.length - 1, i + 3); k++) if (Math.abs(c.valores[k]) > Math.abs(c.valores[melhor] ?? 0)) melhor = k
    return { f: melhor * c.passo, v: c.valores[melhor] ?? 0 }
  }
  return (
    <div className="grafico-banco">
      <div className="mb-1 flex items-center justify-end gap-1 text-xs">
        {[1, 2, 4, 8].map((z) => (
          <button key={z} className={`zoom-bt ${zoom === z ? 'on' : ''}`} onClick={() => setZoom(z)}>
            {z === 1 ? 'tudo' : `0–${fmt(fmax / z)} ${sinal ? 'ms' : 'Hz'}`}
          </button>
        ))}
      </div>
      <svg ref={svg} viewBox={`0 0 ${L} ${A}`} onPointerMove={mover} onPointerLeave={() => setMira(undefined)} role="img" aria-label={sinal ? 'Sinal no tempo' : 'Espectro'}>
        {Array.from({ length: Math.round((max - vmin) / passo) + 1 }, (_, i) => vmin + i * passo).map((v) => (
          <g key={v}>
            <line x1={M.e} x2={L - M.d} y1={y(v)} y2={y(v)} className="grade" />
            <text x={M.e - 6} y={y(v) + 4} textAnchor="end" className="eixo">
              {fmt(v)}
            </text>
          </g>
        ))}
        {Array.from({ length: Math.floor(xmax / passoX) + 1 }, (_, i) => i * passoX).map((f) => (
          <text key={f} x={x(f)} y={A - M.b + 16} textAnchor="middle" className="eixo">
            {fmt(f)}
          </text>
        ))}
        {!sinal &&
          f1 &&
          [1, 2, 3, 4, 5, 6]
            .map((h) => h * f1)
            .filter((f) => f < xmax)
            .map((f, i) => (
              <g key={f}>
                <line x1={x(f)} x2={x(f)} y1={M.t} y2={A - M.b} className="harmonico" />
                <text x={x(f) + 3} y={M.t + 10} className="eixo harm-txt">
                  {i + 1}×
                </text>
              </g>
            ))}
        {linhas.map((pts, k) => (
          <polyline key={k} points={pts} className="serie fina" style={{ color: CORES[k % CORES.length], opacity: k ? 0.75 : 1 }} />
        ))}
        {mira !== undefined && <line x1={x(mira)} x2={x(mira)} y1={M.t} y2={A - M.b} className="mira" />}
        <text x={L - M.d} y={A - 4} textAnchor="end" className="eixo">
          {sinal ? 'ms' : 'Hz'}
        </text>
        <text x={12} y={M.t + 4} className="eixo" transform={`rotate(-90 12 ${M.t + 4})`} textAnchor="end">
          {unidade}
        </text>
      </svg>
      <div className="legenda-banco">
        {curvas.map((c, k) => {
          const p = mira !== undefined ? valorEm(c, mira) : undefined
          return (
            <span key={c.nome}>
              <i style={{ background: CORES[k % CORES.length] }} />
              {c.nome}
              {p && (
                <b>
                  {fmt(p.f)} {sinal ? 'ms' : 'Hz'}
                  {!sinal && f1 ? ` (${fmt(p.f / f1)}×)` : ''} · {fmt(p.v)} {unidade}
                </b>
              )}
            </span>
          )
        })}
        {f1 && !sinal && <span className="text-cinza">rotação {Math.round(f1 * 60)} rpm = {fmt(f1)} Hz</span>}
      </div>
    </div>
  )
}
