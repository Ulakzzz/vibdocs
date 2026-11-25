// Gráficos de barras (com linha de índice opcional) em SVG puro, no estilo do modelo VMN.
// O mesmo SVG é usado na prévia/PDF e convertido em PNG para o Word.
import { mesCurto } from '../lib/historico'
import type { Indicadores } from '../lib/indicadores'

interface Serie {
  nome: string
  cor: string
  valores: number[]
}
interface Linha {
  nome: string
  cor: string
  valores: (number | null)[] // 0..1
}
interface Grafico {
  titulo: string
  rotulos: string[]
  series: Serie[]
  linha?: Linha
}

export const LARGURA = 680
export const ALTURA = 250

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const pct = (v: number) => `${(v * 100).toFixed(1).replace('.', ',')}%`

function tetoBonito(v: number) {
  if (v <= 2) return 2
  if (v <= 5) return 5
  const p = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p
  return 10 * p
}

export function svgGrafico(g: Grafico): string {
  const L = LARGURA
  const A = ALTURA
  const area = { x: 44, y: 46, l: L - 44 - 190, a: A - 46 - 34 }
  const max = tetoBonito(Math.max(1, ...g.series.flatMap((s) => s.valores)))
  const passos = max <= 5 ? max : 5
  const y = (v: number) => area.y + area.a - (v / max) * area.a
  const grupo = area.l / Math.max(1, g.rotulos.length)
  const barra = Math.min(34, (grupo * 0.7) / Math.max(1, g.series.length))
  const partes: string[] = []

  partes.push(`<rect x="0.5" y="0.5" width="${L - 1}" height="${A - 1}" fill="#fff" stroke="#000"/>`)
  partes.push(`<text x="${area.x + area.l / 2}" y="26" font-size="15" font-weight="bold" text-anchor="middle">${esc(g.titulo)}</text>`)

  // eixo e grade
  for (let i = 0; i <= passos; i++) {
    const v = (max / passos) * i
    const yy = y(v)
    partes.push(`<line x1="${area.x}" x2="${area.x + area.l}" y1="${yy}" y2="${yy}" stroke="#e5e5e5"/>`)
    partes.push(`<text x="${area.x - 6}" y="${yy + 4}" font-size="10" text-anchor="end">${Number.isInteger(v) ? v : v.toFixed(1).replace('.', ',')}</text>`)
  }
  partes.push(`<line x1="${area.x}" x2="${area.x}" y1="${area.y}" y2="${area.y + area.a}" stroke="#000"/>`)
  partes.push(`<line x1="${area.x}" x2="${area.x + area.l}" y1="${area.y + area.a}" y2="${area.y + area.a}" stroke="#000"/>`)

  // barras
  g.rotulos.forEach((rot, i) => {
    const centro = area.x + grupo * i + grupo / 2
    const inicio = centro - (barra * g.series.length) / 2
    g.series.forEach((s, k) => {
      const v = s.valores[i] ?? 0
      const x = inicio + k * barra
      partes.push(`<rect x="${x}" y="${y(v)}" width="${barra - 2}" height="${area.y + area.a - y(v)}" fill="${s.cor}" stroke="#333" stroke-width="0.5"/>`)
      if (v > 0) partes.push(`<text x="${x + (barra - 2) / 2}" y="${y(v) - 4}" font-size="10" text-anchor="middle">${v}</text>`)
    })
    partes.push(`<text x="${centro}" y="${area.y + area.a + 18}" font-size="11" text-anchor="middle">${esc(rot)}</text>`)
  })

  // linha do índice (0..100% ocupa a altura do gráfico)
  if (g.linha) {
    const pts = g.linha.valores
      .map((v, i) => (v === null ? null : [area.x + grupo * i + grupo / 2, area.y + area.a - v * area.a * 0.9] as const))
    const validos = pts.filter(Boolean) as (readonly [number, number])[]
    if (validos.length > 1)
      partes.push(`<polyline points="${validos.map(([a, b]) => `${a},${b}`).join(' ')}" fill="none" stroke="${g.linha.cor}" stroke-width="2.5"/>`)
    pts.forEach((p, i) => {
      if (!p) return
      partes.push(`<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${g.linha!.cor}"/>`)
      // contorno branco para não se misturar com os números das barras
      partes.push(
        `<text x="${p[0] + 6}" y="${p[1] - 7}" font-size="10" font-weight="bold" fill="${g.linha!.cor}" stroke="#fff" stroke-width="3" paint-order="stroke">${pct(g.linha!.valores[i]!)}</text>`,
      )
    })
  }

  // legenda
  const lx = area.x + area.l + 18
  let ly = area.y + 4
  const legenda = [...g.series.map((s) => ({ ...s, tipo: 'barra' })), ...(g.linha ? [{ ...g.linha, tipo: 'linha' }] : [])]
  partes.push(`<rect x="${lx - 8}" y="${ly - 12}" width="${L - lx - 4}" height="${legenda.length * 22 + 10}" fill="#fff" stroke="#000"/>`)
  for (const item of legenda) {
    if (item.tipo === 'barra') partes.push(`<rect x="${lx}" y="${ly - 8}" width="12" height="10" fill="${item.cor}" stroke="#333" stroke-width="0.5"/>`)
    else partes.push(`<line x1="${lx - 2}" x2="${lx + 14}" y1="${ly - 3}" y2="${ly - 3}" stroke="${item.cor}" stroke-width="3"/>`)
    partes.push(`<text x="${lx + 20}" y="${ly + 1}" font-size="10.5">${esc(item.nome)}</text>`)
    ly += 22
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${A}" width="${L}" height="${A}" font-family="Arial, Helvetica, sans-serif">${partes.join('')}</svg>`
}

/** Converte o SVG em PNG (no navegador), com resolução extra para impressão. */
export async function svgParaPng(svg: string, escala = 2): Promise<ArrayBuffer> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const c = document.createElement('canvas')
    c.width = LARGURA * escala
    c.height = ALTURA * escala
    const g = c.getContext('2d')!
    g.fillStyle = '#fff'
    g.fillRect(0, 0, c.width, c.height)
    g.drawImage(img, 0, 0, c.width, c.height)
    const blob = await new Promise<Blob>((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error('Falha ao gerar o gráfico'))), 'image/png'))
    return blob.arrayBuffer()
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Os três gráficos do relatório, na ordem do modelo VMN. */
export function graficosDoRelatorio(ind: Indicadores) {
  const rot = ind.meses.map(mesCurto)
  return {
    execucao: svgGrafico({
      titulo: 'Índice de execução (ORDENS)',
      rotulos: rot,
      series: [
        { nome: 'Ordens planejadas', cor: '#002060', valores: ind.execucao.map((x) => x.planejadas) },
        { nome: 'Ordens executadas', cor: '#00b050', valores: ind.execucao.map((x) => x.executadas) },
        { nome: 'Não executadas ou parciais', cor: '#00b0f0', valores: ind.execucao.map((x) => x.naoExecutadas) },
      ],
      linha: { nome: 'Índice de execução', cor: '#1f3864', valores: ind.execucao.map((x) => x.indice) },
    }),
    anomalias: svgGrafico({
      titulo: 'Indicador de anomalias',
      rotulos: rot,
      series: [
        { nome: 'Anomalias em alarme', cor: '#ff0000', valores: ind.anomalias.map((x) => x.alarme) },
        { nome: 'Anomalias em alerta', cor: '#ffc000', valores: ind.anomalias.map((x) => x.alerta) },
        { nome: 'Anomalias monitoráveis', cor: '#92d050', valores: ind.anomalias.map((x) => x.monitoraveis) },
      ],
    }),
    reincidencia: svgGrafico({
      titulo: 'Índice de reincidência',
      rotulos: rot,
      series: [
        { nome: 'Total de anomalias', cor: '#953735', valores: ind.reincidencia.map((x) => x.total) },
        { nome: 'Anomalias reincidentes', cor: '#000000', valores: ind.reincidencia.map((x) => x.reincidentes) },
      ],
      linha: { nome: 'Índice de reincidência', cor: '#7030a0', valores: ind.reincidencia.map((x) => x.indice) },
    }),
  }
}
