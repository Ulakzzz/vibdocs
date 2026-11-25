// Modelo do documento do relatório (um JSON por relatório) e regras automáticas.
// Tudo que é automático pode ser editado depois pelo técnico.
import { siglaArea, type LinhaControle } from './controle'

export const USINAS_RELATORIO = ['Barreiro', 'Jeceaba', 'Mineração', 'Florestal'] as const

export interface EquipRel {
  local: string // Local de instalação (TAG SAP)
  descricao: string
  condicao: string // condição usada no relatório (editável)
  condicaoPlanilha?: string // como veio da planilha de controle
  manual?: boolean // adicionado à mão (fora da planilha)
}

export interface Eixo {
  id: string
  nome: string // "Eixo 01", "Motor LA", ...
  falha: string // id do texto padrão escolhido ('' = nenhum)
  situacaoPadrao: string
  recomendacaoPadrao: string
  situacaoTecnico: string // texto livre do técnico
  recomendacaoTecnico: string
}

export type Slot = 'tendencia' | 'espectro' | 'foto'
export const SLOTS: { id: Slot; nome: string }[] = [
  { id: 'tendencia', nome: 'Tendência' },
  { id: 'espectro', nome: 'Espectro / envelope' },
  { id: 'foto', nome: 'Foto' },
]

export interface ImagemRef {
  id: string // chave no armazenamento de imagens
  slot: Slot
  nome: string
  ajuste: 'conter' | 'preencher' // conter = imagem inteira; preencher = recorta para ocupar o espaço
}

export interface Anomalia {
  equipamento: string
  dataMedicao: string
  reincidenteDesde: string
  notasPR: string
  eixos: Eixo[]
  imagens: ImagemRef[]
}

export interface Relatorio {
  versao: 2
  avulso: boolean
  usina: string
  sigla: string
  areaTitulo: string
  mesReferencia: string // AAAA-MM
  sequencia: number
  codigo: string
  codigoManual: boolean // true = o técnico editou o código; não recalcular
  dataExpedicao: string // AAAA-MM-DD
  cidade: string
  equipe: { coleta: string; analise: string }
  /** Condições cujos equipamentos aparecem no quadro de condição. */
  condicoesQuadro: string[]
  /** Condições que geram página de anomalia. */
  condicoesAnomalia: string[]
  equipamentos: EquipRel[]
  anomalias: Record<string, Anomalia> // por Local de instalação (o texto não se perde ao desmarcar)
  criadoEm: string
  atualizadoEm: string
}

export const TODAS_CONDICOES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', 'X', 'R']
export const PADRAO_QUADRO = TODAS_CONDICOES.filter((c) => c !== 'X' && c !== 'R')
export const PADRAO_ANOMALIA = ['2', '3', '4']

const CONTRATO: Record<string, { prefixo: (s: string) => string; cidade: string }> = {
  Mineração: { prefixo: () => 'VMN-446M', cidade: 'Brumadinho' },
  Barreiro: { prefixo: (s) => `${s}-446V`, cidade: 'Belo Horizonte' },
  Jeceaba: { prefixo: (s) => `${s}-446V`, cidade: 'Jeceaba' }, // formato de Jeceaba ainda a confirmar
  Florestal: { prefixo: (s) => `${s}-446V`, cidade: '' },
}

/** {SIGLA}-446V{AAMM}{NN}; Mineração usa VMN-446M. NN = sequência da usina no mês. */
export function gerarCodigo(usina: string, sigla: string, mesRef: string, sequencia: number) {
  const [aaaa, mm] = mesRef.split('-')
  const pre = CONTRATO[usina]?.prefixo(sigla || 'XXX') ?? `${sigla}-446V`
  return `${pre}${aaaa.slice(2)}${mm}${String(sequencia).padStart(2, '0')}`
}

export const cidadePadrao = (usina: string) => CONTRATO[usina]?.cidade ?? ''

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export function dataPorExtenso(iso: string) {
  const [a, m, d] = iso.split('-').map(Number)
  if (!a || !m || !d) return iso
  return `${String(d).padStart(2, '0')} de ${MESES[m - 1]} de ${a}`
}

export const hojeISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const novoId = () => Math.random().toString(36).slice(2, 10)

export function novoEixo(n: number, id = novoId()): Eixo {
  return {
    id,
    nome: `Eixo ${String(n).padStart(2, '0')}`,
    falha: '',
    situacaoPadrao: '',
    recomendacaoPadrao: '',
    situacaoTecnico: '',
    recomendacaoTecnico: '',
  }
}

export function novaAnomalia(e: EquipRel): Anomalia {
  return {
    equipamento: e.descricao,
    dataMedicao: '',
    reincidenteDesde: '',
    notasPR: '',
    // id fixo: a anomalia ainda não gravada é recriada a cada renderização e o eixo precisa manter o mesmo id
    eixos: [novoEixo(1, 'eixo-1')],
    imagens: [],
  }
}

export function novoRelatorio(p: {
  usina: string
  sigla: string
  mesReferencia: string
  sequencia: number
  analista: string
  linhas: LinhaControle[]
  avulso?: boolean
}): Relatorio {
  const agora = new Date().toISOString()
  const equipamentos: EquipRel[] = p.linhas
    .filter((l) => siglaArea(l.local) === p.sigla)
    .map((l) => ({ local: l.local, descricao: l.descricao, condicao: l.condicao, condicaoPlanilha: l.condicao }))
  return {
    versao: 2,
    avulso: !!p.avulso,
    usina: p.usina,
    sigla: p.sigla,
    areaTitulo: p.sigla,
    mesReferencia: p.mesReferencia,
    sequencia: p.sequencia,
    codigo: gerarCodigo(p.usina, p.sigla, p.mesReferencia, p.sequencia),
    codigoManual: false,
    dataExpedicao: hojeISO(),
    cidade: cidadePadrao(p.usina),
    equipe: { coleta: p.analista, analise: p.analista },
    condicoesQuadro: [...PADRAO_QUADRO],
    condicoesAnomalia: [...PADRAO_ANOMALIA],
    equipamentos,
    anomalias: {},
    criadoEm: agora,
    atualizadoEm: agora,
  }
}

/** Equipamentos que aparecem no quadro de condição. */
export const equipamentosQuadro = (r: Relatorio) => r.equipamentos.filter((e) => r.condicoesQuadro.includes(e.condicao))

/** Equipamentos que geram página de anomalia, na ordem do quadro. */
export const equipamentosAnomalia = (r: Relatorio) => r.equipamentos.filter((e) => r.condicoesAnomalia.includes(e.condicao))

/** Anomalia do equipamento (cria uma vazia, sem gravar, se ainda não existir). */
export const anomaliaDe = (r: Relatorio, e: EquipRel): Anomalia => r.anomalias[e.local] ?? novaAnomalia(e)

/** Texto final de um eixo: padrão + o que o técnico escreveu. */
export const juntar = (...partes: string[]) => partes.map((p) => p.trim()).filter(Boolean).join(' ')

/** Recalcula o que é automático, respeitando o que o técnico editou. */
export function normalizar(r: Relatorio): Relatorio {
  return r.codigoManual ? r : { ...r, codigo: gerarCodigo(r.usina, r.sigla, r.mesReferencia, r.sequencia) }
}
