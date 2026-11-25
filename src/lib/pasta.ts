/// <reference types="wicg-file-system-access" />
// Acesso à pasta do SharePoint sincronizada pelo OneDrive (File System Access API).
// Nada depende do TI: o próprio usuário sincroniza a biblioteca e escolhe a pasta aqui.
import { del, get, set } from 'idb-keyval'

const CHAVE = 'vibdocs.pastaRaiz'
export const PASTA_CONTROLE = 'Planilhas de Controle Gerencial'
export const PASTA_VIBDOCS = 'VibDocs'

export function navegadorSuportado(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

async function temPermissao(h: FileSystemDirectoryHandle, escrita: boolean): Promise<boolean> {
  const mode = escrita ? 'readwrite' : 'read'
  if ((await h.queryPermission({ mode })) === 'granted') return true
  return (await h.requestPermission({ mode })) === 'granted'
}

/** Pede ao usuário a pasta "Integração de Dados ... - Documentos" e lembra a escolha. */
export async function escolherPasta(): Promise<FileSystemDirectoryHandle> {
  const h = await window.showDirectoryPicker({ id: 'vibdocs-raiz', mode: 'readwrite' })
  await validarRaiz(h)
  await set(CHAVE, h)
  return h
}

/** Recupera a pasta escolhida antes. Pode exigir um clique do usuário para reconceder permissão. */
export async function pastaLembrada(): Promise<FileSystemDirectoryHandle | undefined> {
  return (await get<FileSystemDirectoryHandle>(CHAVE)) ?? undefined
}

export async function reconectar(h: FileSystemDirectoryHandle): Promise<boolean> {
  return temPermissao(h, true)
}

export async function esquecerPasta() {
  await del(CHAVE)
}

export async function validarRaiz(h: FileSystemDirectoryHandle) {
  try {
    await h.getDirectoryHandle(PASTA_CONTROLE)
  } catch {
    throw new Error(
      `A pasta escolhida ("${h.name}") não contém "${PASTA_CONTROLE}". ` +
        'Escolha a pasta sincronizada "Integração de Dados Pruftechnik MGS VSB - Documentos".',
    )
  }
}

export async function subpasta(
  raiz: FileSystemDirectoryHandle,
  caminho: string[],
  criar = false,
): Promise<FileSystemDirectoryHandle> {
  let atual = raiz
  for (const parte of caminho) atual = await atual.getDirectoryHandle(parte, { create: criar })
  return atual
}

export async function listar(dir: FileSystemDirectoryHandle) {
  const pastas: string[] = []
  const arquivos: FileSystemFileHandle[] = []
  for await (const [nome, h] of dir.entries()) {
    if (h.kind === 'directory') pastas.push(nome)
    else arquivos.push(h as FileSystemFileHandle)
  }
  pastas.sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))
  return { pastas, arquivos }
}

export async function gravarTexto(dir: FileSystemDirectoryHandle, nome: string, conteudo: string) {
  const arq = await dir.getFileHandle(nome, { create: true })
  const w = await arq.createWritable()
  await w.write(conteudo)
  await w.close()
}

export async function lerTexto(dir: FileSystemDirectoryHandle, nome: string): Promise<string | undefined> {
  try {
    return await (await (await dir.getFileHandle(nome)).getFile()).text()
  } catch {
    return undefined
  }
}
