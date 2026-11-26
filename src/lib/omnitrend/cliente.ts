// Acesso aos bancos Omnitrend da pasta "Banco de Dados - Vibração" (SharePoint sincronizado).
// O Power Automate atualiza os arquivos a cada 3 h (7h–16h); o app relê quando a data do arquivo muda.
import { listar } from '../pasta'
import type { Espectro, NoOT, PontoSerie, ResumoBanco, TarefaOT } from './ler'

export const PASTA_BANCOS = 'Banco de Dados - Vibração'

export interface ArquivoBanco {
  caminho: string // relativo à pasta dos bancos, ex.: "Barreiro/LAA/Banco LAA - Vallourec.mdb"
  nome: string
  tamanho: number
  modificado: number
  obter: () => Promise<File>
}

/** Lista os .mdb da pasta (com subpastas por usina/área). */
export async function listarBancos(raiz: FileSystemDirectoryHandle): Promise<ArquivoBanco[]> {
  let dir: FileSystemDirectoryHandle
  try {
    dir = await raiz.getDirectoryHandle(PASTA_BANCOS)
  } catch {
    return []
  }
  const out: ArquivoBanco[] = []
  const andar = async (d: FileSystemDirectoryHandle, prefixo: string, nivel: number) => {
    const { pastas, arquivos } = await listar(d)
    for (const a of arquivos)
      if (/\.(mdb|accdb)$/i.test(a.name)) {
        const f = await a.getFile()
        out.push({ caminho: prefixo + a.name, nome: a.name, tamanho: f.size, modificado: f.lastModified, obter: () => a.getFile() })
      }
    if (nivel < 4) for (const p of pastas) await andar(await d.getDirectoryHandle(p), `${prefixo}${p}/`, nivel + 1)
  }
  await andar(dir, '', 0)
  return out.sort((a, b) => a.caminho.localeCompare(b.caminho, 'pt-BR'))
}

/** Banco aberto no worker. Um por vez (o arquivo é grande). */
export class BancoAberto {
  resumo: ResumoBanco
  nome: string
  modificado: number
  private worker: Worker
  private seq = 0
  private espera = new Map<number, { ok: (v: unknown) => void; falha: (e: Error) => void }>()
  porId: Map<number, NoOT>
  filhos: Map<number, NoOT[]>
  tarefasDoPonto: Map<number, TarefaOT[]>

  private constructor(worker: Worker, resumo: ResumoBanco, nome: string, modificado: number) {
    this.worker = worker
    this.resumo = resumo
    this.nome = nome
    this.modificado = modificado
    this.porId = new Map(resumo.nos.map((n) => [n.id, n]))
    this.filhos = new Map()
    for (const n of resumo.nos) this.filhos.set(n.pai, [...(this.filhos.get(n.pai) ?? []), n])
    this.tarefasDoPonto = new Map()
    for (const t of resumo.tarefas) this.tarefasDoPonto.set(t.ponto, [...(this.tarefasDoPonto.get(t.ponto) ?? []), t])
    worker.onmessage = (ev) => {
      const { id, ok, erro } = ev.data as { id: number; ok?: unknown; erro?: string }
      const e = this.espera.get(id)
      this.espera.delete(id)
      if (erro) e?.falha(new Error(erro))
      else e?.ok(ok)
    }
  }

  static async abrir(arquivo: File | Blob, nome: string, modificado: number): Promise<BancoAberto> {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    const resumo = await new Promise<ResumoBanco>((ok, falha) => {
      worker.onmessage = (ev) => (ev.data.erro ? falha(new Error(ev.data.erro)) : ok(ev.data.ok))
      worker.onerror = (e) => falha(new Error(e.message || 'Falha ao abrir o banco.'))
      worker.postMessage({ id: 0, tipo: 'abrir', arquivo })
    })
    return new BancoAberto(worker, resumo, nome, modificado)
  }

  private pedir<T>(msg: Record<string, unknown>): Promise<T> {
    const id = ++this.seq
    return new Promise<T>((ok, falha) => {
      this.espera.set(id, { ok: ok as (v: unknown) => void, falha })
      this.worker.postMessage({ id, ...msg })
    })
  }
  series(jobs: number[]) {
    return this.pedir<Record<number, PontoSerie[]>>({ tipo: 'serie', jobs })
  }
  espectros(job: number) {
    return this.pedir<Espectro[]>({ tipo: 'espectros', job })
  }
  fechar() {
    this.worker.terminate()
  }

  /** Caminho de nomes do nó até a raiz (sem os modelos). */
  caminho(id: number): string[] {
    const p: string[] = []
    for (let n = this.porId.get(id); n; n = this.porId.get(n.pai)) p.unshift(n.nome)
    return p
  }
  /** Máquinas (nó tipo 1) de verdade: tira os modelos/templates. */
  maquinas(): NoOT[] {
    return this.resumo.nos.filter((n) => n.tipo === 1 && !/^(modelo|new template|template)/i.test(n.nome) && this.caminho(n.id).length > 1)
  }
  /** Componentes → pontos → tarefas de uma máquina. */
  estrutura(maquina: number) {
    return (this.filhos.get(maquina) ?? [])
      .filter((c) => c.tipo === 2)
      .map((c) => ({
        componente: c,
        dados: this.resumo.componentes.find((x) => x.id === c.id),
        pontos: (this.filhos.get(c.id) ?? [])
          .filter((p) => p.tipo === 3)
          .map((p) => ({ ponto: p, tarefas: this.tarefasDoPonto.get(p.id) ?? [] })),
      }))
  }
  /** Pior situação atual da máquina pelos limites das tarefas de valor global. */
  situacao(maquina: number): 'alarme' | 'alerta' | 'ok' | 'sem' {
    let pior: 'alarme' | 'alerta' | 'ok' | 'sem' = 'sem'
    for (const c of this.estrutura(maquina))
      for (const p of c.pontos)
        for (const t of p.tarefas) {
          const v = t.ultima?.v
          if (v === undefined || !t.limites) continue
          if (t.limites.alarme !== undefined && v >= t.limites.alarme) return 'alarme'
          if (t.limites.alerta !== undefined && v >= t.limites.alerta) pior = 'alerta'
          else if (pior === 'sem') pior = 'ok'
        }
    return pior
  }
}
