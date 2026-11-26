// Vínculo permanente: Local de instalação (TAG da planilha de controle) ↔ máquina do banco Omnitrend.
// O banco não tem a TAG; o app sugere pelo nome e o técnico confirma. Fica em VibDocs/config/vinculos-omnitrend.json
// (compartilhado pelo SharePoint) e numa cópia no navegador. Sempre relê antes de gravar, para não apagar vínculos de colegas.
import { get, set } from 'idb-keyval'
import { lerTexto, gravarTexto, PASTA_VIBDOCS, subpasta } from '../pasta'

export interface Vinculo {
  banco: string // caminho do .mdb dentro da pasta dos bancos
  no: number // Node_ID da máquina no Omnitrend
  caminho: string[] // nomes até a máquina (para achar de novo se o ID mudar)
  descricao?: string // descrição da planilha no momento do vínculo
  automatico?: boolean // juntado pelo app (nome muito parecido); o técnico pode desfazer
  nota?: number
  por?: string
  em: string
}
export type Vinculos = Record<string, Vinculo>

const ARQ = 'vinculos-omnitrend.json'
const CHAVE = 'vibdocs.vinculosOmnitrend'

async function daPasta(raiz?: FileSystemDirectoryHandle): Promise<Vinculos | undefined> {
  if (!raiz) return undefined
  try {
    const t = await lerTexto(await subpasta(raiz, [PASTA_VIBDOCS, 'config']), ARQ)
    return t ? (JSON.parse(t).vinculos as Vinculos) : {}
  } catch {
    return undefined
  }
}

export async function lerVinculos(raiz?: FileSystemDirectoryHandle): Promise<Vinculos> {
  const pasta = await daPasta(raiz)
  const local = (await get<Vinculos>(CHAVE)) ?? {}
  return { ...local, ...(pasta ?? {}) }
}

/** Grava vários vínculos de uma vez (null remove), relendo antes para não apagar os de colegas. */
export async function gravarVinculos(raiz: FileSystemDirectoryHandle | undefined, mudancas: Record<string, Vinculo | null>): Promise<Vinculos> {
  const atual = await lerVinculos(raiz)
  for (const [tag, v] of Object.entries(mudancas)) {
    if (v) atual[tag] = v
    else delete atual[tag]
  }
  await set(CHAVE, atual)
  if (raiz) {
    const dir = await subpasta(raiz, [PASTA_VIBDOCS, 'config'], true)
    await gravarTexto(dir, ARQ, JSON.stringify({ versao: 1, atualizado: new Date().toISOString(), vinculos: atual }, null, 1))
  }
  return atual
}

/** Grava (ou remove, com v = null) o vínculo de uma TAG, mesclando com o que está no SharePoint. */
export async function gravarVinculo(raiz: FileSystemDirectoryHandle | undefined, tag: string, v: Vinculo | null): Promise<Vinculos> {
  const atual = await lerVinculos(raiz)
  if (v) atual[tag] = v
  else delete atual[tag]
  await set(CHAVE, atual)
  if (raiz) {
    const dir = await subpasta(raiz, [PASTA_VIBDOCS, 'config'], true)
    await gravarTexto(dir, ARQ, JSON.stringify({ versao: 1, atualizado: new Date().toISOString(), vinculos: atual }, null, 1))
  }
  return atual
}

export { palavras, sugerir, vincularAutomatico, type Sugestao } from './sugerir'
