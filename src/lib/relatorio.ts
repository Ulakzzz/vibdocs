// Modelo do documento do relatório (um JSON por relatório) e regras automáticas.
import type { LinhaControle, Usina } from './controle'

export interface Anomalia {
  local: string
  equipamento: string
  dataMedicao: string
  reincidenteDesde: string
  notasPR: string
  condicao: string
  situacao: string
  recomendacao: string
}

export interface Relatorio {
  versao: 1
  codigo: string
  usina: Usina | string
  sigla: string
  areaTitulo: string
  mesReferencia: string // AAAA-MM
  dataExpedicao: string // AAAA-MM-DD
  cidade: string
  equipe: { coleta: string; analise: string }
  equipamentos: Pick<LinhaControle, 'local' | 'descricao' | 'condicao'>[]
  anomalias: Anomalia[]
  atualizadoEm: string
}

const CONTRATO: Record<string, { prefixo: (s: string) => string; cidade: string }> = {
  Mineração: { prefixo: () => 'VMN-446M', cidade: 'Brumadinho' },
  Barreiro: { prefixo: (s) => `${s}-446V`, cidade: 'Belo Horizonte' },
  Jeceaba: { prefixo: (s) => `${s}-446V`, cidade: 'Jeceaba' }, // formato de Jeceaba ainda a confirmar
}

/** {SIGLA}-446V{AAMM}{NN}; Mineração usa VMN-446M. NN = sequência da usina no mês. */
export function gerarCodigo(usina: string, sigla: string, mesRef: string, sequencia: number) {
  const [aaaa, mm] = mesRef.split('-')
  const pre = CONTRATO[usina]?.prefixo(sigla) ?? `${sigla}-446V`
  return `${pre}${aaaa.slice(2)}${mm}${String(sequencia).padStart(2, '0')}`
}

export const cidadePadrao = (usina: string) => CONTRATO[usina]?.cidade ?? ''

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export function dataPorExtenso(iso: string) {
  const [a, m, d] = iso.split('-').map(Number)
  return `${String(d).padStart(2, '0')} de ${MESES[m - 1]} de ${a}`
}

export const hojeISO = () => new Date().toISOString().slice(0, 10)
