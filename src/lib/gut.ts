// Priorização GUT (Gravidade × Urgência × Tendência) da anomalia, corrigida pela criticidade SAP do equipamento.
// Faixas, fatores e prazos seguem a planilha "GUT Vibração – nova versão" da equipe. Os critérios detalhados de
// cada nota (amplitudes, rotação, sintomas) ficam na planilha; aqui só os nomes, para não expor o documento.
import type { CriteriosGut } from './gutCriterios'
import type { Anomalia, Relatorio } from './relatorio'

export const MODOS_FALHA = [
  'Desbalanceamento',
  'Desalinhamento',
  'Rolamento',
  'Lubrificação',
  'Engrenamento',
  'Falha elétrica',
  'Rigidez estrutural',
  'Cavitação',
  'Passagem de pás',
] as const

export const CRITICIDADE = { P: 1.2, A: 1, B: 0.9, C: 0.8, X: 0.8 } as const
export type Criticidade = keyof typeof CRITICIDADE

export interface Gut {
  modo: string
  g: number // 1..5
  u: number
  t: number
  criticidade: Criticidade
}

export const DICA_NOTA = {
  g: 'Gravidade: nível da amplitude (velocidade RMS, aceleração, fator de crista ou ultrassom, conforme o modo de falha).',
  u: 'Urgência: rotação real do eixo (< 60, < 300, < 900, < 1800, ≥ 1800 RPM).',
  t: 'Tendência: evolução nos últimos 30 dias e sintomas no espectro (harmônicos, bandas, temperatura, ruído).',
}

export interface ResultadoGut {
  valor: number
  bruto: number
  prioridade: string
  prazoDias: number | null // null = monitoramento, sem data
  situacao: 'Alarme' | 'Alerta' | 'Pré-alerta'
  notaPR: boolean
}

/** Situação no padrão do app a partir do texto da planilha ("Pré alerta", "Alerta", "Alarme"). */
const situacaoDe = (s: string): ResultadoGut['situacao'] => (/alarme/i.test(s) ? 'Alarme' : /pr[ée]/i.test(s) ? 'Pré-alerta' : 'Alerta')

export function calcularGut(g: Gut, criterios?: CriteriosGut): ResultadoGut {
  const bruto = g.g * g.u * g.t
  const fator = criterios?.fatores[g.criticidade] ?? CRITICIDADE[g.criticidade] ?? 1
  const valor = Math.round(bruto * fator * 10) / 10
  // faixas da planilha importada (se houver); senão as da versão atual da planilha
  const faixa = criterios?.faixas.find((f) => valor >= f.minimo)
  if (faixa)
    return { valor, bruto, prioridade: faixa.prioridade, prazoDias: faixa.prazoDias, situacao: situacaoDe(faixa.situacao), notaPR: !/sem nota/i.test(faixa.prioridade) }
  if (valor >= 80) return { valor, bruto, prioridade: 'Muito alto (A2)', prazoDias: 7, situacao: 'Alarme', notaPR: true }
  if (valor > 59) return { valor, bruto, prioridade: 'Alto (A1)', prazoDias: 15, situacao: 'Alerta', notaPR: true }
  if (valor > 35) return { valor, bruto, prioridade: 'Médio (A1)', prazoDias: 30, situacao: 'Alerta', notaPR: true }
  if (valor > 16) return { valor, bruto, prioridade: 'Baixo (A1), sem nota PR', prazoDias: 60, situacao: 'Pré-alerta', notaPR: false }
  return { valor, bruto, prioridade: 'Sem nota PR', prazoDias: null, situacao: 'Pré-alerta', notaPR: false }
}

/** Conclusão desejada (prazo do laudo): data da coleta + prazo da faixa do GUT. */
export function conclusaoDesejada(r: Relatorio, a: Anomalia, criterios?: CriteriosGut): Date | undefined {
  if (!a.gut?.modo) return undefined
  const res = calcularGut(a.gut, criterios)
  if (!res.prazoDias) return undefined
  return new Date(dataIdentificacao(r, a).getTime() + res.prazoDias * 86400000)
}

export const gutPadrao = (): Gut => ({ modo: '', g: 1, u: 1, t: 1, criticidade: 'A' })

/** Data de identificação da anomalia: a data da coleta (dd/mm/aa ou dd/mm/aaaa) ou a expedição do relatório. */
export function dataIdentificacao(r: Relatorio, a: Anomalia): Date {
  const m = a.dataMedicao.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) {
    const ano = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3])
    return new Date(ano, Number(m[2]) - 1, Number(m[1]))
  }
  const [y, mo, d] = r.dataExpedicao.split('-').map(Number)
  return new Date(y, mo - 1, d)
}

/** Lembretes da anomalia (base do aviso no celular, ainda não enviados). */
export function lembretes(r: Relatorio, a: Anomalia, condicao: string, criterios?: CriteriosGut) {
  const inicio = dataIdentificacao(r, a)
  const somar = (dias: number) => new Date(inicio.getTime() + dias * 86400000)
  const out: { tipo: 'enviar' | 'reanalisar'; quando: Date; texto: string }[] = []
  if (condicao === '4') out.push({ tipo: 'enviar', quando: somar(1), texto: 'Alarme: enviar o relatório ao cliente (prazo curto desde a identificação)' })
  if (a.gut?.modo) {
    const res = calcularGut(a.gut, criterios)
    if (res.prazoDias) out.push({ tipo: 'reanalisar', quando: somar(res.prazoDias), texto: `Nova análise / vencimento do laudo (GUT ${res.valor.toLocaleString('pt-BR')}, ${res.prazoDias} dias)` })
  }
  return out
}
