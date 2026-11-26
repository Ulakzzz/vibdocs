// Modelo do documento do relatório (um JSON por relatório) e regras automáticas.
// Tudo que é automático pode ser editado depois pelo técnico.
import { lerConfig } from './config'
import { textoPorId } from './textos'
import { itemCadastro } from './cadastro'
import { conclusaoDesejada } from './gut'
import type { CriteriosGut } from './gutCriterios'
import { siglaArea, type LinhaControle } from './controle'
import { mesCurto, mesesDoQuadro, reincidenteDesde, type Execucao, type Historico } from './historico'

/** Dados do técnico usados no relatório (vindos do perfil). */
export interface PerfilTecnico {
  nome: string
  email?: string
  telefone?: string
  art?: string
  selo?: string
}

export type StatusRelatorio = 'rascunho' | 'revisao' | 'emitido'
export const STATUS_RELATORIO: Record<StatusRelatorio, { nome: string; cor: string }> = {
  rascunho: { nome: 'Rascunho', cor: '#9ca3af' },
  revisao: { nome: 'Em revisão', cor: '#38bdf8' },
  emitido: { nome: 'Emitido', cor: '#a3e635' },
}

export const USINAS_RELATORIO = ['Barreiro', 'Jeceaba', 'Mineração', 'Florestal'] as const

export interface EquipRel {
  local: string // Local de instalação (TAG SAP)
  plano?: string // Plano de manutenção (vem da planilha)
  descricao: string
  condicao: string // condição usada no relatório (editável)
  condicaoPlanilha?: string // como veio da planilha de controle
  manual?: boolean // adicionado à mão (fora da planilha)
  executado?: boolean // ordem executada no mês (coluna "Execução" da planilha)
  celula?: string // célula da Condição na planilha de controle (para gravar de volta)
}

export interface Eixo {
  id: string
  nome: string // parte do equipamento: "Motor", "Bomba", "Mancais"...
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
  /** Posição no layout livre, em % da área de imagens da página (x, y, largura, altura). */
  livre?: { x: number; y: number; l: number; a: number }
}

/** Área de imagens da página de anomalia (mm): largura útil da folha × altura reservada. */
export const AREA_IMAGENS_MM = { l: 184, a: 165 }

/** Posição padrão de cada espaço, em % da área (espelha o layout fixo). */
export const POSICAO_SLOT: Record<Slot, { x: number; y: number; l: number; a: number }> = {
  tendencia: { x: 0, y: 0, l: 100, a: 47 },
  espectro: { x: 0, y: 50, l: 66, a: 50 },
  foto: { x: 67.5, y: 50, l: 32.5, a: 50 },
}

/** Posição livre de uma imagem (se ainda não tiver, parte do espaço padrão; várias no mesmo espaço se dividem). */
export function posicaoLivre(img: ImagemRef, todas: ImagemRef[]) {
  if (img.livre) return img.livre
  const doSlot = todas.filter((i) => i.slot === img.slot)
  const k = doSlot.findIndex((i) => i.id === img.id)
  const base = POSICAO_SLOT[img.slot]
  const l = base.l / doSlot.length
  return { x: base.x + l * k, y: base.y, l: l - (doSlot.length > 1 ? 1 : 0), a: base.a }
}

export interface Anomalia {
  /** vazio = automático (ver localizacaoPadrao) */
  localizacao?: string
  equipamento: string
  dataMedicao: string
  reincidenteDesde: string
  notasPR: string
  eixos: Eixo[]
  imagens: ImagemRef[]
  /** 'padrao' = espaços fixos (tendência, espectro, foto); 'livre' = posição e tamanho escolhidos na prévia */
  layoutImagens?: 'padrao' | 'livre'
  /** Quadro opcional "Observações adicionais" (avaliação em campo, sensitiva, histórico de intervenções…) */
  observacoes?: string
  /** a foto do cadastro do equipamento já foi trazida para esta página */
  fotoCadastro?: boolean
  /** Marcada pelo técnico com o botão "Finalizar": conta como página preenchida */
  finalizada?: boolean
  /** Priorização GUT (uso interno: não sai no relatório) */
  gut?: import('./gut').Gut
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
  equipe: {
    coleta: string
    analise: string
    /** selos de certificação (data URL) copiados do perfil — o relatório fica completo mesmo se o perfil mudar */
    seloColeta?: string
    seloAnalise?: string
  }
  /** Contato no cabeçalho (vem do perfil de quem analisa) */
  contato?: { email: string; telefone: string }
  art?: string
  /** 4.1 Equipamentos utilizados */
  aparelho?: string
  software?: string
  /** Linha "Plataforma Web Dynamox" do modelo: undefined = como está no modelo; '' = remove a linha */
  plataforma?: string
  /** Condições cujos equipamentos aparecem no quadro de condição. */
  condicoesQuadro: string[]
  /** Condições que geram página de anomalia. */
  condicoesAnomalia: string[]
  equipamentos: EquipRel[]
  anomalias: Record<string, Anomalia> // por Local de instalação (o texto não se perde ao desmarcar)
  criadoEm: string
  atualizadoEm: string
  criadoPor?: string // nome do usuário logado
  atualizadoPor?: string
  /** Quantos meses o quadro de condição mostra (incluindo o do relatório). */
  mesesNoQuadro?: number
  /** Cópia do histórico só dos equipamentos deste relatório (meses anteriores ao de referência). */
  historico?: { condicoes: Historico; execucao?: Execucao; fonte: string; atualizadoEm: string }
  /** Andamento: rascunho → em revisão → emitido (emitido é marcado sozinho ao exportar) */
  status?: StatusRelatorio
  emitidoEm?: string
  /** Equipamentos "a analisar" que o técnico tirou da lista de anomalias */
  foraDaAnalise?: string[]
  /** Seções "Resumo" e "Definição da atividade" (textos padrão em Cadastros, ajustáveis por relatório) */
  incluirResumo?: boolean
  resumo?: string
  definicao?: string
  /** Linha "Diagnóstico" na página de anomalia (condição normal / alerta / alarme) */
  mostrarDiagnostico?: boolean
  /** Mostrar a página de indicadores (execução, anomalias, reincidência). */
  incluirIndicadores?: boolean
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

/** Partes mais comuns nos relatórios (sugestões do campo; o técnico pode escrever qualquer nome). */
export const PARTES = ['Motor', 'Bomba', 'Mancais', 'Mancais da bomba', 'Redutor', 'Ventilador', 'Exaustor', 'Compressor', 'Acoplamento']

/** Nova parte do equipamento (Motor, Bomba…). "Eixo" no código é só o nome antigo da estrutura. */
export function novoEixo(n: number, id = novoId()): Eixo {
  return {
    id,
    nome: PARTES[n - 1] ?? `Parte ${n}`,
    falha: '',
    situacaoPadrao: '',
    recomendacaoPadrao: '',
    situacaoTecnico: '',
    recomendacaoTecnico: '',
  }
}

export function novaAnomalia(e: EquipRel): Anomalia {
  return {
    equipamento: itemCadastro(e.local)?.nome ?? e.descricao,
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
  /** perfil de quem está criando (vira técnico da coleta e da análise, contato e ART) */
  perfil?: PerfilTecnico
  linhas: LinhaControle[]
  avulso?: boolean
  /** ART do cabeçalho (a última usada na usina); vazio = a do modelo do Word */
  art?: string
}): Relatorio {
  const agora = new Date().toISOString()
  const equipamentos: EquipRel[] = p.linhas
    .filter((l) => siglaArea(l.local) === p.sigla)
    .map((l) => ({
      local: l.local,
      plano: l.plano,
      descricao: l.descricao,
      condicao: l.condicao,
      condicaoPlanilha: l.condicao,
      executado: l.executado,
      celula: l.celula,
    }))
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
    equipe: { coleta: p.analista, analise: p.analista, seloColeta: p.perfil?.selo, seloAnalise: p.perfil?.selo },
    contato: { email: p.perfil?.email ?? '', telefone: p.perfil?.telefone ?? '' },
    art: p.art ?? '',
    aparelho: 'Coletor de Dados VibXpert II',
    software: 'Omnitrend',
    condicoesQuadro: [...PADRAO_QUADRO],
    condicoesAnomalia: [...PADRAO_ANOMALIA],
    equipamentos,
    anomalias: {},
    criadoEm: agora,
    atualizadoEm: agora,
    criadoPor: p.analista,
    atualizadoPor: p.analista,
  }
}

/** Equipamentos que aparecem no quadro de condição. */
export const equipamentosQuadro = (r: Relatorio) => r.equipamentos.filter((e) => r.condicoesQuadro.includes(e.condicao))

/** Executado na planilha, mas ainda sem condição: falta a análise. */
export const aAnalisar = (e: EquipRel) => !!e.executado && !e.condicao

/** Equipamentos que geram página de anomalia, na ordem do quadro.
 *  Os "a analisar" entram também (até o técnico tirar ou o GUT definir a condição). */
export const equipamentosAnomalia = (r: Relatorio) =>
  r.equipamentos
    .filter((e) => r.condicoesAnomalia.includes(e.condicao) || (aAnalisar(e) && !(r.foraDaAnalise ?? []).includes(e.local)))
    // laudos pela gravidade: alarme, alerta, pré-alerta, demais e, por fim, os ainda a analisar
    .map((e, i) => ({ e, i, g: ({ '4': 0, '3': 1, '2': 2 } as Record<string, number>)[e.condicao] ?? (e.condicao ? 3 : 4) }))
    .sort((a, b) => a.g - b.g || a.i - b.i)
    .map((x) => x.e)

/** O que ainda falta preencher na página de anomalia (vazio = completa). */
export function faltandoNaPagina(r: Relatorio, e: EquipRel): string[] {
  const a = r.anomalias[e.local]
  if (!a) return ['tudo']
  const falta: string[] = []
  if (!e.condicao) falta.push('condição')
  if (!a.equipamento.trim()) falta.push('equipamento')
  if (!a.dataMedicao.trim()) falta.push('data')
  if (!a.notasPR.trim()) falta.push('nota PR')
  if (!a.eixos.some((x) => (x.situacaoPadrao + x.situacaoTecnico).trim())) falta.push('situação')
  if (!a.eixos.some((x) => (x.recomendacaoPadrao + x.recomendacaoTecnico).trim())) falta.push('recomendação')
  if (!a.imagens.length) falta.push('imagens')
  return falta
}
/** Página preenchida: tudo informado, ou marcada como finalizada pelo técnico. */
export const paginaPreenchida = (r: Relatorio, e: EquipRel) => !!r.anomalias[e.local]?.finalizada || faltandoNaPagina(r, e).length === 0

/** Anomalia do equipamento (cria uma vazia, sem gravar, se ainda não existir). */
export const anomaliaDe = (r: Relatorio, e: EquipRel): Anomalia => r.anomalias[e.local] ?? novaAnomalia(e)

/** Texto final de um eixo: padrão + o que o técnico escreveu. */
export const juntar = (...partes: string[]) => partes.map((p) => p.trim()).filter(Boolean).join(' ')

// ---------- histórico ----------
export const MESES_QUADRO_PADRAO = 3

/** Guarda no relatório o histórico dos seus equipamentos (só meses anteriores ao de referência). */
export function aplicarHistorico(r: Relatorio, h: Historico, ex: Execucao, fonte: string): Relatorio {
  const anteriores = <T,>(porMes: Record<string, T> | undefined) =>
    Object.fromEntries(Object.entries(porMes ?? {}).filter(([m]) => m < r.mesReferencia))
  const condicoes: Historico = {}
  const execucao: Execucao = {}
  for (const e of r.equipamentos) {
    const c = anteriores(h[e.local])
    if (Object.keys(c).length) condicoes[e.local] = c
    const x = anteriores(ex[e.local])
    if (Object.keys(x).length) execucao[e.local] = x
  }
  return { ...r, historico: { condicoes, execucao, fonte, atualizadoEm: new Date().toISOString() } }
}

export const mesmoHistorico = (a?: Relatorio['historico'], b?: Relatorio['historico']) =>
  JSON.stringify([a?.condicoes ?? {}, a?.execucao ?? {}]) === JSON.stringify([b?.condicoes ?? {}, b?.execucao ?? {}])

/** Meses (colunas) do quadro de condição. */
export const colunasQuadro = (r: Relatorio) =>
  mesesDoQuadro(r.historico?.condicoes ?? {}, equipamentosQuadro(r).map((e) => e.local), r.mesReferencia, r.mesesNoQuadro ?? MESES_QUADRO_PADRAO)

/** Condição de um equipamento num mês do quadro (o mês do relatório usa a condição atual, editável). */
export const condicaoNoMes = (r: Relatorio, e: EquipRel, mes: string) =>
  mes === r.mesReferencia ? e.condicao : (r.historico?.condicoes[e.local]?.[mes] ?? '')

/** "Reincidente desde" calculado pelo histórico (ex.: "nov/25"). */
export function reincidenciaAuto(r: Relatorio, e: EquipRel): string | undefined {
  const m = reincidenteDesde(r.historico?.condicoes[e.local], r.mesReferencia, e.condicao, r.condicoesAnomalia)
  return m && m < r.mesReferencia ? mesCurto(m) : undefined // só é reincidente se começou antes deste mês
}

/** O que sai no relatório: o valor digitado pelo técnico tem prioridade sobre o automático. */
export const reincidenciaFinal = (r: Relatorio, e: EquipRel, a: Anomalia) => a.reincidenteDesde || reincidenciaAuto(r, e) || ''

/** Recalcula o que é automático, respeitando o que o técnico editou. */
export function normalizar(r: Relatorio): Relatorio {
  return r.codigoManual ? r : { ...r, codigo: gerarCodigo(r.usina, r.sigla, r.mesReferencia, r.sequencia) }
}

// ---------- rótulos que mudam por usina (conforme os relatórios emitidos) ----------
/** Nomes do "farol" (alguns clientes usam outros nomes): definidos pelo administrador em Cadastros, por usina. */
export interface NomesStatus {
  alarme: string
  alerta: string
  pre: string
}
export function rotulosUsina(usina: string) {
  const min = usina === 'Mineração'
  const cfg = lerConfig<{ padrao?: Partial<NomesStatus>; porUsina?: Record<string, Partial<NomesStatus>> }>('status-nomes')
  const n = { ...cfg?.padrao, ...cfg?.porUsina?.[usina] }
  return {
    data: min ? 'Data' : 'Data da coleta',
    severidades: [n.alarme || 'Alarme', n.alerta || 'Alerta', n.pre || (min ? 'Monitoramento' : 'Pré-Alerta')] as readonly [string, string, string],
  }
}

/** Localização padrão da página de anomalia: em Jeceaba é o Local de instalação; nas demais, o nome da área. */
export const localizacaoPadrao = (r: Relatorio, e: EquipRel) => itemCadastro(e.local)?.localizacao || (r.usina === 'Jeceaba' ? e.local : r.areaTitulo || r.sigla)

/** Anomalias do relatório por tipo de falha (modo do GUT; senão a falha do texto padrão da 1ª parte). */
export function tiposDeFalha(r: Relatorio): { nome: string; n: number }[] {
  const conta = new Map<string, number>()
  for (const e of equipamentosAnomalia(r)) {
    if (!['2', '3', '4'].includes(e.condicao)) continue
    const a = r.anomalias[e.local]
    const falha = a?.eixos.find((x) => x.falha)?.falha
    const nome = a?.gut?.modo || (falha && textoPorId(falha)?.nome) || 'Não informado'
    conta.set(nome, (conta.get(nome) ?? 0) + 1)
  }
  return [...conta.entries()].map(([nome, n]) => ({ nome, n })).sort((a, b) => b.n - a.n)
}

/** Texto do Resumo / Definição da atividade: o do relatório ou o padrão de Cadastros, com {usina}, {area} e {mes}. */
export function textoRelatorio(r: Relatorio, qual: 'resumo' | 'definicao') {
  const proprio = qual === 'resumo' ? r.resumo : r.definicao
  const padrao = lerConfig<{ resumo: string; definicao: string }>('textos-relatorio')?.[qual] ?? ''
  return (proprio?.trim() ? proprio : padrao)
    .replace(/\{usina\}/g, r.usina)
    .replace(/\{area\}/g, r.areaTitulo || r.sigla)
    .replace(/\{mes\}/g, mesCurto(r.mesReferencia))
}

/** Linhas a mais na página de anomalia, depois da Nota PR: conclusão desejada (GUT) e diagnóstico resumido. */
export function linhasExtras(r: Relatorio, e: EquipRel, a: Anomalia): [string, string][] {
  const out: [string, string][] = []
  const fim = conclusaoDesejada(r, a, lerConfig<CriteriosGut>('gut-criterios'))
  if (fim) out.push(['Conclusão desejada', fim.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })])
  if (r.mostrarDiagnostico) {
    const sev = e.condicao === '4' ? 'Equipamento em condição de alarme' : e.condicao === '3' ? 'Equipamento em status de alerta' : e.condicao === '2' ? 'Equipamento em status de pré-alerta' : e.condicao === '1' ? 'Condição normal de operação' : ''
    if (sev) out.push(['Diagnóstico', sev])
  }
  return out
}

/** ART lembrada por usina (a ART é do contrato/relatório, não do técnico). */
export const artDaUsina = (usina: string) => (typeof localStorage === 'undefined' ? '' : (localStorage.getItem(`vibdocs.art.${usina}`) ?? ''))
export const lembrarArt = (usina: string, art: string) => localStorage.setItem(`vibdocs.art.${usina}`, art)

/** Texto que os relatórios usam quando o campo não se aplica. */
export const VAZIO = '**'
