// Configurações compartilhadas da equipe: VibDocs/config/<nome>.json no SharePoint (com cópia no navegador).
// Textos padrão, critérios do GUT, nomes do farol, textos do relatório e cadastro de equipamentos.
// Quem pode mudar cada uma é decidido na tela (admin/editor); aqui só se lê e grava.
import { get, set } from 'idb-keyval'
import { useSyncExternalStore } from 'react'
import { gravarTexto, lerTexto, PASTA_VIBDOCS, subpasta } from './pasta'

let raizAtual: FileSystemDirectoryHandle | undefined
const valores = new Map<string, unknown>()
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())
let versao = 0

export const raizConfig = () => raizAtual

export function definirRaizConfig(raiz?: FileSystemDirectoryHandle) {
  raizAtual = raiz
}

/** Lê uma configuração (SharePoint primeiro; senão a cópia do navegador) e guarda em memória. */
export async function carregarConfig<T>(nome: string): Promise<T | undefined> {
  let v: T | undefined
  if (raizAtual) {
    try {
      const t = await lerTexto(await subpasta(raizAtual, [PASTA_VIBDOCS, 'config']), `${nome}.json`)
      if (t) v = JSON.parse(t) as T
    } catch {
      /* sem pasta config ainda */
    }
  }
  v ??= await get<T>(`vibdocs.config.${nome}`)
  if (v !== undefined) {
    valores.set(nome, v)
    versao++
    avisar()
  }
  return v
}

export async function salvarConfig<T>(nome: string, valor: T) {
  valores.set(nome, valor)
  versao++
  avisar()
  await set(`vibdocs.config.${nome}`, valor)
  if (raizAtual) {
    const dir = await subpasta(raizAtual, [PASTA_VIBDOCS, 'config'], true)
    await gravarTexto(dir, `${nome}.json`, JSON.stringify(valor, null, 1))
  }
}

export const lerConfig = <T,>(nome: string): T | undefined => valores.get(nome) as T | undefined

/** Hook: re-renderiza quando qualquer configuração muda. */
export function useConfig<T>(nome: string): T | undefined {
  useSyncExternalStore(
    (f) => {
      ouvintes.add(f)
      return () => ouvintes.delete(f)
    },
    () => versao,
  )
  return valores.get(nome) as T | undefined
}

export const CONFIGS = ['textos-padrao', 'gut-criterios', 'status-nomes', 'textos-relatorio', 'cadastro-equipamentos', 'avisos', 'contratos'] as const

export async function carregarTodas(raiz?: FileSystemDirectoryHandle) {
  definirRaizConfig(raiz)
  await Promise.all(CONFIGS.map((c) => carregarConfig(c)))
}
