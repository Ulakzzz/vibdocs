// Login: o técnico escolhe o próprio nome na lista e digita a senha.
// Também: criar conta, primeira conta (vira administrador) e troca obrigatória após redefinição.
import { useEffect, useState } from 'react'
import { btn, btnPri, Campo, Texto } from '../editor/campos'
import {
  criarConta,
  entrar,
  lembrarSessao,
  PAPEIS,
  SENHA_MINIMA,
  trocarSenha,
  type RepoUsuarios,
  type Usuario,
} from '../lib/usuarios'

type Modo = 'entrar' | 'criar' | 'trocar'

export function TelaLogin({
  repo,
  onEntrar,
  onVoltar,
}: {
  repo: RepoUsuarios
  onEntrar: (u: Usuario) => void
  onVoltar: () => void
}) {
  const [usuarios, setUsuarios] = useState<Usuario[]>()
  const [modo, setModo] = useState<Modo>('entrar')
  const [id, setId] = useState('')
  const [senha, setSenha] = useState('')
  const [manter, setManter] = useState(true)
  const [nova, setNova] = useState({ nome: '', email: '', cargo: '', senha: '', confirma: '' })
  const [troca, setTroca] = useState({ nova: '', confirma: '' })
  const [pendente, setPendente] = useState<Usuario>()
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    repo
      .ler()
      .then((l) => {
        setUsuarios(l)
        const ativos = l.filter((u) => u.ativo)
        if (!ativos.length) setModo('criar')
        else setId(ativos.length === 1 ? ativos[0].id : '')
      })
      .catch((e) => setErro(`Não foi possível ler as contas: ${(e as Error).message}`))
  }, [repo])

  const rodar = async (f: () => Promise<void>) => {
    setErro('')
    setOcupado(true)
    try {
      await f()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  const concluir = (u: Usuario) => {
    lembrarSessao(u.id, manter)
    onEntrar(u)
  }

  const fazerLogin = () =>
    rodar(async () => {
      const u = await entrar(repo, id, senha)
      if (u.trocarSenha) {
        setPendente(u)
        setModo('trocar')
        return
      }
      concluir(u)
    })

  const fazerCadastro = () =>
    rodar(async () => {
      if (nova.senha !== nova.confirma) throw new Error('As senhas não conferem.')
      concluir(await criarConta(repo, nova))
    })

  const fazerTroca = () =>
    rodar(async () => {
      if (!pendente) return
      if (troca.nova !== troca.confirma) throw new Error('As senhas não conferem.')
      concluir(await trocarSenha(repo, pendente.id, senha, troca.nova))
    })

  const ativos = (usuarios ?? []).filter((u) => u.ativo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const primeira = usuarios !== undefined && ativos.length === 0

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-bold">VibDocs</h1>
      <p className="mt-1 text-xs text-zinc-500">
        Contas {repo.onde === 'sharepoint' ? 'compartilhadas pela pasta do SharePoint' : 'guardadas só neste navegador (sem pasta conectada)'}
      </p>

      {usuarios === undefined && !erro && <p className="mt-6 text-sm text-zinc-500">Carregando contas…</p>}

      {modo === 'entrar' && usuarios !== undefined && (
        <form
          className="mt-6 space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            fazerLogin()
          }}
        >
          <Campo rotulo="Seu nome">
            <select className="w-full rounded border border-zinc-300 px-2 py-1.5 text-sm" value={id} onChange={(e) => setId(e.target.value)}>
              <option value="">— escolha —</option>
              {ativos.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                  {u.cargo ? ` · ${u.cargo}` : ''}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Senha">
            <Texto tipo="password" valor={senha} mudar={setSenha} />
          </Campo>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={manter} onChange={(e) => setManter(e.target.checked)} />
            Manter conectado neste computador
          </label>
          <div className="flex items-center gap-2">
            <button type="submit" className={btnPri} disabled={!id || !senha || ocupado}>
              {ocupado ? 'Entrando…' : 'Entrar'}
            </button>
            <button type="button" className={btn} onClick={() => setModo('criar')}>
              Criar conta
            </button>
          </div>
          <p className="text-[11px] text-zinc-500">Esqueceu a senha? Peça a um administrador para redefini-la.</p>
        </form>
      )}

      {modo === 'criar' && (
        <form
          className="mt-6 space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            fazerCadastro()
          }}
        >
          <h2 className="font-semibold">{primeira ? 'Primeira conta' : 'Criar conta'}</h2>
          {primeira && (
            <p className="rounded bg-blue-50 p-2 text-xs text-blue-900">
              Ainda não há contas. A primeira conta criada será a de <b>{PAPEIS.admin}</b>, que gerencia as demais.
            </p>
          )}
          <Campo rotulo="Nome (é o que aparece no relatório como equipe técnica)">
            <Texto valor={nova.nome} mudar={(v) => setNova({ ...nova, nome: v })} placeholder="Nome e sobrenome" />
          </Campo>
          <div className="grid grid-cols-2 gap-2">
            <Campo rotulo="Cargo (opcional)">
              <Texto valor={nova.cargo} mudar={(v) => setNova({ ...nova, cargo: v })} placeholder="Técnico de preditiva" />
            </Campo>
            <Campo rotulo="E-mail (opcional)">
              <Texto tipo="email" valor={nova.email} mudar={(v) => setNova({ ...nova, email: v })} />
            </Campo>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Campo rotulo={`Senha (mín. ${SENHA_MINIMA})`}>
              <Texto tipo="password" valor={nova.senha} mudar={(v) => setNova({ ...nova, senha: v })} />
            </Campo>
            <Campo rotulo="Confirmar senha">
              <Texto tipo="password" valor={nova.confirma} mudar={(v) => setNova({ ...nova, confirma: v })} />
            </Campo>
          </div>
          <div className="flex gap-2">
            <button type="submit" className={btnPri} disabled={!nova.nome.trim() || !nova.senha || ocupado}>
              {ocupado ? 'Criando…' : 'Criar e entrar'}
            </button>
            {!primeira && (
              <button type="button" className={btn} onClick={() => setModo('entrar')}>
                Já tenho conta
              </button>
            )}
          </div>
        </form>
      )}

      {modo === 'trocar' && pendente && (
        <form
          className="mt-6 space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            fazerTroca()
          }}
        >
          <h2 className="font-semibold">Defina uma nova senha</h2>
          <p className="text-xs text-zinc-600">{pendente.nome}, sua senha foi redefinida por um administrador. Escolha uma nova para continuar.</p>
          <Campo rotulo={`Nova senha (mín. ${SENHA_MINIMA})`}>
            <Texto tipo="password" valor={troca.nova} mudar={(v) => setTroca({ ...troca, nova: v })} />
          </Campo>
          <Campo rotulo="Confirmar nova senha">
            <Texto tipo="password" valor={troca.confirma} mudar={(v) => setTroca({ ...troca, confirma: v })} />
          </Campo>
          <button type="submit" className={btnPri} disabled={!troca.nova || ocupado}>
            Salvar e entrar
          </button>
        </form>
      )}

      {erro && <p className="mt-4 rounded bg-red-100 p-3 text-sm text-red-800">{erro}</p>}

      <button className="mt-8 text-xs text-zinc-500 underline" onClick={onVoltar}>
        Voltar e trocar a fonte de dados
      </button>
    </main>
  )
}
