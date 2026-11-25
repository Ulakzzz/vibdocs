// Janela de conta: "Meu perfil" (todos) e "Usuários" (só administradores).
import { useEffect, useState, type ReactNode } from 'react'
import { btn, btnMini, btnPri, Campo, Texto } from '../editor/campos'
import {
  definirAtivo,
  definirPapel,
  PAPEIS,
  redefinirSenha,
  salvarPerfil,
  SENHA_MINIMA,
  trocarSenha,
  type Papel,
  type RepoUsuarios,
  type Usuario,
} from '../lib/usuarios'

function Janela({ titulo, fechar, children }: { titulo: string; fechar: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-6 backdrop-blur-[2px]" onMouseDown={fechar}>
      <div className="surgir max-h-full w-full max-w-2xl overflow-auto rounded-[18px] bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-linha px-5 py-3">
          <h2 className="titulo text-lg">{titulo}</h2>
          <button className={btnMini} onClick={fechar}>
            fechar
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function useAcao() {
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string }>()
  const rodar = async (f: () => Promise<string | void>) => {
    setMsg(undefined)
    try {
      const t = await f()
      if (t) setMsg({ tipo: 'ok', texto: t })
    } catch (e) {
      setMsg({ tipo: 'erro', texto: (e as Error).message })
    }
  }
  const aviso = msg && (
    <p className={`surgir mt-3 rounded-[10px] p-3 text-sm ${msg.tipo === 'ok' ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-800'}`}>{msg.texto}</p>
  )
  return { rodar, aviso }
}

export function MeuPerfil({
  repo,
  usuario,
  mudou,
  fechar,
}: {
  repo: RepoUsuarios
  usuario: Usuario
  mudou: (u: Usuario) => void
  fechar: () => void
}) {
  const [p, setP] = useState({ nome: usuario.nome, email: usuario.email, cargo: usuario.cargo })
  const [s, setS] = useState({ atual: '', nova: '', confirma: '' })
  const perfil = useAcao()
  const senha = useAcao()

  return (
    <Janela titulo="Meu perfil" fechar={fechar}>
      <div className="space-y-3">
        <Campo rotulo="Nome (aparece no relatório como equipe técnica)">
          <Texto valor={p.nome} mudar={(v) => setP({ ...p, nome: v })} />
        </Campo>
        <div className="grid grid-cols-2 gap-2">
          <Campo rotulo="Cargo">
            <Texto valor={p.cargo} mudar={(v) => setP({ ...p, cargo: v })} />
          </Campo>
          <Campo rotulo="E-mail">
            <Texto tipo="email" valor={p.email} mudar={(v) => setP({ ...p, email: v })} />
          </Campo>
        </div>
        <p className="text-xs text-cinza">Papel: {PAPEIS[usuario.papel]} (só um administrador pode alterar)</p>
        <button
          className={btnPri}
          onClick={() =>
            perfil.rodar(async () => {
              mudou(await salvarPerfil(repo, usuario.id, p))
              return 'Perfil salvo.'
            })
          }
        >
          Salvar perfil
        </button>
        {perfil.aviso}
      </div>

      <hr className="my-4" />
      <h3 className="mb-2 text-sm font-semibold">Trocar senha</h3>
      <div className="grid grid-cols-3 gap-2">
        <Campo rotulo="Senha atual">
          <Texto tipo="password" valor={s.atual} mudar={(v) => setS({ ...s, atual: v })} />
        </Campo>
        <Campo rotulo={`Nova (mín. ${SENHA_MINIMA})`}>
          <Texto tipo="password" valor={s.nova} mudar={(v) => setS({ ...s, nova: v })} />
        </Campo>
        <Campo rotulo="Confirmar nova">
          <Texto tipo="password" valor={s.confirma} mudar={(v) => setS({ ...s, confirma: v })} />
        </Campo>
      </div>
      <button
        className={btn + ' mt-2'}
        disabled={!s.atual || !s.nova}
        onClick={() =>
          senha.rodar(async () => {
            if (s.nova !== s.confirma) throw new Error('As senhas não conferem.')
            mudou(await trocarSenha(repo, usuario.id, s.atual, s.nova))
            setS({ atual: '', nova: '', confirma: '' })
            return 'Senha alterada.'
          })
        }
      >
        Trocar senha
      </button>
      {senha.aviso}
    </Janela>
  )
}

export function GerenciarUsuarios({ repo, usuario, fechar }: { repo: RepoUsuarios; usuario: Usuario; fechar: () => void }) {
  const [lista, setLista] = useState<Usuario[]>([])
  const acao = useAcao()
  const recarregar = () => repo.ler().then((l) => setLista(l.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))))
  useEffect(() => {
    recarregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fazer = (f: () => Promise<unknown>, ok: string) =>
    acao.rodar(async () => {
      await f()
      await recarregar()
      return ok
    })

  return (
    <Janela titulo="Usuários" fechar={fechar}>
      <p className="mb-3 text-xs text-cinza">
        Contas guardadas {repo.onde === 'sharepoint' ? 'em VibDocs/config/usuarios.json no SharePoint' : 'neste navegador'}. Senhas são guardadas
        cifradas (hash).
      </p>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-linha text-left text-xs text-cinza">
            <th className="p-1">Nome</th>
            <th className="p-1">Papel</th>
            <th className="p-1">Situação</th>
            <th className="p-1" />
          </tr>
        </thead>
        <tbody>
          {lista.map((u) => (
            <tr key={u.id} className={`linha-viva acoes-no-hover border-b border-linha/70 ${u.ativo ? '' : 'text-cinza'}`}>
              <td className="p-1">
                {u.nome}
                {u.id === usuario.id && <span className="ml-1 text-xs text-cinza">(você)</span>}
                <div className="text-xs text-cinza">{[u.cargo, u.email].filter(Boolean).join(' · ')}</div>
              </td>
              <td className="p-1">
                <select
                  className="campo w-auto py-1 text-xs"
                  value={u.papel}
                  onChange={(e) => fazer(() => definirPapel(repo, u.id, e.target.value as Papel), `Papel de ${u.nome} alterado.`)}
                >
                  {(Object.keys(PAPEIS) as Papel[]).map((p) => (
                    <option key={p} value={p}>
                      {PAPEIS[p]}
                    </option>
                  ))}
                </select>
              </td>
              <td className="p-1 text-xs">
                {u.ativo ? 'ativo' : 'desativado'}
                {u.trocarSenha && <div className="text-amber-700">troca de senha pendente</div>}
              </td>
              <td className="p-1 text-right whitespace-nowrap"><span className="acoes">
                <button
                  className={btnMini}
                  onClick={() => {
                    const t = prompt(`Senha temporária para ${u.nome} (mín. ${SENHA_MINIMA} caracteres). A pessoa troca a senha no próximo login.`)
                    if (t) fazer(() => redefinirSenha(repo, u.id, t), `Senha de ${u.nome} redefinida. Passe a senha temporária para a pessoa.`)
                  }}
                >
                  Redefinir senha
                </button>
                <button
                  className={btnMini + ' ml-1'}
                  onClick={() => fazer(() => definirAtivo(repo, u.id, !u.ativo), `${u.nome}: ${u.ativo ? "conta desativada" : "conta reativada"}.`)}
                >
                  {u.ativo ? 'Desativar' : 'Reativar'}
                </button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {acao.aviso}
    </Janela>
  )
}
