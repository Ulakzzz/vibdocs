// Critérios do GUT por modo de falha: o que significa cada nota de G, U e T.
// Vêm da planilha "GUT Vibração" da equipe, importada pelo administrador (fica em VibDocs/config/gut-criterios.json,
// não no código do site) e podem ser editados depois na tela Cadastros.
import * as XLSX from 'xlsx'

export interface CriterioModo {
  nome: string // ex.: "Desalinhamento de eixos", "Rolamentos com d < 100mm"
  G: Record<string, string> // nota → descrição
  U: Record<string, string>
  T: Record<string, string>
}
export interface Faixa {
  minimo: number // GUT ≥ minimo
  prioridade: string
  prazoDias: number | null
  situacao: string
}
export interface CriteriosGut {
  modos: CriterioModo[]
  fatores: Record<string, number> // criticidade SAP → fator
  faixas: Faixa[] // da mais alta para a mais baixa
  origem?: string
  atualizado?: string
}

const txt = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim())

/** Lê a planilha do GUT: blocos "GUT <modo>" com linhas nota | G | U | T (às vezes dois blocos lado a lado). */
export function lerPlanilhaGut(buf: ArrayBuffer, nomeArquivo: string): CriteriosGut {
  const wb = XLSX.read(buf, { type: 'array' })
  const modos: CriterioModo[] = []
  const fatores: Record<string, number> = {}
  const faixas: Faixa[] = []
  // a aba "Modo Falha" é a versão atual dos critérios; as outras abas só entram se ela não existir
  const abaModos = wb.SheetNames.find((n) => /modo/i.test(n))
  for (const aba of wb.SheetNames) {
    const linhas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[aba], { header: 1, raw: true, defval: '' })
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i]
      for (let c = 0; c < l.length; c++) {
        const t = txt(l[c])
        // bloco de critério: "GUT Desalinhamento de eixos" + cabeçalho G | U | T na linha seguinte
        // (a nota fica na coluna antes do "G"; o título pode estar na coluna da nota ou na do "G")
        const colG = /^G$/i.test(txt(linhas[i + 1]?.[c])) ? c : /^G$/i.test(txt(linhas[i + 1]?.[c + 1])) ? c + 1 : -1
        if (/^GUT\s+\S/i.test(t) && colG >= 0 && (!abaModos || aba === abaModos)) {
          const m: CriterioModo = { nome: t.replace(/^GUT\s+/i, '').trim(), G: {}, U: {}, T: {} }
          const cn = colG - 1
          for (let k = i + 2; k < linhas.length; k++) {
            const n = linhas[k][cn]
            if (typeof n !== 'number') break
            const nota = String(n)
            if (txt(linhas[k][cn + 1])) m.G[nota] = txt(linhas[k][cn + 1])
            if (txt(linhas[k][cn + 2])) m.U[nota] = txt(linhas[k][cn + 2])
            if (txt(linhas[k][cn + 3])) m.T[nota] = txt(linhas[k][cn + 3])
          }
          if (Object.keys(m.G).length && !modos.some((x) => x.nome === m.nome)) modos.push(m)
        }
        // fator de correção pela criticidade SAP: "P" | 1.2 …
        if (/^[PABCX]$/.test(t) && typeof l[c + 1] === 'number' && (l[c + 1] as number) > 0.3 && (l[c + 1] as number) < 2) fatores[t] = l[c + 1] as number
        // faixas: ">= 80" | "Muito alto (A2)" | "7 dias" | "Alarme"
        const faixa = t.match(/^(>=|<=)\s*(\d+)/)
        if (faixa && txt(l[c + 1]) && txt(l[c + 3])) {
          const limite = Number(faixa[2])
          const dias = txt(l[c + 2]).match(/(\d+)\s*dia/)
          faixas.push({ minimo: faixa[1] === '>=' ? limite : NaN, prioridade: txt(l[c + 1]), prazoDias: dias ? Number(dias[1]) : null, situacao: txt(l[c + 3]) })
          ;(faixas.at(-1) as Faixa & { teto?: number }).teto = faixa[1] === '<=' ? limite : undefined
        }
      }
    }
  }
  // "<= 79" vira "≥ 60" (o teto da faixa de baixo + 1)
  const ordenadas = (faixas as (Faixa & { teto?: number })[]).filter((f, i, a) => a.findIndex((x) => x.prioridade === f.prioridade) === i)
  ordenadas.sort((a, b) => (b.teto ?? b.minimo) - (a.teto ?? a.minimo))
  for (let i = 0; i < ordenadas.length; i++) {
    const f = ordenadas[i]
    if (Number.isNaN(f.minimo)) f.minimo = (ordenadas[i + 1]?.teto ?? -1) + 1
    delete f.teto
  }
  return {
    modos,
    fatores: Object.keys(fatores).length ? fatores : { P: 1.2, A: 1, B: 0.9, C: 0.8, X: 0.8 },
    faixas: ordenadas.length >= 3 ? ordenadas : [],
    origem: nomeArquivo,
    atualizado: new Date().toISOString(),
  }
}

/** Critério do modo escolhido (pelo nome exato ou pelo começo, p.ex. "Rolamento" → "Rolamentos com d < 100mm"). */
export function criterioDoModo(modo: string, c: CriteriosGut | undefined): CriterioModo | undefined {
  if (!c || !modo) return undefined
  const n = modo.toLowerCase()
  return c.modos.find((m) => m.nome.toLowerCase() === n) ?? c.modos.find((m) => m.nome.toLowerCase().startsWith(n.slice(0, 6)))
}
