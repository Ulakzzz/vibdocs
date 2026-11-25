// Imagens do relatório: redimensionadas no navegador, guardadas no IndexedDB
// e, quando há pasta conectada, gravadas junto do rascunho (imagens/{id}.jpg).
import { get, set } from 'idb-keyval'
import { novoId } from './relatorio'

const LADO_MAX = 1800
const cacheUrl = new Map<string, string>()
const chave = (id: string) => `vibdocs.img.${id}`

/** Reduz a imagem para no máximo LADO_MAX px (mantendo a proporção) e converte para JPEG. */
async function reduzir(arquivo: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(arquivo)
  const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * escala)
  canvas.height = Math.round(bmp.height * escala)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return new Promise((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error('Falha ao converter a imagem'))), 'image/jpeg', 0.9))
}

export async function guardarImagem(arquivo: Blob): Promise<string> {
  const id = novoId()
  await set(chave(id), await reduzir(arquivo))
  return id
}

export async function blobImagem(id: string): Promise<Blob | undefined> {
  return get<Blob>(chave(id))
}

export async function restaurarImagem(id: string, blob: Blob) {
  await set(chave(id), blob)
  cacheUrl.delete(id)
}

export async function urlImagem(id: string): Promise<string | undefined> {
  const c = cacheUrl.get(id)
  if (c) return c
  const b = await blobImagem(id)
  if (!b) return undefined
  const u = URL.createObjectURL(b)
  cacheUrl.set(id, u)
  return u
}
