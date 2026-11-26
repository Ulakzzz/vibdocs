// Grava a condição de volta na Planilha de Controle (pasta do SharePoint sincronizada).
// Edita SÓ a célula no XML do .xlsx: formatação, cores, fórmulas e as outras abas ficam intactas
// (reescrever o arquivo inteiro com a SheetJS perderia a formatação).
import JSZip from 'jszip'

const NS_S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

const ler = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml')
const gravar = (d: Document) => new XMLSerializer().serializeToString(d)

/** "AB12" → { col: 28, linha: 12 } */
function partes(ref: string) {
  const m = ref.match(/^([A-Z]+)(\d+)$/)!
  const col = [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)
  return { col, linha: Number(m[2]) }
}

export interface MudancaCelula {
  celula: string
  valor: string
}

export async function gravarCondicoes(arquivo: FileSystemFileHandle, aba: string, mudancas: MudancaCelula[]) {
  const saida = await editarXlsx(await (await arquivo.getFile()).arrayBuffer(), aba, mudancas)
  const w = await arquivo.createWritable()
  await w.write(saida)
  await w.close()
}

/** Troca valores de células de uma aba direto no XML do .xlsx e devolve o arquivo novo. */
export async function editarXlsx(buf: ArrayBuffer, aba: string, mudancas: MudancaCelula[]): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(buf, { createFolders: false })
  const wb = ler(await zip.file('xl/workbook.xml')!.async('string'))
  const folha = [...wb.getElementsByTagNameNS(NS_S, 'sheet')].find((s) => s.getAttribute('name') === aba)
  if (!folha) throw new Error(`Aba "${aba}" não encontrada na planilha.`)
  const rid = folha.getAttributeNS(NS_R, 'id')
  const rels = ler(await zip.file('xl/_rels/workbook.xml.rels')!.async('string'))
  const alvo = [...rels.documentElement.children].find((r) => r.getAttribute('Id') === rid)?.getAttribute('Target')
  if (!alvo) throw new Error('Planilha sem a referência da aba.')
  const caminho = alvo.startsWith('/') ? alvo.slice(1) : `xl/${alvo}`
  const doc = ler(await zip.file(caminho)!.async('string'))
  const dados = doc.getElementsByTagNameNS(NS_S, 'sheetData')[0]
  let tiravaFormula = false

  for (const { celula, valor } of mudancas) {
    const { col, linha } = partes(celula)
    // linha (cria na ordem, se não existir)
    let row = [...dados.children].find((r) => Number(r.getAttribute('r')) === linha)
    if (!row) {
      row = doc.createElementNS(NS_S, 'row')
      row.setAttribute('r', String(linha))
      const depois = [...dados.children].find((r) => Number(r.getAttribute('r')) > linha)
      dados.insertBefore(row, depois ?? null)
    }
    // célula (cria na ordem da coluna, se não existir)
    let c = [...row.children].find((x) => x.getAttribute('r') === celula)
    if (!c) {
      c = doc.createElementNS(NS_S, 'c')
      c.setAttribute('r', celula)
      const depois = [...row.children].find((x) => partes(x.getAttribute('r')!).col > col)
      row.insertBefore(c, depois ?? null)
    }
    for (const filho of [...c.children]) {
      if (filho.localName === 'f') tiravaFormula = true
      if (['f', 'v', 'is'].includes(filho.localName)) filho.remove()
    }
    c.removeAttribute('t')
    if (/^\d+$/.test(valor)) {
      const v = doc.createElementNS(NS_S, 'v')
      v.textContent = valor
      c.appendChild(v)
    } else if (valor) {
      c.setAttribute('t', 'inlineStr')
      const is = doc.createElementNS(NS_S, 'is')
      const tx = doc.createElementNS(NS_S, 't')
      tx.textContent = valor
      is.appendChild(tx)
      c.appendChild(is)
    }
  }
  zip.file(caminho, gravar(doc))

  // se uma fórmula foi substituída, a cadeia de cálculo antiga apontaria para ela: o Excel refaz sozinho
  if (tiravaFormula && zip.file('xl/calcChain.xml')) {
    zip.remove('xl/calcChain.xml')
    const ct = ler(await zip.file('[Content_Types].xml')!.async('string'))
    for (const o of [...ct.documentElement.children]) if (o.getAttribute('PartName') === '/xl/calcChain.xml') o.remove()
    zip.file('[Content_Types].xml', gravar(ct))
    for (const r of [...rels.documentElement.children]) if (r.getAttribute('Target')?.includes('calcChain')) r.remove()
    zip.file('xl/_rels/workbook.xml.rels', gravar(rels))
  }

  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
}
