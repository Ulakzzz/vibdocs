// Cadastro de equipamentos (por TAG da planilha): nome e localização usados no laudo e a foto do equipamento,
// que entra sozinha no quadro "Foto" de cada nova página de anomalia. Fica em VibDocs/config/cadastro-equipamentos.json;
// as fotos em VibDocs/cadastro/fotos/<TAG>.jpg (e no navegador).
import { lerConfig, salvarConfig } from './config'
import { blobImagem, guardarImagem, restaurarImagem } from './imagens'
import { PASTA_VIBDOCS, subpasta } from './pasta'

export interface ItemCadastro {
  nome?: string // como o equipamento aparece no laudo
  localizacao?: string // local de instalação/área no laudo
  foto?: string // id da imagem
  fotoNome?: string
}
export type Cadastro = Record<string, ItemCadastro>

export const cadastroAtual = (): Cadastro => lerConfig<Cadastro>('cadastro-equipamentos') ?? {}
export const itemCadastro = (tag: string): ItemCadastro | undefined => cadastroAtual()[tag]

const nomeArquivo = (tag: string) => `${tag.replace(/[\\/:*?"<>|]/g, '_')}.jpg`

export async function salvarItem(_raiz: FileSystemDirectoryHandle | undefined, tag: string, item: ItemCadastro | null) {
  const c = { ...cadastroAtual() }
  if (item) c[tag] = item
  else delete c[tag]
  await salvarConfig('cadastro-equipamentos', c)
}

/** Guarda a foto do cadastro (reduzida) e, com a pasta conectada, também no SharePoint. */
export async function salvarFoto(raiz: FileSystemDirectoryHandle | undefined, tag: string, arquivo: File) {
  const id = await guardarImagem(arquivo)
  if (raiz) {
    const dir = await subpasta(raiz, [PASTA_VIBDOCS, 'cadastro', 'fotos'], true)
    const w = await (await dir.getFileHandle(nomeArquivo(tag), { create: true })).createWritable()
    await w.write((await blobImagem(id))!)
    await w.close()
  }
  await salvarItem(raiz, tag, { ...itemCadastro(tag), foto: id, fotoNome: arquivo.name })
  return id
}

/** Garante que a foto do cadastro está neste navegador (foi cadastrada em outro computador). */
export async function garantirFoto(raiz: FileSystemDirectoryHandle | undefined, tag: string): Promise<string | undefined> {
  const it = itemCadastro(tag)
  if (!it?.foto) return undefined
  if (await blobImagem(it.foto)) return it.foto
  if (!raiz) return undefined
  try {
    const dir = await subpasta(raiz, [PASTA_VIBDOCS, 'cadastro', 'fotos'])
    await restaurarImagem(it.foto, await (await dir.getFileHandle(nomeArquivo(tag))).getFile())
    return it.foto
  } catch {
    return undefined
  }
}
