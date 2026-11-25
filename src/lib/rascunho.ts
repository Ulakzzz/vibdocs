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
