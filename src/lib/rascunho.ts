// Rascunhos: salvamento automático no navegador (IndexedDB) e na pasta sincronizada do SharePoint.
// Caminho: VibDocs/rascunhos/{Usina}/{AAAA}/{MM}/{SIGLA}/relatorio.json (+ imagens/)
import { get, set } from 'idb-keyval'
import { blobImagem, restaurarImagem } from './imagens'
import { gravarTexto, lerTexto, listar, PASTA_VIBDOCS, subpasta } from './pasta'
import type { Relatorio } from './relatorio'

export const chaveRascunho = (usina: string, mesRef: string, sigla: string) => `${usina}/${mesRef}/${sigla}`
const idb = (k: string) => `vibdocs.rascunho.${k}`

function caminho(r: Pick<Relatorio, 'usina' | 'mesReferencia' | 'sigla'>) {
  const [aaaa, mm] = r.mesReferencia.split('-')
  return [PASTA_VIBDOCS, 'rascunhos', r.usina, aaaa, mm, r.sigla || 'SEM-SIGLA']
}

export async function salvarLocal(r: Relatorio) {
  await set(idb(chaveRascunho(r.usina, r.mesReferencia, r.sigla)), r)
}

export async function lerLocal(usina: string, mesRef: string, sigla: string) {
  return get<Relatorio>(idb(chaveRascunho(usina, mesRef, sigla)))
}

export async function salvarNaPasta(raiz: FileSystemDirectoryHandle, r: Relatorio) {
  const dir = await subpasta(raiz, caminho(r), true)
  await gravarTexto(dir, 'relatorio.json', JSON.stringify(r, null, 2))
  const ids = Object.values(r.anomalias).flatMap((a) => a.imagens.map((i) => i.id))
  if (!ids.length) return
  const dirImg = await dir.getDirectoryHandle('imagens', { create: true })
  const existentes = new Set((await listar(dirImg)).arquivos.map((a) => a.name))
  for (const id of ids) {
    if (existentes.has(`${id}.jpg`)) continue
    const b = await blobImagem(id)
    if (!b) continue
    const w = await (await dirImg.getFileHandle(`${id}.jpg`, { create: true })).createWritable()
    await w.write(b)
    await w.close()
  }
}

export async function lerDaPasta(raiz: FileSystemDirectoryHandle, usina: string, mesRef: string, sigla: string) {
  try {
    const dir = await subpasta(raiz, caminho({ usina, mesReferencia: mesRef, sigla }))
    const txt = await lerTexto(dir, 'relatorio.json')
    if (!txt) return undefined
    const r = JSON.parse(txt) as Relatorio
    // Traz as imagens que ainda não estão neste navegador (ex.: rascunho criado em outro computador).
    try {
      const dirImg = await dir.getDirectoryHandle('imagens')
      for (const a of Object.values(r.anomalias))
        for (const i of a.imagens) {
          if (await blobImagem(i.id)) continue
          try {
            await restaurarImagem(i.id, await (await dirImg.getFileHandle(`${i.id}.jpg`)).getFile())
          } catch {
            /* imagem ainda não sincronizada */
          }
        }
    } catch {
      /* sem imagens */
    }
    return r
  } catch {
    return undefined
  }
}

/** Grava um arquivo emitido (Word/PDF) em VibDocs/emitidos/{Usina}/{AAAA}/{MM}/ e devolve o caminho relativo. */
export async function salvarEmitido(raiz: FileSystemDirectoryHandle, r: Relatorio, nome: string, conteudo: Blob) {
  const [aaaa, mm] = r.mesReferencia.split('-')
  const partes = [PASTA_VIBDOCS, 'emitidos', r.usina, aaaa, mm]
  const dir = await subpasta(raiz, partes, true)
  const w = await (await dir.getFileHandle(nome, { create: true })).createWritable()
  await w.write(conteudo)
  await w.close()
  return [...partes, nome].join('\\')
}

/** Próxima sequência do mês na usina = quantidade de áreas com rascunho no mês + 1. */
export async function proximaSequencia(raiz: FileSystemDirectoryHandle, usina: string, mesRef: string) {
  try {
    const [aaaa, mm] = mesRef.split('-')
    const dir = await subpasta(raiz, [PASTA_VIBDOCS, 'rascunhos', usina, aaaa, mm])
    return (await listar(dir)).pastas.length + 1
  } catch {
    return 1
  }
}

/** Escolhe o rascunho mais recente entre o do navegador e o da pasta. */
export function maisRecente(a?: Relatorio, b?: Relatorio) {
  if (!a) return b
  if (!b) return a
  return a.atualizadoEm >= b.atualizadoEm ? a : b
}

/** Rascunhos guardados neste navegador, do mais recente para o mais antigo. */
export async function rascunhosRecentes(n = 6): Promise<Relatorio[]> {
  const { entries } = await import('idb-keyval')
  const todos = (await entries<string, Relatorio>())
    .filter(([k, v]) => typeof k === 'string' && k.startsWith('vibdocs.rascunho.') && v && typeof v === 'object' && 'codigo' in v)
    .map(([, v]) => v)
  return todos.sort((a, b) => (b.atualizadoEm ?? '').localeCompare(a.atualizadoEm ?? '')).slice(0, n)
}

/** Resumo da usina no mês, só listando pastas (rápido, não abre planilhas): áreas com rascunho e arquivos emitidos. */
export async function resumoUsina(raiz: FileSystemDirectoryHandle, usina: string, mesRef: string) {
  const [aaaa, mm] = mesRef.split('-')
  const contar = async (partes: string[], tipo: 'pastas' | 'arquivos') => {
    try {
      const l = await listar(await subpasta(raiz, partes))
      return tipo === 'pastas' ? l.pastas.length : l.arquivos.filter((a) => /\.(docx|pdf)$/i.test(a.name)).length
    } catch {
      return 0
    }
  }
  return {
    rascunhos: await contar([PASTA_VIBDOCS, 'rascunhos', usina, aaaa, mm], 'pastas'),
    emitidos: await contar([PASTA_VIBDOCS, 'emitidos', usina, aaaa, mm], 'arquivos'),
  }
}

/** Todos os relatórios guardados na pasta do SharePoint (VibDocs/rascunhos/<usina>/<ano>/<mês>/<área>/relatorio.json). */
export async function rascunhosDaPasta(raiz: FileSystemDirectoryHandle, progresso?: (n: number) => void): Promise<Relatorio[]> {
  const out: Relatorio[] = []
  let base: FileSystemDirectoryHandle
  try {
    base = await subpasta(raiz, [PASTA_VIBDOCS, 'rascunhos'])
  } catch {
    return out
  }
  const andar = async (d: FileSystemDirectoryHandle, nivel: number) => {
    const { pastas, arquivos } = await listar(d)
    const rel = arquivos.find((a) => a.name === 'relatorio.json')
    if (rel) {
      try {
        out.push(JSON.parse(await (await rel.getFile()).text()) as Relatorio)
        progresso?.(out.length)
      } catch {
        /* arquivo em sincronização */
      }
    }
    if (nivel < 5) for (const p of pastas) if (p !== 'imagens') await andar(await d.getDirectoryHandle(p), nivel + 1)
  }
  await andar(base, 0)
  return out
}
