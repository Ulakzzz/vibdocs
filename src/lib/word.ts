// Exportação em Word (.docx) no navegador, com o mesmo conteúdo e layout do PDF (modelo VMN).
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlignTable,
  WidthType,
  type ICropOptions,
  type ParagraphChild,
} from 'docx'
import { CONDICOES, severidade } from './condicao'
import { blobImagem } from './imagens'
import { mesCurto } from './historico'
import {
  anomaliaDe,
  colunasQuadro,
  condicaoNoMes,
  dataPorExtenso,
  reincidenciaFinal,
  equipamentosAnomalia,
  equipamentosQuadro,
  juntar,
  type ImagemRef,
  type Relatorio,
  type Slot,
} from './relatorio'

// A4 em twips (1/20 pt) e margens de 2 cm.
const PAG_L = 11906
const PAG_A = 16838
const MARGEM = 1134
const UTIL = PAG_L - 2 * MARGEM // largura útil em twips
const TWIP_PX = 96 / 1440 // twips → pixels a 96 dpi
const FONTE = 'Arial'

/** "#abc" ou "#aabbcc" → "AABBCC" (o Word exige 6 dígitos). */
const hex = (cor: string) => {
  const h = cor.replace('#', '').toUpperCase()
  return h.length === 3 ? h.replace(/./g, (c) => c + c) : h
}
const t = (texto: string, o: { bold?: boolean; size?: number; color?: string } = {}) =>
  new TextRun({ text: texto, font: FONTE, bold: o.bold, size: o.size ?? 20, color: o.color })
const p = (filhos: ParagraphChild[] | string, o: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; antes?: number; depois?: number; quebra?: boolean } = {}) =>
  new Paragraph({
    children: typeof filhos === 'string' ? [t(filhos)] : filhos,
    alignment: o.align,
    spacing: { before: o.antes ?? 0, after: o.depois ?? 80 },
    pageBreakBefore: o.quebra,
  })

const SEM_BORDA = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const BORDA = { style: BorderStyle.SINGLE, size: 6, color: '000000' }
const semBordas = { top: SEM_BORDA, bottom: SEM_BORDA, left: SEM_BORDA, right: SEM_BORDA, insideHorizontal: SEM_BORDA, insideVertical: SEM_BORDA }
const comBordas = { top: BORDA, bottom: BORDA, left: BORDA, right: BORDA, insideHorizontal: BORDA, insideVertical: BORDA }

function celula(filhos: Paragraph[], o: { largura?: number; fundo?: string; colunas?: number; centro?: boolean } = {}) {
  return new TableCell({
    children: filhos,
    width: o.largura ? { size: o.largura, type: WidthType.DXA } : undefined,
    columnSpan: o.colunas,
    shading: o.fundo ? { type: ShadingType.CLEAR, color: 'auto', fill: hex(o.fundo) } : undefined,
    verticalAlign: o.centro ? VerticalAlignTable.CENTER : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
  })
}

// ---------- imagens ----------
const ESPACOS: Record<Slot, { l: number; a: number }> = {
  // em pixels a 96 dpi; espelham a grade da prévia
  tendencia: { l: Math.floor(UTIL * TWIP_PX) - 16, a: 215 },
  espectro: { l: Math.floor(UTIL * TWIP_PX * (2 / 3)) - 16, a: 230 },
  foto: { l: Math.floor(UTIL * TWIP_PX * (1 / 3)) - 16, a: 230 },
}

async function imagemNoEspaco(img: ImagemRef, slot: Slot, quantas: number): Promise<ImageRun | undefined> {
  const blob = await blobImagem(img.id)
  if (!blob) return undefined
  const bmp = await createImageBitmap(blob)
  const { width: w, height: h } = bmp
  bmp.close()
  const caixa = { l: Math.floor(ESPACOS[slot].l / quantas) - (quantas > 1 ? 6 : 0), a: ESPACOS[slot].a }
  let largura: number, altura: number
  let crop: ICropOptions | undefined
  if (img.ajuste === 'preencher') {
    // ocupa o espaço inteiro e recorta o excesso, centralizado
    largura = caixa.l
    altura = caixa.a
    const rImg = w / h
    const rCaixa = caixa.l / caixa.a
    if (rImg > rCaixa) {
      const sobra = (1 - rCaixa / rImg) * 50
      crop = { left: sobra, right: sobra, top: 0, bottom: 0 }
    } else {
      const sobra = (1 - rImg / rCaixa) * 50
      crop = { top: sobra, bottom: sobra, left: 0, right: 0 }
    }
  } else {
    // imagem inteira, sem distorcer
    const escala = Math.min(caixa.l / w, caixa.a / h)
    largura = Math.round(w * escala)
    altura = Math.round(h * escala)
  }
  return new ImageRun({
    type: 'jpg',
    data: await blob.arrayBuffer(),
    transformation: { width: largura, height: altura },
    crop,
    altText: { name: img.nome, description: img.nome, title: img.nome },
  })
}

async function espaco(imagens: ImagemRef[], slot: Slot): Promise<Paragraph> {
  const dela = imagens.filter((i) => i.slot === slot)
  const runs = (await Promise.all(dela.map((i) => imagemNoEspaco(i, slot, dela.length)))).filter(Boolean) as ImageRun[]
  return new Paragraph({ children: runs, alignment: AlignmentType.CENTER, spacing: { after: 0 } })
}

// ---------- documento ----------
function cabecalho() {
  return new Header({
    children: [
      new Table({
        width: { size: UTIL, type: WidthType.DXA },
        columnWidths: [UTIL / 2, UTIL / 2],
        borders: { ...semBordas, bottom: { style: BorderStyle.SINGLE, size: 12, color: 'F5B800' } },
        rows: [
          new TableRow({
            children: [
              celula([
                p([t('José P. Xavier Sobrinho, 101 - B. Triângulo', { size: 14 })], { depois: 0 }),
                p([t('Pedro Leopoldo – MG – Brasil - CEP:33600-000', { size: 14 })], { depois: 0 }),
              ]),
              celula([p([t('PRÜFTECHNIK · MGS', { bold: true, size: 22 })], { align: AlignmentType.RIGHT })], { centro: true }),
            ],
          }),
        ],
      }),
    ],
  })
}

function rodape(r: Relatorio) {
  return new Footer({
    children: [
      p([t(`${r.codigo}   ·   página `, { size: 14, color: '777777' }), new TextRun({ children: [PageNumber.CURRENT], font: FONTE, size: 14, color: '777777' })], {
        align: AlignmentType.RIGHT,
      }),
    ],
  })
}

function quadro(r: Relatorio): (Paragraph | Table)[] {
  const eqs = equipamentosQuadro(r)
  if (!eqs.length) return [p([t('Nenhum equipamento com as condições selecionadas.', { color: '777777' })])]
  const meses = colunasQuadro(r)
  const lMes = 760
  const lLocal = Math.round((UTIL - lMes * meses.length) * 0.42)
  const larg = [lLocal, UTIL - lMes * meses.length - lLocal, ...meses.map(() => lMes)]
  const cab = ['Local de instalação', 'Descrição', ...meses.map(mesCurto)].map((h, i) =>
    celula([p([t(h, { bold: true, size: 16, color: 'FFFFFF' })], { align: AlignmentType.CENTER, depois: 0 })], { largura: larg[i], fundo: '#002060' }),
  )
  const linhas = eqs.map(
    (e) =>
      new TableRow({
        children: [
          celula([p([t(e.local, { size: 16 })], { depois: 0 })], { largura: larg[0] }),
          celula([p([t(e.descricao, { size: 16 })], { depois: 0 })], { largura: larg[1] }),
          ...meses.map((m, i) => {
            const c = condicaoNoMes(r, e, m)
            const k = CONDICOES[c] ?? CONDICOES.X
            return celula([p([t(c, { size: 16, color: hex(k.texto) })], { align: AlignmentType.CENTER, depois: 0 })], {
              largura: larg[2 + i],
              fundo: k.cor,
            })
          }),
        ],
      }),
  )
  return [
    new Table({
      width: { size: UTIL, type: WidthType.DXA },
      columnWidths: larg,
      borders: comBordas,
      rows: [new TableRow({ children: cab, tableHeader: true }), ...linhas],
    }),
  ]
}

async function paginaAnomalia(r: Relatorio, local: string): Promise<(Paragraph | Table)[]> {
  const e = r.equipamentos.find((x) => x.local === local)!
  const a = anomaliaDe(r, e)
  const sev = severidade(e.condicao)
  const corSev = (s: string) => (s === 'Alarme' ? '#ff0000' : s === 'Alerta' ? '#ffc000' : '#ffff00')

  const titulo = new Table({
    width: { size: UTIL, type: WidthType.DXA },
    columnWidths: [Math.round(UTIL * 0.7), UTIL - Math.round(UTIL * 0.7)],
    borders: { ...semBordas, bottom: { style: BorderStyle.SINGLE, size: 12, color: '000000' } },
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          celula([p([t('Relatório de Análise de Vibração', { bold: true, size: 30, color: 'E00000' })], { depois: 0 })]),
          celula([p([t('Anomalia pendente', { bold: true, size: 18 })], { align: AlignmentType.RIGHT, depois: 0 })], { centro: true }),
        ],
      }),
    ],
  })

  const info = [
    ['Localização', r.areaTitulo || r.sigla],
    ['Equipamento', a.equipamento || e.descricao],
    ['Local de instalação', e.local],
    ['Data', a.dataMedicao || '—'],
    ['Reincidente desde', reincidenciaFinal(r, e, a) || '—'],
    ['Notas PR', a.notasPR || '—'],
  ].map(([k, v]) => p([t(`${k}: ${v}`, { bold: true, size: 20 })], { depois: 30 }))

  const severidades = new Table({
    width: { size: 1700, type: WidthType.DXA },
    columnWidths: [400, 1300],
    borders: semBordas,
    rows: (['Alarme', 'Alerta', 'Pré-alerta'] as const).map(
      (s) =>
        new TableRow({
          children: [
            new TableCell({
              children: [p('', { depois: 0 })],
              width: { size: 400, type: WidthType.DXA },
              shading: { type: ShadingType.CLEAR, color: 'auto', fill: sev === s ? hex(corSev(s)) : 'FFFFFF' },
              borders: { top: BORDA, bottom: BORDA, left: BORDA, right: BORDA },
            }),
            celula([p([t(s, { bold: true, size: 18 })], { depois: 0 })], { centro: true }),
          ],
        }),
    ),
  })

  const cabecalhoAnomalia = new Table({
    width: { size: UTIL, type: WidthType.DXA },
    columnWidths: [UTIL - 1900, 1900],
    borders: semBordas,
    rows: [new TableRow({ children: [celula(info), new TableCell({ children: [severidades], width: { size: 1900, type: WidthType.DXA } })] })],
  })

  const caixa = (rotulo: string, linhas: [string, string][]) =>
    new Table({
      width: { size: UTIL, type: WidthType.DXA },
      columnWidths: [UTIL],
      borders: comBordas,
      rows: [
        new TableRow({
          height: { value: 1700, rule: 'atLeast' },
          children: [
            celula([
              p([t(rotulo, { bold: true, size: 20 })], { depois: 100 }),
              ...linhas.map(([nome, texto]) => p([t(`${nome}: `, { bold: true }), t(texto)], { align: AlignmentType.JUSTIFIED, depois: 80 })),
            ]),
          ],
        }),
      ],
    })

  const temImg = (s: Slot) => a.imagens.some((i) => i.slot === s)
  const blocos: (Paragraph | Table)[] = [
    titulo,
    p('', { depois: 60 }),
    cabecalhoAnomalia,
    p('', { depois: 60 }),
    caixa('Situação:', a.eixos.map((x) => [x.nome, juntar(x.situacaoPadrao, x.situacaoTecnico)])),
    p('', { depois: 60 }),
    caixa('Recomendação:', a.eixos.map((x) => [x.nome, juntar(x.recomendacaoPadrao, x.recomendacaoTecnico)])),
  ]

  if (a.imagens.length) {
    const c1 = Math.round(UTIL * (2 / 3))
    const linhas: TableRow[] = []
    if (temImg('tendencia'))
      linhas.push(new TableRow({ cantSplit: true, children: [celula([await espaco(a.imagens, 'tendencia')], { colunas: 2, largura: UTIL })] }))
    if (temImg('espectro') || temImg('foto'))
      linhas.push(
        new TableRow({
          cantSplit: true,
          children: [
            celula([await espaco(a.imagens, 'espectro')], { largura: c1, centro: true }),
            celula([await espaco(a.imagens, 'foto')], { largura: UTIL - c1, centro: true }),
          ],
        }),
      )
    blocos.push(
      p('', { depois: 60 }),
      new Table({ width: { size: UTIL, type: WidthType.DXA }, columnWidths: [c1, UTIL - c1], borders: comBordas, rows: linhas }),
    )
  }
  return blocos
}

export async function gerarWord(r: Relatorio): Promise<Blob> {
  const capa = [
    p('', { antes: 2400 }),
    p([t('Relatório de Análise de Vibração', { bold: true, size: 52 })], { align: AlignmentType.CENTER, depois: 1600 }),
    p([t('Número do Relatório: '), t(r.codigo, { bold: true }), t(r.areaTitulo ? ` – ${r.areaTitulo}` : '')], {
      align: AlignmentType.CENTER,
      depois: 3600,
    }),
    p([t(`${r.cidade ? `${r.cidade}, ` : ''}${dataPorExtenso(r.dataExpedicao)}`)], { align: AlignmentType.CENTER }),
  ]

  const condicao: (Paragraph | Table)[] = [
    p([t('1. Condição dos equipamentos da rota', { bold: true, size: 24 })], { quebra: true, depois: 160 }),
    ...quadro(r),
    p([t('Equipe técnica', { bold: true, size: 24 })], { antes: 360, depois: 100 }),
    p(`Técnico responsável pela coleta de dados: ${r.equipe.coleta || '—'}`, { depois: 40 }),
    p(`Técnico responsável pela análise de dados: ${r.equipe.analise || '—'}`),
  ]

  const anomalias = equipamentosAnomalia(r)
  if (anomalias.length)
    condicao.push(
      p([t('Anomalias registradas', { bold: true, size: 24 })], { antes: 360, depois: 100 }),
      p('A seguir as anomalias detectadas nos equipamentos monitorados.'),
    )

  const paginas: (Paragraph | Table)[] = []
  for (const e of anomalias) {
    paginas.push(p('', { quebra: true, depois: 0 }), ...(await paginaAnomalia(r, e.local)))
  }

  const doc = new Document({
    creator: r.atualizadoPor || 'VibDocs',
    title: `${r.codigo}${r.areaTitulo ? ` - ${r.areaTitulo}` : ''}`,
    description: 'Relatório de Análise de Vibração',
    styles: { default: { document: { run: { font: FONTE, size: 20 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAG_L, height: PAG_A },
            margin: { top: MARGEM, bottom: MARGEM, left: MARGEM, right: MARGEM, header: 500, footer: 400 },
            borders: {
              pageBorderLeft: { style: BorderStyle.SINGLE, size: 96, color: '000000', space: 24 },
              pageBorders: { offsetFrom: 'page' },
            },
          },
        },
        headers: { default: cabecalho() },
        footers: { default: rodape(r) },
        children: [...capa, ...condicao, ...paginas],
      },
    ],
  })
  return Packer.toBlob(doc)
}

export const nomeArquivo = (r: Relatorio, ext: string) =>
  `${r.codigo}${r.areaTitulo ? ` - ${r.areaTitulo}` : ''}.${ext}`.replace(/[\\/:*?"<>|]/g, '-')
