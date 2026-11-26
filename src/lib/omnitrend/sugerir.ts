// Sugestão de vínculo TAG ↔ máquina pelo nome (sem dependências: roda no navegador e no Node).
import type { NoOT } from './ler'

// ---------- sugestões por nome ----------
const IGNORAR = new Set(['VIB', 'DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'A', 'O', 'COM', 'PARA', 'MT', 'MOTOR', 'ACION', 'PRINC', 'BB', 'RED', 'VS01', 'VM52'])

export function palavras(s: string): string[] {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/([A-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Z])/g, '$1 $2')
    .split(/[^A-Z0-9]+/)
    .map((p) => p.replace(/^0+(\d)/, '$1'))
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
  const alvo = [...new Set([...palavras(descricao), ...palavras(tag).filter((p) => !/^\d{3,}$/.test(p))])]
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
