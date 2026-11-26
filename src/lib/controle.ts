// Leitura das Planilhas de Controle (aba de vibração) direto do .xlsx, no navegador.
import * as XLSX from 'xlsx'
import { listar, PASTA_CONTROLE, subpasta } from './pasta'

export const USINAS = ['Barreiro', 'Jeceaba', 'Mineração'] as const
export type Usina = (typeof USINAS)[number]

export interface LinhaControle {
  plano?: string // Plano de manutenção (coluna do quadro do relatório)
  ordem: string
  descricao: string
  executado: boolean
  local: string // Local de instalação (TAG SAP) — identificador do equipamento
  area: string // como veio escrito na planilha (não confiável)
  condicao: string // 1..13, X, R
  motorAcc?: number
  motorVel?: number
  movidaAcc?: number
  movidaVel?: number
  /** célula da Condição na aba de vibração (ex.: "G12"), para gravar a condição de volta na planilha */
  celula?: string
  aba?: string
}

export interface PlanilhaInfo {
  usina: Usina
  ano: string
  mesPasta: string // ex.: "09-Setembro"
  arquivo: FileSystemFileHandle
}

/** Lista {ano: [mesPasta...]} disponíveis para a usina. */
export async function mesesDisponiveis(raiz: FileSystemDirectoryHandle, usina: Usina) {
  const dirUsina = await subpasta(raiz, [PASTA_CONTROLE, usina])
  const { pastas: anos } = await listar(dirUsina)
  const out: Record<string, string[]> = {}
  for (const ano of anos.filter((a) => /^\d{4}$/.test(a))) {
    const { pastas } = await listar(await dirUsina.getDirectoryHandle(ano))
    const comArquivo: string[] = []
    for (const m of pastas) {
      const { arquivos } = await listar(await subpasta(dirUsina, [ano, m]))
      if (arquivos.some((a) => a.name.toLowerCase().endsWith('.xlsx'))) comArquivo.push(m)
    }
    if (comArquivo.length) out[ano] = comArquivo
  }
  return out
}

/** Todas as planilhas de controle da usina, de todos os anos: [{ mesRef: "AAAA-MM", arquivo }]. */
export async function listarPlanilhas(raiz: FileSystemDirectoryHandle, usina: Usina) {
  const meses = await mesesDisponiveis(raiz, usina)
  const out: { mesRef: string; arquivo: FileSystemFileHandle }[] = []
  for (const [ano, pastas] of Object.entries(meses))
    for (const mesPasta of pastas) {
      const { arquivo } = await localizarPlanilha(raiz, usina, ano, mesPasta)
      out.push({ mesRef: `${ano}-${mesPasta.slice(0, 2)}`, arquivo })
    }
  return out.sort((a, b) => a.mesRef.localeCompare(b.mesRef))
}

export async function localizarPlanilha(
  raiz: FileSystemDirectoryHandle,
  usina: Usina,
  ano: string,
  mesPasta: string,
): Promise<PlanilhaInfo> {
  const dir = await subpasta(raiz, [PASTA_CONTROLE, usina, ano, mesPasta])
  const { arquivos } = await listar(dir)
  const arquivo = arquivos.find((a) => /planilha de controle/i.test(a.name) && a.name.endsWith('.xlsx'))
  if (!arquivo) throw new Error(`Nenhuma planilha de controle em ${usina}/${ano}/${mesPasta}.`)
  return { usina, ano, mesPasta, arquivo }
}

const num = (v: unknown) => (typeof v === 'number' ? v : undefined)
const txt = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim())

export async function lerAbaVibracao(info: PlanilhaInfo): Promise<LinhaControle[]> {
  return lerXlsxVibracao(await (await info.arquivo.getFile()).arrayBuffer(), info.arquivo.name)
}

/** Plano B: o usuário escolhe o .xlsx manualmente (qualquer navegador). */
export async function lerArquivoVibracao(arquivo: File): Promise<LinhaControle[]> {
  return lerXlsxVibracao(await arquivo.arrayBuffer(), arquivo.name)
}

export function lerXlsxVibracao(buf: ArrayBuffer, nomeArquivo: string): LinhaControle[] {
  const wb = XLSX.read(buf, { type: 'array' })
  const nomeAba = wb.SheetNames.find((n) => /vibra/i.test(n))
  if (!nomeAba) throw new Error(`A planilha ${nomeArquivo} não tem aba de vibração.`)
  const ws = wb.Sheets[nomeAba]
  const inicio = XLSX.utils.decode_range(ws['!ref'] ?? 'A1').s
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '', blankrows: true })

  const iCab = linhas.findIndex((r) => r.some((c) => /local de instala/i.test(txt(c))))
  if (iCab < 0) throw new Error('Cabeçalho "Local de instalação" não encontrado na aba de vibração.')
  const cab = linhas[iCab].map((c) => txt(c).toLowerCase())
  const col = (re: RegExp) => cab.findIndex((c) => re.test(c))
  const c = {
    plano: col(/^plano/),
    ordem: col(/^ordem/),
    desc: col(/descri/),
    exec: col(/execu/),
    local: col(/local de instala/),
    area: col(/^[áa]rea/),
    cond: col(/condi/),
  }
  // Colunas de valores globais: "Motor m/s²", "Motor mm/s", "Movida m/s²", "Movida mm/s"
  const val = (parte: RegExp, un: RegExp) => cab.findIndex((h) => parte.test(h) && un.test(h))
  const v = {
    motorAcc: val(/motor/, /m\/s/),
    motorVel: val(/motor/, /mm\/s/),
    movidaAcc: val(/movida/, /m\/s/),
    movidaVel: val(/movida/, /mm\/s/),
  }

  const out: LinhaControle[] = []
  for (const [j, r] of linhas.entries()) {
    if (j <= iCab) continue
    const local = txt(r[c.local])
    if (!local || /local de instala/i.test(local)) continue
    out.push({
      plano: c.plano >= 0 ? txt(r[c.plano]) : undefined,
      ordem: txt(r[c.ordem]),
      descricao: txt(r[c.desc]),
      executado: r[c.exec] === true || /^(true|sim|verdadeiro)$/i.test(txt(r[c.exec])),
      local,
      area: txt(r[c.area]),
      condicao: txt(r[c.cond]).toUpperCase(),
      motorAcc: num(r[v.motorAcc]),
      motorVel: num(r[v.motorVel]),
      movidaAcc: num(r[v.movidaAcc]),
      movidaVel: num(r[v.movidaVel]),
      celula: c.cond >= 0 ? XLSX.utils.encode_cell({ r: inicio.r + j, c: inicio.c + c.cond }) : undefined,
      aba: nomeAba,
    })
  }
  return out
}

/** Sigla da área a partir do Local de instalação (regra do levantamento de áreas). */
export function siglaArea(local: string): string {
  const p = local.split('-')
  if (p[0] === 'VS01' || p[0] === 'VM52') return p[2] ?? p[1] ?? '?' // VS01-DWS-LAQ / VM52-ITM1-BRT
  return p[1] ?? '?' // 7501-RKL-...
}
