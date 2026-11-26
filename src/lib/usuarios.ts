// Contas do VibDocs (sem TI): ficam em VibDocs/config/usuarios.json na pasta sincronizada do SharePoint.
// Sem pasta conectada (modo manual), ficam só neste navegador (IndexedDB).
// Senhas: só o hash PBKDF2-SHA256 com salt aleatório é guardado.
//
// Limite assumido: quem tem acesso à pasta no SharePoint pode ler/editar o arquivo.
// O login identifica quem é quem (autoria, perfis, papéis); a proteção real dos dados é a permissão do SharePoint.
import { get, set } from 'idb-keyval'
import { gravarTexto, lerTexto, PASTA_VIBDOCS, subpasta } from './pasta'

// Perfis do requisito: Administrador (tudo), Editor (cria e edita relatórios) e Leitor (só consulta).
// "revisor" é o nome antigo do editor e continua valendo.
export type Papel = 'admin' | 'tecnico' | 'leitor' | 'revisor'
export const PAPEIS: Record<Papel, string> = { admin: 'Administrador', tecnico: 'Editor', leitor: 'Leitor', revisor: 'Editor (revisor)' }
export const podeEditar = (p?: Papel) => p === 'admin' || p === 'tecnico' || p === 'revisor'

export interface Usuario {
  id: string
  nome: string // nome de exibição (lista de login e menus)
  email: string
  cargo: string
  /** Dados do perfil que vão para o relatório */
  nomeCompleto?: string // equipe técnica no relatório (se vazio, usa o nome)
  telefone?: string // cabeçalho do relatório
  art?: string // ART / registro profissional, se houver
  selo?: string // selo de certificação (imagem PNG em data URL, já reduzida)
  papel: Papel
  ativo: boolean
  salt: string // base64
  hash: string // base64
  iteracoes: number
  trocarSenha: boolean // senha redefinida pelo admin: pedir troca no próximo login
  criadoEm: string
  atualizadoEm: string
}

export type UsuarioPublico = Omit<Usuario, 'salt' | 'hash' | 'iteracoes'>

export const publico = ({ salt: _s, hash: _h, iteracoes: _i, ...u }: Usuario): UsuarioPublico => u

const ITERACOES = 310_000
export const SENHA_MINIMA = 6

// ---------- criptografia (Web Crypto, nativo do navegador) ----------
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))))
const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function derivar(senha: string, salt: Uint8Array, iteracoes: number) {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits'])
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: iteracoes }, chave, 256)
}

async function gerarHash(senha: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return { salt: b64(salt), hash: b64(await derivar(senha, salt, ITERACOES)), iteracoes: ITERACOES }
}

async function conferir(u: Usuario, senha: string) {
  const h = b64(await derivar(senha, deB64(u.salt), u.iteracoes))
  // comparação em tempo constante
  if (h.length !== u.hash.length) return false
  let d = 0
  for (let i = 0; i < h.length; i++) d |= h.charCodeAt(i) ^ u.hash.charCodeAt(i)
  return d === 0
}

// ---------- armazenamento ----------
export interface RepoUsuarios {
  onde: 'sharepoint' | 'navegador'
  ler(): Promise<Usuario[]>
  gravar(lista: Usuario[]): Promise<void>
}

export function repoPasta(raiz: FileSystemDirectoryHandle): RepoUsuarios {
  const dir = () => subpasta(raiz, [PASTA_VIBDOCS, 'config'], true)
  return {
    onde: 'sharepoint',
    async ler() {
      const txt = await lerTexto(await dir(), 'usuarios.json')
      return txt ? ((JSON.parse(txt) as { usuarios: Usuario[] }).usuarios ?? []) : []
    },
    async gravar(lista) {
      await gravarTexto(await dir(), 'usuarios.json', JSON.stringify({ versao: 1, usuarios: lista }, null, 2))
    },
  }
}

export function repoNavegador(): RepoUsuarios {
  const K = 'vibdocs.usuarios'
  return {
    onde: 'navegador',
    ler: async () => (await get<Usuario[]>(K)) ?? [],
    gravar: (lista) => set(K, lista),
  }
}

// ---------- regras ----------
export type DadosPerfil = Partial<Pick<Usuario, 'nomeCompleto' | 'telefone' | 'art' | 'selo'>>

const SELO_MAX = 400_000 // ~300 KB de imagem; o selo é reduzido antes de chegar aqui

function limparPerfil(d: DadosPerfil): DadosPerfil {
  if (d.selo && (!d.selo.startsWith('data:image/') || d.selo.length > SELO_MAX)) throw new Error('Imagem do selo inválida ou grande demais.')
  return { nomeCompleto: d.nomeCompleto?.trim() || '', telefone: d.telefone?.trim() || '', art: d.art?.trim() || '', selo: d.selo || '' }
}
const normal = (s: string) => s.trim().toLowerCase()
const novoIdUsuario = () => crypto.randomUUID()

function validarSenha(senha: string) {
  if (senha.length < SENHA_MINIMA) throw new Error(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`)
}

function validarNome(lista: Usuario[], nome: string, ignorarId?: string) {
  if (!nome.trim()) throw new Error('Informe o nome.')
  if (lista.some((u) => u.id !== ignorarId && normal(u.nome) === normal(nome)))
    throw new Error('Já existe uma conta com esse nome. Use um nome diferente (ex.: com sobrenome).')
}

export async function criarConta(
  repo: RepoUsuarios,
  dados: { nome: string; email: string; cargo: string; senha: string } & DadosPerfil,
): Promise<Usuario> {
  const lista = await repo.ler()
  validarNome(lista, dados.nome)
  validarSenha(dados.senha)
  const agora = new Date().toISOString()
  const u: Usuario = {
    id: novoIdUsuario(),
    nome: dados.nome.trim(),
    email: dados.email.trim(),
    cargo: dados.cargo.trim(),
    ...limparPerfil(dados),
    // a primeira conta vira administrador
    papel: lista.length === 0 ? 'admin' : 'tecnico',
    ativo: true,
    ...(await gerarHash(dados.senha)),
    trocarSenha: false,
    criadoEm: agora,
    atualizadoEm: agora,
  }
  await repo.gravar([...lista, u])
  return u
}

export async function entrar(repo: RepoUsuarios, id: string, senha: string): Promise<Usuario> {
  const u = (await repo.ler()).find((x) => x.id === id)
  if (!u || !u.ativo || !(await conferir(u, senha))) throw new Error('Nome ou senha incorretos.')
  return u
}

async function alterar(repo: RepoUsuarios, id: string, f: (u: Usuario, lista: Usuario[]) => Promise<Usuario> | Usuario) {
  const lista = await repo.ler()
  const i = lista.findIndex((u) => u.id === id)
  if (i < 0) throw new Error('Conta não encontrada.')
  const novo = { ...(await f(lista[i], lista)), atualizadoEm: new Date().toISOString() }
  lista[i] = novo
  await repo.gravar(lista)
  return novo
}

export const salvarPerfil = (repo: RepoUsuarios, id: string, p: { nome: string; email: string; cargo: string } & DadosPerfil) =>
  alterar(repo, id, (u, lista) => {
    validarNome(lista, p.nome, id)
    return { ...u, nome: p.nome.trim(), email: p.email.trim(), cargo: p.cargo.trim(), ...limparPerfil(p) }
  })

/** Nome que vai para o relatório. */
export const nomeNoRelatorio = (u: Pick<Usuario, 'nome' | 'nomeCompleto'>) => (u.nomeCompleto?.trim() || u.nome).trim()

export const trocarSenha = (repo: RepoUsuarios, id: string, atual: string, nova: string) =>
  alterar(repo, id, async (u) => {
    if (!(await conferir(u, atual))) throw new Error('A senha atual está incorreta.')
    validarSenha(nova)
    return { ...u, ...(await gerarHash(nova)), trocarSenha: false }
  })

// ---------- administração ----------
function garantirAdminRestante(lista: Usuario[], id: string, mudanca: Partial<Usuario>) {
  const depois = lista.map((u) => (u.id === id ? { ...u, ...mudanca } : u))
  if (!depois.some((u) => u.papel === 'admin' && u.ativo)) throw new Error('É preciso manter pelo menos um administrador ativo.')
}

export const definirPapel = (repo: RepoUsuarios, id: string, papel: Papel) =>
  alterar(repo, id, (u, lista) => {
    garantirAdminRestante(lista, id, { papel })
    return { ...u, papel }
  })

export const definirAtivo = (repo: RepoUsuarios, id: string, ativo: boolean) =>
  alterar(repo, id, (u, lista) => {
    garantirAdminRestante(lista, id, { ativo })
    return { ...u, ativo }
  })

/** Admin redefine a senha (não há e-mail sem servidor). O usuário troca no próximo login. */
export const redefinirSenha = (repo: RepoUsuarios, id: string, temporaria: string) =>
  alterar(repo, id, async (u) => {
    validarSenha(temporaria)
    return { ...u, ...(await gerarHash(temporaria)), trocarSenha: true }
  })

// ---------- sessão ----------
const SESSAO = 'vibdocs.sessao'

export function lembrarSessao(id: string, manter: boolean) {
  sessionStorage.setItem(SESSAO, id)
  if (manter) localStorage.setItem(SESSAO, id)
  else localStorage.removeItem(SESSAO)
}

export const sessaoGuardada = () => sessionStorage.getItem(SESSAO) ?? localStorage.getItem(SESSAO) ?? undefined

export function encerrarSessao() {
  sessionStorage.removeItem(SESSAO)
  localStorage.removeItem(SESSAO)
}

export async function retomarSessao(repo: RepoUsuarios): Promise<Usuario | undefined> {
  const id = sessaoGuardada()
  if (!id) return undefined
  const u = (await repo.ler()).find((x) => x.id === id)
  return u?.ativo && !u.trocarSenha ? u : undefined
}
