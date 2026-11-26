// Leitura do banco Omnitrend (.mdb) — independente do ambiente (navegador/worker ou Node, para testes).
// Estrutura (estudada no banco LAA):
//   T_TreeInfo   árvore: 0 área · 1 máquina · 2 componente (MT, BB…) · 3 ponto (1H, 1V…) · 5 tarefa (medição) · 7 sub-tarefa
//   T_JobInfo    tarefa → Ref_Meas_ID (tipo da medição) e Ref_Settings (T_MeasSetup.Setup_ID, nome da configuração)
//   T_MeasValue  medições: Ref_MeasJob, MeasTime (segundos unix), BlobValues
//                · 12 bytes = 3 float32 (global; o 1º é o valor global)   · 4 bytes = 1 float32 (rotação, temperatura…)
//                · espectro/sinal: int32 n, int32 0, float32 passo (Hz ou ms), float32 escala, n × int16 (valor = int16 × escala)
//   T_AlarmInfo  limites por tarefa: ALARM_VALUE_OS1 (alarme), WARN_VALUE (alerta), PRE_WARN_VALUE (pré-alerta; -32768 = não usa)
//   T_MachineInfo velocidade (rpm) e potência por componente (Machine_ID = nó do componente)
// O banco NÃO tem a TAG SAP: o vínculo com a planilha de controle é feito pelo usuário (vinculos.ts).

export interface NoOT {
  id: number
  pai: number
  nome: string
  tipo: number
}
export interface Limites {
  alarme?: number
  alerta?: number
  pre?: number
}
export type TipoDado = 'global' | 'escalar' | 'espectro' | 'tempo'
export interface TarefaOT {
  id: number
  ponto: number
  nome: string
  tipo: TipoDado
  unidade: string
  limites?: Limites
  n: number
  ultima?: { t: number; v?: number } // t em segundos; v = valor global/escalar
}
export interface ComponenteOT {
  id: number
  rpm?: number
  kw?: number
}
export interface ResumoBanco {
  nos: NoOT[]
  tarefas: TarefaOT[]
  componentes: ComponenteOT[]
  periodo: { de: number; ate: number }
  medicoes: number
}
export interface PontoSerie {
  t: number
  v: number
}
export interface Espectro {
  t: number
  dataId: number
  passo: number
  valores: number[]
}

type Linha = Record<string, unknown>
interface Leitor {
  getTableNames(): string[]
  getTable(n: string): { rowCount: number; getData(o?: { columns?: string[]; rowOffset?: number; rowLimit?: number }): Linha[] }
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const lim = (v: unknown) => {
  const n = num(v)
  return n === undefined || n <= -32768 || n === 0 ? undefined : n
}

function unidadeDe(nome: string, quantidade?: number) {
  const s = nome.toLowerCase()
  if (/rota|rpm/.test(s)) return 'rpm'
  if (/temper/.test(s)) return '°C'
  if (/desloc/.test(s) || quantidade === 2) return 'µm'
  if (/veloc/.test(s) || quantidade === 1) return 'mm/s'
  if (/envelope|acel|acc|rolamento|choque|shock/.test(s) || quantidade === 0) return 'm/s²'
  return ''
}

/** Lê um blob de espectro/sinal no tempo. */
export function decodificarCurva(b: Uint8Array): { passo: number; valores: number[] } | undefined {
  if (b.length < 20) return undefined
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const n = dv.getInt32(0, true)
  const passo = dv.getFloat32(8, true)
  const escala = dv.getFloat32(12, true)
  const max = Math.min(n, (b.length - 16) >> 1)
  const valores = new Array<number>(max)
  for (let i = 0; i < max; i++) valores[i] = dv.getInt16(16 + i * 2, true) * escala
  return { passo, valores }
}
/** Valor de um blob pequeno (global = 1º float de 3; escalar = 1 float). */
export function decodificarValor(b: Uint8Array): number | undefined {
  if (b.length !== 12 && b.length !== 4) return undefined
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength).getFloat32(0, true)
  return Number.isFinite(v) ? v : undefined
}

export class BancoOmnitrend {
  private db: Leitor
  resumo!: ResumoBanco
  /** séries de valores (global/escalar) por tarefa */
  private series = new Map<number, PontoSerie[]>()
  /** últimas curvas (espectro/sinal) por tarefa, mais recentes primeiro */
  private curvas = new Map<number, Espectro[]>()

  constructor(db: Leitor, guardarCurvas = 6) {
    this.db = db
    this.ler(guardarCurvas)
  }

  private dados(nome: string, columns?: string[]) {
    return this.db.getTableNames().includes(nome) ? this.db.getTable(nome).getData(columns ? { columns } : undefined) : []
  }

  private ler(guardarCurvas: number) {
    const nos: NoOT[] = this.dados('T_TreeInfo', ['Node_ID', 'Ref_parent', 'Name', 'TREENODETYPE']).map((n) => ({
      id: n.Node_ID as number,
      pai: n.Ref_parent as number,
      nome: String(n.Name ?? '').trim(),
      tipo: n.TREENODETYPE as number,
    }))
    const porId = new Map(nos.map((n) => [n.id, n]))
    const quant = new Map(this.dados('T_MeasType').map((m) => [m.Meas_ID as number, m.Quantity as number]))
    const setups = new Map(this.dados('T_MeasSetup', ['Setup_ID', 'Name']).map((s) => [s.Setup_ID as number, String(s.Name ?? '')]))
    const limites = new Map<number, Limites>()
    for (const a of this.dados('T_AlarmInfo')) {
      const l = { alarme: lim(a.ALARM_VALUE_OS1), alerta: lim(a.WARN_VALUE), pre: a.USE_PREWARN ? lim(a.PRE_WARN_VALUE) : undefined }
      if (l.alarme || l.alerta) limites.set(a.Ref_Job as number, l)
    }

    // medições: uma passada em blocos (só guarda séries pequenas e as últimas curvas de cada tarefa)
    const tabela = this.db.getTable('T_MeasValue')
    const tipos = new Map<number, TipoDado>()
    const contagem = new Map<number, number>()
    const ultima = new Map<number, { t: number; v?: number }>()
    let de = Infinity
    let ate = 0
    const BLOCO = 1500
    for (let off = 0; off < tabela.rowCount; off += BLOCO) {
      const linhas = tabela.getData({ columns: ['Data_ID', 'Ref_MeasJob', 'MeasTime', 'BlobValues'], rowOffset: off, rowLimit: BLOCO })
      for (const m of linhas) {
        const job = m.Ref_MeasJob as number
        const t = m.MeasTime as number
        const b = m.BlobValues as Uint8Array | null
        if (!b || !t) continue
        de = Math.min(de, t)
        ate = Math.max(ate, t)
        contagem.set(job, (contagem.get(job) ?? 0) + 1)
        if (b.length === 12 || b.length === 4) {
          const v = decodificarValor(b)
          if (v === undefined) continue
          tipos.set(job, b.length === 12 ? 'global' : 'escalar')
          const s = this.series.get(job) ?? []
          s.push({ t, v })
          this.series.set(job, s)
          if (!ultima.has(job) || ultima.get(job)!.t < t) ultima.set(job, { t, v })
        } else {
          const c = decodificarCurva(b)
          if (!c) continue
          tipos.set(job, c.passo < 0.01 || /tempo|time/i.test(porId.get(job)?.nome ?? '') ? 'tempo' : 'espectro')
          const lista = this.curvas.get(job) ?? []
          if (lista.length < guardarCurvas || t > lista[lista.length - 1].t) {
            lista.push({ t, dataId: m.Data_ID as number, ...c })
            lista.sort((x, y) => y.t - x.t)
            if (lista.length > guardarCurvas) lista.pop()
            this.curvas.set(job, lista)
          }
          if (!ultima.has(job) || ultima.get(job)!.t < t) ultima.set(job, { t })
        }
      }
    }
    for (const s of this.series.values()) s.sort((a, b) => a.t - b.t)

    const tarefas: TarefaOT[] = []
    for (const j of this.dados('T_JobInfo', ['Job_ID', 'Ref_Meas_ID', 'Ref_Settings'])) {
      const id = j.Job_ID as number
      const no = porId.get(id)
      if (!no || !contagem.get(id)) continue
      // espectros e sinais costumam ser sub-tarefas (tipo 7) dentro de uma tarefa: sobe até o ponto (tipo 3)
      let ponto = porId.get(no.pai)
      while (ponto && ponto.tipo !== 3 && ponto.tipo !== 2 && ponto.tipo !== 1) ponto = porId.get(ponto.pai)
      if (!ponto || ponto.tipo !== 3) continue
      const pai = porId.get(no.pai)
      const base = no.nome || setups.get(j.Ref_Settings as number) || `Tarefa ${id}`
      const nome = pai && (pai.tipo === 5 || pai.tipo === 7) ? `${pai.nome} · ${base}` : base
      tarefas.push({
        id,
        ponto: ponto.id,
        nome,
        tipo: tipos.get(id) ?? 'global',
        unidade: unidadeDe(`${nome} ${setups.get(j.Ref_Settings as number) ?? ''}`, quant.get(j.Ref_Meas_ID as number)),
        limites: limites.get(id),
        n: contagem.get(id) ?? 0,
        ultima: ultima.get(id),
      })
    }
    const componentes: ComponenteOT[] = this.dados('T_MachineInfo', ['Machine_ID', 'Speed', 'Power']).map((m) => ({
      id: m.Machine_ID as number,
      rpm: num(m.Speed),
      kw: num(m.Power),
    }))
    this.resumo = { nos, tarefas, componentes, periodo: { de: de === Infinity ? 0 : de, ate }, medicoes: tabela.rowCount }
  }

  serie(job: number) {
    return this.series.get(job) ?? []
  }
  espectros(job: number) {
    return this.curvas.get(job) ?? []
  }
}
