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

/** Imagem dentro da sua caixa do relatório: fundo branco, margem de 1 mm, borda preta fina.
 *  Usada no Word (com e sem modelo) para ficar igual à prévia. Tamanho em mm. */
export async function imagemNaCaixa(blob: Blob, lMm: number, aMm: number, ajuste: 'conter' | 'preencher'): Promise<Blob> {
  const pxMm = 200 / 25.4 // 200 dpi
  const c = document.createElement('canvas')
  c.width = Math.max(10, Math.round(lMm * pxMm))
  c.height = Math.max(10, Math.round(aMm * pxMm))
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, c.width, c.height)
  const bmp = await createImageBitmap(blob)
  const m = 1 * pxMm
  const area = { x: m, y: m, l: c.width - 2 * m, a: c.height - 2 * m }
  const esc = ajuste === 'preencher' ? Math.max(area.l / bmp.width, area.a / bmp.height) : Math.min(area.l / bmp.width, area.a / bmp.height)
  const l = bmp.width * esc
  const a = bmp.height * esc
  g.save()
  g.beginPath()
  g.rect(area.x, area.y, area.l, area.a)
  g.clip()
  g.drawImage(bmp, area.x + (area.l - l) / 2, area.y + (area.a - a) / 2, l, a)
  g.restore()
  bmp.close()
  const borda = Math.max(1, Math.round(0.26 * pxMm)) // ~0,75 pt
  g.strokeStyle = '#000'
  g.lineWidth = borda
  g.strokeRect(borda / 2, borda / 2, c.width - borda, c.height - borda)
  return new Promise((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error('Falha na imagem'))), 'image/jpeg', 0.92))
}
