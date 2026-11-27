// Onde fica o modelo .docx do relatório: na pasta do SharePoint (VibDocs/config) quando conectada,
// e sempre uma cópia neste navegador. Pode haver um modelo por usina (modelo-relatorio-Jeceaba.docx)
// além do geral (modelo-relatorio.docx).
import { get, set } from 'idb-keyval'
import { PASTA_VIBDOCS, subpasta } from './pasta'

export interface Modelo {
  nome: string // nome original do arquivo enviado
  dados: ArrayBuffer
  em: string
  origem: 'pasta' | 'navegador'
}

const arquivo = (usina?: string) => (usina ? `modelo-relatorio-${usina}.docx` : 'modelo-relatorio.docx')
const chave = (usina?: string) => `vibdocs.modelo.${usina ?? 'geral'}`

async function daPasta(raiz: FileSystemDirectoryHandle, usina?: string): Promise<Modelo | undefined> {
  try {
    const dir = await subpasta(raiz, [PASTA_VIBDOCS, 'config'])
    const f = await (await dir.getFileHandle(arquivo(usina))).getFile()
    return { nome: f.name, dados: await f.arrayBuffer(), em: new Date(f.lastModified).toISOString(), origem: 'pasta' }
  } catch {
    return undefined
  }
}

/** Modelo a usar no relatório, do mais específico ao geral: contrato+usina, contrato, usina, geral (pasta antes do navegador).
 *  Outros contratos (clientes) podem ter o próprio modelo: modelo-relatorio-<Contrato>.docx ou -<Contrato>-<Usina>.docx. */
export async function obterModelo(raiz: FileSystemDirectoryHandle | undefined, usina: string, contrato = 'Vallourec'): Promise<Modelo | undefined> {
  for (const u of [`${contrato}-${usina}`, contrato, usina, undefined]) {
    const m = (raiz && (await daPasta(raiz, u))) || (await get<Modelo>(chave(u)))
    if (m) return m.origem === 'pasta' ? m : { ...m, origem: 'navegador' }
  }
  return undefined
}

/** Guarda o modelo (geral ou da usina) no navegador e, se houver pasta, no SharePoint. */
export async function guardarModelo(arq: File, raiz?: FileSystemDirectoryHandle, usina?: string): Promise<Modelo> {
  const dados = await arq.arrayBuffer()
  const m: Modelo = { nome: arq.name, dados, em: new Date().toISOString(), origem: 'navegador' }
  await set(chave(usina), m)
  if (raiz) {
    const dir = await subpasta(raiz, [PASTA_VIBDOCS, 'config'], true)
    const h = await dir.getFileHandle(arquivo(usina), { create: true })
    const wr = await h.createWritable()
    await wr.write(dados)
    await wr.close()
    return { ...m, origem: 'pasta' }
  }
  return m
}

// ---------- elementos visuais do modelo, para a prévia/PDF ficar igual ao Word ----------
export interface SerieModelo {
  nome: string
  cor: string
}
export interface VisualModelo {
  chave: string
  capa?: string // object URLs
  moldura?: string
  legenda?: string
  logoEsq?: string
  logoDir?: string
  cabecalho: string[] // linhas de texto do cabeçalho (endereço, telefone, e-mail)
  plataforma?: string // linha "Plataforma ..." do 4.1, como está no modelo
  art?: string // ART do rodapé do modelo (fica quando o perfil não tem ART)
  graficos: Partial<Record<'execucao' | 'anomalias' | 'reincidencia', { titulo: string; series: SerieModelo[] }>>
}

const cacheVisual = new Map<string, Promise<VisualModelo>>()

export function visualDoModelo(m: Modelo): Promise<VisualModelo> {
  const chave = `${m.nome}|${m.em}|${m.dados.byteLength}`
  if (!cacheVisual.has(chave)) cacheVisual.set(chave, extrair(m.dados, chave))
  return cacheVisual.get(chave)!
}

async function extrair(dados: ArrayBuffer, chave: string): Promise<VisualModelo> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(dados)
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
  const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
  const C = 'http://schemas.openxmlformats.org/drawingml/2006/chart'
  const ler = async (c: string) => {
    const f = zip.file(c)
    return f ? new DOMParser().parseFromString(await f.async('string'), 'application/xml') : undefined
  }
  const rels = async (parte: string) => {
    const i = parte.lastIndexOf('/')
    const d = await ler(`${parte.slice(0, i)}/_rels/${parte.slice(i + 1)}.rels`)
    return new Map([...(d?.documentElement.children ?? [])].map((r) => [r.getAttribute('Id')!, r.getAttribute('Target')!]))
  }
  const urls = new Map<string, string>()
  const url = async (pasta: string, alvo?: string) => {
    if (!alvo || /\.(emf|wmf)$/i.test(alvo)) return undefined
    const caminho = new URL(alvo, `http://x/${pasta}/`).pathname.slice(1)
    if (!urls.has(caminho)) {
      const f = zip.file(caminho)
      if (!f) return undefined
      const tipo = /\.png$/i.test(caminho) ? 'image/png' : /\.jpe?g$/i.test(caminho) ? 'image/jpeg' : /\.gif$/i.test(caminho) ? 'image/gif' : 'image/*'
      urls.set(caminho, URL.createObjectURL(new Blob([await f.async('arraybuffer')], { type: tipo })))
    }
    return urls.get(caminho)
  }
  const texto = (p: Element) =>
    [...p.getElementsByTagNameNS(W, 't')]
      .filter((t) => !t.closest('txbxContent'))
      .map((t) => t.textContent)
      .join('')
  const blips = (el: Element) => [...el.getElementsByTagNameNS(A, 'blip')].map((b) => b.getAttributeNS(R, 'embed')!)

  const doc = (await ler('word/document.xml'))!
  const relDoc = await rels('word/document.xml')
  const corpo = [...doc.getElementsByTagNameNS(W, 'body')[0].children]
  const v: VisualModelo = { chave, cabecalho: [], graficos: {} }

  // capa: primeira imagem do documento
  const primeira = corpo.find((e) => blips(e).length)
  if (primeira && corpo.indexOf(primeira) < 3) v.capa = await url('word', relDoc.get(blips(primeira)[0]))

  // legenda: primeira figura depois de "Condição dos equipamentos"
  const iCond = corpo.findIndex((e) => /Condi[çc][ãa]o dos equipamentos/i.test(texto(e)))
  if (iCond >= 0) {
    const fig = corpo.slice(iCond + 1).find((e) => blips(e).length)
    if (fig) v.legenda = await url('word', relDoc.get(blips(fig)[0]))
  }
  v.plataforma = corpo.map(texto).find((t) => /^\s*Plataforma/i.test(t))?.trim()

  // logos da página de anomalia: imagens do parágrafo antes de "Relatório de Análise de Vibração ... Anomalia"
  const iAnom = corpo.findIndex((e) => /Anomalia pendente|Anomalia/i.test(texto(e)) && /Relat[óo]rio de An[áa]lise/i.test(texto(e)))
  if (iAnom > 0) {
    for (const e of corpo.slice(Math.max(0, iAnom - 2), iAnom + 1)) {
      for (const anc of e.getElementsByTagNameNS(WP, 'anchor')) {
        const b = blips(anc)[0]
        if (!b) continue
        const lado = anc.getElementsByTagNameNS(WP, 'positionH')[0]?.textContent?.trim()
        const u = await url('word', relDoc.get(b))
        if (lado === 'right') v.logoDir ??= u
        else v.logoEsq ??= u
      }
    }
  }

  // cabeçalho (moldura de página inteira e texto) e gráficos
  for (const [, alvo] of relDoc) {
    if (/^header\d*\.xml$/.test(alvo) && !v.moldura) {
      const h = await ler(`word/${alvo}`)
      if (!h) continue
      const rh = await rels(`word/${alvo}`)
      const b = blips(h.documentElement)[0]
      if (b) v.moldura = await url('word', rh.get(b))
      v.cabecalho = [...h.getElementsByTagNameNS(W, 'p')].map(texto).filter((t) => t.trim())
    }
    if (/^footer\d*\.xml$/.test(alvo) && !v.art) {
      const f = await ler(`word/${alvo}`)
      const t = f ? [...f.getElementsByTagNameNS(W, 'p')].map(texto).find((x) => /ART:/.test(x)) : undefined
      if (t) v.art = t.replace(/^.*ART:\s*/, '').trim()
    }
    if (/^charts\/chart\d+\.xml$/.test(alvo)) {
      const g = await ler(`word/${alvo}`)
      if (!g) continue
      const titulo = [...(g.getElementsByTagNameNS(C, 'title')[0]?.getElementsByTagNameNS(A, 't') ?? [])].map((t) => t.textContent).join('')
      const tipo = /reincid/i.test(titulo) ? 'reincidencia' : /anomal/i.test(titulo) ? 'anomalias' : /execu/i.test(titulo) ? 'execucao' : undefined
      if (!tipo) continue
      const series = [...g.getElementsByTagNameNS(C, 'ser')].map((s) => {
        const tx = s.getElementsByTagNameNS(C, 'tx')[0]
        const cor = [...s.children].find((x) => x.localName === 'spPr')?.getElementsByTagNameNS(A, 'srgbClr')[0]?.getAttribute('val')
        return { nome: tx?.getElementsByTagNameNS(C, 'v')[0]?.textContent ?? '', cor: `#${cor ?? '999999'}` }
      })
      v.graficos[tipo] = { titulo, series }
    }
  }
  return v
}
