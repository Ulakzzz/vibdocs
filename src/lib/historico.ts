// Histórico de condição por equipamento, montado a partir das Planilhas de Controle de todos os meses.
// Usado para: "Reincidente desde", colunas de meses anteriores no quadro de condição e linha do tempo.
import { get, set } from 'idb-keyval'
import { lerXlsxVibracao, listarPlanilhas, type Usina } from './controle'

/** condição por mês (AAAA-MM) de cada Local de instalação */
export type Historico = Record<string, Record<string, string>>

export interface FonteHistorico {
  mesRef: string // AAAA-MM
  nome: string
  linhas: { local: string; condicao: string; executado?: boolean }[]
}

/** ordem executada (true/false) por mês de cada Local de instalação; só meses em que estava planejada */
export type Execucao = Record<string, Record<string, boolean>>

const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** "2025-11" → "nov/25" (formato do quadro do modelo VMN). */
export const mesCurto = (mesRef: string) => {
  const [a, m] = mesRef.split('-')
  return `${MESES_CURTOS[Number(m) - 1]}/${a.slice(2)}`
}

/** Tenta descobrir o mês pelo nome do arquivo: "Planilha de Controle Barreiro - Setembro 2026.xlsx" → "2026-09". */
export function mesDoNome(nome: string): string | undefined {
  const n = nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const ano = n.match(/(20\d{2})/)?.[1]
  const i = MESES_PT.findIndex((m) => n.includes(m.normalize('NFD').replace(/[̀-ͯ]/g, '')))
  return ano && i >= 0 ? `${ano}-${String(i + 1).padStart(2, '0')}` : undefined
}

/** Condições que contam como "medido" (as demais — X, R, vazio — não interrompem nem iniciam nada). */
const medido = (c: string) => /^(1[0-3]?|[2-9])$/.test(c)

export function montarHistorico(fontes: FonteHistorico[]): Historico {
  const h: Historico = {}
  for (const f of [...fontes].sort((a, b) => a.mesRef.localeCompare(b.mesRef)))
    for (const l of f.linhas) {
      if (!medido(l.condicao)) continue
      ;(h[l.local] ??= {})[f.mesRef] = l.condicao
    }
  return h
}

/** Ordens planejadas e executadas por mês. "X" (não previsto no mês) não conta como planejada. */
export function montarExecucao(fontes: FonteHistorico[]): Execucao {
  const e: Execucao = {}
  for (const f of fontes)
    for (const l of f.linhas) {
      if (l.condicao === 'X' || l.executado === undefined) continue
      ;(e[l.local] ??= {})[f.mesRef] = l.executado
    }
  return e
}

// ---------- leitura das planilhas da pasta, com cache no navegador ----------
interface Cache {
  chave: string
  fonte: FonteHistorico
}

export async function carregarHistoricoPasta(
  raiz: FileSystemDirectoryHandle,
  usina: Usina,
  progresso?: (feito: number, total: number) => void,
): Promise<{ historico: Historico; execucao: Execucao; meses: string[]; falhas: string[] }> {
  const planilhas = await listarPlanilhas(raiz, usina)
  const fontes: FonteHistorico[] = []
  const falhas: string[] = []
  let feito = 0
  for (const p of planilhas) {
    progresso?.(feito, planilhas.length)
    try {
      const arq = await p.arquivo.getFile()
      const chave = `${usina}/${p.mesRef}/${arq.name}/${arq.lastModified}/${arq.size}`
      const ck = `vibdocs.hist2.${usina}.${p.mesRef}` // hist2: inclui a execução das ordens
      const emCache = await get<Cache>(ck)
      if (emCache?.chave === chave) fontes.push(emCache.fonte)
      else {
        const linhas = lerXlsxVibracao(await arq.arrayBuffer(), arq.name).map((l) => ({
          local: l.local,
          condicao: l.condicao,
          executado: l.executado,
        }))
        const fonte = { mesRef: p.mesRef, nome: arq.name, linhas }
        await set(ck, { chave, fonte } satisfies Cache)
        fontes.push(fonte)
      }
    } catch (e) {
      falhas.push(`${p.mesRef}: ${(e as Error).message}`)
    }
    feito++
  }
  progresso?.(feito, planilhas.length)
  return { historico: montarHistorico(fontes), execucao: montarExecucao(fontes), meses: fontes.map((f) => f.mesRef).sort(), falhas }
}

// ---------- regras ----------

/**
 * Reincidente desde = mês da primeira anomalia da sequência ininterrupta mais recente.
 * Anda para trás a partir do mês do relatório:
 *  - condição de anomalia → a sequência continua (guarda o mês);
 *  - condição 1 (Normal) → a sequência acaba;
 *  - mês sem medição ou outras condições (manutenção, inacessível, reserva…) → ignorado (rotas têm periodicidades diferentes).
 * Só devolve algo se o equipamento está em anomalia no mês do relatório.
 */
export function reincidenteDesde(
  porMes: Record<string, string> | undefined,
  mesAtual: string,
  condicaoAtual: string,
  condicoesAnomalia: string[],
): string | undefined {
  if (!condicoesAnomalia.includes(condicaoAtual)) return undefined
  let desde = mesAtual
  const anteriores = Object.keys(porMes ?? {})
    .filter((m) => m < mesAtual)
    .sort()
    .reverse()
  for (const m of anteriores) {
    const c = porMes![m]
    if (c === '1') break
    if (condicoesAnomalia.includes(c)) desde = m
  }
  return desde
}

/** Meses do quadro: os N-1 meses anteriores com medição em algum equipamento da área + o mês do relatório. */
export function mesesDoQuadro(h: Historico, locais: string[], mesAtual: string, total: number): string[] {
  const comMedicao = new Set<string>()
  for (const l of locais) for (const m of Object.keys(h[l] ?? {})) if (m < mesAtual) comMedicao.add(m)
  const anteriores = Math.max(1, total) - 1
  return [...(anteriores > 0 ? [...comMedicao].sort().slice(-anteriores) : []), mesAtual]
}
