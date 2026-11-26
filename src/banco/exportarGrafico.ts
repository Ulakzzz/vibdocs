// Transforma um gráfico do banco (SVG na tela) numa imagem para o relatório: fundo branco, cores de papel
// e a legenda embaixo. A imagem vai para o quadro "Tendência" ou "Espectro" da página de anomalia.

/** Copia os estilos calculados (CSS) para atributos, para o SVG desenhar igual fora da página. */
function inlinarEstilos(orig: SVGSVGElement, copia: SVGSVGElement) {
  const a = [orig, ...orig.querySelectorAll('*')]
  const b = [copia, ...copia.querySelectorAll('*')]
  a.forEach((el, i) => {
    const cs = getComputedStyle(el)
    const alvo = b[i] as SVGElement
    for (const p of ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity', 'opacity', 'font-size', 'font-weight', 'font-family']) {
      const v = cs.getPropertyValue(p)
      if (v) alvo.setAttribute(p, v)
    }
    // cores de papel: textos e grade escuros/claros sobre o branco
    const cls = (el.getAttribute('class') ?? '').split(' ')
    if (cls.includes('eixo')) alvo.setAttribute('fill', cls.includes('harm-txt') ? '#b8860b' : '#333')
    if (cls.includes('grade')) alvo.setAttribute('stroke', '#e2e2e2')
    if (cls.includes('mira')) alvo.remove()
  })
}

export async function graficoParaImagem(svg: SVGSVGElement, titulo: string, legenda: { nome: string; cor: string }[]): Promise<Blob> {
  const copia = svg.cloneNode(true) as SVGSVGElement
  inlinarEstilos(svg, copia)
  const vb = svg.viewBox.baseVal
  copia.setAttribute('width', String(vb.width))
  copia.setAttribute('height', String(vb.height))
  copia.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copia)], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const esc = 2
    const topo = 34
    const base = 30
    const c = document.createElement('canvas')
    c.width = vb.width * esc
    c.height = (vb.height + topo + base) * esc
    const g = c.getContext('2d')!
    g.scale(esc, esc)
    g.fillStyle = '#fff'
    g.fillRect(0, 0, vb.width, vb.height + topo + base)
    g.fillStyle = '#111'
    g.font = 'bold 14px Arial'
    g.fillText(titulo, 14, 22)
    g.drawImage(img, 0, topo, vb.width, vb.height)
    // legenda
    let x = 52
    g.font = '12px Arial'
    for (const l of legenda) {
      g.fillStyle = l.cor
      g.fillRect(x, vb.height + topo + 10, 10, 10)
      g.fillStyle = '#333'
      g.fillText(l.nome, x + 14, vb.height + topo + 19)
      x += g.measureText(l.nome).width + 32
      if (x > vb.width - 80) break
    }
    return await new Promise<Blob>((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error('Falha ao gerar a imagem'))), 'image/png'))
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Pede ao app para colocar a imagem na página de anomalia da TAG (no relatório aberto). */
export function enviarAoRelatorio(tag: string, blob: Blob, slot: 'tendencia' | 'espectro', nome: string) {
  window.dispatchEvent(new CustomEvent('vibdocs:imagem-banco', { detail: { tag, blob, slot, nome } }))
}
