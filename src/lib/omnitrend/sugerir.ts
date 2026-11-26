// Sugestão de vínculo TAG ↔ máquina pelo nome (sem dependências: roda no navegador e no Node).
import type { NoOT } from './ler'

// ---------- sugestões por nome ----------
// palavras genéricas (não ajudam a distinguir máquinas) e abreviações comuns das planilhas
const IGNORAR = new Set(['VIB', 'DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'A', 'O', 'COM', 'PARA', 'ACION', 'ACIONAMENTO', 'PRINC', 'PRIN', 'PRINCIPAL', 'MOTOR', 'VS01', 'VM52', 'LM', 'LA'])
const SINONIMOS: Record<string, string> = {
  BB: 'BOMBA',
  BBA: 'BOMBA',
  MT: 'MOTOR',
  RED: 'REDUTOR',
  VENT: 'VENTILADOR',
  VT: 'VENTILADOR',
  EXAUST: 'EXAUSTOR',
  EXA: 'EXAUSTOR',
  COMP: 'COMPRESSOR',
  REFR: 'REFRIGERACAO',
  REFRIG: 'REFRIGERACAO',
  CHANF: 'CHANFRADEIRA',
  ESM: 'ESMERILHADEIRA',
  ESMERI: 'ESMERILHADEIRA',
}

export function palavras(s: string): string[] {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/([A-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Z])/g, '$1 $2')
    .split(/[^A-Z0-9]+/)
    .map((p) => SINONIMOS[p.replace(/^0+(\d)/, '$1')] ?? p.replace(/^0+(\d)/, '$1'))
    .filter((p) => p && !IGNORAR.has(p))
}

const parecido = (a: string, b: string) => {
  if (a === b) return 1
  if (/^\d+$/.test(a) || /^\d+$/.test(b)) return 0 // números só valem iguais
  const [c, l] = a.length < b.length ? [a, b] : [b, a]
  return c.length >= 3 && l.startsWith(c) ? 0.8 : 0
}

export interface Sugestao {
  maquina: NoOT
  caminho: string[]
  nota: number // 0..1
}

/** Sugere máquinas do banco para uma linha da planilha (TAG + descrição). */
export function sugerir(tag: string, descricao: string, maquinas: NoOT[], caminho: (id: number) => string[], quantas = 5): Sugestao[] {
  // da TAG só vale a sigla da área (os números do SAP não aparecem no Omnitrend)
  const alvo = [...new Set([...palavras(descricao), ...palavras(tag).filter((p) => !/^\d+$/.test(p))])]
  const numerosAlvo = new Set(palavras(descricao).filter((p) => /^\d+$/.test(p)))
  if (!alvo.length) return []
  return maquinas
    .map((m) => {
      const cam = caminho(m.id)
      const daMaquina = palavras(m.nome)
      const doCaminho = palavras(cam.join(' '))
      let soma = 0
      for (const p of alvo) {
        const naMaquina = Math.max(0, ...daMaquina.map((q) => parecido(p, q)))
        const noCaminho = Math.max(0, ...doCaminho.map((q) => parecido(p, q)))
        soma += Math.max(naMaquina * 1.2, noCaminho * 0.7)
      }
      // número da máquina diferente (BOMBA-1 × BOMBA-2) derruba a nota
      const numerosMaq = daMaquina.filter((p) => /^\d+$/.test(p))
      const conflito = numerosMaq.length > 0 && numerosAlvo.size > 0 && !numerosMaq.some((n) => numerosAlvo.has(n))
      const nota = Math.min(1, (soma / Math.max(3, alvo.length)) * (conflito ? 0.35 : 1))
      return { maquina: m, caminho: cam, nota }
    })
    .filter((s) => s.nota > 0.15)
    .sort((a, b) => b.nota - a.nota)
    .slice(0, quantas)
}

export interface Automatico {
  tag: string
  descricao: string
  maquina: NoOT
  caminho: string[]
  nota: number
}

/** Junta sozinho só o que é claro: nota alta e bem acima da 2ª opção (máquinas homônimas em lugares diferentes ficam para o técnico). */
export function vincularAutomatico(
  linhas: { local: string; descricao: string }[],
  maquinas: NoOT[],
  caminho: (id: number) => string[],
  ja: Set<string>,
  minimo = 0.55,
  folga = 0.08,
): Automatico[] {
  const out: Automatico[] = []
  // área de cada máquina (palavras do caminho): a linha só se junta a máquinas da mesma área (sigla da TAG)
  const doCaminho = new Map(maquinas.map((m) => [m.id, new Set(palavras(caminho(m.id).join(' ')))]))
  const siglasDoBanco = new Set([...doCaminho.values()].flatMap((x) => [...x]))
  for (const l of linhas) {
    if (ja.has(l.local)) continue
    const sigla = siglaDaTag(l.local)
    if (sigla && !siglasDoBanco.has(sigla)) continue // a área nem existe neste banco
    const daArea = sigla ? maquinas.filter((m) => doCaminho.get(m.id)!.has(sigla)) : maquinas
    const [a, b] = sugerir(l.local, l.descricao, daArea, caminho, 2)
    if (!a || a.nota < minimo) continue
    if (b && a.nota - b.nota < folga) continue
    out.push({ tag: l.local, descricao: l.descricao, maquina: a.maquina, caminho: a.caminho, nota: a.nota })
  }
  return out
}

/** Sigla da área a partir do Local de instalação (7501-LAA-…, VS01-DWS-AJU-…, VM52-ITM1-BRT-…). */
export function siglaDaTag(tag: string): string | undefined {
  const p = tag.toUpperCase().split('-')
  if (p.length < 3) return undefined
  return p[0] === 'VS01' || p[0] === 'VM52' ? p[2] : p[1]
}
