// Word a partir do MODELO do relatório (.docx enviado pelo usuário, guardado no SharePoint/navegador).
// O modelo é preenchido, não recriado: capa, moldura da página, cabeçalho, rodapé, estilos, gráficos
// nativos e páginas de anomalia continuam exatamente como no arquivo original. O modelo NÃO fica no
// repositório (tem logos e dados do cliente).
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { CONDICOES, severidade } from './condicao'
import { blobImagem, imagemNaCaixa } from './imagens'
import { mesCurto } from './historico'
import { ALTURA_MODELO, graficoTiposFalha, LARGURA_MODELO, svgParaPng } from '../report/graficos'
import { calcularIndicadores } from './indicadores'
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

const NS = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
  c: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  w14: 'http://schemas.microsoft.com/office/word/2010/wordml',
  wp14: 'http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
}
const DECL = Object.entries(NS)
  .filter(([k]) => !['rel', 'ct'].includes(k))
  .map(([k, v]) => `xmlns:${k}="${v}"`)
  .join(' ')

const EMU_CM = 360000
const LARGURA_UTIL_DXA = 10466 // A4 com margens de 1,27 cm (as do modelo)

// ---------- XML ----------
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const ler = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml')
const gravar = (d: Document) => new XMLSerializer().serializeToString(d)
const filhos = (el: Element, ns: string, nome: string) => [...el.children].filter((c) => c.namespaceURI === ns && c.localName === nome)
const todos = (el: Element | Document, ns: string, nome: string) => [...el.getElementsByTagNameNS(ns, nome)]
const w = (el: Element | Document, nome: string) => todos(el, NS.w, nome)

/** Converte um trecho de XML (com prefixos w:, r:, wp:...) em nós do documento de destino. */
function frag(doc: Document, xml: string): Element[] {
  const tmp = ler(`<x ${DECL}>${xml}</x>`)
  const erro = tmp.getElementsByTagName('parsererror')[0]
  if (erro) throw new Error(`XML inválido gerado: ${erro.textContent}`)
  return [...tmp.documentElement.children].map((c) => doc.importNode(c, true) as Element)
}

/** Runs de texto diretos do parágrafo (inclui os de hiperlink; ignora caixas de texto e desenhos). */
function runsDe(p: Element): Element[] {
  const out: Element[] = []
  for (const c of p.children) {
    if (c.namespaceURI !== NS.w) continue
    if (c.localName === 'r') out.push(c)
    else if (c.localName === 'hyperlink' || c.localName === 'smartTag' || c.localName === 'ins') out.push(...filhos(c, NS.w, 'r'))
  }
  return out
}
const textoRun = (r: Element) => filhos(r, NS.w, 't').map((t) => t.textContent ?? '').join('') + (filhos(r, NS.w, 'tab').length ? '\t' : '')
const textoP = (p: Element) => runsDe(p).map(textoRun).join('')
const soTexto = (r: Element) => [...r.children].every((c) => ['rPr', 't', 'tab', 'lastRenderedPageBreak', 'noBreakHyphen', 'softHyphen'].includes(c.localName))

function definirT(r: Element, texto: string) {
  const ts = filhos(r, NS.w, 't')
  for (const x of [...filhos(r, NS.w, 'tab'), ...ts.slice(1)]) x.remove()
  let t = ts[0]
  if (!t) {
    t = r.ownerDocument.createElementNS(NS.w, 'w:t')
    r.appendChild(t)
  }
  t.textContent = texto
  t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve')
}

/** Troca todo o texto do parágrafo, mantendo a formatação do primeiro run. */
function trocarTexto(p: Element, novo: string) {
  const runs = runsDe(p).filter(soTexto)
  if (!runs.length) return
  definirT(runs[0], novo)
  for (const r of runs.slice(1)) r.remove()
}

/** "Rótulo: valor" → troca só o valor, mantendo a formatação do rótulo e do valor original. */
function definirValor(p: Element, rotulo: string, valor: string) {
  const runs = runsDe(p)
  let acum = ''
  let k = -1
  let fimNoRun = 0
  for (const [i, r] of runs.entries()) {
    const t = textoRun(r)
    const pos = (acum + t).indexOf(rotulo)
    if (pos >= 0 && pos + rotulo.length > acum.length) {
      k = i
      fimNoRun = pos + rotulo.length - acum.length
      break
    }
    acum += t
  }
  if (k < 0) return false
  const rotRun = runs[k]
  const seguintes = runs.slice(k + 1).filter(soTexto)
  // modelo do run do valor: o primeiro run depois do rótulo que tem texto de verdade
  const base = seguintes.find((r) => textoRun(r).trim()) ?? rotRun
  const novo = base.cloneNode(true) as Element
  if (base === rotRun) {
    // valor estava no mesmo run do rótulo: o valor não leva o negrito do rótulo
    for (const b of [...w(novo, 'b'), ...w(novo, 'bCs')]) b.remove()
  }
  definirT(rotRun, textoRun(rotRun).slice(0, fimNoRun).replace(/\t$/, ''))
  for (const r of seguintes) r.remove()
  definirT(novo, (/\s$/.test(textoRun(rotRun)) ? '' : ' ') + valor)
  rotRun.after(novo)
  return true
}

/** Primeiro parágrafo (em `els`) cujo texto casa com o padrão. */
const acharP = (els: Element[], re: RegExp) => els.find((e) => e.localName === 'p' && re.test(textoP(e)))
const temDesenho = (e: Element) => w(e, 'drawing').length > 0 || w(e, 'pict').length > 0 || w(e, 'object').length > 0
const temSecao = (e: Element) => w(e, 'sectPr').length > 0
const vazio = (e: Element) => e.localName === 'p' && !textoP(e).trim() && !temDesenho(e) && !temSecao(e)

function quebraAntes(p: Element) {
  let ppr = filhos(p, NS.w, 'pPr')[0]
  if (!ppr) {
    ppr = p.ownerDocument.createElementNS(NS.w, 'w:pPr')
    p.prepend(ppr)
  }
  if (!filhos(ppr, NS.w, 'pageBreakBefore').length) {
    const pb = p.ownerDocument.createElementNS(NS.w, 'w:pageBreakBefore')
    // ordem do esquema: pStyle, keepNext, keepLines, pageBreakBefore
    const antes = ['keepLines', 'keepNext', 'pStyle'].map((n) => filhos(ppr!, NS.w, n)[0]).find(Boolean)
    if (antes) antes.after(pb)
    else ppr.prepend(pb)
  }
}

// ---------- pacote ----------
class Pacote {
  zip: JSZip
  private rels = new Map<string, Document>()
  private n = 0
  constructor(zip: JSZip) {
    this.zip = zip
  }
  async xml(caminho: string) {
    const f = this.zip.file(caminho)
    return f ? ler(await f.async('string')) : undefined
  }
  salvar(caminho: string, d: Document) {
    this.zip.file(caminho, gravar(d))
  }
  private caminhoRels(parte: string) {
    const i = parte.lastIndexOf('/')
    return `${parte.slice(0, i)}/_rels/${parte.slice(i + 1)}.rels`
  }
  async relacoes(parte: string) {
    const c = this.caminhoRels(parte)
    if (!this.rels.has(c)) this.rels.set(c, (await this.xml(c)) ?? ler(`<Relationships xmlns="${NS.rel}"/>`))
    return [...this.rels.get(c)!.documentElement.children].map((r) => ({
      el: r,
      id: r.getAttribute('Id')!,
      tipo: r.getAttribute('Type')!,
      alvo: r.getAttribute('Target')!,
    }))
  }
  /** Adiciona uma imagem ao pacote e devolve o id da relação a partir de `parte`. */
  async imagem(parte: string, dados: ArrayBuffer, ext: 'png' | 'jpeg') {
    await this.relacoes(parte)
    const d = this.rels.get(this.caminhoRels(parte))!
    const nome = `vibdocs${++this.n}.${ext}`
    this.zip.file(`word/media/${nome}`, dados)
    const id = `rIdVd${this.n}`
    const r = d.createElementNS(NS.rel, 'Relationship')
    r.setAttribute('Id', id)
    r.setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image')
    r.setAttribute('Target', `media/${nome}`)
    d.documentElement.appendChild(r)
    return id
  }
  async fechar() {
    for (const [c, d] of this.rels) this.salvar(c, d)
    // tipos de imagem usados
    const ct = (await this.xml('[Content_Types].xml'))!
    const exts = [...ct.documentElement.children].map((e) => e.getAttribute('Extension')?.toLowerCase())
    for (const [ext, tipo] of [
      ['png', 'image/png'],
      ['jpeg', 'image/jpeg'],
    ]) {
      if (exts.includes(ext)) continue
      const e = ct.createElementNS(NS.ct, 'Default')
      e.setAttribute('Extension', ext)
      e.setAttribute('ContentType', tipo)
      ct.documentElement.prepend(e)
    }
    this.salvar('[Content_Types].xml', ct)
  }
}

async function bytesDeDataUrl(url: string) {
  const blob = await (await fetch(url)).blob()
  return { dados: await blob.arrayBuffer(), ext: (blob.type.includes('png') ? 'png' : 'jpeg') as 'png' | 'jpeg', blob }
}
async function tamanho(blob: Blob) {
  const b = await createImageBitmap(blob)
  const r = { l: b.width, a: b.height }
  b.close()
  return r
}

// ---------- quadro de condição (no modelo é uma imagem colada; aqui vira tabela no mesmo estilo) ----------
function xmlQuadro(r: Relatorio): string {
  const eqs = equipamentosQuadro(r)
  const meses = colunasQuadro(r)
  const fonte = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>'
  const run = (t: string, o: { b?: boolean; cor?: string } = {}) =>
    `<w:r><w:rPr>${fonte}${o.b ? '<w:b/><w:bCs/>' : ''}${o.cor ? `<w:color w:val="${o.cor}"/>` : ''}<w:sz w:val="14"/><w:szCs w:val="14"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`
  const par = (t: string, o: { b?: boolean; cor?: string; jc?: string } = {}) =>
    `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="${o.jc ?? 'center'}"/></w:pPr>${run(t, o)}</w:p>`
  const lMes = 900
  const lPlano = 1150
  const resto = LARGURA_UTIL_DXA - lPlano - lMes * meses.length
  const lDesc = Math.round(resto * 0.54)
  const larg = [lPlano, lDesc, resto - lDesc, ...meses.map(() => lMes)]
  const cel = (l: number, conteudo: string, fundo?: string, span?: number) =>
    `<w:tc><w:tcPr><w:tcW w:w="${l}" w:type="dxa"/>${span ? `<w:gridSpan w:val="${span}"/>` : ''}${fundo ? `<w:shd w:val="clear" w:color="auto" w:fill="${fundo}"/>` : ''}<w:vAlign w:val="center"/></w:tcPr>${conteudo}</w:tc>`
  const hex = (c: string) => {
    const h = c.replace('#', '').toUpperCase()
    return h.length === 3 ? h.replace(/./g, (x) => x + x) : h
  }
  const linhaTitulo = `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${cel(LARGURA_UTIL_DXA, par(r.areaTitulo || r.sigla, { b: true }), undefined, larg.length)}</w:tr>`
  const cab = `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${['Plano manutenção', 'Descrição', 'Local de instalação', ...meses.map(mesCurto)]
    .map((h, i) => cel(larg[i], par(h, { b: true })))
    .join('')}</w:tr>`
  const linhas = eqs
    .map(
      (e) =>
        `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cel(larg[0], par(e.plano ?? ''))}${cel(larg[1], par(e.descricao))}${cel(larg[2], par(e.local))}${meses
          .map((m, i) => {
            const c = condicaoNoMes(r, e, m)
            const k = CONDICOES[c]
            return cel(larg[3 + i], par(c, { b: true, cor: k ? hex(k.texto) : undefined }), k ? hex(k.cor) : undefined)
          })
          .join('')}</w:tr>`,
    )
    .join('')
  const borda = (n: string) => `<w:${n} w:val="single" w:sz="4" w:space="0" w:color="A6A6A6"/>`
  return `<w:tbl><w:tblPr><w:tblW w:w="${LARGURA_UTIL_DXA}" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(borda).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="40" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="40" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0"/></w:tblPr><w:tblGrid>${larg.map((l) => `<w:gridCol w:w="${l}"/>`).join('')}</w:tblGrid>${linhaTitulo}${cab}${linhas}</w:tbl>`
}

// ---------- gráficos nativos do modelo ----------
async function atualizarGraficos(pk: Pacote, r: Relatorio) {
  const ind = calcularIndicadores(r)
  const doMes = <T extends { mes: string }>(l: T[]) => l.find((x) => x.mes === r.mesReferencia)
  const ex = doMes(ind.execucao)
  const an = doMes(ind.anomalias)
  const re = doMes(ind.reincidencia)
  const valor = (tipo: string, serie: string): number | undefined => {
    const s = serie.toLowerCase()
    if (tipo === 'execucao') return /planejad/.test(s) ? ex?.planejadas : /executad/.test(s) && !/n[ãa]o/.test(s) ? ex?.executadas : ex?.naoExecutadas
    if (tipo === 'anomalias') return /pr[ée]|monitor/.test(s) ? an?.monitoraveis : /alarme/.test(s) ? an?.alarme : /alerta/.test(s) ? an?.alerta : undefined
    if (tipo === 'reincidencia') return /total/.test(s) ? re?.total : /reincident/.test(s) ? re?.reincidentes : undefined
    return undefined
  }
  for (const rel of await pk.relacoes('word/document.xml')) {
    if (!rel.tipo.endsWith('/chart')) continue
    const caminho = `word/${rel.alvo}`
    const d = await pk.xml(caminho)
    if (!d) continue
    const titulo = todos(d, NS.c, 'title')
      .flatMap((t) => todos(t, NS.a, 't').map((x) => x.textContent))
      .join(' ')
      .toLowerCase()
    const tipo = /reincid/.test(titulo) ? 'reincidencia' : /anomal/.test(titulo) ? 'anomalias' : /execu/.test(titulo) ? 'execucao' : ''
    if (!tipo) continue
    const celulas: Record<string, number | undefined> = {}
    for (const ser of todos(d, NS.c, 'ser')) {
      const nome = todos(filhos(ser, NS.c, 'tx')[0] ?? ser, NS.c, 'v')[0]?.textContent ?? ''
      const v = valor(tipo, nome)
      const val = filhos(ser, NS.c, 'val')[0]
      const cache = val && todos(val, NS.c, 'numCache')[0]
      if (!cache) continue
      for (const pt of filhos(cache, NS.c, 'pt')) pt.remove()
      // zero não aparece (como no modelo: barra e rótulo vazios)
      if (v) cache.append(...frag(d, `<c:pt idx="0"><c:v>${v}</c:v></c:pt>`))
      const f = todos(val, NS.c, 'f')[0]?.textContent?.match(/\$([A-Z]+)\$(\d+)/)
      if (f) celulas[`${f[1]}${f[2]}`] = v || undefined
    }
    pk.salvar(caminho, d)
    // planilha embutida do gráfico (o que o Word mostra em "Editar dados")
    const relsGraf = await pk.relacoes(caminho)
    const emb = relsGraf.find((x) => /package|oleObject/.test(x.tipo))
    if (emb) {
      const alvo = new URL(emb.alvo, `http://x/${caminho}`).pathname.slice(1)
      const arq = pk.zip.file(alvo)
      if (arq) {
        const wb = XLSX.read(await arq.async('arraybuffer'), { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        for (const [cel, v] of Object.entries(celulas)) {
          if (v === undefined) delete ws[cel]
          else ws[cel] = { t: 'n', v }
        }
        pk.zip.file(alvo, XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
      }
    }
  }
}

// ---------- página de anomalia ----------
const SEV_COR: Record<string, string> = { Alarme: 'FF0000', Alerta: 'FFC000', 'Pré-alerta': 'FFFF00' }

function caixaTexto(rotulo: string, linhas: [string, string][], comNome: boolean) {
  const rpr = (b: boolean) => `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${b ? '<w:b/><w:bCs/>' : ''}<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>`
  const corpo = linhas
    .map(
      ([nome, t]) =>
        `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="both"/></w:pPr>${comNome && nome.trim() ? `<w:r>${rpr(true)}<w:t xml:space="preserve">${esc(nome.trim())}: </w:t></w:r>` : ''}<w:r>${rpr(false)}<w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`,
    )
    .join('')
  const borda = (n: string) => `<w:${n} w:val="single" w:sz="8" w:space="0" w:color="000000"/>`
  return `<w:tbl><w:tblPr><w:tblW w:w="${LARGURA_UTIL_DXA}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right'].map(borda).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="72" w:type="dxa"/><w:left w:w="144" w:type="dxa"/><w:bottom w:w="72" w:type="dxa"/><w:right w:w="144" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="0000"/></w:tblPr><w:tblGrid><w:gridCol w:w="${LARGURA_UTIL_DXA}"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="900"/></w:trPr><w:tc><w:tcPr><w:tcW w:w="${LARGURA_UTIL_DXA}" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="100"/></w:pPr><w:r>${rpr(false)}<w:t>${esc(rotulo)}</w:t></w:r></w:p>${corpo || '<w:p/>'}</w:tc></w:tr></w:tbl>`
}
const ESPACADOR = '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="100" w:lineRule="exact"/><w:rPr><w:sz w:val="8"/></w:rPr></w:pPr></w:p>'

let idDesenho = 0
function ancora(rid: string, o: { x: number; y: number; l: number; a: number; z: number; nome: string; corte?: { l: number; t: number; r: number; b: number } }) {
  const n = ++idDesenho
  const corte = o.corte ? `<a:srcRect l="${o.corte.l}" t="${o.corte.t}" r="${o.corte.r}" b="${o.corte.b}"/>` : '<a:srcRect/>'
  return `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${o.z}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="margin"><wp:posOffset>${Math.round(o.x)}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>${Math.round(o.y)}</wp:posOffset></wp:positionV><wp:extent cx="${Math.round(o.l)}" cy="${Math.round(o.a)}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${n}" name="${esc(o.nome)}" descr="${esc(o.nome)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${n}" name="${esc(o.nome)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/>${corte}<a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(o.l)}" cy="${Math.round(o.a)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`
}

/** Limpa ids que não podem se repetir ao clonar um bloco do modelo. */
function limparClone(el: Element) {
  for (const n of [el, ...el.getElementsByTagName('*')]) {
    for (const at of [...n.attributes]) if (at.namespaceURI === NS.w14 || at.namespaceURI === NS.wp14) n.removeAttributeNode(at)
  }
  for (const f of todos(el, NS.mc, 'Fallback')) f.remove()
  for (const b of [...w(el, 'bookmarkStart'), ...w(el, 'bookmarkEnd')]) b.remove()
}

async function preencherAnomalia(pk: Pacote, doc: Document, bloco: Element[], r: Relatorio, local: string) {
  const e = r.equipamentos.find((x) => x.local === local)!
  const a = anomaliaDe(r, e)
  const sev = severidade(e.condicao)
  const rot = rotulosUsina(r.usina)

  // quadro de severidade: pinta a célula da linha certa
  const tbl = bloco.find((x) => x.localName === 'tbl' && /Alarme/.test(x.textContent ?? ''))
  if (tbl) {
    const linhas = filhos(tbl, NS.w, 'tr')
    const nomes = ['Alarme', 'Alerta', 'Pré-alerta']
    linhas.slice(0, 3).forEach((tr, i) => {
      const tc = filhos(tr, NS.w, 'tc')[0]
      if (!tc) return
      let tcPr = filhos(tc, NS.w, 'tcPr')[0]
      if (!tcPr) {
        tcPr = doc.createElementNS(NS.w, 'w:tcPr')
        tc.prepend(tcPr)
      }
      for (const s of filhos(tcPr, NS.w, 'shd')) s.remove()
      if (sev === nomes[i]) {
        const shd = frag(doc, `<w:shd w:val="clear" w:color="auto" w:fill="${SEV_COR[nomes[i]]}"/>`)[0]
        const antes = filhos(tcPr, NS.w, 'noWrap')[0] ?? filhos(tcPr, NS.w, 'tcMar')[0] ?? filhos(tcPr, NS.w, 'textDirection')[0] ?? filhos(tcPr, NS.w, 'vAlign')[0]
        if (antes) antes.before(shd)
        else tcPr.append(shd)
      }
    })
    // nomes do farol (personalizáveis por usina em Cadastros)
    const padrao = [/^\s*Alarme\s*$/i, /^\s*Alerta\s*$/i, /Pr[ée]-?\s?Alerta/i]
    rot.severidades.forEach((nome, i) => {
      const p = w(tbl, 'p').find((x) => padrao[i].test(textoP(x)))
      if (p && textoP(p).trim() !== nome) trocarTexto(p, nome)
    })
  }

  const ps = bloco.filter((x) => x.localName === 'p')
  const campo = (re: RegExp) => ps.find((p) => re.test(textoP(p)))
  const pLoc = campo(/^\s*Localiza/)
  if (pLoc) definirValor(pLoc, 'Localização:', a.localizacao || localizacaoPadrao(r, e))
  const pEq = campo(/^\s*Equipamento:/)
  if (pEq) definirValor(pEq, 'Equipamento:', a.equipamento || e.descricao)
  const pData = campo(/^\s*Data/)
  if (pData) {
    const rotuloModelo = textoP(pData).match(/^\s*(Data[^:]*):/)?.[1] ?? 'Data da coleta'
    definirValor(pData, ':', a.dataMedicao || VAZIO)
    if (rotuloModelo !== rot.data) {
      const r0 = runsDe(pData).find((x) => textoRun(x).includes(rotuloModelo))
      if (r0) definirT(r0, textoRun(r0).replace(rotuloModelo, rot.data))
    }
  }
  const pRe = campo(/^\s*Reincidente/)
  if (pRe) definirValor(pRe, 'Reincidente desde:', reincidenciaFinal(r, e, a) || VAZIO)

  // último parágrafo do bloco: fim da seção. No modelo tem a Nota PR, as caixas de texto e as imagens;
  // aqui vira: Nota PR + caixas (tabelas, crescem com o texto) + imagens na posição da prévia.
  const fim = bloco[bloco.length - 1]
  for (const run of runsDe(fim)) run.remove()
  for (const x of [...fim.children]) if (x.localName !== 'pPr') x.remove()

  const novos: string[] = []
  if (pLoc) {
    // Nota PR com a mesma formatação dos campos acima
    const runs = runsDe(pLoc)
    const rotRpr = runs[0] ? new XMLSerializer().serializeToString(filhos(runs[0], NS.w, 'rPr')[0] ?? doc.createElementNS(NS.w, 'w:rPr')) : ''
    const valRpr = runs.at(-1) ? new XMLSerializer().serializeToString(filhos(runs.at(-1)!, NS.w, 'rPr')[0] ?? doc.createElementNS(NS.w, 'w:rPr')) : ''
    const pPr = filhos(pRe ?? pLoc, NS.w, 'pPr')[0]
    novos.push(
      `<w:p>${pPr ? new XMLSerializer().serializeToString(pPr) : ''}<w:r>${rotRpr}<w:t xml:space="preserve">Nota PR: </w:t></w:r><w:r>${valRpr}<w:t xml:space="preserve">${esc(a.notasPR || VAZIO)}</w:t></w:r></w:p>`,
      // conclusão desejada (GUT) e diagnóstico resumido, no mesmo formato dos campos
      ...linhasExtras(r, e, a).map(
        ([k, v]) =>
          `<w:p>${pPr ? new XMLSerializer().serializeToString(pPr) : ''}<w:r>${rotRpr}<w:t xml:space="preserve">${esc(k)}: </w:t></w:r><w:r>${valRpr}<w:t xml:space="preserve">${esc(v)}</w:t></w:r></w:p>`,
      ),
    )
  }
  const situacao = a.eixos.map((x) => [x.nome, juntar(x.situacaoPadrao, x.situacaoTecnico)] as [string, string]).filter(([, t]) => t)
  const recomendacao = a.eixos.map((x) => [x.nome, juntar(x.recomendacaoPadrao, x.recomendacaoTecnico)] as [string, string]).filter(([, t]) => t)
  novos.push(ESPACADOR, caixaTexto('Situação:', situacao, true), ESPACADOR, caixaTexto('Recomendação:', recomendacao, recomendacao.length > 1))
  if (a.observacoes?.trim())
    novos.push(ESPACADOR, caixaTexto('Observações adicionais:', a.observacoes.split(/\r?\n/).map((l) => ['', l] as [string, string]), false))
  for (const n of novos.flatMap((x) => frag(doc, x))) fim.before(n)

  // imagens flutuantes, ancoradas no parágrafo final, na mesma posição (em %) da prévia
  const W = (LARGURA_UTIL_DXA / 1440) * 2.54 * EMU_CM
  const H = (W * AREA_IMAGENS_MM.a) / AREA_IMAGENS_MM.l
  const TOPO = 0.15 * EMU_CM
  for (const [ordem, img] of a.imagens.entries()) {
    const blob = await blobImagem(img.id)
    if (!blob) continue
    const pos = posicaoLivre(img, a.imagens)
    // a caixa inteira (borda + margem + imagem) vira uma figura só, do tamanho da caixa na prévia
    const caixa = { l: (pos.l / 100) * W, a: (pos.a / 100) * H }
    const desenho = await imagemNaCaixa(blob, caixa.l / 36000, caixa.a / 36000, img.ajuste)
    const rid = await pk.imagem('word/document.xml', await desenho.arrayBuffer(), 'jpeg')
    const x = (pos.x / 100) * W
    const y = TOPO + (pos.y / 100) * H
    const run = frag(doc, ancora(rid, { x, y, l: caixa.l, a: caixa.a, z: 251659264 + ordem * 1024, nome: img.nome }))[0]
    fim.append(run)
  }
}

// ---------- montagem ----------
export async function gerarWordDoModelo(r: Relatorio, modelo: ArrayBuffer): Promise<Blob> {
  idDesenho = 100000
  const zip = await JSZip.loadAsync(modelo)
  const pk = new Pacote(zip)
  const doc = (await pk.xml('word/document.xml'))!
  const body = w(doc, 'body')[0]
  const els = () => [...body.children]

  // título
  const pNum = acharP(els(), /N[úu]mero do Relat[óo]rio:/)
  if (pNum) definirValor(pNum, 'Relatório:', `${r.codigo}${r.areaTitulo ? ` - ${r.areaTitulo}` : ''}`)
  const pData = acharP(els(), /^\s*[^,\d]+,\s*\d{1,2}\s+de\s+\p{L}+\s+de\s+\d{4}\s*$/u)
  if (pData) trocarTexto(pData, `${r.cidade ? `${r.cidade}, ` : ''}${dataPorExtenso(r.dataExpedicao).replace(/^0/, '')}`)

  // Resumo e Definição da atividade (opcional): numa página própria, antes da seção 1
  if (r.incluirResumo) {
    const tit = els().find((e) => /Condi[çc][ãa]o dos equipamentos/i.test(textoP(e)))
    if (tit) {
      const rpr = (b: boolean, pt: number) => `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${b ? '<w:b/><w:bCs/>' : ''}<w:sz w:val="${pt * 2}"/><w:szCs w:val="${pt * 2}"/></w:rPr>`
      const titulo = (s: string, quebra: boolean) =>
        `<w:p><w:pPr>${quebra ? '<w:pageBreakBefore/>' : ''}<w:spacing w:before="${quebra ? 0 : 300}" w:after="160"/></w:pPr><w:r>${rpr(true, 14)}<w:t xml:space="preserve">${esc(s)}</w:t></w:r></w:p>`
      const corrido = (s: string) =>
        s
          .split(/\r?\n/)
          .map((l) => `<w:p><w:pPr><w:spacing w:after="120"/><w:jc w:val="both"/></w:pPr><w:r>${rpr(false, 12)}<w:t xml:space="preserve">${esc(l)}</w:t></w:r></w:p>`)
          .join('')
      const xml = titulo('Resumo', true) + corrido(textoRelatorio(r, 'resumo')) + titulo('Definição da atividade', false) + corrido(textoRelatorio(r, 'definicao'))
      tit.before(...frag(doc, xml))
      quebraAntes(tit)
    }
  }

  // 1. Condição dos equipamentos: a última figura antes do próximo título vira a tabela do quadro
  const lista = els()
  const iCond = lista.findIndex((e) => /Condi[çc][ãa]o dos equipamentos/i.test(textoP(e)))
  const iProx = lista.findIndex((e, i) => i > iCond && /[ÍI]ndice de execu|Dados operacionais/i.test(textoP(e)))
  if (iCond >= 0 && iProx > iCond) {
    const figuras = lista.slice(iCond + 1, iProx).filter(temDesenho)
    const alvo = figuras.at(-1)
    if (alvo && figuras.length > 1) {
      const tabela = frag(doc, xmlQuadro(r))
      alvo.before(...tabela)
      alvo.remove()
      // os parágrafos vazios que empurravam o próximo título viram quebra de página
      for (const e of lista.slice(lista.indexOf(alvo) + 1, iProx)) if (vazio(e)) e.remove()
      quebraAntes(lista[iProx])
    }
  }

  // 2 e 3. Indicadores
  const iExec = els().findIndex((e) => /[ÍI]ndice de execu/i.test(textoP(e)))
  const iDados = els().findIndex((e) => /Dados operacionais/i.test(textoP(e)))
  if (r.incluirIndicadores === false && iExec >= 0 && iDados > iExec) {
    for (const e of els().slice(iExec, iDados)) e.remove()
    // os títulos 2..5 são numeração automática, mas "4.1", "4.2" e "5." estão digitados no modelo
    for (const p of els().filter((e) => e.localName === 'p')) {
      const t = textoP(p)
      if (/^\s*4\.1\s/.test(t) || /^\s*4\.2\s/.test(t) || /^\s*5\.\s/.test(t)) {
        const r0 = runsDe(p).find((x) => /4\.[12]|5\./.test(textoRun(x)))
        if (r0) definirT(r0, textoRun(r0).replace(/^(\s*)4\.([12])/, '$12.$2').replace(/^(\s*)5\./, '$13.'))
      }
    }
  } else {
    await atualizarGraficos(pk, r)
    // 4º gráfico (requisito): tipo de falhas, como figura logo depois do gráfico de reincidências
    const tipos = tiposDeFalha(r)
    const iDadosAgora = els().findIndex((e) => /Dados operacionais/i.test(textoP(e)))
    const graficos = els().filter((e, i) => (iDadosAgora < 0 || i < iDadosAgora) && todos(e, NS.c, 'chart').length > 0)
    const ultimo = graficos.at(-1)
    if (tipos.length && ultimo) {
      const png = await svgParaPng(graficoTiposFalha(tipos), 2, LARGURA_MODELO, ALTURA_MODELO)
      const rid = await pk.imagem('word/document.xml', png, 'png')
      const cx = Math.round((LARGURA_UTIL_DXA / 1440) * 2.54 * EMU_CM)
      const cy = Math.round((cx * ALTURA_MODELO) / LARGURA_MODELO)
      const n = ++idDesenho
      ultimo.after(
        ...frag(
          doc,
          `<w:p><w:pPr><w:pageBreakBefore/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Tipo de falhas"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${n}" name="Tipo de falhas"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`,
        ),
      )
    }
  }
  const pDados = acharP(els(), /Dados operacionais/i)
  if (pDados) {
    for (let e = pDados.previousElementSibling; e && vazio(e); e = pDados.previousElementSibling) e.remove()
    quebraAntes(pDados)
  }

  // 4.1 e 4.2
  const ponto = (s: string) => (s && !/[.!?]$/.test(s) ? `${s}.` : s)
  const linha = (re: RegExp, rotulo: string, valor: string | undefined) => {
    const p = acharP(els(), re)
    if (!p || valor === undefined) return
    if (valor === '') p.remove()
    else definirValor(p, rotulo, ponto(valor))
  }
  linha(/^\s*Aparelho:/, 'Aparelho:', r.aparelho)
  linha(/^\s*Software/, 'medidos:', r.software)
  linha(/^\s*Plataforma/, ':', r.plataforma)
  linha(/coleta de dados:/, 'coleta de dados:', r.equipe.coleta || VAZIO)
  linha(/an[áa]lise de dados:/, 'análise de dados:', r.equipe.analise || VAZIO)

  // selo(s) de certificação: a figura entre "Equipe Técnica" e "Anomalias registradas"
  {
    const l = els()
    const i0 = l.findIndex((e) => /Equipe T[ée]cnica/i.test(textoP(e)))
    const i1 = l.findIndex((e) => /Anomalias registradas/i.test(textoP(e)))
    const pSelo = i0 >= 0 ? l.slice(i0 + 1, i1 > i0 ? i1 : undefined).find(temDesenho) : undefined
    const selos = [...new Set([r.equipe.seloColeta, r.equipe.seloAnalise].filter(Boolean) as string[])]
    if (pSelo && !selos.length) pSelo.remove()
    else if (pSelo) {
      const runSelo = runsDe(pSelo).find((x) => w(x, 'drawing').length)!
      const extentEl = todos(runSelo, NS.wp, 'extent')[0]
      const cx = Number(extentEl?.getAttribute('cx') ?? 2 * EMU_CM)
      for (const [k, s] of selos.entries()) {
        const run = k === 0 ? runSelo : (runSelo.cloneNode(true) as Element)
        const { dados, ext, blob } = await bytesDeDataUrl(s)
        const { l: li, a: ai } = await tamanho(blob)
        const cy = Math.round((cx * ai) / li)
        const rid = await pk.imagem('word/document.xml', dados, ext)
        for (const b of todos(run, NS.a, 'blip')) b.setAttributeNS(NS.r, 'r:embed', rid)
        for (const x of [...todos(run, NS.wp, 'extent'), ...todos(run, NS.a, 'ext')].filter((x) => x.hasAttribute('cy'))) {
          x.setAttribute('cx', String(cx))
          x.setAttribute('cy', String(cy))
        }
        if (k > 0) {
          for (const d of todos(run, NS.wp, 'docPr')) d.setAttribute('id', String(++idDesenho))
          limparClone(run)
          const sep = frag(doc, '<w:r><w:t xml:space="preserve">      </w:t></w:r>')[0]
          runsDe(pSelo).at(-1)!.after(sep, run)
        }
      }
    }
  }

  // 5. Anomalias: cada bloco do modelo vai do logo até o parágrafo com a quebra de seção
  const anomalias = equipamentosAnomalia(r)
  {
    const l = els()
    const iAnom = l.findIndex((e) => /Anomalias registradas/i.test(textoP(e)))
    const iFimIntro = l.findIndex((e, i) => i >= iAnom && temSecao(e) && e.localName === 'p')
    const blocos: Element[][] = []
    let atual: Element[] = []
    for (const e of l.slice(iFimIntro + 1)) {
      if (e.localName === 'sectPr') break
      atual.push(e)
      if (temSecao(e)) {
        blocos.push(atual)
        atual = []
      }
    }
    if (iAnom >= 0 && blocos.length && blocos[0].some((e) => /Anomalia|Localiza/i.test(textoP(e)) || e.localName === 'tbl')) {
      const modeloBloco = blocos[0].map((e) => e.cloneNode(true) as Element)
      const depois = blocos.at(-1)!.at(-1)!.nextElementSibling!
      for (const b of blocos) for (const e of b) e.remove()
      for (const eq of anomalias) {
        const bloco = modeloBloco.map((e) => e.cloneNode(true) as Element)
        bloco.forEach(limparClone)
        for (const e of bloco) depois.before(e)
        await preencherAnomalia(pk, doc, bloco, r, eq.local)
      }
      if (!anomalias.length) {
        for (const e of l.slice(iAnom, iFimIntro)) if (e.localName === 'p' && !temSecao(e)) e.remove()
        trocarTexto(l[iFimIntro], '')
      }
    }
  }

  // ids de desenho únicos no documento todo
  let n = 1
  for (const d of todos(doc, NS.wp, 'docPr')) d.setAttribute('id', String(n++))
  pk.salvar('word/document.xml', doc)

  // cabeçalho e rodapé (contato e ART de quem assina)
  for (const rel of await pk.relacoes('word/document.xml')) {
    const caminho = `word/${rel.alvo}`
    if (rel.tipo.endsWith('/header')) {
      const d = await pk.xml(caminho)
      if (!d) continue
      for (const p of w(d, 'p')) {
        const t = textoP(p)
        const tel = r.contato?.telefone?.trim()
        if (tel && /^\s*(Phone|Telefone|Tel)\b/i.test(t)) {
          const atual = t.replace(/^[^:]*:\s*/, '')
          const fixo = atual.includes('/') ? `${atual.split('/')[0].trim()}/ ` : ''
          definirValor(p, ':', `${fixo}${tel}`)
        }
        const email = r.contato?.email?.trim()
        if (email && /^\s*E-?mail/i.test(t)) {
          const link = filhos(p, NS.w, 'hyperlink')[0]
          if (link) {
            const runs = filhos(link, NS.w, 'r').filter(soTexto)
            if (runs[0]) definirT(runs[0], email)
            for (const x of runs.slice(1)) x.remove()
            const rid = link.getAttributeNS(NS.r, 'id')
            const rr = (await pk.relacoes(caminho)).find((x) => x.id === rid)
            rr?.el.setAttribute('Target', `mailto:${email}`)
          } else definirValor(p, t.includes('–') ? '–' : ':', email)
        }
      }
      pk.salvar(caminho, d)
    }
    if (rel.tipo.endsWith('/footer') && r.art?.trim()) {
      const d = await pk.xml(caminho)
      if (!d) continue
      for (const p of w(d, 'p')) if (/ART:/.test(textoP(p))) definirValor(p, 'ART:', r.art.trim())
      pk.salvar(caminho, d)
    }
  }

  // propriedades do arquivo
  const core = await pk.xml('docProps/core.xml')
  if (core) {
    const tit = core.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'title')[0]
    if (tit) tit.textContent = `${r.codigo}${r.areaTitulo ? ` - ${r.areaTitulo}` : ''}`
    pk.salvar('docProps/core.xml', core)
  }

  await pk.fechar()
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' })
}

/** Confere se o arquivo parece o modelo do relatório (para avisar na hora de carregar). */
export async function validarModelo(buf: ArrayBuffer) {
  const zip = await JSZip.loadAsync(buf)
  const xml = await zip.file('word/document.xml')?.async('string')
  if (!xml) throw new Error('O arquivo não é um .docx válido.')
  const faltando = ['Número do Relat', 'Condição dos equipamentos', 'Localização'].filter((t) => !xml.replace(/<[^>]+>/g, '').includes(t))
  return { ok: faltando.length === 0, faltando }
}
