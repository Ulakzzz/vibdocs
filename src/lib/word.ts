// Word (.docx) SEM o modelo do usuário: monta o documento com a mesma geometria da prévia/PDF
// (moldura de página, rosto, seções numeradas, gráficos do mês e páginas de anomalia sem cabeçalho).
// Com o modelo carregado, o Word sai de modeloWord.ts (preenchendo o próprio .docx).
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HorizontalPositionRelativeFrom,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  TextWrappingType,
  VerticalAlignTable,
  VerticalPositionRelativeFrom,
  WidthType,
  type ParagraphChild,
} from 'docx'
import { CONDICOES, severidade } from './condicao'
import { blobImagem, imagemNaCaixa } from './imagens'
import { mesCurto } from './historico'
import { calcularIndicadores } from './indicadores'
import { ALTURA_MODELO, graficoTiposFalha, graficosDoMes, LARGURA_MODELO, svgParaPng } from '../report/graficos'
import {
  anomaliaDe,
  AREA_IMAGENS_MM,
  colunasQuadro,
  condicaoNoMes,
  dataPorExtenso,
  equipamentosAnomalia,
  equipamentosQuadro,
  juntar,
  linhasExtras,
  localizacaoPadrao,
  textoRelatorio,
  tiposDeFalha,
  posicaoLivre,
  reincidenciaFinal,
  rotulosUsina,
  VAZIO,
  type Relatorio,
} from './relatorio'

// A4 em twips, margens de 1,27 cm (como o modelo)
const PAG_L = 11906
const PAG_A = 16838
const MARGEM = 720
const UTIL = PAG_L - 2 * MARGEM
const PX_TWIP = 96 / 1440
const ARIAL = 'Arial'
const CALIBRI = 'Calibri'

const hex = (cor: string) => {
  const h = cor.replace('#', '').toUpperCase()
  return h.length === 3 ? h.replace(/./g, (c) => c + c) : h
}
const t = (texto: string, o: { b?: boolean; pt?: number; cor?: string; fonte?: string } = {}) =>
  new TextRun({ text: texto, font: o.fonte ?? ARIAL, bold: o.b, size: Math.round((o.pt ?? 11) * 2), color: o.cor })
const p = (
  filhos: ParagraphChild[],
  o: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; antes?: number; depois?: number; quebra?: boolean; recuo?: number; linha?: number } = {},
) =>
  new Paragraph({
    children: filhos,
    alignment: o.align,
    spacing: { before: o.antes ?? 0, after: o.depois ?? 0, line: o.linha },
    pageBreakBefore: o.quebra,
    indent: o.recuo ? { left: o.recuo } : undefined,
  })
/** Título numerado das seções (14 pt, negrito, recuo da lista do modelo). */
const titulo = (n: number, texto: string, o: { quebra?: boolean; antes?: number } = {}) =>
  p([t(`${n}.`, { b: true, pt: 14 }), new TextRun({ text: '\t' }), t(texto, { b: true, pt: 14 })], {
    quebra: o.quebra,
    antes: o.antes ?? 0,
    depois: 220,
    recuo: 357,
  })

const NADA = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const semBordas = { top: NADA, bottom: NADA, left: NADA, right: NADA, insideHorizontal: NADA, insideVertical: NADA }
const linhaFina = (cor = 'A6A6A6') => ({ style: BorderStyle.SINGLE, size: 4, color: cor })

function celula(filhos: Paragraph[], o: { l?: number; fundo?: string; span?: number; centro?: boolean; margem?: number } = {}) {
  return new TableCell({
    children: filhos,
    width: o.l ? { size: o.l, type: WidthType.DXA } : undefined,
    columnSpan: o.span,
    shading: o.fundo ? { type: ShadingType.CLEAR, color: 'auto', fill: hex(o.fundo) } : undefined,
    verticalAlign: o.centro ? VerticalAlignTable.CENTER : undefined,
    margins: { top: 0, bottom: 0, left: o.margem ?? 40, right: o.margem ?? 40 },
  })
}

// ---------- moldura de página (imagem de página inteira no cabeçalho, como o modelo faz) ----------
async function moldura(): Promise<ArrayBuffer> {
  const esc = 150 / 25.4 // px por mm a 150 dpi
  const c = document.createElement('canvas')
  c.width = Math.round(210 * esc)
  c.height = Math.round(297 * esc)
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = '#000'
  g.fillRect(0, 0, 9.5 * esc, c.height)
  g.fillStyle = '#FFC20E'
  g.fillRect(0, 20.5 * esc, c.width, 0.6 * esc)
  g.fillStyle = '#000'
  g.textAlign = 'right'
  g.font = `${4.2 * esc}px Arial`
  g.fillText('PRÜFTECHNIK MGS', c.width - 12.7 * esc, 11 * esc)
  g.font = `${2.8 * esc}px Arial`
  g.fillStyle = '#555'
  g.fillText('Machinery Service', c.width - 12.7 * esc, 15 * esc)
  g.textAlign = 'center'
  g.fillStyle = '#000'
  g.font = `${3.2 * esc}px Arial`
  g.fillText('www.pruftechnik.com/br', c.width / 2, c.height - 6 * esc)
  const blob = await new Promise<Blob>((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error('Falha na moldura'))), 'image/png'))
  return blob.arrayBuffer()
}

async function cabecalho(r: Relatorio) {
  const linhas = ['José P. Xavier Sobrinho, 101 - B. Triângulo', 'Pedro Leopoldo – MG – Brasil - CEP:33600-000']
  if (r.contato?.telefone) linhas.push(`Telefone: ${r.contato.telefone}`)
  const pars = linhas.map((l) => p([t(l, { pt: 8, fonte: CALIBRI })]))
  if (r.contato?.email) pars.push(p([t('Email – ', { pt: 8, fonte: CALIBRI }), t(r.contato.email, { pt: 8, fonte: CALIBRI, cor: '0563C1' })]))
  pars[0] = new Paragraph({
    children: [
      new ImageRun({
        type: 'png',
        data: await moldura(),
        transformation: { width: Math.round((PAG_L * PX_TWIP) as number), height: Math.round(PAG_A * PX_TWIP) },
        floating: {
          horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
          verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
          wrap: { type: TextWrappingType.NONE },
          behindDocument: true,
          allowOverlap: true,
        },
        altText: { name: 'Moldura', description: 'Moldura da página', title: 'Moldura' },
      }),
      t(linhas[0], { pt: 8, fonte: CALIBRI }),
    ],
  })
  return new Header({ children: pars })
}

const rodape = (r: Relatorio) =>
  new Footer({ children: r.art?.trim() ? [new Paragraph({ children: [t(`ART: ${r.art.trim()}`, { b: true, pt: 14, fonte: CALIBRI })], indent: { firstLine: 708 } })] : [] })

// ---------- 1. condição ----------
function legenda(): Table {
  const esq = ['1', '2', '3', '4', '5', '6', '7']
  const dir = ['8', '9', '10', '11', '12', '13', 'X']
  const lNum = Math.round(UTIL * 0.1)
  const lNome = Math.round(UTIL / 2 - lNum)
  const par = (c: string) => {
    const k = CONDICOES[c]
    return [
      celula([p([t(c, { b: true, pt: 7, cor: hex(k.texto) })], { align: AlignmentType.CENTER })], { l: lNum, fundo: k.cor }),
      celula([p([t(k.nome.toUpperCase(), { pt: 7 })])], { l: lNome }),
    ]
  }
  const preta = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
  return new Table({
    width: { size: lNum * 2 + lNome * 2, type: WidthType.DXA },
    columnWidths: [lNum, lNome, lNum, lNome],
    layout: TableLayoutType.FIXED,
    borders: { top: { ...preta, size: 12 }, bottom: { ...preta, size: 12 }, left: { ...preta, size: 12 }, right: { ...preta, size: 12 }, insideHorizontal: preta, insideVertical: preta },
    rows: [
      new TableRow({ children: [celula([p([t('PRÜFTECHNIK ', { pt: 7 }), t('MGS', { b: true, pt: 7 })])], { span: 4 })] }),
      ...esq.map((c, i) => new TableRow({ cantSplit: true, children: [...par(c), ...par(dir[i])] })),
    ],
  })
}

function quadro(r: Relatorio): (Paragraph | Table)[] {
  const eqs = equipamentosQuadro(r)
  if (!eqs.length) return [p([t('Nenhum equipamento com as condições selecionadas.', { pt: 10, cor: '777777' })], { antes: 200 })]
  const meses = colunasQuadro(r)
  const lMes = 900
  const lPlano = 1150
  const resto = UTIL - lPlano - lMes * meses.length
  const lDesc = Math.round(resto * 0.54)
  const larg = [lPlano, lDesc, resto - lDesc, ...meses.map(() => lMes)]
  const txt = (s: string, o: { b?: boolean; cor?: string } = {}) => p([t(s, { pt: 7, fonte: CALIBRI, ...o })], { align: AlignmentType.CENTER })
  return [
    p([], { depois: 240 }),
    new Table({
      width: { size: UTIL, type: WidthType.DXA },
      columnWidths: larg,
      layout: TableLayoutType.FIXED,
      borders: { top: linhaFina(), bottom: linhaFina(), left: linhaFina(), right: linhaFina(), insideHorizontal: linhaFina(), insideVertical: linhaFina() },
      rows: [
        new TableRow({ tableHeader: true, children: [celula([txt(r.areaTitulo || r.sigla, { b: true })], { span: larg.length })] }),
        new TableRow({
          tableHeader: true,
          children: ['Plano manutenção', 'Descrição', 'Local de instalação', ...meses.map(mesCurto)].map((h, i) => celula([txt(h, { b: true })], { l: larg[i], centro: true })),
        }),
        ...eqs.map(
          (e) =>
            new TableRow({
              cantSplit: true,
              children: [
                celula([txt(e.plano ?? '')], { l: larg[0] }),
                celula([txt(e.descricao)], { l: larg[1] }),
                celula([txt(e.local)], { l: larg[2] }),
                ...meses.map((m, i) => {
                  const c = condicaoNoMes(r, e, m)
                  const k = CONDICOES[c]
                  return celula([txt(c, { b: true, cor: k ? hex(k.texto) : undefined })], { l: larg[3 + i], fundo: k?.cor })
                }),
              ],
            }),
        ),
      ],
    }),
  ]
}

// ---------- página de anomalia ----------
const SEV_COR: Record<string, string> = { Alarme: 'FF0000', Alerta: 'FFC000', 'Pré-alerta': 'FFFF00' }
const NIVEIS = ['Alarme', 'Alerta', 'Pré-alerta'] as const
const GROSSA = { style: BorderStyle.SINGLE, size: 18, color: '000000' }

function caixa(rotulo: string, linhas: [string, string][], comNome: boolean) {
  const borda = { style: BorderStyle.SINGLE, size: 8, color: '000000' }
  return new Table({
    width: { size: UTIL, type: WidthType.DXA },
    columnWidths: [UTIL],
    borders: { top: borda, bottom: borda, left: borda, right: borda, insideHorizontal: NADA, insideVertical: NADA },
    rows: [
      new TableRow({
        cantSplit: true,
        height: { value: 900, rule: 'atLeast' },
        children: [
          new TableCell({
            margins: { top: 72, bottom: 72, left: 144, right: 144 },
            children: [
              p([t(rotulo, { pt: 10 })], { depois: 100 }),
              ...linhas.map(([nome, texto]) => p([...(comNome && nome.trim() ? [t(`${nome.trim()}: `, { b: true, pt: 10 })] : []), t(texto, { pt: 10 })], { align: AlignmentType.JUSTIFIED })),
            ],
          }),
        ],
      }),
    ],
  })
}

async function imagens(r: Relatorio, local: string): Promise<Paragraph> {
  const e = r.equipamentos.find((x) => x.local === local)!
  const a = anomaliaDe(r, e)
  const W = UTIL * PX_TWIP // px a 96 dpi
  const H = (W * AREA_IMAGENS_MM.a) / AREA_IMAGENS_MM.l
  const EMU = 9525
  const runs: ImageRun[] = []
  for (const [ordem, img] of a.imagens.entries()) {
    const blob = await blobImagem(img.id)
    if (!blob) continue
    const pos = posicaoLivre(img, a.imagens)
    // caixa inteira (borda + margem + imagem) numa figura só, do tamanho da caixa da prévia
    const cx = { l: (pos.l / 100) * W, a: (pos.a / 100) * H }
    const desenho = await imagemNaCaixa(blob, (cx.l * 25.4) / 96, (cx.a * 25.4) / 96, img.ajuste)
    runs.push(
      new ImageRun({
        type: 'jpg',
        data: await desenho.arrayBuffer(),
        transformation: { width: Math.round(cx.l), height: Math.round(cx.a) },
        altText: { name: img.nome, description: img.nome, title: img.nome },
        floating: {
          horizontalPosition: { relative: HorizontalPositionRelativeFrom.MARGIN, offset: Math.round(((pos.x / 100) * W) * EMU) },
          verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: Math.round((5.7 + (pos.y / 100) * H) * EMU) },
          wrap: { type: TextWrappingType.NONE },
          allowOverlap: true,
          lockAnchor: true,
          behindDocument: false,
          zIndex: 251659264 + ordem * 1024,
        },
      }),
    )
  }
  return new Paragraph({ children: runs, spacing: { before: 0, after: 0 } })
}

async function paginaAnomalia(r: Relatorio, local: string): Promise<(Paragraph | Table)[]> {
  const e = r.equipamentos.find((x) => x.local === local)!
  const a = anomaliaDe(r, e)
  const sev = severidade(e.condicao)
  const rot = rotulosUsina(r.usina)
  const lSev = 2090
  const campo = (k: string, v: string) => p([t(`${k}:`, { b: true }), t(` ${v}`)], { depois: 150, linha: 230 })
  const topo = new Table({
    width: { size: UTIL, type: WidthType.DXA },
    columnWidths: [UTIL - lSev, lSev],
    borders: semBordas,
    rows: [
      new TableRow({
        children: [
          celula(
            [
              campo('Localização', a.localizacao || localizacaoPadrao(r, e)),
              campo('Equipamento', a.equipamento || e.descricao),
              campo(rot.data, a.dataMedicao || VAZIO),
              campo('Reincidente desde', reincidenciaFinal(r, e, a) || VAZIO),
              campo('Nota PR', a.notasPR || VAZIO),
              ...linhasExtras(r, e, a).map(([k, v]) => campo(k, v)),
            ],
            { l: UTIL - lSev, margem: 0 },
          ),
          new TableCell({
            width: { size: lSev, type: WidthType.DXA },
            borders: { top: NADA, bottom: NADA, left: NADA, right: NADA },
            children: [
              new Table({
                width: { size: lSev, type: WidthType.DXA },
                columnWidths: [407, lSev - 407],
                borders: semBordas,
                rows: rot.severidades.map(
                  (s, i) =>
                    new TableRow({
                      height: { value: 400, rule: 'atLeast' },
                      children: [
                        new TableCell({
                          width: { size: 407, type: WidthType.DXA },
                          borders: { top: GROSSA, bottom: GROSSA, left: GROSSA, right: GROSSA },
                          shading: { type: ShadingType.CLEAR, color: 'auto', fill: sev === NIVEIS[i] ? SEV_COR[NIVEIS[i]] : 'FFFFFF' },
                          children: [p([])],
                        }),
                        celula([p([t(s, { b: true, pt: 9 })])], { l: lSev - 407, centro: true, margem: 110 }),
                      ],
                    }),
                ),
              }),
            ],
          }),
        ],
      }),
    ],
  })
  const situacao = a.eixos.map((x) => [x.nome, juntar(x.situacaoPadrao, x.situacaoTecnico)] as [string, string]).filter(([, s]) => s)
  const recomendacao = a.eixos.map((x) => [x.nome, juntar(x.recomendacaoPadrao, x.recomendacaoTecnico)] as [string, string]).filter(([, s]) => s)
  const linhaGrossa = { bottom: { style: BorderStyle.SINGLE, size: 18, color: '000000', space: 2 } }
  return [
    new Paragraph({
      children: [t('PRÜFTECHNIK ', { pt: 9 }), t('MGS', { b: true, pt: 9 }), new TextRun({ text: '\t' }), t('vallourec', { b: true, pt: 13, cor: '1F3C88' })],
      tabStops: [{ type: 'right', position: UTIL }],
      border: linhaGrossa,
      spacing: { before: 120, after: 80 },
    }),
    new Paragraph({
      children: [t('Relatório de Análise de Vibração', { b: true, pt: 16, cor: 'FF0000' }), new TextRun({ text: '\t' }), t('Anomalia pendente', { b: true, pt: 9 })],
      tabStops: [{ type: 'right', position: UTIL }],
      border: linhaGrossa,
      spacing: { before: 0, after: 160 },
    }),
    topo,
    p([], { depois: 60 }),
    caixa('Situação:', situacao, true),
    p([], { depois: 60 }),
    caixa('Recomendação:', recomendacao, recomendacao.length > 1),
    ...(a.observacoes?.trim() ? [p([], { depois: 60 }), caixa('Observações adicionais:', a.observacoes.split(/\r?\n/).map((l) => ['', l] as [string, string]), false)] : []),
    await imagens(r, local),
  ]
}

// ---------- documento ----------
export async function gerarWord(r: Relatorio): Promise<Blob> {
  const anomalias = equipamentosAnomalia(r)
  const comInd = r.incluirIndicadores !== false
  const nDados = comInd ? 4 : 2
  const ponto = (s: string) => (s && !/[.!?]$/.test(s) ? `${s}.` : s)

  const rosto = [
    p([t('Relatório de Análise de Vibração', { b: true, pt: 28 })], { align: AlignmentType.CENTER, linha: 400, antes: 0 }),
    p([t(`Número do Relatório: ${r.codigo}${r.areaTitulo ? ` - ${r.areaTitulo}` : ''}`, { b: true, pt: 14 })], { antes: 5600, recuo: 700 }),
    p([t(`${r.cidade ? `${r.cidade}, ` : ''}${dataPorExtenso(r.dataExpedicao).replace(/^0/, '')}`, { pt: 14 })], { align: AlignmentType.CENTER, antes: 3700 }),
  ]

  const corrido = (s: string) => s.split(/\r?\n/).map((l) => p([t(l, { pt: 12 })], { depois: 120, align: AlignmentType.JUSTIFIED }))
  const resumo: Paragraph[] = r.incluirResumo
    ? [
        p([t('Resumo', { b: true, pt: 14 })], { quebra: true, depois: 160 }),
        ...corrido(textoRelatorio(r, 'resumo')),
        p([t('Definição da atividade', { b: true, pt: 14 })], { antes: 300, depois: 160 }),
        ...corrido(textoRelatorio(r, 'definicao')),
      ]
    : []
  const condicao: (Paragraph | Table)[] = [titulo(1, 'Condição dos equipamentos da rota', { quebra: true }), legenda(), ...quadro(r)]

  const indicadores: (Paragraph | Table)[] = []
  if (comInd) {
    const g = graficosDoMes(calcularIndicadores(r), r.mesReferencia)
    const l = Math.round(UTIL * PX_TWIP)
    const h = Math.round((l * ALTURA_MODELO) / LARGURA_MODELO)
    const fig = async (svg: string, nome: string) =>
      new Paragraph({
        children: [new ImageRun({ type: 'png', data: await svgParaPng(svg, 2, LARGURA_MODELO, ALTURA_MODELO), transformation: { width: l, height: h }, altText: { name: nome, description: nome, title: nome } })],
        spacing: { after: 100 },
      })
    indicadores.push(
      titulo(2, 'Índice de execução', { quebra: true }),
      await fig(g.execucao, 'Índice de execução'),
      titulo(3, 'Indicadores de anomalia', { antes: 300 }),
      await fig(g.anomalias, 'Indicador de anomalias'),
      await fig(g.reincidencia, 'Índice de reincidências'),
    )
    const tipos = tiposDeFalha(r)
    if (tipos.length) indicadores.push(p([], { quebra: true }), await fig(graficoTiposFalha(tipos), 'Tipo de falhas'))
  }

  const linha14 = (s: string) => p([t(s, { pt: 14 })], { linha: 300 })
  const sub = (s: string, antes: number) => p([t(s, { b: true, pt: 14 })], { antes, depois: 40 })
  const dados: (Paragraph | Table)[] = [
    p([t(`${nDados}.`, { b: true, pt: 14 }), new TextRun({ text: '\t' }), t('Dados operacionais', { b: true, pt: 14 })], { quebra: true, depois: 240 }),
    sub(`${nDados}.1 Equipamentos utilizados`, 0),
    ...(r.aparelho !== '' ? [linha14(`Aparelho: ${ponto(r.aparelho || VAZIO)}`)] : []),
    ...(r.software !== '' ? [linha14(`Software para tratamento dos dados medidos: ${ponto(r.software || VAZIO)}`)] : []),
    ...(r.plataforma ? [linha14(ponto(`Plataforma Web Dynamox: ${r.plataforma}`))] : []),
    sub(`${nDados}.2 Equipe Técnica`, 900),
    linha14(`Técnico responsável pela coleta de dados: ${ponto(r.equipe.coleta || VAZIO)}`),
    linha14(`Técnico responsável pela análise de dados: ${ponto(r.equipe.analise || VAZIO)}`),
  ]
  const selos = [...new Set([r.equipe.seloColeta, r.equipe.seloAnalise].filter(Boolean) as string[])]
  if (selos.length) {
    const runs: (ImageRun | TextRun)[] = []
    for (const [i, s] of selos.entries()) {
      const blob = await (await fetch(s)).blob()
      const bmp = await createImageBitmap(blob)
      const alt = 68
      const larg = Math.round((bmp.width / bmp.height) * alt)
      bmp.close()
      if (i) runs.push(new TextRun({ text: '      ' }))
      runs.push(new ImageRun({ type: blob.type.includes('png') ? 'png' : 'jpg', data: await blob.arrayBuffer(), transformation: { width: larg, height: alt }, altText: { name: 'Selo', description: 'Selo de certificação', title: 'Selo' } }))
    }
    dados.push(new Paragraph({ children: runs, spacing: { before: 200 } }))
  }
  if (anomalias.length) dados.push(sub(`${nDados + 1}. Anomalias registradas`, selos.length ? 200 : 340), linha14('A seguir as anomalias detectadas nos equipamentos monitorados.'))

  const pagina = {
    size: { width: PAG_L, height: PAG_A },
    margin: { top: MARGEM, bottom: MARGEM, left: MARGEM, right: MARGEM, header: 283, footer: 708 },
  }
  const cab = await cabecalho(r)
  const vazioCab = new Header({ children: [] })
  const vazioRod = new Footer({ children: [] })

  const secoes = [
    // corpo com a moldura (o cabeçalho empurra o texto como no modelo)
    {
      properties: { page: { ...pagina, margin: { ...pagina.margin, top: 1900, bottom: 1500 } } },
      headers: { default: cab },
      footers: { default: rodape(r) },
      children: [...rosto, ...resumo, ...condicao, ...indicadores, ...dados],
    },
    // páginas de anomalia: sem cabeçalho nem rodapé, uma seção por equipamento
    ...(await Promise.all(
      anomalias.map(async (e) => ({
        properties: { page: pagina },
        headers: { default: vazioCab },
        footers: { default: vazioRod },
        children: await paginaAnomalia(r, e.local),
      })),
    )),
  ]

  const doc = new Document({
    creator: r.atualizadoPor || 'VibDocs',
    title: `${r.codigo}${r.areaTitulo ? ` - ${r.areaTitulo}` : ''}`,
    description: 'Relatório de Análise de Vibração',
    styles: { default: { document: { run: { font: ARIAL, size: 22 }, paragraph: { spacing: { after: 0 } } } } },
    sections: secoes,
  })
  return Packer.toBlob(doc)
}

export const nomeArquivo = (r: Relatorio, ext: string) =>
  `${r.codigo}${r.areaTitulo ? ` - ${r.areaTitulo}` : ''}.${ext}`.replace(/[\\/:*?"<>|]/g, '-')
