// Worker: abre o .mdb fora da tela principal (o arquivo tem centenas de MB) e responde consultas.
import { Buffer } from './bufferGlobal'
import MDBReader from 'mdb-reader'
import { BancoOmnitrend } from './ler'

let banco: BancoOmnitrend | undefined

type Pedido = { id: number } & ({ tipo: 'abrir'; arquivo: Blob } | { tipo: 'serie'; jobs: number[] } | { tipo: 'espectros'; job: number })

self.onmessage = async (ev: MessageEvent<Pedido>) => {
  const p = ev.data
  try {
    if (p.tipo === 'abrir') {
      const buf = Buffer.from(await p.arquivo.arrayBuffer())
      banco = new BancoOmnitrend(new MDBReader(buf) as never)
      self.postMessage({ id: p.id, ok: banco.resumo })
    } else if (!banco) throw new Error('Banco não aberto.')
    else if (p.tipo === 'serie') self.postMessage({ id: p.id, ok: Object.fromEntries(p.jobs.map((j) => [j, banco!.serie(j)])) })
    else if (p.tipo === 'espectros') self.postMessage({ id: p.id, ok: banco.espectros(p.job) })
  } catch (e) {
    self.postMessage({ id: p.id, erro: e instanceof Error ? e.message : String(e) })
  }
}
